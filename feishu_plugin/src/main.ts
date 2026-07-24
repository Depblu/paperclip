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

  const coordinator = new ApprovalCoordinator({
    config, paperclip, feishuRegistry, tokenService, deliveryRepo,
  });

  const interactionCoordinator = new InteractionCoordinator({
    config, feishuRegistry, tokenService, deliveryRepo,
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

  logger.info("paperclip-feishu-bridge started", {
    mode: storeMode ? "store" : "env",
    companies: config.companies.length,
    pollIntervalMs: config.pollIntervalMs,
    adminPort: config.adminPort,
  });

  const shutdown = () => {
    logger.info("shutting down", { metrics: snapshotMetrics() });
    poller.stop();
    interactionPoller.stop();
    reconciliation.stop();
    adminServer.stop();
    authService.destroy();
    void longConnectionManager.stop();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("fatal startup error", { error: String(err) });
  process.exit(1);
});
