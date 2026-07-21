import type { BridgeConfig, PaperclipApproval } from "../types.js";
import type { PaperclipClient } from "./client.js";
import { logger } from "../observability/logger.js";
import { incMetric, METRIC_NAMES } from "../observability/metrics.js";

export type DiscoveredHandler = (approval: PaperclipApproval, companyId: string) => Promise<void>;

export class ApprovalPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private config: BridgeConfig,
    private client: PaperclipClient,
    private onDiscovered: DiscoveredHandler,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
    logger.info("approval poller started", { intervalMs: this.config.pollIntervalMs });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("approval poller stopped");
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
      const approvals = await this.client.listPendingApprovals(companyId);
      incMetric(METRIC_NAMES.pendingDiscovered, approvals.length);
      for (const approval of approvals) {
        await this.onDiscovered(approval, companyId);
      }
    } catch (err) {
      logger.warn("poll company failed", { companyId, error: String(err) });
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
