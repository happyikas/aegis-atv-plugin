import { createHash, randomUUID } from "node:crypto";

export interface CodexHookPayload {
  event: string;
  [key: string]: unknown;
}

export interface AdapterContext {
  tenantId: string;
  agentId: string;
  codexSurface: string;
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getPath(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in payload) {
      return payload[key];
    }
  }
  return undefined;
}

function nested(payload: Record<string, unknown>, rootKey: string, key: string): unknown {
  const root = firstObject(payload[rootKey]);
  return root?.[key];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inferSessionId(payload: Record<string, unknown>): string {
  return (
    firstString(getPath(payload, "session_id", "sessionId")) ??
    firstString(getPath(payload, "conversation_id", "conversationId")) ??
    firstString(getPath(payload, "task_id", "taskId")) ??
    `codex-${randomUUID()}`
  );
}

function inferTraceId(payload: Record<string, unknown>): string {
  return (
    firstString(getPath(payload, "trace_id", "traceId")) ??
    firstString(getPath(payload, "span_id", "spanId")) ??
    randomUUID()
  );
}

function inferWorkspace(payload: Record<string, unknown>): string {
  return (
    firstString(getPath(payload, "workspace", "workspaceRoot", "cwd")) ??
    firstString(nested(payload, "tool_input", "cwd")) ??
    process.cwd()
  );
}

function inferRepo(payload: Record<string, unknown>): string | undefined {
  return firstString(getPath(payload, "repo", "repository"));
}

function inferToolName(payload: Record<string, unknown>): string {
  return (
    firstString(getPath(payload, "tool_name", "toolName", "tool")) ??
    firstString(nested(payload, "tool_input", "tool_name")) ??
    "unknown"
  );
}

function inferCommand(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(getPath(payload, "command")) ??
    firstString(nested(payload, "tool_input", "command")) ??
    firstString(getPath(payload, "input"))
  );
}

function inferPrompt(payload: Record<string, unknown>): string | undefined {
  return firstString(getPath(payload, "prompt", "text", "user_prompt"));
}

function inferIntent(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(getPath(payload, "declared_intent", "declaredIntent")) ??
    inferPrompt(payload)
  );
}

function inferDurationMs(payload: Record<string, unknown>): number | undefined {
  const value = getPath(payload, "duration_ms", "durationMs");
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function inferToolOutput(payload: Record<string, unknown>): string | undefined {
  return firstString(getPath(payload, "output")) ?? firstString(nested(payload, "tool_output", "output"));
}

function inferAction(toolName: string, command?: string): "mcp_tool" | "read_file" | "delete_file" | "external_share" {
  const normalizedTool = toolName.toLowerCase();
  const normalizedCommand = command?.toLowerCase() ?? "";

  if (normalizedTool.includes("mcp")) {
    return "mcp_tool";
  }
  if (
    normalizedTool.includes("read") ||
    /\b(cat|less|head|tail|sed|awk|rg|grep)\b/.test(normalizedCommand)
  ) {
    return "read_file";
  }
  if (normalizedTool.includes("delete") || /\b(rm|unlink)\b/.test(normalizedCommand)) {
    return "delete_file";
  }
  if (
    normalizedTool.includes("share") ||
    /\b(curl|wget|scp|rsync|nc)\b/.test(normalizedCommand) ||
    /https?:\/\//.test(normalizedCommand)
  ) {
    return "external_share";
  }
  return "mcp_tool";
}

export class CodexHookAdapter {
  constructor(private readonly context: AdapterContext) {}

  toSessionStart(payload: CodexHookPayload) {
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      codex_surface: this.context.codexSurface,
      session_id: inferSessionId(payload),
      workspace: inferWorkspace(payload),
      repo: inferRepo(payload),
      model: firstString(getPath(payload, "model")),
      sandbox_mode: firstString(getPath(payload, "sandbox_mode", "sandboxMode")),
      approval_policy: firstString(getPath(payload, "approval_policy", "approvalPolicy")),
    };
  }

  toUserPrompt(payload: CodexHookPayload) {
    const prompt = inferPrompt(payload) ?? "prompt-unavailable";
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      session_id: inferSessionId(payload),
      prompt,
      declared_intent: inferIntent(payload),
      source_locator: firstString(getPath(payload, "source_locator", "sourceLocator")),
    };
  }

  toToolDecision(payload: CodexHookPayload) {
    const toolName = inferToolName(payload);
    const command = inferCommand(payload);
    const action = inferAction(toolName, command);
    const traceId = inferTraceId(payload);
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      session_id: inferSessionId(payload),
      trace_id: traceId,
      span_id: firstString(getPath(payload, "span_id", "spanId")) ?? traceId,
      parent_span_id: firstString(getPath(payload, "parent_span_id", "parentSpanId")),
      codex_surface: this.context.codexSurface,
      workspace: inferWorkspace(payload),
      repo: inferRepo(payload),
      model: firstString(getPath(payload, "model")),
      sandbox_mode: firstString(getPath(payload, "sandbox_mode", "sandboxMode")),
      approval_policy: firstString(getPath(payload, "approval_policy", "approvalPolicy")),
      action,
      requested_by: firstString(getPath(payload, "requested_by", "requestedBy")) ?? `codex:${toolName}`,
      payload: {
        tool_name: toolName,
        command,
        original_event: payload.event,
        raw: payload,
      },
      context: {
        session_id: inferSessionId(payload),
        declared_intent: inferIntent(payload),
      },
    };
  }

  toPermissionRequest(payload: CodexHookPayload) {
    const toolName = inferToolName(payload);
    const command = inferCommand(payload);
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      session_id: inferSessionId(payload),
      trace_id: inferTraceId(payload),
      span_id: firstString(getPath(payload, "span_id", "spanId")),
      action: inferAction(toolName, command),
      requested_by: firstString(getPath(payload, "requested_by", "requestedBy")) ?? `codex:${toolName}`,
      payload: {
        tool_name: toolName,
        command,
        original_event: payload.event,
      },
      codex_reason: firstString(getPath(payload, "reason", "message")),
      proposed_scope: firstString(getPath(payload, "scope", "proposed_scope", "proposedScope")),
    };
  }

  toToolResult(payload: CodexHookPayload) {
    const toolName = inferToolName(payload);
    const command = inferCommand(payload);
    const output = inferToolOutput(payload);
    const traceId = inferTraceId(payload);
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      session_id: inferSessionId(payload),
      trace_id: traceId,
      span_id: firstString(getPath(payload, "span_id", "spanId")) ?? traceId,
      action: inferAction(toolName, command),
      status: firstString(getPath(payload, "status")) === "error" ? "error" : "success",
      duration_ms: inferDurationMs(payload),
      output,
      output_hash: output ? digest(output) : undefined,
      approval_id: firstString(getPath(payload, "approval_id", "approvalId")),
    };
  }

  toStop(payload: CodexHookPayload) {
    return {
      tenant_id: this.context.tenantId,
      agent_id: this.context.agentId,
      session_id: inferSessionId(payload),
      trace_id: inferTraceId(payload),
      conversation_id: firstString(getPath(payload, "conversation_id", "conversationId")),
      result_summary: firstString(getPath(payload, "result_summary", "summary")),
      token_count: typeof getPath(payload, "token_count", "tokenCount") === "number"
        ? (getPath(payload, "token_count", "tokenCount") as number)
        : undefined,
      status: firstString(getPath(payload, "status")) === "error" ? "error" : "completed",
    };
  }
}
