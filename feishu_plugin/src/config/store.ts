import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type {
  BridgeGlobalConfig,
  CompanyConfig,
  CompanyFeishuConfig,
  SecretsConfig,
  SecretsPublic,
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
  documentTunnelAutoStart: false,
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
    this.migrateLegacyFeishuSecrets();
  }

  private migrateLegacyFeishuSecrets(): void {
    if (!existsSync(this.companiesPath)) return;
    const raw = this.readJson<{ companies: CompanyConfig[] }>(this.companiesPath, { companies: [] });
    const companies = raw.companies ?? [];
    const dirty = companies.filter((c) => c.feishu?.appId || c.feishu?.appSecret);
    if (dirty.length === 0) return;
    const secrets = this.getSecrets();
    secrets.companySecrets ??= {};
    for (const c of dirty) {
      if (c.feishu?.appId && c.feishu?.appSecret && !secrets.companySecrets[c.companyId]) {
        secrets.companySecrets[c.companyId] = { appId: c.feishu.appId, appSecret: c.feishu.appSecret };
      }
    }
    this.writeSecretsAtomic(secrets);
    const stripped = companies.map((c) => {
      const { feishu: _drop, ...rest } = c;
      return rest as CompanyConfig;
    });
    this.writeJson(this.companiesPath, { companies: stripped });
    logger.info("migrated legacy feishu secrets from companies.json to secrets.json", {
      count: dirty.length,
    });
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
    const sanitized = this.stripSecret(company);
    if (idx >= 0) {
      companies[idx] = sanitized;
    } else {
      companies.push(sanitized);
    }
    this.saveCompanies(companies);
  }

  updateCompany(companyId: string, patch: Partial<CompanyConfig>): CompanyConfig | null {
    const companies = this.getCompanies();
    const idx = companies.findIndex((c) => c.companyId === companyId);
    if (idx < 0) return null;
    companies[idx] = this.stripSecret({ ...companies[idx], ...patch, companyId });
    this.saveCompanies(companies);
    return companies[idx];
  }

  private stripSecret(company: CompanyConfig): CompanyConfig {
    const { feishu: _drop, ...rest } = company;
    return rest as CompanyConfig;
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

  hasDefaultFeishuCredentials(): boolean {
    const s = this.getSecrets();
    return !!(s.defaultFeishuAppId && s.defaultFeishuAppSecret);
  }

  getDefaultFeishuCredentials(): CompanyFeishuConfig | null {
    const s = this.getSecrets();
    if (s.defaultFeishuAppId && s.defaultFeishuAppSecret) {
      return { appId: s.defaultFeishuAppId, appSecret: s.defaultFeishuAppSecret };
    }
    return null;
  }

  hasCompanyFeishuCredentials(companyId: string): boolean {
    const s = this.getSecrets();
    const cs = s.companySecrets?.[companyId];
    return !!(cs?.appId && cs?.appSecret);
  }

  setCompanyFeishuCredentials(companyId: string, creds: CompanyFeishuConfig): void {
    const s = this.getSecrets();
    s.companySecrets ??= {};
    s.companySecrets[companyId] = { appId: creds.appId, appSecret: creds.appSecret };
    this.saveSecrets(s);
  }

  removeCompanyFeishuCredentials(companyId: string): void {
    const s = this.getSecrets();
    if (s.companySecrets?.[companyId]) {
      delete s.companySecrets[companyId];
      this.saveSecrets(s);
    }
  }

  getFeishuForCompany(companyId: string): { appId: string; appSecret: string } | null {
    const secrets = this.getSecrets();
    const companySecret = secrets.companySecrets?.[companyId];
    if (companySecret?.appId && companySecret?.appSecret) {
      return companySecret;
    }
    return null;
  }

  isBindingValid(company: CompanyConfig): boolean {
    const mode = company.feishuBinding?.mode;
    if (mode === "global") return this.hasDefaultFeishuCredentials();
    if (mode === "company") return this.hasCompanyFeishuCredentials(company.companyId);
    return this.hasCompanyFeishuCredentials(company.companyId);
  }

  getCompaniesPublic(): CompanyConfigPublic[] {
    return this.getCompanies().map((c) => ({
      companyId: c.companyId,
      name: c.name,
      hasFeishu: this.isBindingValid(c),
      feishuBinding: c.feishuBinding ?? null,
      feishuBindingValid: this.isBindingValid(c),
      defaultApprovers: c.defaultApprovers,
      routing: c.routing,
    }));
  }

  maskSecrets(): SecretsPublic {
    const s = this.getSecrets();
    return {
      paperclipApiKey: s.paperclipApiKey ? "***" : "",
      hasDefaultFeishuApp: !!(s.defaultFeishuAppId && s.defaultFeishuAppSecret),
      defaultFeishuAppIdDisplay: s.defaultFeishuAppId ? mask(s.defaultFeishuAppId) : undefined,
      defaultFeishuAppSecret: s.defaultFeishuAppSecret ? "***" : "",
      companySecrets: s.companySecrets
        ? Object.fromEntries(
            Object.entries(s.companySecrets).map(([k, v]) => [
              k,
              { appId: mask(v.appId), appSecret: "***" },
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
