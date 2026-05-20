import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AegisMcpProxy,
  CommandMcpTransport,
  createConfiguredMcpTransport,
} from "../../adapters/mcp-proxy.js";
import type { AegisControlPlaneClient } from "../../core/control-plane.js";
import type { McpTransport } from "../../adapters/mcp-proxy.js";

const tempDirs: string[] = [];

function createControlPlane(verdict: "allow" | "require_approval" | "block"): AegisControlPlaneClient {
  return {
    startSession: vi.fn(),
    recordUserPrompt: vi.fn(),
    decideTool: vi.fn(async (request?: { payload?: { descriptor_drift?: boolean } }) => {
      const effectiveVerdict = request?.payload?.descriptor_drift ? "block" : verdict;
      return {
        verdict: effectiveVerdict,
        evaluation: {
          verdict: effectiveVerdict,
          signals:
            effectiveVerdict === "block"
              ? ["blocked"]
              : effectiveVerdict === "require_approval"
                ? ["needs_approval"]
                : [],
          telemetry: { telemetry_id: `tel-${effectiveVerdict}` },
        },
        atv_lite: { commitment: { atv_hash: `atv-${effectiveVerdict}` } },
        event_id: `evt-${effectiveVerdict}`,
      };
    }),
    recordToolResult: vi.fn(async () => ({
      atv_lite: { result: { status: verdict === "block" ? "blocked" : verdict === "require_approval" ? "queued" : "success" } },
      event_id: `evt-result-${verdict}`,
    })),
    createApproval: vi.fn(),
    requestApproval: vi.fn(async () => ({
      queued: true,
      item: { id: "approval-1" },
      event_id: "evt-approval",
    })),
    stopSession: vi.fn(),
  } as unknown as AegisControlPlaneClient;
}

function createUpstream(): McpTransport {
  return {
    send: vi.fn(async (request) => {
      if (request.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [
              {
                name: "upstream.echo",
                inputSchema: { type: "object" },
              },
            ],
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: "upstream ok" }],
        },
      };
    }),
  };
}

describe("AegisMcpProxy", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function makeDataRoot(): Promise<string> {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-mcp-proxy-"));
    tempDirs.push(dataRoot);
    return dataRoot;
  }

  it("forwards allow decisions to the upstream MCP server", async () => {
    const upstream = createUpstream();
    const proxy = new AegisMcpProxy(createControlPlane("allow"), upstream, await makeDataRoot());

    const response = await proxy.handle(
      {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "upstream.echo",
          arguments: { path: "MEMORY.md" },
        },
      },
      {
        agent_id: "aid:proxy",
        session_id: "sess-1",
      },
    );

    expect((upstream.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect((response.result as { _meta: Record<string, string> })._meta["aegis/verdict"]).toBe("allow");
  });

  it("returns a pending error when approval is required", async () => {
    const upstream = createUpstream();
    const proxy = new AegisMcpProxy(createControlPlane("require_approval"), upstream, await makeDataRoot());

    const response = await proxy.handle(
      {
        jsonrpc: "2.0",
        id: "call-2",
        method: "tools/call",
        params: {
          name: "upstream.publish",
          arguments: { target: "https://example.com" },
        },
      },
      {
        agent_id: "aid:proxy",
        session_id: "sess-1",
      },
    );

    expect((response.error as { code: number }).code).toBe(-32001);
    expect((upstream.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("returns a block error and avoids forwarding blocked calls", async () => {
    const upstream = createUpstream();
    const proxy = new AegisMcpProxy(createControlPlane("block"), upstream, await makeDataRoot());

    const response = await proxy.handle(
      {
        jsonrpc: "2.0",
        id: "call-3",
        method: "tools/call",
        params: {
          name: "upstream.delete",
          arguments: { path: "memory/task.md" },
        },
      },
      {
        agent_id: "aid:proxy",
        session_id: "sess-1",
      },
    );

    expect((response.error as { code: number }).code).toBe(-32003);
    expect((upstream.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("invokes a stdio MCP transport command with JSON-RPC payloads", async () => {
    const transport = new CommandMcpTransport(process.execPath, [
      "-e",
      'process.stdin.on("data",chunk=>{const input=JSON.parse(chunk.toString());process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:input.id,result:{echoed:input.method}}));});',
    ]);

    const response = await transport.send({
      jsonrpc: "2.0",
      id: "stdio-1",
      method: "ping",
      params: {},
    });

    expect((response.result as { echoed: string }).echoed).toBe("ping");
  });

  it("creates a command MCP transport from environment configuration", () => {
    const transport = createConfiguredMcpTransport({
      AEGIS_MCP_UPSTREAM_COMMAND: process.execPath,
      AEGIS_MCP_UPSTREAM_ARGS: JSON.stringify(["-e", "process.exit(0)"]),
      AEGIS_MCP_UPSTREAM_CWD: process.cwd(),
    });

    expect(transport).toBeInstanceOf(CommandMcpTransport);
  });

  it("blocks MCP tool calls when the upstream descriptor drifts from baseline", async () => {
    let tools = [
      {
        name: "upstream.echo",
        inputSchema: { type: "object" },
      },
    ];

    const upstream: McpTransport = {
      send: vi.fn(async (request) => {
        if (request.method === "tools/list") {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: { tools },
          };
        }
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: "ok" }],
          },
        };
      }),
    };

    const proxy = new AegisMcpProxy(createControlPlane("allow"), upstream, await makeDataRoot());
    await proxy.handle(
      {
        jsonrpc: "2.0",
        id: "baseline-list",
        method: "tools/list",
        params: {},
      },
      {
        agent_id: "aid:proxy",
        session_id: "sess-1",
      },
    );

    tools = [
      {
        name: "upstream.echo",
        inputSchema: { type: "object" },
      },
      {
        name: "upstream.delete",
        inputSchema: { type: "object" },
      },
    ];

    const response = await proxy.handle(
      {
        jsonrpc: "2.0",
        id: "call-drift",
        method: "tools/call",
        params: {
          name: "upstream.echo",
          arguments: {},
        },
      },
      {
        agent_id: "aid:proxy",
        session_id: "sess-1",
      },
    );

    expect((response.error as { code: number }).code).toBe(-32003);
    expect(((response.error as { data: Record<string, unknown> }).data.telemetry_id)).toBeTruthy();
  });
});
