import * as lark from "@larksuiteoapi/node-sdk";
import { logger } from "../observability/logger.js";

export interface CardActionEvent {
  eventId: string;
  operatorOpenId: string;
  operatorName: string;
  actionValue: Record<string, string>;
  tenantKey: string;
}

export type CardActionCallback = (event: CardActionEvent) => Promise<Record<string, unknown> | void>;

export class FeishuLongConnection {
  private wsClient: lark.WSClient;
  private started = false;

  constructor(
    appId: string,
    appSecret: string,
    private onCardAction: CardActionCallback,
  ) {
    this.wsClient = new lark.WSClient({
      appId,
      appSecret,
      loggerLevel: lark.LoggerLevel.info,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    const dispatcher = new lark.EventDispatcher({}).register({
      "card.action.trigger": async (data: Record<string, unknown>) => {
        const event = this.parseCardAction(data);
        if (!event) return;
        try {
          const result = await this.onCardAction(event);
          return result ?? undefined;
        } catch (err) {
          logger.error("card action handler error", {
            eventId: event.eventId,
            error: String(err),
          });
        }
      },
    });
    this.wsClient.start({ eventDispatcher: dispatcher });
    this.started = true;
    logger.info("feishu long connection started");
  }

  async stop(): Promise<void> {
    this.started = false;
    logger.info("feishu long connection stopped");
  }

  isStarted(): boolean {
    return this.started;
  }

  private parseCardAction(data: Record<string, unknown>): CardActionEvent | null {
    try {
      const event = data.event as Record<string, unknown> | undefined;
      const header = data.header as Record<string, unknown> | undefined;
      if (!event) return null;

      const operator = event.operator as Record<string, unknown> | undefined;
      const action = event.action as Record<string, unknown> | undefined;
      if (!operator || !action) return null;

      const actionValue = (action.value ?? {}) as Record<string, string>;
      return {
        eventId: (header?.event_id as string) ?? (data.event_id as string) ?? crypto.randomUUID(),
        operatorOpenId: (operator.open_id as string) ?? "",
        operatorName: (operator.name as string) ?? "unknown",
        actionValue,
        tenantKey: (header?.tenant_key as string) ?? "",
      };
    } catch (err) {
      logger.warn("failed to parse card action", { error: String(err) });
      return null;
    }
  }
}
