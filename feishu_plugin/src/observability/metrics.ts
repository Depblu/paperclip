const counters = new Map<string, number>();

export function incMetric(name: string, value = 1) {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function getMetric(name: string): number {
  return counters.get(name) ?? 0;
}

export function snapshotMetrics(): Record<string, number> {
  return Object.fromEntries(counters);
}

export const METRIC_NAMES = {
  pendingDiscovered: "pending_approvals_discovered_total",
  cardsSent: "approval_cards_sent_total",
  cardSendFailures: "approval_card_send_failures_total",
  callbacks: "approval_callbacks_total",
  callbackDuplicates: "approval_callback_duplicates_total",
  versionMismatches: "approval_version_mismatches_total",
  decisionRequests: "paperclip_decision_requests_total",
  decisionFailures: "paperclip_decision_failures_total",
  decisionCommittedUnknown: "decision_committed_side_effect_unknown_total",
  reconciliationRepairs: "reconciliation_repairs_total",
  credentialInvalidations: "credential_invalidations_total",
} as const;
