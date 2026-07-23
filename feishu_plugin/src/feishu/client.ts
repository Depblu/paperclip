import * as lark from "@larksuiteoapi/node-sdk";
import type { DeliveryReference, FeishuAppVerifyResult, FeishuDirectoryResult, FeishuUser, SendApprovalCardInput, UpdateApprovalCardInput } from "../types.js";
import { logger } from "../observability/logger.js";

const FEISHU_REQUEST_TIMEOUT_MS = 15000;
const MAX_DEPARTMENTS = 200;
const MAX_PAGES_PER_DEPARTMENT = 50;

export interface FeishuClientOptions {
  requestTimeoutMs?: number;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class FeishuClient {
  private client: lark.Client;
  private appId: string;
  private appSecret: string;
  private requestTimeoutMs: number;

  constructor(appId: string, appSecret: string, options: FeishuClientOptions = {}) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.requestTimeoutMs = options.requestTimeoutMs ?? FEISHU_REQUEST_TIMEOUT_MS;
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`feishu sdk timeout: ${label}`)),
        this.requestTimeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async sendInteractiveCard(
    openId: string,
    cardContent: string,
  ): Promise<DeliveryReference> {
    const res = await this.client.im.message.create({
      params: { receive_id_type: "open_id" },
      data: {
        receive_id: openId,
        content: cardContent,
        msg_type: "interactive",
      },
    });
    const messageId = res.data?.message_id;
    if (!messageId) {
      throw new Error(`Feishu send failed: no message_id returned, code=${res.code}`);
    }
    return { messageId };
  }

  async updateInteractiveCard(messageId: string, cardContent: string): Promise<void> {
    const res = await this.client.im.message.patch({
      path: { message_id: messageId },
      data: { content: cardContent },
    });
    if (res.code !== 0) {
      logger.warn("feishu card update failed", { messageId, code: res.code, msg: res.msg });
      throw new Error(`feishu card update failed: code=${res.code} msg=${res.msg}`);
    }
  }

  getRawClient(): lark.Client {
    return this.client;
  }

  async searchUsers(keyword: string): Promise<FeishuUser[]> {
    try {
      const res = await this.client.contact.user.batchGetId({
        params: { user_id_type: "open_id" },
        data: { emails: [], mobiles: [] },
      });
      void res;
      return [];
    } catch {
      return [];
    }
  }

  async listUsers(): Promise<FeishuUser[]> {
    const result = await this.listUsersWithStatus();
    return result.users;
  }

  async listUsersWithStatus(): Promise<FeishuDirectoryResult> {
    const users: FeishuUser[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    const visitedDepartments = new Set<string>();
    const queue: string[] = ["0"];
    let complete = true;
    let deptProcessed = 0;

    while (queue.length > 0) {
      const deptId = queue.shift()!;
      if (visitedDepartments.has(deptId)) continue;
      visitedDepartments.add(deptId);
      deptProcessed++;
      if (deptProcessed > MAX_DEPARTMENTS) {
        complete = false;
        warnings.push(`department limit reached (${MAX_DEPARTMENTS})`);
        break;
      }

      let pageToken: string | undefined;
      let pageCount = 0;
      while (true) {
        pageCount++;
        if (pageCount > MAX_PAGES_PER_DEPARTMENT) {
          complete = false;
          warnings.push(`user page limit reached for department ${deptId}`);
          break;
        }
        let res;
        try {
          res = await this.withTimeout(
            this.client.contact.user.list({
              params: {
                department_id: deptId,
                user_id_type: "open_id",
                page_size: 50,
                ...(pageToken ? { page_token: pageToken } : {}),
              },
            }),
            `user.list dept=${deptId}`,
          );
        } catch (err) {
          complete = false;
          warnings.push(`user list failed for department ${deptId}: ${errMsg(err)}`);
          break;
        }
        const items = (res.data?.items ?? []) as Array<{
          open_id?: string;
          name?: string;
          email?: string;
        }>;
        for (const item of items) {
          if (item.open_id && !seen.has(item.open_id)) {
            seen.add(item.open_id);
            users.push({ openId: item.open_id, name: item.name ?? "", email: item.email });
          }
        }
        pageToken = res.data?.page_token ?? undefined;
        if (!pageToken) break;
      }

      let childPageToken: string | undefined;
      let childPageCount = 0;
      while (true) {
        childPageCount++;
        if (childPageCount > MAX_PAGES_PER_DEPARTMENT) {
          complete = false;
          warnings.push(`child department page limit reached for ${deptId}`);
          break;
        }
        let childRes;
        try {
          childRes = await this.withTimeout(
            this.client.contact.department.children({
              path: { department_id: deptId },
              params: {
                department_id_type: "open_department_id",
                page_size: 50,
                ...(childPageToken ? { page_token: childPageToken } : {}),
              },
            }),
            `department.children dept=${deptId}`,
          );
        } catch (err) {
          complete = false;
          warnings.push(`child department query failed for ${deptId}: ${errMsg(err)}`);
          break;
        }
        const childItems = (childRes.data?.items ?? []) as Array<{ open_department_id?: string }>;
        for (const child of childItems) {
          if (child.open_department_id && !visitedDepartments.has(child.open_department_id)) {
            queue.push(child.open_department_id);
          }
        }
        childPageToken = childRes.data?.page_token ?? undefined;
        if (!childPageToken) break;
      }
    }

    return { users, complete, warnings };
  }

  async verifyApp(): Promise<FeishuAppVerifyResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FEISHU_REQUEST_TIMEOUT_MS);
      let tokenRes: Response;
      try {
        tokenRes = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof DOMException && err.name === "AbortError") {
          return { valid: false, error: "feishu unreachable (timeout)" };
        }
        return { valid: false, error: "feishu unreachable" };
      }
      clearTimeout(timer);

      const tokenData = await tokenRes.json() as { code: number; msg?: string; tenant_access_token?: string };
      if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
        return { valid: false, error: tokenData.msg || `code=${tokenData.code}` };
      }
      const token = tokenData.tenant_access_token;

      let botName: string | undefined;
      let botId: string | undefined;
      let appName: string | undefined;
      try {
        const botController = new AbortController();
        const botTimer = setTimeout(() => botController.abort(), FEISHU_REQUEST_TIMEOUT_MS);
        const botRes = await fetch("https://open.feishu.cn/open-apis/bot/v3/info", {
          headers: { Authorization: `Bearer ${token}` },
          signal: botController.signal,
        });
        clearTimeout(botTimer);
        const botData = await botRes.json() as { code: number; bot?: { app_name?: string; bot_name?: string; open_id?: string } };
        if (botData.code === 0 && botData.bot) {
          appName = botData.bot.app_name;
          botName = botData.bot.bot_name;
          botId = botData.bot.open_id;
        }
      } catch { /* bot info optional */ }

      let contactsPermission = false;
      try {
        const scopeController = new AbortController();
        const scopeTimer = setTimeout(() => scopeController.abort(), FEISHU_REQUEST_TIMEOUT_MS);
        const scopeRes = await fetch("https://open.feishu.cn/open-apis/contact/v3/users?page_size=1&department_id=0", {
          headers: { Authorization: `Bearer ${token}` },
          signal: scopeController.signal,
        });
        clearTimeout(scopeTimer);
        const scopeData = await scopeRes.json() as { code: number };
        contactsPermission = scopeRes.ok && scopeData.code === 0;
      } catch { /* contacts check optional */ }

      return {
        valid: true,
        appName,
        botId,
        botName,
        permissions: { contacts: contactsPermission },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: msg };
    }
  }
}
