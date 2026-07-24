import type { BridgeConfig, PaperclipInteraction, PaperclipIssueListItem } from "../types.js";
import type { PaperclipClient } from "./client.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export type InteractionDiscoveredHandler = (
  interaction: PaperclipInteraction,
  companyId: string,
  issue: PaperclipIssueListItem,
) => Promise<void>;

const ISSUE_PAGE_SIZE = 50;

export class InteractionPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private config: BridgeConfig,
    private client: PaperclipClient,
    private onDiscovered: InteractionDiscoveredHandler,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
    logger.info("interaction poller started", { intervalMs: this.config.pollIntervalMs });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("interaction poller stopped");
  }

  private async poll() {
    if (this.running) return;
    this.running = true;
    try {
      const chunks = this.chunk(this.config.companies, this.config.scanConcurrency);
      for (const batch of chunks) {
        await Promise.allSettled(batch.map((c) => this.pollCompany(c.companyId)));
      }
    } finally {
      this.running = false;
    }
  }

  private async pollCompany(companyId: string) {
    try {
      let offset = 0;
      while (true) {
        const issues = await this.client.listCompanyIssues(companyId, ISSUE_PAGE_SIZE, offset);
        if (issues.length === 0) break;

        for (const issue of issues) {
          await this.pollIssueInteractions(issue, companyId);
        }

        if (issues.length < ISSUE_PAGE_SIZE) break;
        offset += ISSUE_PAGE_SIZE;
      }
    } catch (err) {
      logger.warn("interaction poll company failed", { companyId, error: String(err) });
    }
  }

  private async pollIssueInteractions(issue: PaperclipIssueListItem, companyId: string) {
    try {
      const interactions = await this.client.listIssueInteractions(issue.id);
      const pending = interactions.filter(
        (i) => i.kind === "request_confirmation" && i.status === "pending",
      );
      incMetric(METRIC_NAMES.interactionsDiscovered, pending.length);
      for (const interaction of pending) {
        await this.onDiscovered(interaction, companyId, issue);
      }
    } catch (err) {
      logger.warn("interaction poll issue failed", { issueId: issue.id, companyId, error: String(err) });
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}
