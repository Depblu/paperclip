import { randomBytes } from "node:crypto";
import type { FeishuVerificationSession } from "../types.js";

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60000;

export interface VerificationSessionsOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
}

export class FeishuVerificationSessions {
  private sessions = new Map<string, FeishuVerificationSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: VerificationSessionsOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    const interval = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupTimer = setInterval(() => this.cleanup(), interval);
    this.cleanupTimer.unref?.();
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  create(appId: string, appSecret: string): string {
    const verificationId = randomBytes(24).toString("hex");
    this.sessions.set(verificationId, {
      verificationId,
      appId,
      appSecret,
      createdAt: this.now(),
    });
    return verificationId;
  }

  get(verificationId: string): { appId: string; appSecret: string } | null {
    const session = this.sessions.get(verificationId);
    if (!session) return null;
    if (this.now() - session.createdAt > this.ttlMs) {
      this.sessions.delete(verificationId);
      return null;
    }
    return { appId: session.appId, appSecret: session.appSecret };
  }

  consume(verificationId: string): boolean {
    return this.sessions.delete(verificationId);
  }

  private cleanup(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
