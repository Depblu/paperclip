import { createHash, randomBytes } from "node:crypto";
import type { ActionTokenRepository } from "../storage/repositories.js";
import type { VersionSnapshot } from "../types.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function computePayloadHash(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
  return createHash("sha256").update(json).digest("hex");
}

export function buildVersionSnapshot(updatedAt: string, payload: unknown): VersionSnapshot {
  return {
    approvalUpdatedAt: updatedAt,
    payloadHash: computePayloadHash(payload),
  };
}

export function versionMatches(current: VersionSnapshot, bound: VersionSnapshot): boolean {
  return current.approvalUpdatedAt === bound.approvalUpdatedAt && current.payloadHash === bound.payloadHash;
}

export class ActionTokenService {
  constructor(
    private repo: ActionTokenRepository,
    private ttlMs: number,
  ) {}

  generate(
    approvalId: string,
    companyId: string,
    recipientOpenId: string,
    allowedActions: string[],
    version: VersionSnapshot,
  ): string {
    const raw = randomBytes(32).toString("hex");
    const credentialHash = hashToken(raw);
    this.repo.insert({
      credentialHash,
      approvalId,
      companyId,
      recipientOpenId,
      allowedActions: JSON.stringify(allowedActions),
      approvalUpdatedAt: version.approvalUpdatedAt,
      payloadHash: version.payloadHash,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      consumedAt: null,
      invalidatedAt: null,
      createdAt: new Date().toISOString(),
    });
    return raw;
  }

  validate(token: string): {
    valid: boolean;
    record?: {
      approvalId: string;
      companyId: string;
      recipientOpenId: string;
      allowedActions: string[];
      version: VersionSnapshot;
    };
    reason?: string;
  } {
    const credentialHash = hashToken(token);
    const rec = this.repo.findValid(credentialHash);
    if (!rec) {
      return { valid: false, reason: "token_not_found_or_expired_or_used" };
    }
    return {
      valid: true,
      record: {
        approvalId: rec.approvalId,
        companyId: rec.companyId,
        recipientOpenId: rec.recipientOpenId,
        allowedActions: JSON.parse(rec.allowedActions) as string[],
        version: {
          approvalUpdatedAt: rec.approvalUpdatedAt,
          payloadHash: rec.payloadHash,
        },
      },
    };
  }

  consume(token: string) {
    this.repo.consume(hashToken(token));
  }

  invalidate(token: string) {
    this.repo.invalidate(hashToken(token));
  }

  invalidateByApproval(approvalId: string, version?: VersionSnapshot) {
    this.repo.invalidateByApproval(approvalId, version);
  }
}
