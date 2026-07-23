import { FeishuLongConnection, type CardActionCallback } from "./long-connection.js";
import type { ConfigStore } from "../config/store.js";
import { logger } from "../observability/logger.js";

export class LongConnectionManager {
  private connections = new Map<string, FeishuLongConnection>();
  private started = false;
  private onCardAction: CardActionCallback | null = null;

  constructor(private store: ConfigStore | null) {}

  async start(
    onCardAction: CardActionCallback,
    initialCredentials: Array<{ appId: string; appSecret: string }> = [],
  ): Promise<void> {
    if (this.started) return;
    this.onCardAction = onCardAction;
    const credentials = [...initialCredentials];

    if (this.store) {
      for (const company of this.store.getCompanies()) {
        const feishu = this.store.getFeishuForCompany(company.companyId);
        if (feishu) credentials.push(feishu);
      }
      const secrets = this.store.getSecrets();
      if (secrets.defaultFeishuAppId && secrets.defaultFeishuAppSecret) {
        credentials.push({
          appId: secrets.defaultFeishuAppId,
          appSecret: secrets.defaultFeishuAppSecret,
        });
      }
    }

    for (const credential of credentials) {
      await this.startConnection(credential.appId, credential.appSecret);
    }
    this.started = true;
    logger.info("long connection manager started", { connections: this.connections.size });
  }

  async ensureConnection(appId: string, appSecret: string): Promise<void> {
    if (!this.onCardAction) throw new Error("feishu callback connection manager not started");
    const connection = await this.startConnection(appId, appSecret);
    await connection.waitUntilReady();
  }

  async stop(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.stop();
    }
    this.connections.clear();
    this.onCardAction = null;
    this.started = false;
  }

  private async startConnection(appId: string, appSecret: string): Promise<FeishuLongConnection> {
    const existing = this.connections.get(appId);
    if (existing) return existing;
    if (!this.onCardAction) throw new Error("feishu callback connection manager not started");

    const connection = new FeishuLongConnection(appId, appSecret, this.onCardAction);
    this.connections.set(appId, connection);
    try {
      await connection.start();
      return connection;
    } catch (err) {
      this.connections.delete(appId);
      throw err;
    }
  }
}
