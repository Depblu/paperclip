import { randomBytes } from "node:crypto";
import type { CardActionEvent } from "./long-connection.js";
import type { ApproverConfig } from "../types.js";

const DEFAULT_TIMEOUT_MS = 600 * 1000;
const DEFAULT_RETENTION_MS = 10 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;

export type TestApprovalStatus = "pending" | "approved" | "rejected" | "cancelled" | "timed_out";

export interface TestApprovalResult {
  sessionId: string;
  companyId: string;
  type: string;
  status: TestApprovalStatus;
  createdAt: string;
  expiresAt: string;
  operatorOpenId?: string;
  operatorName?: string;
  completedAt?: string;
}

interface TestApprovalSession extends TestApprovalResult {
  token: string;
  approverNames: Map<string, string>;
}

export interface TestApprovalSessionsOptions {
  timeoutMs?: number;
  retentionMs?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
}

export type TestApprovalActionResult =
  | { matched: false }
  | { matched: true; response: Record<string, unknown> };

export class TestApprovalSessions {
  private readonly sessions = new Map<string, TestApprovalSession>();
  private readonly sessionIdByToken = new Map<string, string>();
  private readonly timeoutMs: number;
  private readonly retentionMs: number;
  private readonly now: () => number;
  private cleanupTimer: ReturnType<typeof setInterval> | null;

  constructor(options: TestApprovalSessionsOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    this.now = options.now ?? (() => Date.now());
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();
  }

  create(companyId: string, type: string, approvers: ApproverConfig[]): {
    sessionId: string;
    token: string;
    expiresAt: string;
  } {
    const createdAtMs = this.now();
    const sessionId = `test-${randomBytes(16).toString("hex")}`;
    const token = randomBytes(24).toString("hex");
    const session: TestApprovalSession = {
      sessionId,
      token,
      companyId,
      type,
      status: "pending",
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.timeoutMs).toISOString(),
      approverNames: new Map(
        approvers.map((approver) => [approver.openId.trim(), approver.name.trim()]),
      ),
    };
    this.sessions.set(sessionId, session);
    this.sessionIdByToken.set(token, sessionId);
    return { sessionId, token, expiresAt: session.expiresAt };
  }

  get(sessionId: string): TestApprovalResult | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.expireIfNeeded(session);
    return this.toResult(session);
  }

  cancel(sessionId: string): TestApprovalResult | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.expireIfNeeded(session);
    if (session.status === "pending") {
      session.status = "cancelled";
      session.completedAt = new Date(this.now()).toISOString();
    }
    return this.toResult(session);
  }

  handleAction(event: CardActionEvent): TestApprovalActionResult {
    const token = event.actionValue.token;
    const sessionId = token ? this.sessionIdByToken.get(token) : undefined;
    if (!sessionId) return { matched: false };

    const session = this.sessions.get(sessionId);
    if (!session || event.actionValue.approval_id !== sessionId) {
      return { matched: true, response: this.toast("测试会话无效") };
    }
    this.expireIfNeeded(session);
    if (session.status !== "pending") {
      return { matched: true, response: this.toast(this.terminalMessage(session.status)) };
    }
    if (!session.approverNames.has(event.operatorOpenId)) {
      return { matched: true, response: this.toast("您不是该测试的指定审批人") };
    }

    const action = event.actionValue.action;
    if (action !== "approve" && action !== "reject") {
      return { matched: true, response: this.toast("无效的测试操作") };
    }
    session.status = action === "approve" ? "approved" : "rejected";
    session.operatorOpenId = event.operatorOpenId;
    const callbackName = event.operatorName.trim();
    session.operatorName = callbackName && callbackName !== "unknown"
      ? callbackName
      : session.approverNames.get(event.operatorOpenId) || event.operatorOpenId;
    session.completedAt = new Date(this.now()).toISOString();
    return { matched: true, response: this.toast(action === "approve" ? "测试结果：已同意" : "测试结果：已拒绝") };
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.sessions.clear();
    this.sessionIdByToken.clear();
  }

  private expireIfNeeded(session: TestApprovalSession): void {
    if (session.status === "pending" && this.now() >= Date.parse(session.expiresAt)) {
      session.status = "timed_out";
      session.completedAt = new Date(this.now()).toISOString();
    }
  }

  private cleanup(): void {
    for (const [sessionId, session] of this.sessions) {
      this.expireIfNeeded(session);
      if (this.now() >= Date.parse(session.expiresAt) + this.retentionMs) {
        this.sessions.delete(sessionId);
        this.sessionIdByToken.delete(session.token);
      }
    }
  }

  private toResult(session: TestApprovalSession): TestApprovalResult {
    const { token: _token, approverNames: _approvers, ...result } = session;
    return result;
  }

  private terminalMessage(status: TestApprovalStatus): string {
    if (status === "cancelled") return "测试等待已取消";
    if (status === "timed_out") return "测试等待已超时";
    return "该测试已完成";
  }

  private toast(content: string): Record<string, unknown> {
    return { toast: { type: "info", content } };
  }
}
