import { FeishuClient } from "./client.js";
import type { ConfigStore } from "../config/store.js";
import type { BridgeConfig } from "../types.js";
import { logger } from "../observability/logger.js";

export class FeishuClientRegistry {
  private clients = new Map<string, FeishuClient>();
  private defaultClient: FeishuClient | null = null;
  private mode: "store" | "env" = "env";

  constructor(private store: ConfigStore | null) {}

  initFromStore(): void {
    if (!this.store) return;
    this.mode = "store";
    this.clients.clear();
    this.defaultClient = null;
    const secrets = this.store.getSecrets();
    if (secrets.defaultFeishuAppId && secrets.defaultFeishuAppSecret) {
      this.defaultClient = new FeishuClient(
        secrets.defaultFeishuAppId,
        secrets.defaultFeishuAppSecret,
      );
    }
    const companies = this.store.getCompanies();
    for (const c of companies) {
      const binding = c.feishuBinding;
      if (binding?.mode === "global" && this.defaultClient) {
        this.clients.set(c.companyId, this.defaultClient);
      } else if (binding?.mode === "company") {
        const feishu = this.store.getFeishuForCompany(c.companyId);
        if (feishu) {
          this.clients.set(c.companyId, new FeishuClient(feishu.appId, feishu.appSecret));
        }
      } else {
        const feishu = this.store.getFeishuForCompany(c.companyId);
        if (feishu) {
          this.clients.set(c.companyId, new FeishuClient(feishu.appId, feishu.appSecret));
        }
      }
    }
    logger.info("feishu client registry initialized from store", {
      companies: this.clients.size,
      hasDefault: !!this.defaultClient,
    });
  }

  initFromConfig(config: BridgeConfig): void {
    this.mode = "env";
    this.clients.clear();
    this.defaultClient = null;
    if (config.feishuAppId && config.feishuAppSecret) {
      this.defaultClient = new FeishuClient(config.feishuAppId, config.feishuAppSecret);
    }
    for (const c of config.companies) {
      if (c.feishu?.appId && c.feishu?.appSecret) {
        this.clients.set(c.companyId, new FeishuClient(c.feishu.appId, c.feishu.appSecret));
      } else if (this.defaultClient) {
        this.clients.set(c.companyId, this.defaultClient);
      }
    }
    logger.info("feishu client registry initialized from config", {
      companies: this.clients.size,
      hasDefault: !!this.defaultClient,
    });
  }

  getForCompany(companyId: string): FeishuClient | null {
    return this.clients.get(companyId) ?? null;
  }

  getDefault(): FeishuClient | null {
    return this.defaultClient;
  }

  hasAny(): boolean {
    return this.clients.size > 0 || !!this.defaultClient;
  }
}
