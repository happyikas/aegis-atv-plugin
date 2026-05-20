import { spawn } from "node:child_process";
import type { AegisControlPlaneClient } from "../core/control-plane.js";
import { McpDescriptorStore } from "../core/mcp-descriptor-store.js";
import type {
  McpProxyContext,
  McpToolsCallRequest,
  McpTransportRequest,
} from "../core/types.js";
import { checksum, nowIso } from "../core/utils.js";

export interface McpTransport {
  send(request: McpTransportRequest): Promise<Record<string, unknown>>;
}

export class InMemoryMcpTransport implements McpTransport {
  async send(request: McpTransportRequest): Promise<Record<string, unknown>> {
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "upstream-demo", version: "0.1.0" },
          capabilities: { tools: {}, resources: {}, prompts: {} },
        },
      };
    }

    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            {
              name: "upstream.echo",
              title: "Upstream Echo",
              description: "Echoes arguments to demonstrate proxy forwarding.",
              inputSchema: { type: "object", additionalProperties: true },
            },
          ],
        },
      };
    }

    if (request.method === "tools/call") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: `Upstream executed ${request.params.name}`,
            },
          ],
          structuredContent: {
            echoed_arguments: request.params.arguments ?? {},
            forwarded_at: nowIso(),
          },
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {},
    };
  }
}

export class HttpMcpTransport implements McpTransport {
  constructor(private readonly baseUrl: string) {}

  async send(request: McpTransportRequest): Promise<Record<string, unknown>> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Upstream MCP transport failed with status ${response.status}`);
    }
    return payload;
  }
}

export class CommandMcpTransport implements McpTransport {
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly cwd?: string,
  ) {}

  async send(request: McpTransportRequest): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Upstream MCP command failed with code ${code}: ${stderr.trim()}`));
          return;
        }

        const raw = stdout.trim();
        if (!raw) {
          resolve({ jsonrpc: "2.0", id: request.id, result: {} });
          return;
        }

        try {
          resolve(JSON.parse(raw) as Record<string, unknown>);
        } catch (error) {
          reject(
            new Error(
              `Upstream MCP command returned invalid JSON: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      });

      child.stdin.write(JSON.stringify(request));
      child.stdin.end();
    });
  }
}

function inferSideEffect(call: McpToolsCallRequest, context: McpProxyContext): { readOnly: boolean; sideEffect: boolean } {
  if (typeof context.read_only === "boolean" || typeof context.side_effect === "boolean") {
    return {
      readOnly: context.read_only === true,
      sideEffect: context.side_effect === true,
    };
  }

  const lower = call.params.name.toLowerCase();
  const sideEffect = ["delete", "share", "send", "write", "publish", "deploy", "update"].some((needle) =>
    lower.includes(needle),
  );

  return {
    readOnly: !sideEffect,
    sideEffect,
  };
}

function attachMeta(
  response: Record<string, unknown>,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  if ("result" in response && response.result && typeof response.result === "object" && !Array.isArray(response.result)) {
    const result = response.result as Record<string, unknown>;
    return {
      ...response,
      result: {
        ...result,
        _meta: {
          ...(result._meta && typeof result._meta === "object" ? result._meta as Record<string, unknown> : {}),
          ...meta,
        },
      },
    };
  }

  return {
    ...response,
    _meta: meta,
  };
}

function makeProxyError(id: string | number, code: number, message: string, data: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

export class AegisMcpProxy {
  private readonly descriptors: McpDescriptorStore;

  constructor(
    private readonly controlPlane: AegisControlPlaneClient,
    private readonly upstream: McpTransport,
    dataRoot = process.env.AEGIS_DATA_DIR ?? `${process.cwd()}/data`,
  ) {
    this.descriptors = new McpDescriptorStore(dataRoot);
  }

  private async fetchToolDescriptor(serverId = "upstream") {
    const response = await this.upstream.send({
      jsonrpc: "2.0",
      id: "aegis-descriptor-probe",
      method: "tools/list",
      params: {},
    });
    const tools = Array.isArray((response.result as { tools?: unknown[] } | undefined)?.tools)
      ? ((response.result as { tools?: unknown[] }).tools ?? [])
      : [];
    const report = await this.descriptors.ensureBaseline(serverId, tools);
    return { tools, report };
  }

  async primeDescriptorBaseline(serverId = "upstream"): Promise<void> {
    await this.fetchToolDescriptor(serverId);
  }

  async handle(request: McpTransportRequest, context: McpProxyContext): Promise<Record<string, unknown>> {
    if (request.method === "tools/list") {
      const upstreamResponse = await this.upstream.send(request);
      const tools = Array.isArray((upstreamResponse.result as { tools?: unknown[] } | undefined)?.tools)
        ? ((upstreamResponse.result as { tools?: unknown[] }).tools ?? [])
        : [];
      const report = await this.descriptors.ensureBaseline("upstream", tools);
      return attachMeta(upstreamResponse, {
        "aegis/descriptorHash": report.descriptor_hash,
        "aegis/descriptorBaselineHash": report.baseline_hash,
        "aegis/descriptorClean": report.clean,
        "aegis/descriptorToolCount": report.tool_count,
      });
    }

    if (request.method !== "tools/call") {
      return this.upstream.send(request);
    }

    const { readOnly, sideEffect } = inferSideEffect(request, context);
    const { report } = await this.fetchToolDescriptor("upstream");
    const traceId = checksum(JSON.stringify({
      session_id: context.session_id,
      tool_name: request.params.name,
      arguments: request.params.arguments ?? {},
      server_name: "upstream",
    })).slice(0, 16);
    const spanId = checksum(JSON.stringify({
      trace_id: traceId,
      requested_by: context.requested_by ?? context.agent_id,
    })).slice(0, 16);

    const decision = await this.controlPlane.decideTool({
      tenant_id: context.tenant_id ?? "local-tenant",
      agent_id: context.agent_id,
      session_id: context.session_id,
      trace_id: traceId,
      span_id: spanId,
      codex_surface: "codex-mcp-proxy",
      workspace: context.workspace,
      repo: context.repo,
      model: context.model,
      sandbox_mode: context.sandbox_mode,
      approval_policy: context.approval_policy,
      action: "mcp_tool",
      requested_by: context.requested_by ?? context.agent_id,
        payload: {
          server_name: "upstream",
          tool_name: request.params.name,
          arguments: request.params.arguments ?? {},
          read_only: readOnly,
          side_effect: sideEffect,
          descriptor_hash: report.descriptor_hash,
          descriptor_baseline_hash: report.baseline_hash,
          descriptor_drift: !report.clean,
          tool_count: report.tool_count,
        },
        context: {
          session_id: context.session_id,
        step_id: spanId,
        declared_intent: context.declared_intent,
        sources: context.sources,
      },
    });

    if (decision.verdict === "block") {
      await this.controlPlane.recordToolResult({
        tenant_id: context.tenant_id ?? "local-tenant",
        agent_id: context.agent_id,
        session_id: context.session_id,
        trace_id: traceId,
        span_id: spanId,
        action: "mcp_tool",
        status: "blocked",
      });
      return makeProxyError(request.id, -32003, "Aegis ATV blocked MCP tool call", {
        verdict: decision.verdict,
        telemetry_id: decision.evaluation.telemetry.telemetry_id,
        verdict_record_id: decision.atv_lite.commitment.atv_hash,
        signals: decision.evaluation.signals,
      });
    }

    if (decision.verdict === "require_approval") {
      const approval = await this.controlPlane.requestApproval({
        tenant_id: context.tenant_id ?? "local-tenant",
        agent_id: context.agent_id,
        session_id: context.session_id,
        trace_id: traceId,
        span_id: spanId,
        action: "mcp_tool",
        requested_by: context.requested_by ?? context.agent_id,
        payload: {
          server_name: "upstream",
          tool_name: request.params.name,
          arguments: request.params.arguments ?? {},
          read_only: readOnly,
          side_effect: sideEffect,
        },
        codex_reason: "mcp_proxy_requires_approval",
        proposed_scope: request.params.name,
      });
      await this.controlPlane.recordToolResult({
        tenant_id: context.tenant_id ?? "local-tenant",
        agent_id: context.agent_id,
        session_id: context.session_id,
        trace_id: traceId,
        span_id: spanId,
        action: "mcp_tool",
        status: "queued",
        approval_id: approval.item?.id,
      });
      return makeProxyError(request.id, -32001, "Aegis ATV requires approval before forwarding MCP tool call", {
        verdict: decision.verdict,
        telemetry_id: decision.evaluation.telemetry.telemetry_id,
        approval_id: approval.item?.id,
        verdict_record_id: decision.atv_lite.commitment.atv_hash,
      });
    }

    const upstreamResponse = await this.upstream.send(request);
    const resultPayload = "result" in upstreamResponse ? upstreamResponse.result : upstreamResponse;
    const resultHash = checksum(JSON.stringify(resultPayload ?? null));
    const resultStatus = "error" in upstreamResponse ? "error" : "success";

    await this.controlPlane.recordToolResult({
      tenant_id: context.tenant_id ?? "local-tenant",
      agent_id: context.agent_id,
      session_id: context.session_id,
      trace_id: traceId,
      span_id: spanId,
      action: "mcp_tool",
      status: resultStatus,
      output_hash: resultHash,
      output: JSON.stringify(resultPayload ?? null),
    });

    return attachMeta(upstreamResponse, {
      "aegis/verdict": decision.verdict,
      "aegis/telemetryId": decision.evaluation.telemetry.telemetry_id,
      "aegis/verdictRecordId": decision.atv_lite.commitment.atv_hash,
      "aegis/traceId": traceId,
      "aegis/descriptorHash": report.descriptor_hash,
      "aegis/descriptorBaselineHash": report.baseline_hash,
      "aegis/descriptorClean": report.clean,
    });
  }
}

export function createConfiguredMcpTransport(env: NodeJS.ProcessEnv = process.env): McpTransport {
  const url = env.AEGIS_MCP_UPSTREAM_URL;
  if (url && url.length > 0) {
    return new HttpMcpTransport(url);
  }
  const command = env.AEGIS_MCP_UPSTREAM_COMMAND;
  if (command && command.length > 0) {
    const args = env.AEGIS_MCP_UPSTREAM_ARGS ? JSON.parse(env.AEGIS_MCP_UPSTREAM_ARGS) : [];
    if (!Array.isArray(args) || !args.every((value) => typeof value === "string")) {
      throw new Error("AEGIS_MCP_UPSTREAM_ARGS must be a JSON array of strings");
    }
    return new CommandMcpTransport(command, args, env.AEGIS_MCP_UPSTREAM_CWD);
  }
  return new InMemoryMcpTransport();
}
