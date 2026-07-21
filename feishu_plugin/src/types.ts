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

export interface CompanyFeishuConfig {
  appId: string;
  appSecret: string;
}

export interface CompanyConfig {
  companyId: string;
  name?: string;
  feishu?: CompanyFeishuConfig;
  defaultApprovers: ApproverConfig[];
  routing: Record<string, ApprovalTypeRouting>;
}

export interface BridgeGlobalConfig {
  paperclipBaseUrl: string;
  paperclipPublicUrl: string;
  pollIntervalMs: number;
  reconciliationIntervalMs: number;
  scanConcurrency: number;
  requestTimeoutMs: number;
  sqlitePath: string;
  actionTokenTtlMs: number;
  adminPort: number;
  adminHost?: string;
}

export interface SecretsConfig {
  paperclipApiKey: string;
  defaultFeishuAppId?: string;
  defaultFeishuAppSecret?: string;
  companySecrets?: Record<string, CompanyFeishuConfig>;
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
  adminPort: number;
  companies: CompanyConfig[];
}

export interface PaperclipCompany {
  id: string;
  name: string;
  issuePrefix?: string;
}

export interface FeishuUser {
  openId: string;
  name: string;
}

export interface CompanyConfigPublic {
  companyId: string;
  name?: string;
  hasFeishu: boolean;
  defaultApprovers: ApproverConfig[];
  routing: Record<string, ApprovalTypeRouting>;
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

export type AuthFlowStatus = "pending" | "approved" | "cancelled" | "expired" | "failed";

export type AuthValidity = "valid" | "missing" | "expired" | "revoked_or_invalid" | "unreachable" | "unknown";

export interface AuthMetadata {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  keyId: string;
  keyExpiresAt: string | null;
  connectedAt: string;
  companyCount: number;
}

export interface AuthFlowPublic {
  flowId: string;
  status: AuthFlowStatus;
  approvalUrl?: string;
  expiresAt?: string;
  suggestedPollIntervalMs?: number;
  metadata?: AuthMetadata;
  restartRequired?: boolean;
  error?: string;
}

export interface AuthStatusResponse {
  connected: boolean;
  validity: AuthValidity;
  user?: { id: string; name: string | null; email: string | null };
  companyCount?: number;
  key?: { id: string; expiresAt: string | null; expired: boolean };
  lastValidatedAt?: string;
  mode?: "store" | "env";
}

export interface CreateChallengeResponse {
  id: string;
  token: string;
  boardApiToken: string;
  approvalPath: string;
  approvalUrl: string | null;
  pollPath: string;
  expiresAt: string;
  suggestedPollIntervalMs: number;
}

export interface ChallengeStatusResponse {
  id: string;
  status: "pending" | "approved" | "cancelled" | "expired";
  command: string;
  clientName: string | null;
  requestedAccess: string;
  requestedCompanyId: string | null;
  requestedCompanyName: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string;
  approvedByUser: { id: string; name: string | null; email: string | null } | null;
}

export interface CliAuthMeResponse {
  user: { id: string; name: string | null; email: string | null } | null;
  userId: string;
  isInstanceAdmin: boolean;
  companyIds: string[];
  memberships: Array<{ companyId: string; membershipRole: string | null; status: string }>;
  source: string;
  keyId: string | null;
}

export interface BoardApiKeyEntry {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}
