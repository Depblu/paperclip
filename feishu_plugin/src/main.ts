import { loadConfig } from "./config/index.js";
import { openDatabase } from "./storage/database.js";
import { DeliveryRepository, CallbackEventRepository, ActionTokenRepository } from "./storage/repositories.js";
import { PaperclipClient } from "./paperclip/client.js";
import { ApprovalPoller } from "./paperclip/approval-poller.js";
import { FeishuClient } from "./feishu/client.js";
import { FeishuLongConnection } from "./feishu/long-connection.js";
import { CallbackHandler } from "./feishu/callback-handler.js";
import { ActionTokenService } from "./approvals/action-token.js";
import { ApprovalCoordinator } from "./approvals/coordinator.js";
import { Reconciliation } from "./approvals/reconciliation.js";
import { logger } from "./observability/logger.js";
import { snapshotMetrics } from "./observability/metrics.js";

async function main() {
  logger.info("paperclip-feishu-bridge starting");

  const config = loadConfig();
  const db = openDatabase(config.sqlitePath);

  const deliveryRepo = new DeliveryRepository(db);
  const callbackRepo = new CallbackEventRepository(db);
  const tokenRepo = new ActionTokenRepository(db);

  const paperclip = new PaperclipClient(
    config.paperclipBaseUrl,
    config.paperclipApiKey,
    config.requestTimeoutMs,
  );

  const feishu = new FeishuClient(config.feishuAppId, config.feishuAppSecret);

  const tokenService = new ActionTokenService(tokenRepo, config.actionTokenTtlMs);

  const coordinator = new ApprovalCoordinator({
    config, paperclip, feishu, tokenService, deliveryRepo,
  });

  const callbackHandler = new CallbackHandler({
    config, paperclip, feishu, tokenService, deliveryRepo, callbackRepo,
  });

  const longConnection = new FeishuLongConnection(
    config.feishuAppId,
    config.feishuAppSecret,
    (event) => callbackHandler.handle(event),
  );

  const poller = new ApprovalPoller(config, paperclip, (approval, companyId) =>
    coordinator.handleDiscovered(approval, companyId),
  );

  const reconciliation = new Reconciliation({
    config, paperclip, feishu, tokenService, deliveryRepo,
  });

  const healthy = await paperclip.healthCheck();
  if (!healthy) {
    logger.warn("paperclip api not reachable at startup, will retry on poll");
  }

  await longConnection.start();
  poller.start();
  reconciliation.start();

  logger.info("paperclip-feishu-bridge started", {
    companies: config.companies.length,
    pollIntervalMs: config.pollIntervalMs,
    reconciliationIntervalMs: config.reconciliationIntervalMs,
  });

  const shutdown = () => {
    logger.info("shutting down", { metrics: snapshotMetrics() });
    poller.stop();
    reconciliation.stop();
    void longConnection.stop();
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
