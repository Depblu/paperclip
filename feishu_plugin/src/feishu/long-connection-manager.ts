import { FeishuLongConnection, type CardActionCallback } from "./long-connection.js";
import type { ConfigStore } from "../config/store.js";
import { logger } from "../observability/logger.js";

export class LongConnectionManager {
  private connections: FeishuLongConnection[] = [];
  private started = false;

  constructor(private store: ConfigStore) {}

  async start(onCardAction: CardActionCallback): Promise<void> {
    if (this.started) return;
    const seen = new Set<string>();
    const companies = this.store.getCompanies();

    for (const c of companies) {
      const feishu = this.store.getFeishuForCompany(c.companyId);
      if (!feishu) continue;
      const key = feishu.appId;
      if (seen.has(key)) continue;
      seen.add(key);
      const conn = new FeishuLongConnection(feishu.appId, feishu.appSecret, onCardAction);
      await conn.start();
      this.connections.push(conn);
    }

    const secrets = this.store.getSecrets();
    if (
      secrets.defaultFeishuAppId &&
      secrets.defaultFeishuAppSecret &&
      !seen.has(secrets.defaultFeishuAppId)
    ) {
      const conn = new FeishuLongConnection(
        secrets.defaultFeishuAppId,
        secrets.defaultFeishuAppSecret,
        onCardAction,
      );
      await conn.start();
      this.connections.push(conn);
    }

    this.started = true;
    logger.info("long connection manager started", { connections: this.connections.length });
  }

  async stop(): Promise<void> {
    for (const conn of this.connections) {
      await conn.stop();
    }
    this.connections = [];
    this.started = false;
  }
}
