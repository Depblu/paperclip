export type ClawithBridgeMode = "sync";
export type ClawithBridgeWriteBack = "run_log" | "issue_comment";

export interface ClawithBridgeConfig {
  enabled: boolean;
  baseUrl: string;
  bridgeSecret: string;
  timeoutSec: number;
  mode: ClawithBridgeMode;
  writeBack: ClawithBridgeWriteBack;
  issuer: string;
  audience: string;
}

export interface ClawithBridgeWakeIssue {
  id: string | null;
  identifier: string | null;
  title: string | null;
  description: string | null;
  comments: Array<{
    id: string | null;
    body: string;
    created_at: string | null;
    author_type: string | null;
    author_id: string | null;
  }>;
}

export interface ClawithBridgeWakeRequest {
  company_id: string;
  agent_id: string;
  issue_id: string | null;
  run_id: string;
  idempotency_key: string;
  message: string;
  goal: {
    id: string | null;
    title: string | null;
  } | null;
  issue: ClawithBridgeWakeIssue;
  context: Record<string, unknown>;
}

export type ClawithBridgeWakeStatus = "completed" | "accepted" | "failed";

export interface ClawithBridgeWakeResponse {
  status?: ClawithBridgeWakeStatus | string;
  paperclip_run_id?: string;
  clawith_tenant_id?: string | null;
  clawith_agent_id?: string | null;
  clawith_session_id?: string | null;
  summary?: string | null;
  message?: string | null;
  artifacts?: unknown[];
  usage?: {
    model?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cached_input_tokens?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number | null;
  } | null;
  poll_url?: string | null;
  error_code?: string | null;
  retryable?: boolean | null;
}

export interface ClawithBridgeAgentState {
  paperclip_company_id?: string | null;
  paperclip_agent_id?: string | null;
  clawith_tenant_id?: string | null;
  clawith_agent_id?: string | null;
  clawith_session_id?: string | null;
  status?: string | null;
}

export interface ClawithBridgeFocusSummary {
  paperclip_agent_id?: string | null;
  clawith_agent_id?: string | null;
  items?: unknown[];
}

export interface ClawithBridgeReflectionSummary {
  paperclip_agent_id?: string | null;
  clawith_agent_id?: string | null;
  items?: unknown[];
}

export interface ClawithBridgeReadonlySummary {
  state?: ClawithBridgeAgentState | null;
  focus?: ClawithBridgeFocusSummary | null;
  reflections?: ClawithBridgeReflectionSummary | null;
}
