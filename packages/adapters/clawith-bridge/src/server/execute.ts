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

function nativeSessionUrl(baseUrl: string, agentId: string): string {
  return `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/sessions`;
}

function nativeChatWebSocketUrl(baseUrl: string, agentId: string, token: string, sessionId: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = `/ws/chat/${encodeURIComponent(agentId)}`;
  parsed.search = "";
  parsed.searchParams.set("token", token);
  parsed.searchParams.set("session_id", sessionId);
  parsed.searchParams.set("lang", "zh");
  return parsed.toString();
}

function nativeChatWebSocketUrls(baseUrl: string, agentId: string, token: string, sessionId: string): string[] {
  const primary = nativeChatWebSocketUrl(baseUrl, agentId, token, sessionId);
  const parsed = new URL(primary);
  if (parsed.hostname !== "localhost") return [primary];

  const urls = [primary];
  for (const host of ["127.0.0.1", "[::1]"]) {
    const fallback = new URL(primary);
    fallback.host = parsed.port ? `${host}:${parsed.port}` : host;
    urls.push(fallback.toString());
  }
  return urls;
}

type NativeChatSocketListener = (...args: unknown[]) => void;

function createNativeChatWebSocket(url: string): WebSocket {
  return new WebSocket(url);
}

function addSocketListener(
  ws: WebSocket,
  type: "open" | "message" | "error" | "close",
  listener: NativeChatSocketListener,
  options?: { once?: boolean },
): void {
  ws.addEventListener(type, listener as EventListener, options?.once ? { once: true } : undefined);
}

function removeSocketListener(
  ws: WebSocket,
  type: "open" | "message" | "error" | "close",
  listener: NativeChatSocketListener,
): void {
  ws.removeEventListener(type, listener as EventListener);
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
  if (config.connectionMode === "bridge_wake" && !config.bridgeSecret) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge adapter missing bridgeSecret.",
      errorCode: "clawith_bridge_secret_missing",
    };
  }
  if (config.connectionMode === "native_chat" && !config.clawithAuthToken) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith connection expired. Reconnect Clawith.",
      errorCode: "clawith_native_chat_token_missing",
    };
  }
  if (config.connectionMode === "native_chat" && !config.clawithAgentId) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith native chat requires clawithAgentId.",
      errorCode: "clawith_native_chat_agent_id_missing",
    };
  }
  if (config.connectionMode === "bridge_wake" && config.linkMode === "link_existing" && !config.clawithTenantId) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Clawith Bridge link_existing requires clawithTenantId.",
      errorCode: "clawith_bridge_tenant_id_missing",
    };
  }
  if (config.connectionMode === "bridge_wake" && config.linkMode === "link_existing" && !config.clawithAgentId) {
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

function readRuntimeClawithSessionId(ctx: AdapterExecutionContext, clawithAgentId: string): string | null {
  const params = ctx.runtime.sessionParams;
  const connectionMode = nonEmpty(params?.connectionMode) ?? nonEmpty(params?.connection_mode);
  const sessionAgentId = nonEmpty(params?.clawithAgentId) ?? nonEmpty(params?.clawith_agent_id);
  if (connectionMode !== "native_chat" || sessionAgentId !== clawithAgentId) return null;
  return nonEmpty(params?.clawithSessionId)
    ?? nonEmpty(params?.clawith_session_id)
    ?? nonEmpty(ctx.runtime.sessionId);
}

async function createNativeChatSession(input: {
  baseUrl: string;
  agentId: string;
  authToken: string;
  title: string | null;
  signal: AbortSignal;
}): Promise<string> {
  const res = await fetch(nativeSessionUrl(input.baseUrl, input.agentId), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: input.title ?? undefined }),
    signal: input.signal,
  });
  const body = await readJsonResponse(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Clawith connection expired. Reconnect Clawith.");
    }
    const message = nonEmpty(body.message) ?? nonEmpty(body.detail) ?? `Clawith session create returned HTTP ${res.status}`;
    throw new Error(message);
  }
  const sessionId = nonEmpty(body.id);
  if (!sessionId) throw new Error("Clawith session create response did not include id.");
  return sessionId;
}

function socketErrorMessage(value: unknown): string | null {
  if (value instanceof Error) return nonEmpty(value.message);
  if (typeof value !== "object" || value === null) return nonEmpty(value);
  const record = value as Record<string, unknown>;
  if (record.error instanceof Error) return nonEmpty(record.error.message);
  return nonEmpty(record.message);
}

function socketCloseDetails(args: unknown[]): { code: number | null; reason: string | null } {
  const first = args[0];
  if (typeof first === "number") {
    const reason = args[1];
    return {
      code: first,
      reason: Buffer.isBuffer(reason) ? nonEmpty(reason.toString("utf8")) : nonEmpty(reason),
    };
  }
  if (typeof first === "object" && first !== null) {
    const record = first as Record<string, unknown>;
    const code = typeof record.code === "number" ? record.code : null;
    return { code, reason: nonEmpty(record.reason) };
  }
  return { code: null, reason: null };
}

function socketMessageData(args: unknown[]): unknown {
  const first = args[0];
  if (typeof first === "object" && first !== null && "data" in first) {
    return (first as { data?: unknown }).data;
  }
  return first;
}

function parseNativeChatMessage(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nativeChatFailureMessage(data: Record<string, unknown>): string {
  return nonEmpty(data.content)
    ?? nonEmpty(data.detail)
    ?? nonEmpty(data.message)
    ?? "Clawith native chat failed.";
}

function nativeChatCloseMessage(phase: "open" | "ready", code: number | "unknown", reason: string): string {
  const message = `Clawith native chat websocket closed before ${phase} (${code}): ${reason}`;
  if (phase !== "ready") return message;
  return `${message}. Clawith accepted the websocket but closed during chat setup; check Clawith backend logs and runtime dependencies such as Redis.`;
}

function waitForNativeChatReady(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastError: string | null = null;
    let opened = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Clawith native chat websocket ready timed out."));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      removeSocketListener(ws, "open", onOpen);
      removeSocketListener(ws, "message", onMessage);
      removeSocketListener(ws, "error", onError);
      removeSocketListener(ws, "close", onClose);
    };
    const onOpen = (): void => {
      opened = true;
    };
    const onMessage = (...args: unknown[]): void => {
      const text = wsDataToString(socketMessageData(args));
      const data = parseNativeChatMessage(text);
      if (!data) return;
      const type = nonEmpty(data.type);
      if (type === "connected") {
        cleanup();
        resolve();
      } else if (type === "error" || type === "quota_exceeded") {
        cleanup();
        reject(new Error(`Clawith native chat websocket setup failed: ${nativeChatFailureMessage(data)}`));
      }
    };
    const onError = (...args: unknown[]): void => {
      lastError = socketErrorMessage(args[0]) ?? "websocket error";
      cleanup();
      const phase = opened ? "ready" : "open";
      reject(new Error(`Clawith native chat websocket error before ${phase}: ${lastError}`));
    };
    const onClose = (...args: unknown[]): void => {
      const details = socketCloseDetails(args);
      const code = details.code ?? "unknown";
      const reason = details.reason ?? lastError ?? "no close reason";
      cleanup();
      const phase = opened ? "ready" : "open";
      reject(new Error(nativeChatCloseMessage(phase, code, reason)));
    };
    addSocketListener(ws, "open", onOpen, { once: true });
    addSocketListener(ws, "message", onMessage);
    addSocketListener(ws, "error", onError, { once: true });
    addSocketListener(ws, "close", onClose, { once: true });
  });
}

function wsDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return String(data ?? "");
}

async function runNativeChat(input: {
  wsUrls: string[];
  message: string;
  timeoutMs: number;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<{ message: string; status: "completed" | "failed"; errorCode?: string }> {
  let lastError: Error | null = null;
  for (let index = 0; index < input.wsUrls.length; index += 1) {
    try {
      return await runNativeChatOnce({
        wsUrl: input.wsUrls[index]!,
        message: input.message,
        timeoutMs: input.timeoutMs,
        onLog: input.onLog,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (index < input.wsUrls.length - 1) {
        const redactedCandidate = new URL(input.wsUrls[index]!);
        redactedCandidate.searchParams.set("token", "[redacted]");
        await input.onLog("stderr", `[clawith-bridge] native chat websocket retrying after failed candidate ${index + 1} (${redactedCandidate.host}): ${lastError.message}\n`);
      }
    }
  }
  throw lastError ?? new Error("Clawith native chat websocket failed.");
}

async function runNativeChatOnce(input: {
  wsUrl: string;
  message: string;
  timeoutMs: number;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<{ message: string; status: "completed" | "failed"; errorCode?: string }> {
  const ws = createNativeChatWebSocket(input.wsUrl);
  const logMessage = (...args: unknown[]): void => {
    const text = wsDataToString(socketMessageData(args));
    void input.onLog("stdout", `[clawith-bridge:event] ${text}\n`);
  };
  addSocketListener(ws, "message", logMessage);
  try {
    await waitForNativeChatReady(ws, Math.min(input.timeoutMs, 10_000));

    const done = new Promise<{ message: string; status: "completed" | "failed"; errorCode?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Clawith native chat timed out after ${input.timeoutMs}ms`));
      }, input.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        removeSocketListener(ws, "message", onMessage);
        removeSocketListener(ws, "error", onError);
        removeSocketListener(ws, "close", onClose);
      };
      const onError = (...args: unknown[]): void => {
        cleanup();
        reject(new Error(`Clawith native chat websocket error: ${socketErrorMessage(args[0]) ?? "websocket error"}`));
      };
      const onClose = (...args: unknown[]): void => {
        const details = socketCloseDetails(args);
        const code = details.code ?? "unknown";
        const reason = details.reason ?? "no close reason";
        cleanup();
        reject(new Error(`Clawith native chat websocket closed (${code}): ${reason}`));
      };
      const onMessage = (...args: unknown[]): void => {
        const text = wsDataToString(socketMessageData(args));
        const data = parseNativeChatMessage(text);
        if (!data) return;
        const type = nonEmpty(data.type);
        if (type === "done") {
          cleanup();
          resolve({ status: "completed", message: nonEmpty(data.content) ?? "" });
        } else if (type === "error" || type === "quota_exceeded") {
          cleanup();
          resolve({
            status: "failed",
            message: nativeChatFailureMessage(data),
            errorCode: type === "quota_exceeded" ? "clawith_native_chat_quota_exceeded" : "clawith_native_chat_error",
          });
        }
      };
      addSocketListener(ws, "message", onMessage);
      addSocketListener(ws, "error", onError, { once: true });
      addSocketListener(ws, "close", onClose, { once: true });
    });

    ws.send(JSON.stringify({
      content: input.message,
      display_content: input.message,
    }));
    return await done;
  } finally {
    removeSocketListener(ws, "message", logMessage);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "paperclip-complete");
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
}

async function executeNativeChat(
  ctx: AdapterExecutionContext,
  config: ClawithBridgeConfig,
): Promise<AdapterExecutionResult> {
  const agentId = config.clawithAgentId!;
  const authToken = config.clawithAuthToken!;
  const timeoutMs = config.timeoutSec * 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const wakeRequest = buildWakeRequest(ctx);
  const existingSessionId = readRuntimeClawithSessionId(ctx, agentId);
  let sessionId = existingSessionId;

  try {
    if (typeof WebSocket !== "function") {
      throw new Error("Clawith native chat requires a runtime with global WebSocket support.");
    }
    sessionId = sessionId ?? await createNativeChatSession({
      baseUrl: config.baseUrl,
      agentId,
      authToken,
      title: wakeRequest.issue.title ?? wakeRequest.issue.identifier ?? `Paperclip ${ctx.runId.slice(0, 8)}`,
      signal: controller.signal,
    });
    const redactedWsUrl = nativeChatWebSocketUrl(config.baseUrl, agentId, "[redacted]", sessionId);
    const wsUrls = nativeChatWebSocketUrls(config.baseUrl, agentId, authToken, sessionId);

    await ctx.onMeta?.({
      adapterType: "clawith_bridge",
      command: "native-chat",
      commandArgs: ["WS", redactedWsUrl],
      commandNotes: [
        `connectionMode=${config.connectionMode}`,
        `writeBack=${config.writeBack}`,
        `timeoutSec=${config.timeoutSec}`,
      ],
      context: {
        issueId: wakeRequest.issue_id,
        clawithAgentId: agentId,
        clawithSessionId: sessionId,
        reusedSession: Boolean(existingSessionId),
      },
    });
    await ctx.onLog(
      "stdout",
      `[clawith-bridge] native chat run=${ctx.runId} clawithAgent=${agentId} session=${sessionId} issue=${wakeRequest.issue_id ?? ""}\n`,
    );

    const result = await runNativeChat({
      wsUrls,
      message: wakeRequest.message,
      timeoutMs,
      onLog: ctx.onLog,
    });
    const sessionParams = {
      connectionMode: "native_chat",
      clawithAgentId: agentId,
      clawithSessionId: sessionId,
    };
    if (result.status === "failed") {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: result.message,
        errorCode: result.errorCode ?? "clawith_native_chat_failed",
        provider: "clawith",
        resultJson: {
          status: "failed",
          message: result.message,
          paperclipRunId: ctx.runId,
          clawithAgentId: agentId,
          clawithSessionId: sessionId,
        },
        sessionParams,
        sessionDisplayId: sessionId,
      };
    }
    if (result.message) await ctx.onLog("stdout", `${result.message}\n`);
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      provider: "clawith",
      resultJson: {
        status: "completed",
        message: result.message,
        paperclipRunId: ctx.runId,
        clawithAgentId: agentId,
        clawithSessionId: sessionId,
        summary: result.message,
      },
      summary: config.writeBack === "issue_comment" ? result.message : null,
      sessionParams,
      sessionDisplayId: sessionId,
    };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("timed out"))) {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: err.message,
        errorCode: "timeout",
        ...(sessionId ? {
          sessionParams: {
            connectionMode: "native_chat",
            clawithAgentId: agentId,
            clawithSessionId: sessionId,
          },
          sessionDisplayId: sessionId,
        } : {}),
      };
    }
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCode: "clawith_native_chat_request_failed",
      errorFamily: "transient_upstream",
      ...(sessionId ? {
        sessionParams: {
          connectionMode: "native_chat",
          clawithAgentId: agentId,
          clawithSessionId: sessionId,
        },
        sessionDisplayId: sessionId,
      } : {}),
    };
  } finally {
    clearTimeout(timeout);
  }
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
  if (config.connectionMode === "native_chat") {
    return executeNativeChat(ctx, config);
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
