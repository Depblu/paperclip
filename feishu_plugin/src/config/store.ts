import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type {
  BridgeGlobalConfig,
  CompanyConfig,
  SecretsConfig,
  CompanyConfigPublic,
  AuthMetadata,
} from "../types.js";
import { logger } from "../observability/logger.js";

const DEFAULT_GLOBAL: BridgeGlobalConfig = {
  paperclipBaseUrl: "http://localhost:3100",
  paperclipPublicUrl: "http://localhost:3100",
  pollIntervalMs: 5000,
  reconciliationIntervalMs: 60000,
  scanConcurrency: 4,
  requestTimeoutMs: 10000,
  sqlitePath: "./data/bridge.db",
  actionTokenTtlMs: 86400000,
  adminPort: 9090,
  adminHost: "127.0.0.1",
};

export class ConfigStore {
  private configDir: string;
  private globalPath: string;
  private companiesPath: string;
  private secretsPath: string;
  private authMetadataPath: string;

  constructor(configDir = "./config") {
    this.configDir = resolve(configDir);
    this.globalPath = resolve(this.configDir, "bridge-config.json");
    this.companiesPath = resolve(this.configDir, "companies.json");
    this.secretsPath = resolve(this.configDir, "secrets.json");
    this.authMetadataPath = resolve(this.configDir, "auth-metadata.json");
    mkdirSync(this.configDir, { recursive: true });
  }

  private readJson<T>(path: string, fallback: T): T {
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch (err) {
      logger.warn("config file parse error", { path, error: String(err) });
      return fallback;
    }
  }

  private writeJson(path: string, data: unknown): void {
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  }

  private writeSecretsAtomic(data: unknown): void {
    const tmpPath = join(this.configDir, `.secrets-tmp-${randomBytes(4).toString("hex")}`);
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, this.secretsPath);
    chmodSync(this.secretsPath, 0o600);
  }

  getGlobal(): BridgeGlobalConfig {
    const stored = this.readJson<Partial<BridgeGlobalConfig>>(this.globalPath, {});
    return { ...DEFAULT_GLOBAL, ...stored };
  }

  saveGlobal(config: BridgeGlobalConfig): void {
    this.writeJson(this.globalPath, config);
  }

  getSecrets(): SecretsConfig {
    return this.readJson<SecretsConfig>(this.secretsPath, {
      paperclipApiKey: "",
    });
  }

  saveSecrets(secrets: SecretsConfig): void {
    this.writeSecretsAtomic(secrets);
  }

  getCompanies(): CompanyConfig[] {
    const data = this.readJson<{ companies: CompanyConfig[] }>(this.companiesPath, {
      companies: [],
    });
    return data.companies ?? [];
  }

  saveCompanies(companies: CompanyConfig[]): void {
    this.writeJson(this.companiesPath, { companies });
  }

  addCompany(company: CompanyConfig): void {
    const companies = this.getCompanies();
    const idx = companies.findIndex((c) => c.companyId === company.companyId);
    if (idx >= 0) {
      companies[idx] = company;
    } else {
      companies.push(company);
    }
    this.saveCompanies(companies);
    this.syncCompanySecret(company);
  }

  updateCompany(companyId: string, patch: Partial<CompanyConfig>): CompanyConfig | null {
    const companies = this.getCompanies();
    const idx = companies.findIndex((c) => c.companyId === companyId);
    if (idx < 0) return null;
    companies[idx] = { ...companies[idx], ...patch, companyId };
    this.saveCompanies(companies);
    this.syncCompanySecret(companies[idx]);
    return companies[idx];
  }

  removeCompany(companyId: string): boolean {
    const companies = this.getCompanies();
    const filtered = companies.filter((c) => c.companyId !== companyId);
    if (filtered.length === companies.length) return false;
    this.saveCompanies(filtered);
    const secrets = this.getSecrets();
    if (secrets.companySecrets?.[companyId]) {
      delete secrets.companySecrets[companyId];
      this.saveSecrets(secrets);
    }
    return true;
  }

  private syncCompanySecret(company: CompanyConfig): void {
    if (!company.feishu) return;
    const secrets = this.getSecrets();
    secrets.companySecrets ??= {};
    secrets.companySecrets[company.companyId] = { ...company.feishu };
    this.saveSecrets(secrets);
  }

  getFeishuForCompany(companyId: string): { appId: string; appSecret: string } | null {
    const secrets = this.getSecrets();
    const companySecret = secrets.companySecrets?.[companyId];
    if (companySecret?.appId && companySecret?.appSecret) {
      return companySecret;
    }
    return null;
  }

  getCompaniesPublic(): CompanyConfigPublic[] {
    return this.getCompanies().map((c) => ({
      companyId: c.companyId,
      name: c.name,
      hasFeishu: !!(
        c.feishu?.appId ||
        this.getSecrets().companySecrets?.[c.companyId]?.appId
      ),
      defaultApprovers: c.defaultApprovers,
      routing: c.routing,
    }));
  }

  maskSecrets(): SecretsConfig {
    const s = this.getSecrets();
    return {
      paperclipApiKey: s.paperclipApiKey ? "***" : "",
      defaultFeishuAppId: s.defaultFeishuAppId ? mask(s.defaultFeishuAppId) : undefined,
      defaultFeishuAppSecret: s.defaultFeishuAppSecret ? "***" : undefined,
      companySecrets: s.companySecrets
        ? Object.fromEntries(
            Object.entries(s.companySecrets).map(([k, v]) => [
              k,
              { appId: mask(v.appId), appSecret: "***" as string },
            ]),
          )
        : undefined,
    };
  }

  saveAuthMetadata(metadata: AuthMetadata): void {
    this.writeJson(this.authMetadataPath, metadata);
  }

  getAuthMetadata(): AuthMetadata | null {
    if (!existsSync(this.authMetadataPath)) return null;
    try {
      return JSON.parse(readFileSync(this.authMetadataPath, "utf-8")) as AuthMetadata;
    } catch {
      return null;
    }
  }

  clearAuthMetadata(): void {
    if (existsSync(this.authMetadataPath)) {
      writeFileSync(this.authMetadataPath, "", "utf-8");
    }
  }
}

function mask(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}
