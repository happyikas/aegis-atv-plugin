import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawActionHarness } from "../../adapters/mcporter-hook.js";
import { createRouteHandlers } from "../../api/routes.js";
import { handleApiError } from "../../api/server.js";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { ApprovalQueue } from "../../core/approval-queue.js";
import { ActionFirewall } from "../../core/action-firewall.js";
import { IntegrityBaselineStore } from "../../core/integrity.js";
import { TelemetryStore } from "../../core/telemetry-store.js";
import { AuditLogger } from "../../daemon/audit.js";
import { CheckpointManager } from "../../daemon/checkpoint.js";

const tempDirs: string[] = [];

function mockResponse() {
  const response = {
    statusCode: 200,
    contentType: undefined as string | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type(value: string) {
      this.contentType = value;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as unknown as Response & { statusCode: number; contentType?: string; body: unknown };
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    ...overrides,
  } as Request;
}

async function createHarness() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-api-workspace-"));
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-api-data-"));
  tempDirs.push(workspaceRoot, dataRoot);

  await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "MEMORY.md"), "# canonical\n", "utf8");
  await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# task\n", "utf8");

  const workspace = new OpenClawWorkspaceAdapter(workspaceRoot);
  await workspace.scan();
  const approvals = new ApprovalQueue(dataRoot);
  const audit = new AuditLogger(dataRoot);
  const integrity = new IntegrityBaselineStore(dataRoot, process.cwd());
  const telemetry = new TelemetryStore(dataRoot);
  const firewall = new ActionFirewall(integrity);

  const handlers = createRouteHandlers({
    workspace,
    approvals,
    audit,
    checkpoints: new CheckpointManager(workspace, dataRoot),
    actions: new OpenClawActionHarness(approvals, audit, async (request) => ({
      action: request.action,
      payload: request.payload,
      delivered: true,
    }), firewall, telemetry),
    integrity,
    telemetry,
  });

  return { workspace, handlers };
}

describe("api handlers", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("serves memories, verifies them, and quarantines with consistent JSON responses", async () => {
    const { workspace, handlers } = await createHarness();
    const task = (await workspace.scan()).find((item) => item.metadata.source_path === "memory/task.md");
    expect(task).toBeDefined();

    const listRes = mockResponse();
    await handlers.listMemories(mockRequest(), listRes);
    expect(listRes.statusCode).toBe(200);
    expect((listRes.body as { ok: boolean }).ok).toBe(true);

    const getRes = mockResponse();
    await handlers.getMemory(mockRequest({ params: { id: task!.metadata.memory_id } }), getRes);
    expect((getRes.body as { data: { metadata: { source_path: string } } }).data.metadata.source_path).toBe(
      "memory/task.md",
    );

    const verifyRes = mockResponse();
    await handlers.verifyMemory(mockRequest({ params: { id: task!.metadata.memory_id } }), verifyRes);
    expect((verifyRes.body as { data: { state: string } }).data.state).toBe("verified");

    const quarantineRes = mockResponse();
    await handlers.quarantineMemory(
      mockRequest({ params: { id: task!.metadata.memory_id }, body: {} }),
      quarantineRes,
    );
    expect((quarantineRes.body as { data: { state: string } }).data.state).toBe("quarantined");
  });

  it("creates checkpoints, restores them, and manages approval queue endpoints", async () => {
    const { workspace, handlers } = await createHarness();
    const task = (await workspace.scan()).find((item) => item.metadata.source_path === "memory/task.md");
    expect(task).toBeDefined();

    const checkpointRes = mockResponse();
    await handlers.createCheckpoint(mockRequest(), checkpointRes);
    const checkpointId = (checkpointRes.body as { data: { checkpoint_id: string } }).data.checkpoint_id;
    expect(checkpointRes.statusCode).toBe(201);

    await handlers.verifyMemory(mockRequest({ params: { id: task!.metadata.memory_id } }), mockResponse());

    const restoreRes = mockResponse();
    await handlers.restoreCheckpointByParam(
      mockRequest({ params: { checkpointId: checkpointId }, body: { restore_files: false, force: false } }),
      restoreRes,
    );
    expect((restoreRes.body as { ok: boolean }).ok).toBe(true);

    const createApprovalRes = mockResponse();
    await handlers.createApproval(
      mockRequest({
        body: { action: "send_email", requested_by: "aid:executor", payload: { to: "x" } },
      }),
      createApprovalRes,
    );
    const approvalId = (createApprovalRes.body as { data: { item: { id: string } } }).data.item.id;
    expect(createApprovalRes.statusCode).toBe(201);

    const listQueueRes = mockResponse();
    await handlers.listApprovalQueue(mockRequest(), listQueueRes);
    expect((listQueueRes.body as { data: unknown[] }).data).toHaveLength(1);

    const approveRes = mockResponse();
    await handlers.approveQueueItem(mockRequest({ params: { id: approvalId } }), approveRes);
    expect((approveRes.body as { data: { status: string } }).data.status).toBe("approved");
  });

  it("returns structured errors for missing memories", async () => {
    const { handlers } = await createHarness();
    const res = mockResponse();

    try {
      await handlers.getMemory(mockRequest({ params: { id: "not-real" } }), res);
    } catch (error) {
      handleApiError(error, res);
    }

    expect(res.statusCode).toBe(404);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("intercepts risky actions, queues them, and replays after approval", async () => {
    const { handlers } = await createHarness();

    const interceptRes = mockResponse();
    await handlers.interceptAction(
      mockRequest({
        body: {
          action: "send_email",
          requested_by: "aid:executor",
          payload: { to: "demo@example.com" },
        },
      }),
      interceptRes,
    );

    expect(interceptRes.statusCode).toBe(201);
    expect((interceptRes.body as { data: { queued: boolean } }).data.queued).toBe(true);
    const approvalId = (interceptRes.body as { data: { approval_id: string } }).data.approval_id;

    const approveRes = mockResponse();
    await handlers.approveQueueItem(mockRequest({ params: { id: approvalId } }), approveRes);
    expect((approveRes.body as { data: { status: string } }).data.status).toBe("approved");

    const replayRes = mockResponse();
    await handlers.replayApprovedAction(mockRequest({ params: { approvalId } }), replayRes);
    expect(replayRes.statusCode).toBe(200);
    expect((replayRes.body as { data: { executed: boolean } }).data.executed).toBe(true);
  });

  it("creates an integrity baseline and previews actions with telemetry", async () => {
    const { handlers } = await createHarness();

    const baselineRes = mockResponse();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), baselineRes);
    expect(baselineRes.statusCode).toBe(201);

    const previewRes = mockResponse();
    await handlers.previewAction(
      mockRequest({
        body: {
          action: "read_file",
          requested_by: "aid:retriever",
          payload: { path: "MEMORY.md" },
          context: {
            declared_intent: "inspect canonical memory only",
            sources: [{ kind: "user_prompt", label: "user", content: "inspect memory", stance: "supporting" }],
          },
        },
      }),
      previewRes,
    );

    const data = (previewRes.body as { data: { verdict: string; telemetry: { vector: number[] } } }).data;
    expect(data.verdict).toBe("allow");
    expect(data.telemetry.vector).toHaveLength(2080);
  });

  it("lists, fetches, and compares stored telemetry records", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const allowRes = mockResponse();
    await handlers.previewAction(
      mockRequest({
        body: {
          action: "read_file",
          requested_by: "aid:retriever",
          payload: { path: "MEMORY.md" },
          context: {
            declared_intent: "inspect memory only",
            sources: [{ kind: "user_prompt", label: "user", content: "inspect", stance: "supporting" }],
          },
        },
      }),
      allowRes,
    );

    const riskyRes = mockResponse();
    await handlers.previewAction(
      mockRequest({
        body: {
          action: "external_share",
          requested_by: "aid:executor",
          payload: { target: "https://example.com", resource: "memory/task.md" },
          context: {
            declared_intent: "share the approved summary",
            sources: [
              { kind: "repo_file", label: "AGENTS.md", content: "share", stance: "supporting" },
              { kind: "user_prompt", label: "user", content: "do not share", stance: "opposing" },
            ],
          },
        },
      }),
      riskyRes,
    );

    const listRes = mockResponse();
    await handlers.listTelemetry(mockRequest({ query: { limit: "10" } as never }), listRes);
    const listed = (listRes.body as { data: Array<{ telemetry_id: string }> }).data;
    expect(listed.length).toBeGreaterThanOrEqual(2);

    const firstTelemetryId = listed[0]!.telemetry_id;
    const getRes = mockResponse();
    await handlers.getTelemetry(mockRequest({ params: { telemetryId: firstTelemetryId } }), getRes);
    expect((getRes.body as { data: { telemetry_id: string } }).data.telemetry_id).toBe(firstTelemetryId);

    const compareRes = mockResponse();
    await handlers.compareTelemetry(
      mockRequest({
        body: {
          telemetry_ids: listed.slice(0, 2).map((item) => item.telemetry_id),
        },
      }),
      compareRes,
    );
    expect((compareRes.body as { data: { telemetry_ids: string[] } }).data.telemetry_ids).toHaveLength(2);
  });

  it("lists recent approval audit events", async () => {
    const { handlers } = await createHarness();

    await handlers.createApproval(
      mockRequest({
        body: { action: "send_email", requested_by: "aid:executor", payload: { to: "demo@example.com" } },
      }),
      mockResponse(),
    );

    const res = mockResponse();
    await handlers.listAudit(
      mockRequest({ query: { limit: "5", event_prefix: "approval" } as never }),
      res,
    );

    const data = (res.body as { data: Array<{ event: string }> }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]?.event.startsWith("approval")).toBe(true);
  });

  it("serves a realistic MCP initialize and tools/list flow", async () => {
    const { handlers } = await createHarness();

    const initializeRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            clientInfo: {
              name: "Codex",
              version: "1.0.0",
            },
          },
        },
      }),
      initializeRes,
    );

    expect((initializeRes.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-03-26");

    const listRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        },
      }),
      listRes,
    );

    const tools = (listRes.body as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.some((tool) => tool.name === "aegis.preview_action")).toBe(true);

    const resourcesRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 3,
          method: "resources/list",
        },
      }),
      resourcesRes,
    );
    const resources = (resourcesRes.body as { result: { resources: Array<{ uri: string }> } }).result.resources;
    expect(resources.some((resource) => resource.uri === "aegis://dashboard/live")).toBe(true);

    const promptsRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 4,
          method: "prompts/list",
        },
      }),
      promptsRes,
    );
    const prompts = (promptsRes.body as { result: { prompts: Array<{ name: string }> } }).result.prompts;
    expect(prompts.some((prompt) => prompt.name === "aegis_demo_walkthrough")).toBe(true);

    const resourceReadRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 5,
          method: "resources/read",
          params: {
            uri: "aegis://telemetry/recent",
          },
        },
      }),
      resourceReadRes,
    );
    const resourceContents = (resourceReadRes.body as { result: { contents: Array<{ uri: string }> } }).result.contents;
    expect(resourceContents[0]?.uri).toBe("aegis://telemetry/recent");

    const auditResourceRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 7,
          method: "resources/read",
          params: {
            uri: "aegis://audit/approval",
          },
        },
      }),
      auditResourceRes,
    );
    const auditResource = (auditResourceRes.body as { result: { contents: Array<{ uri: string }> } }).result.contents;
    expect(auditResource[0]?.uri).toBe("aegis://audit/approval");

    const promptGetRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: 6,
          method: "prompts/get",
          params: {
            name: "aegis_demo_walkthrough",
            arguments: {
              audience: "customer",
            },
          },
        },
      }),
      promptGetRes,
    );
    const promptResult = (promptGetRes.body as { result: { name: string; messages: Array<{ content: { text: string } }> } }).result;
    expect(promptResult.name).toBe("aegis_demo_walkthrough");
    expect(promptResult.messages[0]?.content.text).toContain("customer");
  });

  it("executes an MCP tools/call preview using a realistic MCP wire format", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const res = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: "call-1",
          method: "tools/call",
          params: {
            name: "aegis.preview_action",
            arguments: {
              action: "read_file",
              requested_by: "aid:mcp:client",
              payload: { path: "MEMORY.md" },
              context: {
                declared_intent: "inspect canonical memory only",
                sources: [{ kind: "user_prompt", label: "user", content: "inspect memory", stance: "supporting" }],
              },
            },
          },
        },
      }),
      res,
    );

    const result = (res.body as {
      result: {
        structuredContent: { verdict: string };
        _meta: { "aegis/verdict": string; "aegis/telemetryId": string };
      };
    }).result;
    expect(result.structuredContent.verdict).toBe("allow");
    expect(result._meta["aegis/verdict"]).toBe("allow");
    expect(result._meta["aegis/telemetryId"]).toBeTruthy();
  });

  it("intercepts MCP-style tool calls and returns a JSON-RPC-shaped policy response", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const res = mockResponse();
    await handlers.interceptMcpTool(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: "demo-1",
          method: "tools/call",
          params: {
            requested_by: "aid:mcp:client",
            server_name: "github",
            tool_name: "issues.update",
            arguments: { status: "closed" },
            side_effect: true,
            context: {
              declared_intent: "inspect the issue only",
              sources: [{ kind: "user_prompt", label: "user", content: "review only", stance: "supporting" }],
            },
          },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    const data = (res.body as { data: { mcp_response: { error: { message: string } } } }).data;
    expect(data.mcp_response.error.message).toContain("Blocked by Aegis ATV");
  });

  it("renders the customer demo dashboard html", async () => {
    const { handlers } = await createHarness();
    const res = mockResponse();

    handlers.telemetryDashboard(mockRequest(), res);

    expect(res.contentType).toBe("html");
    expect(String(res.body)).toContain("Pre-execution trust for agent actions");
    expect(String(res.body)).toContain("Aegis ATV customer demo surface");
    expect(String(res.body)).toContain("Pending approval queue");
    expect(String(res.body)).toContain("Latest drift status");
    expect(String(res.body)).toContain("Create baseline");
    expect(String(res.body)).toContain("Approve");
    expect(String(res.body)).toContain("Replay approved");
    expect(String(res.body)).toContain("Compare latest two");
    expect(String(res.body)).toContain("Selected telemetry drawer");
    expect(String(res.body)).toContain("Recent governance events");
  });

  it("attests reviewer outputs and marks mismatches as untrusted", async () => {
    const { handlers } = await createHarness();
    const res = mockResponse();

    await handlers.attestReviewers(
      mockRequest({
        body: {
          artifact_id: "pr-1",
          primary: {
            reviewer_id: "aid:reviewer:1",
            output: "Approve after docs update.",
            verdict: "approve",
          },
          secondary: {
            reviewer_id: "aid:reviewer:2",
            output: "Reject because the docs are incomplete.",
            verdict: "reject",
          },
        },
      }),
      res,
    );

    expect((res.body as { data: { trusted: boolean } }).data.trusted).toBe(false);
  });
});
