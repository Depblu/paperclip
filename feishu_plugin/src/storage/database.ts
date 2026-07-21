import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../observability/logger.js";

export function openDatabase(sqlitePath: string): Database.Database {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  logger.info("sqlite opened", { path: sqlitePath });
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      approval_status TEXT NOT NULL,
      approval_updated_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      feishu_tenant_key TEXT NOT NULL DEFAULT '',
      recipient_open_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      message_id TEXT,
      card_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at TEXT,
      sent_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(approval_id, recipient_open_id, approval_updated_at, payload_hash)
    );

    CREATE TABLE IF NOT EXISTS callback_events (
      event_id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      operator_open_id TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      action TEXT NOT NULL,
      decision_note TEXT,
      result_status TEXT NOT NULL DEFAULT 'processing',
      result_message TEXT,
      paperclip_status TEXT,
      version_matched INTEGER NOT NULL DEFAULT 1,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS action_tokens (
      credential_hash TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      recipient_open_id TEXT NOT NULL,
      allowed_actions TEXT NOT NULL,
      approval_updated_at TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      invalidated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_approval ON deliveries(approval_id, delivery_status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(delivery_status);
    CREATE INDEX IF NOT EXISTS idx_tokens_approval ON action_tokens(approval_id);
  `);
}
