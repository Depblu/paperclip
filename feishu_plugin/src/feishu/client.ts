import * as lark from "@larksuiteoapi/node-sdk";
import type { DeliveryReference, FeishuUser, SendApprovalCardInput, UpdateApprovalCardInput } from "../types.js";
import { logger } from "../observability/logger.js";

export class FeishuClient {
  private client: lark.Client;

  constructor(appId: string, appSecret: string) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
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
    const users: FeishuUser[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.client.contact.user.list({
        params: {
          department_id: "0",
          user_id_type: "open_id",
          page_size: 50,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      const items = (res.data?.items ?? []) as Array<{
        open_id?: string;
        name?: string;
      }>;
      for (const item of items) {
        if (item.open_id) {
          users.push({ openId: item.open_id, name: item.name ?? "" });
        }
      }
      pageToken = res.data?.page_token ?? undefined;
    } while (pageToken);
    return users;
  }
}
