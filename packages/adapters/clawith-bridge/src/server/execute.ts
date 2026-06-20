import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  normalizePaperclipWakePayload,
  parseObject,
  renderPaperclipWakePrompt,
} from "@paperclipai/adapter-utils/server-utils";
import crypto from "node:crypto";
import { readClawithBridgeConfig } from "./config.js";
import { signBridgeJwt } from "./jwt.js";
import type {
  ClawithBridgeConfig,
  ClawithBridgeReadonlySummary,
  ClawithBridgeWakeRequest,
  ClawithBridgeWakeResponse,
} from "./types.js";

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readIssueId(context: Record<string, unknown>): string | null {
  return nonEmpty(context.issueId) ?? nonEmpty(context.taskId);
}

function readGoal(context: Record<string, unknown>): ClawithBridgeWakeRequest["goal"] {
  const goal = parseObject(context.paperclipGoal);
  const id = nonEmpty(goal.id) ?? nonEmpty(context.goalId);
  const title = nonEmpty(goal.title) ?? nonEmpty(context.goalTitle);
  if (!id && !title) return null;
  return { id, title };
}

function readIssue(context: Record<string, unknown>, issueId: string | null): ClawithBridgeWakeRequest["issue"] {
  const paperclipIssue = parseObject(context.paperclipIssue);
  const wake = normalizePaperclipWakePayload(context.paperclipWake);
  const wakeIssue = wake?.issue ?? null;

  return {
    id: issueId ?? nonEmpty(wakeIssue?.id) ?? nonEmpty(paperclipIssue.id),
    identifier: nonEmpty(wakeIssue?.identifier),
    title: nonEmpty(wakeIssue?.title) ?? nonEmpty(paperclipIssue.title),
    description: nonEmpty(paperclipIssue.description),
    comments: (wake?.comments ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      created_at: comment.createdAt,
      author_type: comment.authorType,
      author_id: comment.authorId,
    })),
  };
}

function buildMessage(context: Record<string, unknown>): string {
  const configured = nonEmpty(context.paperclipTaskMarkdown);
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake);
  const parts = [
    configured,
    wakePrompt,
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join("\n\n");
  return "请处理这个 Paperclip issue，并返回可写回 Paperclip 的执行结果。";
}

export function buildIdempotencyKey(input: {
  companyId: string;
  agentId: string;
  issueId: string | null;
  runId: string;
}): string {
  return [
    input.companyId,
    input.agentId,
    input.issueId ?? "no-issue",
    input.runId,
  ].join(":");
}

export function buildWakeRequest(
  ctx: Pick<AdapterExecutionContext, "runId" | "agent" | "context">,
): ClawithBridgeWakeRequest {
  const issueId = readIssueId(ctx.context);
  const idempotencyKey = buildIdempotencyKey({
    companyId: ctx.agent.companyId,
    agentId: ctx.agent.id,
    issueId,
    runId: ctx.runId,
  });
  return {
    company_id: ctx.agent.companyId,
    agent_id: ctx.agent.id,
    issue_id: issueId,
    run_id: ctx.runId,
    idempotency_key: idempotencyKey,
    message: buildMessage(ctx.context),
    goal: readGoal(ctx.context),
    issue: readIssue(ctx.context, issueId),
    context: {
      source: "paperclip",
      mode: "poc",
      wake_reason: nonEmpty(ctx.context.wakeReason),
      wake_comment_id: nonEmpty(ctx.context.wakeCommentId) ?? nonEmpty(ctx.context.commentId),
      paperclip_wake: parseObject(ctx.context.paperclipWake),
    },
  };
}

function bridgeWakeUrl(baseUrl: string, agentId: string): string {
  return `${baseUrl}/api/bridge/agents/${encodeURIComponent(agentId)}/wake`;
}

function bridgeSyncUrl(baseUrl: string): string {
  return `${baseUrl}/api/bridge/agents/sync`;
}

function bridgeAgentUrl(baseUrl: string, agentId: string, suffix: "state" | "focus" | "reflections"): string {
  return `${baseUrl}/api/bridge/agents/${encodeURIComponent(agentId)}/${suffix}`;
}

function buildReadonlyIdempotencyKey(input: {
  companyId: string;
  agentId: string;
  suffix: "state" | "focus" | "reflections";
  runId: string;
}): string {
  return [
    input.companyId,
    input.agentId,
    input.suffix,
    input.runId,
  ].join(":");
}

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { message: text };
  } catch {
    return { message: text };
  }
}

function normalizeUsage(response: ClawithBridgeWakeResponse): AdapterExecutionResult["usage"] {
  const usage = response.usage;
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens ?? usage.inputTokens ?? 0;
  const outputTokens = usage.output_tokens ?? usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cached_input_tokens ?? usage.cachedInputTokens ?? undefined;
  return {
    inputTokens: Math.max(0, Math.floor(inputTokens ?? 0)),
    outputTokens: Math.max(0, Math.floor(outputTokens ?? 0)),
    ...(cachedInputTokens != null ? { cachedInputTokens: Math.max(0, Math.floor(cachedInputTokens)) } : {}),
  };
}

function responseText(response: ClawithBridgeWakeResponse): string | null {
  return nonEmpty(response.message) ?? nonEmpty(response.summary) ?? null;
}

export function mapBridgeResponseToResult(
  response: ClawithBridgeWakeResponse,
  config: Pick<ClawithBridgeConfig, "writeBack">,
  readonlySummary: ClawithBridgeReadonlySummary | null = null,
): AdapterExecutionResult {
  const status = asString(response.status, "completed").trim().toLowerCase();
  const text = responseText(response);
  const resultJson = {
    status,
    message: text,
    paperclipRunId: response.paperclip_run_id,
    clawithTenantId: response.clawith_tenant_id,
    clawithAgentId: response.clawith_agent_id,
    clawithSessionId: response.clawith_session_id,
    pollUrl: response.poll_url,
    artifacts: response.artifacts ?? [],
    ...(readonlySummary?.state ? { state: readonlySummary.state } : {}),
    ...(readonlySummary?.focus ? { focus: readonlySummary.focus } : {}),
    ...(readonlySummary?.reflections ? { reflections: readonlySummary.reflections } : {}),
    ...(config.writeBack === "issue_comment" ? { summary: text } : {}),
    ...(response.retryable != null ? { retryable: response.retryable } : {}),
  };

  if (status === "failed") {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: text ?? "Clawith Bridge reported failure",
      errorCode: nonEmpty(response.error_code) ?? "clawith_bridge_failed",
      usage: normalizeUsage(response),
      model: nonEmpty(response.usage?.model),
      provider: "clawith",
      resultJson,
      summary: text,
    };
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    usage: normalizeUsage(response),
    model: nonEmpty(response.usage?.model),
    provider: "clawith",
    resultJson,
    summary: config.writeBack === "issue_comment"
      ? (text ?? (status === "accepted" ? "Clawith Bridge accepted the run." : null))
      : null,
    sessionParams: nonEmpty(response.clawith_session_id)
      ? { clawithSessionId: response.clawith_session_id }
      : undefined,
    sessionDisplayId: nonEmpty(response.clawith_session_id),
  };
}

function validateConfig(config: ClawithBridgeConfig): AdapterExecutionResult | null {
  if (!config.enabled) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge adapter is disabled.",
      errorCode: "clawith_bridge_disabled",
    };
  }
  if (!config.baseUrl) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge adapter missing baseUrl.",
      errorCode: "clawith_bridge_base_url_missing",
    };
  }
  if (!config.bridgeSecret) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge adapter missing bridgeSecret.",
      errorCode: "clawith_bridge_secret_missing",
    };
  }
  if (config.linkMode === "link_existing" && !config.clawithTenantId) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge link_existing requires clawithTenantId.",
      errorCode: "clawith_bridge_tenant_id_missing",
    };
  }
  if (config.linkMode === "link_existing" && !config.clawithAgentId) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge link_existing requires clawithAgentId.",
      errorCode: "clawith_bridge_agent_id_missing",
    };
  }
  return null;
}

async function fetchReadonlySummary(input: {
  baseUrl: string;
  companyId: string;
  agentId: string;
  token: string;
  runId: string;
  controller: AbortController;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<ClawithBridgeReadonlySummary | null> {
  const summary: ClawithBridgeReadonlySummary = {};
  const endpoints: Array<["state" | "focus" | "reflections", keyof ClawithBridgeReadonlySummary]> = [
    ["state", "state"],
    ["focus", "focus"],
    ["reflections", "reflections"],
  ];
  for (const [suffix, key] of endpoints) {
    try {
      const res = await fetch(bridgeAgentUrl(input.baseUrl, input.agentId, suffix), {
        method: "GET",
        headers: {
          authorization: `Bearer ${input.token}`,
          "x-paperclip-run-id": input.runId,
          "x-idempotency-key": buildReadonlyIdempotencyKey({
            companyId: input.companyId,
            agentId: input.agentId,
            suffix,
            runId: input.runId,
          }),
          "x-request-id": crypto.randomUUID(),
        },
        signal: input.controller.signal,
      });
      if (!res.ok) {
        await input.onLog("stderr", `[clawith-bridge] ${suffix} returned HTTP ${res.status}\n`);
        continue;
      }
      (summary as Record<string, unknown>)[key] = await readJsonResponse(res);
    } catch (err) {
      await input.onLog(
        "stderr",
        `[clawith-bridge] ${suffix} query failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  if (summary.state?.status) {
    await input.onLog("stdout", `[clawith-bridge] state=${summary.state.status}\n`);
  }
  if (summary.focus?.items) {
    await input.onLog("stdout", `[clawith-bridge] focus items=${summary.focus.items.length}\n`);
  }
  if (summary.reflections?.items) {
    await input.onLog("stdout", `[clawith-bridge] reflections items=${summary.reflections.items.length}\n`);
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = readClawithBridgeConfig(ctx.config);
  const invalid = validateConfig(config);
  if (invalid) return invalid;

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(config.baseUrl);
  } catch {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Invalid Clawith Bridge URL: ${config.baseUrl}`,
      errorCode: "clawith_bridge_base_url_invalid",
    };
  }
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Unsupported Clawith Bridge URL protocol: ${parsedBaseUrl.protocol}`,
      errorCode: "clawith_bridge_base_url_protocol",
    };
  }

  const wakeRequest = buildWakeRequest(ctx);
  const requestId = crypto.randomUUID();
  const syncRequestId = crypto.randomUUID();
  const syncIdempotencyKey = `${ctx.agent.companyId}:${ctx.agent.id}:sync:${ctx.runId}`;
  const token = signBridgeJwt({
    secret: config.bridgeSecret,
    issuer: config.issuer,
    audience: config.audience,
    subject: ctx.agent.id,
    companyId: ctx.agent.companyId,
    agentId: ctx.agent.id,
    issueId: wakeRequest.issue_id,
    runId: ctx.runId,
  });
  const url = bridgeWakeUrl(config.baseUrl, ctx.agent.id);
  const syncUrl = bridgeSyncUrl(config.baseUrl);
  const timeoutMs = config.timeoutSec * 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  await ctx.onMeta?.({
    adapterType: "clawith_bridge",
    command: "bridge-wake",
    commandArgs: ["POST", url],
    commandNotes: [
      `mode=${config.mode}`,
      `linkMode=${config.linkMode}`,
      `writeBack=${config.writeBack}`,
      `timeoutSec=${config.timeoutSec}`,
    ],
    context: {
      requestId,
      idempotencyKey: wakeRequest.idempotency_key,
      issueId: wakeRequest.issue_id,
    },
  });
  await ctx.onLog(
    "stdout",
    `[clawith-bridge] wake request run=${ctx.runId} request=${requestId} agent=${ctx.agent.id} issue=${wakeRequest.issue_id ?? ""}\n`,
  );

  try {
    const syncRes = await fetch(syncUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-paperclip-run-id": ctx.runId,
        "x-idempotency-key": syncIdempotencyKey,
        "x-request-id": syncRequestId,
      },
      body: JSON.stringify({
        company_id: ctx.agent.companyId,
        agent_id: ctx.agent.id,
        agent_name: ctx.agent.name,
        link_mode: config.linkMode,
        ...(config.linkMode === "link_existing"
          ? {
              clawith_tenant_id: config.clawithTenantId,
              clawith_agent_id: config.clawithAgentId,
            }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!syncRes.ok) {
      const syncBody = await readJsonResponse(syncRes);
      const message = nonEmpty(syncBody.message) ?? nonEmpty(syncBody.detail) ?? `Clawith Bridge sync returned HTTP ${syncRes.status}`;
      await ctx.onLog("stderr", `[clawith-bridge] ${message}\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: message,
        errorCode: `clawith_bridge_sync_http_${syncRes.status}`,
        resultJson: {
          status: "failed",
          phase: "sync",
          httpStatus: syncRes.status,
          message,
        },
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-paperclip-run-id": ctx.runId,
        "x-idempotency-key": wakeRequest.idempotency_key,
        "x-request-id": requestId,
      },
      body: JSON.stringify(wakeRequest),
      signal: controller.signal,
    });
    const body = await readJsonResponse(res);
    const response = body as ClawithBridgeWakeResponse;
    if (!res.ok) {
      const message = nonEmpty(body.message) ?? `Clawith Bridge returned HTTP ${res.status}`;
      await ctx.onLog("stderr", `[clawith-bridge] ${message}\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: message,
        errorCode: nonEmpty(response.error_code) ?? `clawith_bridge_http_${res.status}`,
        resultJson: {
          status: "failed",
          httpStatus: res.status,
          errorCode: response.error_code,
          message,
          ...(response.retryable != null ? { retryable: response.retryable } : {}),
        },
      };
    }

    const text = responseText(response);
    if (text) await ctx.onLog("stdout", `${text}\n`);
    const readonlySummary = await fetchReadonlySummary({
      baseUrl: config.baseUrl,
      companyId: ctx.agent.companyId,
      agentId: ctx.agent.id,
      token,
      runId: ctx.runId,
      controller,
      onLog: ctx.onLog,
    });
    return mapBridgeResponseToResult(response, config, readonlySummary);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `Clawith Bridge wake timed out after ${timeoutMs}ms`,
        errorCode: "timeout",
      };
    }
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCode: "clawith_bridge_request_failed",
      errorFamily: "transient_upstream",
    };
  } finally {
    clearTimeout(timeout);
  }
}
