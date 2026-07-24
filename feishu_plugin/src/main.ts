import { loadConfig, isStoreMode } from "./config/index.js";
import { ConfigStore } from "./config/store.js";
import { openDatabase } from "./storage/database.js";
import { DeliveryRepository, CallbackEventRepository, ActionTokenRepository } from "./storage/repositories.js";
import { PaperclipClient } from "./paperclip/client.js";
import { PaperclipAuthService } from "./paperclip/auth-service.js";
import { ApprovalPoller } from "./paperclip/approval-poller.js";
import { InteractionPoller } from "./paperclip/interaction-poller.js";
import { FeishuClientRegistry } from "./feishu/client-registry.js";
import { LongConnectionManager } from "./feishu/long-connection-manager.js";
import { CallbackHandler } from "./feishu/callback-handler.js";
import { TestApprovalSessions } from "./feishu/test-approval-sessions.js";
import { ActionTokenService } from "./approvals/action-token.js";
import { ApprovalCoordinator } from "./approvals/coordinator.js";
import { InteractionCoordinator } from "./approvals/interaction-coordinator.js";
import { Reconciliation } from "./approvals/reconciliation.js";
import { AdminServer } from "./admin/server.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { logger } from "./observability/logger.js";
import { snapshotMetrics } from "./observability/metrics.js";
import { PreviewTokenService } from "./tunnel/preview-token.js";
import { DocumentPreviewServer } from "./tunnel/document-preview-server.js";
import { QuickTunnelManager } from "./tunnel/quick-tunnel-manager.js";
import { DocumentPreviewLinkService } from "./tunnel/document-preview-link.js";
import { PendingInteractionCardRefresher } from "./tunnel/pending-interaction-card-refresher.js";

async function main() {
  logger.info("paperclip-feishu-bridge starting");

  const storeMode = isStoreMode();
  const config = loadConfig();
  const store = storeMode ? new ConfigStore() : null;
  const db = openDatabase(config.sqlitePath);

  const deliveryRepo = new DeliveryRepository(db);
  const callbackRepo = new CallbackEventRepository(db);
  const tokenRepo = new ActionTokenRepository(db);

  const paperclip = new PaperclipClient(
    config.paperclipBaseUrl,
    config.paperclipApiKey,
    config.requestTimeoutMs,
  );

  const feishuRegistry = new FeishuClientRegistry(store);
  if (storeMode) {
    feishuRegistry.initFromStore();
  } else {
    feishuRegistry.initFromConfig(config);
  }

  const tokenService = new ActionTokenService(tokenRepo, config.actionTokenTtlMs);
  const testApprovalSessions = new TestApprovalSessions();

  const previewTokenService = new PreviewTokenService({ ttlMs: config.actionTokenTtlMs });
  const previewServer = new DocumentPreviewServer({ tokenService: previewTokenService, client: paperclip });
  const { port: previewPort } = await previewServer.start();
  const tunnelManager = new QuickTunnelManager();
  const previewLinkService = new DocumentPreviewLinkService({ tunnelManager, tokenService: previewTokenService });

  const coordinator = new ApprovalCoordinator({
    config, paperclip, feishuRegistry, tokenService, deliveryRepo,
  });

  const interactionCoordinator = new InteractionCoordinator({
    config, feishuRegistry, tokenService, deliveryRepo, previewLinkService,
  });

  const cardRefresher = new PendingInteractionCardRefresher({
    paperclip, feishuRegistry, tokenService, deliveryRepo, previewLinkService,
  });

  const callbackHandler = new CallbackHandler({
    config, paperclip, feishuRegistry, tokenService, deliveryRepo, callbackRepo, testApprovalSessions,
  });

  const longConnectionManager = new LongConnectionManager(store);

  const poller = new ApprovalPoller(config, paperclip, (approval, companyId) =>
    coordinator.handleDiscovered(approval, companyId),
  );

  const interactionPoller = new InteractionPoller(config, paperclip, (interaction, companyId, issue) =>
    interactionCoordinator.handleDiscovered(interaction, companyId, issue),
  );

  const reconciliation = new Reconciliation({
    config, paperclip, feishuRegistry, tokenService, deliveryRepo,
  });

  const adminServer = new AdminServer(config.adminPort, "./ui", storeMode ? (store?.getGlobal().adminHost ?? "127.0.0.1") : "127.0.0.1");
  const authService = new PaperclipAuthService(store ?? new ConfigStore(), storeMode);
  registerAdminRoutes(adminServer, {
    store: store ?? new ConfigStore(),
    paperclip,
    authService,
    feishuRegistry,
    storeMode,
    onConfigChanged: () => {
      logger.info("config changed via admin, consider restart for full effect");
    },
    testApprovalSessions,
    ensureFeishuCallback: (appId, appSecret) =>
      longConnectionManager.ensureConnection(appId, appSecret),
    documentTunnel: { manager: tunnelManager, previewPort, refresher: cardRefresher },
  });

  const healthy = await paperclip.healthCheck();
  if (!healthy) {
    logger.warn("paperclip api not reachable at startup, will retry on poll");
  }

  await longConnectionManager.start(
    (event) => callbackHandler.handle(event),
    storeMode ? [] : [{ appId: config.feishuAppId, appSecret: config.feishuAppSecret }],
  );

  poller.start();
  interactionPoller.start();
  reconciliation.start();
  adminServer.start();

  if (config.documentTunnelAutoStart) {
    let tunnelStarted = false;
    try {
      await tunnelManager.start(previewPort);
      tunnelStarted = true;
      logger.info("document tunnel auto-started", { previewPort, status: tunnelManager.getStatus() });
    } catch (err) {
      logger.warn("document tunnel auto-start failed", { previewPort, error: String(err) });
    }
    if (tunnelStarted) {
      try {
        await cardRefresher.refreshAll();
      } catch (err) {
        logger.warn("card refresh failed", { previewPort, error: String(err) });
      }
    }
  }

  logger.info("paperclip-feishu-bridge started", {
    mode: storeMode ? "store" : "env",
    companies: config.companies.length,
    pollIntervalMs: config.pollIntervalMs,
    adminPort: config.adminPort,
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { metrics: snapshotMetrics() });
    poller.stop();
    interactionPoller.stop();
    reconciliation.stop();
    adminServer.stop();
    authService.destroy();
    try {
      await tunnelManager.stop();
    } catch (err) {
      logger.warn("tunnel stop failed during shutdown", { error: String(err) });
    }
    try {
      await previewServer.stop();
    } catch (err) {
      logger.warn("preview server stop failed during shutdown", { error: String(err) });
    }
    try {
      await longConnectionManager.stop();
    } catch (err) {
      logger.warn("long connection stop failed during shutdown", { error: String(err) });
    }
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  logger.error("fatal startup error", { error: String(err) });
  process.exit(1);
});
