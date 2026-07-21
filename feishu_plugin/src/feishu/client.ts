import * as lark from "@larksuiteoapi/node-sdk";
import type { DeliveryReference, SendApprovalCardInput, UpdateApprovalCardInput } from "../types.js";
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
}
