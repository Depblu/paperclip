import type Database from "better-sqlite3";
import type {
  ActionTokenRecord,
  CallbackEvent,
  CallbackResultStatus,
  DeliveryRecord,
  DeliveryStatus,
  VersionSnapshot,
} from "../types.js";

const DELIVERY_COLUMNS = `
  id,
  approval_id AS approvalId,
  company_id AS companyId,
  approval_type AS approvalType,
  approval_status AS approvalStatus,
  approval_updated_at AS approvalUpdatedAt,
  payload_hash AS payloadHash,
  feishu_tenant_key AS feishuTenantKey,
  recipient_open_id AS recipientOpenId,
  recipient_name AS recipientName,
  message_id AS messageId,
  card_id AS cardId,
  delivery_status AS deliveryStatus,
  attempt_count AS attemptCount,
  last_error AS lastError,
  last_attempt_at AS lastAttemptAt,
  sent_at AS sentAt,
  updated_at AS updatedAt
`;

export class DeliveryRepository {
  constructor(private db: Database.Database) {}

  upsert(rec: Omit<DeliveryRecord, "id" | "updatedAt">): void {
    this.db.prepare(`
      INSERT INTO deliveries (
        approval_id, company_id, approval_type, approval_status,
        approval_updated_at, payload_hash, feishu_tenant_key,
        recipient_open_id, recipient_name, message_id, card_id,
        delivery_status, attempt_count, last_error, last_attempt_at, sent_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(approval_id, recipient_open_id, approval_updated_at, payload_hash)
      DO UPDATE SET
        delivery_status = excluded.delivery_status,
        message_id = COALESCE(excluded.message_id, deliveries.message_id),
        card_id = COALESCE(excluded.card_id, deliveries.card_id),
        attempt_count = excluded.attempt_count,
        last_error = excluded.last_error,
        last_attempt_at = excluded.last_attempt_at,
        sent_at = COALESCE(excluded.sent_at, deliveries.sent_at),
        updated_at = datetime('now')
    `).run(
      rec.approvalId, rec.companyId, rec.approvalType, rec.approvalStatus,
      rec.approvalUpdatedAt, rec.payloadHash, rec.feishuTenantKey,
      rec.recipientOpenId, rec.recipientName, rec.messageId, rec.cardId,
      rec.deliveryStatus, rec.attemptCount, rec.lastError, rec.lastAttemptAt, rec.sentAt,
    );
  }

  findActiveByApproval(approvalId: string): DeliveryRecord[] {
    return this.db.prepare(
      `SELECT ${DELIVERY_COLUMNS} FROM deliveries WHERE approval_id = ? AND delivery_status NOT IN ('superseded')`,
    ).all(approvalId) as DeliveryRecord[];
  }

  findPendingOrRetryable(): DeliveryRecord[] {
    return this.db.prepare(
      `SELECT ${DELIVERY_COLUMNS} FROM deliveries WHERE delivery_status IN ('pending', 'failed', 'sending', 'unknown')`,
    ).all() as DeliveryRecord[];
  }

  findActivePending(): DeliveryRecord[] {
    return this.db.prepare(
      `SELECT ${DELIVERY_COLUMNS} FROM deliveries WHERE delivery_status = 'sent' AND approval_status = 'pending'`,
    ).all() as DeliveryRecord[];
  }

  setStatus(approvalId: string, status: DeliveryStatus, error?: string) {
    this.db.prepare(
      `UPDATE deliveries SET delivery_status = ?, last_error = ?, updated_at = datetime('now')
       WHERE approval_id = ? AND delivery_status NOT IN ('superseded')`,
    ).run(status, error ?? null, approvalId);
  }

  supersedeByApproval(approvalId: string, version: VersionSnapshot) {
    this.db.prepare(`
      UPDATE deliveries SET delivery_status = 'superseded', updated_at = datetime('now')
      WHERE approval_id = ? AND (approval_updated_at != ? OR payload_hash != ?)
        AND delivery_status NOT IN ('superseded')
    `).run(approvalId, version.approvalUpdatedAt, version.payloadHash);
  }

  hasDelivered(approvalId: string, openId: string, version: VersionSnapshot): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM deliveries
      WHERE approval_id = ? AND recipient_open_id = ?
        AND approval_updated_at = ? AND payload_hash = ?
        AND delivery_status IN ('sent', 'sending', 'unknown')
      LIMIT 1
    `).get(approvalId, openId, version.approvalUpdatedAt, version.payloadHash);
    return row !== undefined;
  }
}

export class CallbackEventRepository {
  constructor(private db: Database.Database) {}

  insert(ev: CallbackEvent): boolean {
    try {
      this.db.prepare(`
        INSERT INTO callback_events (
          event_id, approval_id, company_id, operator_open_id, operator_name,
          action, decision_note, result_status, result_message, paperclip_status,
          version_matched, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ev.eventId, ev.approvalId, ev.companyId, ev.operatorOpenId, ev.operatorName,
        ev.action, ev.decisionNote, ev.resultStatus, ev.resultMessage, ev.paperclipStatus,
        ev.versionMatched, ev.processedAt,
      );
      return true;
    } catch {
      return false;
    }
  }

  updateResult(eventId: string, status: CallbackResultStatus, message?: string, paperclipStatus?: string) {
    this.db.prepare(`
      UPDATE callback_events SET result_status = ?, result_message = ?, paperclip_status = ?,
        processed_at = datetime('now')
      WHERE event_id = ?
    `).run(status, message ?? null, paperclipStatus ?? null, eventId);
  }

  exists(eventId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM callback_events WHERE event_id = ? LIMIT 1`).get(eventId) !== undefined;
  }
}

export class ActionTokenRepository {
  constructor(private db: Database.Database) {}

  insert(rec: ActionTokenRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO action_tokens (
        credential_hash, approval_id, company_id, recipient_open_id,
        allowed_actions, approval_updated_at, payload_hash,
        expires_at, consumed_at, invalidated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rec.credentialHash, rec.approvalId, rec.companyId, rec.recipientOpenId,
      rec.allowedActions, rec.approvalUpdatedAt, rec.payloadHash,
      rec.expiresAt, rec.consumedAt, rec.invalidatedAt, rec.createdAt,
    );
  }

  findValid(credentialHash: string): ActionTokenRecord | null {
    const row = this.db.prepare(`
      SELECT
        credential_hash AS credentialHash,
        approval_id AS approvalId,
        company_id AS companyId,
        recipient_open_id AS recipientOpenId,
        allowed_actions AS allowedActions,
        approval_updated_at AS approvalUpdatedAt,
        payload_hash AS payloadHash,
        expires_at AS expiresAt,
        consumed_at AS consumedAt,
        invalidated_at AS invalidatedAt,
        created_at AS createdAt
      FROM action_tokens
      WHERE credential_hash = ? AND consumed_at IS NULL AND invalidated_at IS NULL
        AND expires_at > datetime('now')
    `).get(credentialHash) as ActionTokenRecord | undefined;
    return row ?? null;
  }

  consume(credentialHash: string) {
    this.db.prepare(`UPDATE action_tokens SET consumed_at = datetime('now') WHERE credential_hash = ?`)
      .run(credentialHash);
  }

  invalidate(credentialHash: string) {
    this.db.prepare(`UPDATE action_tokens SET invalidated_at = datetime('now') WHERE credential_hash = ?`)
      .run(credentialHash);
  }

  invalidateByApproval(approvalId: string, version?: VersionSnapshot) {
    if (version) {
      this.db.prepare(`
        UPDATE action_tokens SET invalidated_at = datetime('now')
        WHERE approval_id = ? AND (approval_updated_at != ? OR payload_hash != ?)
          AND invalidated_at IS NULL AND consumed_at IS NULL
      `).run(approvalId, version.approvalUpdatedAt, version.payloadHash);
    } else {
      this.db.prepare(`
        UPDATE action_tokens SET invalidated_at = datetime('now')
        WHERE approval_id = ? AND invalidated_at IS NULL AND consumed_at IS NULL
      `).run(approvalId);
    }
  }
}
