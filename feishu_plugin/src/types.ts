export interface PaperclipApproval {
  id: string;
  companyId: string;
  type: string;
  status: "pending" | "revision_requested" | "approved" | "rejected" | "cancelled";
  payload: Record<string, unknown>;
  requestedByAgentId?: string | null;
  decidedByUserId?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipApprovalWithMeta extends PaperclipApproval {
  issues?: PaperclipIssue[];
  comments?: PaperclipComment[];
}

export interface PaperclipIssue {
  id: string;
  title: string;
  identifier?: string;
}

export interface PaperclipComment {
  id: string;
  body: string;
  createdAt: string;
}

export interface VersionSnapshot {
  approvalUpdatedAt: string;
  payloadHash: string;
}

export type DeliveryStatus = "pending" | "sending" | "sent" | "unknown" | "failed" | "superseded";

export interface DeliveryRecord {
  id: number;
  approvalId: string;
  companyId: string;
  approvalType: string;
  approvalStatus: string;
  approvalUpdatedAt: string;
  payloadHash: string;
  feishuTenantKey: string;
  recipientOpenId: string;
  recipientName: string;
  messageId: string | null;
  cardId: string | null;
  deliveryStatus: DeliveryStatus;
  attemptCount: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  updatedAt: string;
}

export type CallbackResultStatus =
  | "processing"
  | "succeeded"
  | "retryable_failed"
  | "permanent_failed"
  | "version_mismatch"
  | "decision_committed_side_effect_unknown";

export interface CallbackEvent {
  eventId: string;
  approvalId: string;
  companyId: string;
  operatorOpenId: string;
  operatorName: string;
  action: string;
  decisionNote: string | null;
  resultStatus: CallbackResultStatus;
  resultMessage: string | null;
  paperclipStatus: string | null;
  versionMatched: number;
  processedAt: string;
}

export interface ActionTokenRecord {
  credentialHash: string;
  approvalId: string;
  companyId: string;
  recipientOpenId: string;
  allowedActions: string;
  approvalUpdatedAt: string;
  payloadHash: string;
  expiresAt: string;
  consumedAt: string | null;
  invalidatedAt: string | null;
  createdAt: string;
}

export interface ApproverConfig {
  openId: string;
  name: string;
}

export interface ApprovalTypeRouting {
  approvers: ApproverConfig[];
}

export interface CompanyConfig {
  companyId: string;
  defaultApprovers: ApproverConfig[];
  routing: Record<string, ApprovalTypeRouting>;
}

export interface BridgeConfig {
  paperclipBaseUrl: string;
  paperclipApiKey: string;
  paperclipPublicUrl: string;
  feishuAppId: string;
  feishuAppSecret: string;
  pollIntervalMs: number;
  reconciliationIntervalMs: number;
  scanConcurrency: number;
  requestTimeoutMs: number;
  sqlitePath: string;
  actionTokenTtlMs: number;
  companies: CompanyConfig[];
}

export interface SendApprovalCardInput {
  approval: PaperclipApprovalWithMeta;
  version: VersionSnapshot;
  recipient: ApproverConfig;
  companyId: string;
  actionToken: string;
  detailUrl: string;
}

export interface DeliveryReference {
  messageId: string;
  cardId?: string;
}

export interface UpdateApprovalCardInput {
  messageId: string;
  status: string;
  operatorName?: string;
  decisionNote?: string;
}

export interface FeishuTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendApprovalCard(input: SendApprovalCardInput): Promise<DeliveryReference>;
  updateApprovalCard(input: UpdateApprovalCardInput): Promise<void>;
}
