import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PreviewTokenPayload } from "../types.js";

export interface PreviewTokenOptions {
  ttlMs: number;
  /** Injectable for testing; defaults to random 32 bytes. */
  secret?: Buffer;
  /** Injectable clock for testing; defaults to Date.now. */
  now?: () => number;
}

export class PreviewTokenService {
  private secret: Buffer;
  private ttlMs: number;
  private now: () => number;

  constructor(opts: PreviewTokenOptions) {
    this.ttlMs = opts.ttlMs;
    this.secret = opts.secret ?? randomBytes(32);
    this.now = opts.now ?? (() => Date.now());
  }

  generate(payload: Omit<PreviewTokenPayload, "exp">): string {
    const full: PreviewTokenPayload = {
      ...payload,
      exp: this.now() + this.ttlMs,
    };
    const data = Buffer.from(JSON.stringify(full)).toString("base64url");
    const sig = this.sign(data);
    return `${data}.${sig}`;
  }

  verify(token: string): { valid: true; payload: PreviewTokenPayload } | { valid: false; reason: string } {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return { valid: false, reason: "malformed" };
    const data = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    const expected = this.sign(data);
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: "signature_mismatch" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    } catch {
      return { valid: false, reason: "malformed" };
    }

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { valid: false, reason: "malformed" };
    }
    const parsed = payload as PreviewTokenPayload;

    if (typeof parsed.exp !== "number" || !Number.isInteger(parsed.exp)) {
      return { valid: false, reason: "malformed" };
    }
    if (this.now() > parsed.exp) {
      return { valid: false, reason: "expired" };
    }
    if (
      typeof parsed.companyId !== "string" || !parsed.companyId ||
      typeof parsed.issueId !== "string" || !parsed.issueId ||
      typeof parsed.key !== "string" || !parsed.key ||
      typeof parsed.revisionId !== "string" || !parsed.revisionId
    ) {
      return { valid: false, reason: "incomplete" };
    }
    return { valid: true, payload: parsed };
  }

  private sign(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }
}
