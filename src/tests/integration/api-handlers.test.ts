import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawActionHarness } from "../../adapters/mcporter-hook.js";
import { AegisMcpProxy, InMemoryMcpTransport } from "../../adapters/mcp-proxy.js";
import { createRouteHandlers } from "../../api/routes.js";
import { handleApiError } from "../../api/server.js";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { ApprovalQueue } from "../../core/approval-queue.js";
import { ActionFirewall } from "../../core/action-firewall.js";
import { EventCollector } from "../../core/event-collector.js";
import { AegisControlPlane } from "../../core/control-plane.js";
import { IntegrityBaselineStore } from "../../core/integrity.js";
import { TelemetryStore } from "../../core/telemetry-store.js";
import { AuditLogger } from "../../daemon/audit.js";
import { AtmuLedger } from "../../core/atmu-ledger.js";
import { BurnInProfiler } from "../../core/burnin.js";
import { DualCheckStore } from "../../core/dual-check.js";
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
  const headers = (overrides as Partial<Request> & { headerMap?: Record<string, string> }).headerMap ?? {};
  return {
    body: {},
    params: {},
    header(name: string) {
      return headers[name.toLowerCase()];
    },
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
  const collector = new EventCollector(dataRoot, audit);
  const atmu = new AtmuLedger(dataRoot);
  const dualCheck = new DualCheckStore(dataRoot);
  const burnin = new BurnInProfiler(dataRoot);
  const contextMemory = new (await import("../../core/context-memory.js")).ContextMemoryStore(dataRoot);
  const firewall = new ActionFirewall(integrity);
  const actions = new OpenClawActionHarness(approvals, audit, async (request) => ({
    action: request.action,
    payload: request.payload,
    delivered: true,
  }), firewall, telemetry);
  const controlPlane = new AegisControlPlane({
    approvals,
    audit,
    actions,
    integrity,
    collector,
    atmu,
    dualCheck,
    contextMemory,
  });

  const handlers = createRouteHandlers({
    workspace,
    approvals,
    audit,
    checkpoints: new CheckpointManager(workspace, dataRoot),
    actions,
    integrity,
    telemetry,
    collector,
    atmu,
    dualCheck,
    burnin,
    contextMemory,
    controlPlane,
    mcpProxy: new AegisMcpProxy(controlPlane, new InMemoryMcpTransport(), dataRoot),
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

  it("supports phase 1 session, prompt, decision, and tool result collection APIs", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const sessionRes = mockResponse();
    await handlers.startSession(
      mockRequest({
        body: {
          agent_id: "aid:executor",
          workspace: "/repo",
        },
      }),
      sessionRes,
    );
    expect(sessionRes.statusCode).toBe(201);
    const sessionId = (sessionRes.body as { data: { session: { session_id: string } } }).data.session.session_id;

    const promptRes = mockResponse();
    await handlers.collectUserPrompt(
      mockRequest({
        body: {
          session_id: sessionId,
          agent_id: "aid:executor",
          prompt: "Review the repository and summarize the safety posture.",
        },
      }),
      promptRes,
    );
    expect(promptRes.statusCode).toBe(201);
    expect((promptRes.body as { data: { prompt_hash: string } }).data.prompt_hash).toBeTruthy();

    const decisionRes = mockResponse();
    await handlers.decideTool(
      mockRequest({
        body: {
          session_id: sessionId,
          agent_id: "aid:executor",
          action: "read_file",
          payload: { path: "MEMORY.md" },
          context: {
            declared_intent: "inspect canonical memory only",
            sources: [{ kind: "user_prompt", label: "user", content: "inspect memory", stance: "supporting" }],
          },
        },
      }),
      decisionRes,
    );
    expect(decisionRes.statusCode).toBe(201);
    expect((decisionRes.body as { data: { verdict: string; atv_lite: { schema_version: string } } }).data.verdict).toBe("allow");
    expect((decisionRes.body as { data: { atv_lite: { schema_version: string } } }).data.atv_lite.schema_version).toBe("ATV-Lite-v1");
    const decisionData = (decisionRes.body as { data: { atv_lite: { trace_id: string; commitment: { intent_id?: string; dual_check_receipt_id?: string } } } }).data;
    expect(decisionData.atv_lite.commitment.intent_id).toBeTruthy();
    expect(decisionData.atv_lite.commitment.dual_check_receipt_id).toBeTruthy();

    const resultRes = mockResponse();
    await handlers.collectToolResult(
      mockRequest({
        body: {
          session_id: sessionId,
          trace_id: decisionData.atv_lite.trace_id,
          agent_id: "aid:executor",
          action: "read_file",
          status: "success",
          output: "ok",
        },
      }),
      resultRes,
    );
    expect(resultRes.statusCode).toBe(201);
    expect((resultRes.body as { data: { atv_lite: { result: { status: string } } } }).data.atv_lite.result?.status).toBe("success");
  });

  it("records permission requests and stop events for Codex hook flows", async () => {
    const { handlers } = await createHarness();

    const permissionRes = mockResponse();
    await handlers.collectPermissionRequest(
      mockRequest({
        body: {
          session_id: "sess-hooks",
          agent_id: "aid:executor",
          action: "send_email",
          payload: { to: "demo@example.com" },
          codex_reason: "external outreach requested",
        },
      }),
      permissionRes,
    );
    expect(permissionRes.statusCode).toBe(201);
    expect((permissionRes.body as { data: { item: { id: string } } }).data.item.id).toBeTruthy();

    const stopRes = mockResponse();
    await handlers.stopSession(
      mockRequest({
        body: {
          session_id: "sess-hooks",
          agent_id: "aid:executor",
          result_summary: "completed cleanly",
          token_count: 42,
        },
      }),
      stopRes,
    );
    expect(stopRes.statusCode).toBe(201);
    expect((stopRes.body as { data: { summary: { status: string } } }).data.summary.status).toBe("completed");
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

  it("exposes ATMU intents, dual-check receipts, and burn-in calibration endpoints", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const decisionRes = mockResponse();
    await handlers.decideTool(
      mockRequest({
        body: {
          session_id: "sess-atmu",
          agent_id: "aid:executor",
          action: "read_file",
          payload: { path: "MEMORY.md" },
          context: {
            declared_intent: "inspect canonical memory only",
            sources: [{ kind: "user_prompt", label: "user", content: "inspect memory", stance: "supporting" }],
          },
        },
      }),
      decisionRes,
    );
    const decisionData = (decisionRes.body as { data: { atv_lite: { trace_id: string; commitment: { dual_check_receipt_id?: string } } } }).data;

    const intentRes = mockResponse();
    await handlers.listIntents(mockRequest({ query: { limit: "10" } as never }), intentRes);
    expect((intentRes.body as { data: Array<{ trace_id: string }> }).data.some((item) => item.trace_id === decisionData.atv_lite.trace_id)).toBe(true);

    const receiptsRes = mockResponse();
    await handlers.listDualCheckReceipts(mockRequest({ query: { limit: "10" } as never }), receiptsRes);
    const receipts = (receiptsRes.body as { data: Array<{ receipt_id: string }> }).data;
    expect(receipts.length).toBeGreaterThan(0);

    const verifyRes = mockResponse();
    await handlers.verifyDualCheckReceipt(
      mockRequest({ body: { receipt_id: decisionData.atv_lite.commitment.dual_check_receipt_id } }),
      verifyRes,
    );
    expect((verifyRes.body as { data: { valid: boolean } }).data.valid).toBe(true);

    await handlers.previewAction(
      mockRequest({
        body: {
          action: "external_share",
          requested_by: "aid:executor",
          payload: { target: "https://example.com", resource: "memory/task.md" },
          context: {
            declared_intent: "share the approved summary",
            sources: [{ kind: "user_prompt", label: "user", content: "share summary", stance: "supporting" }],
          },
        },
      }),
      mockResponse(),
    );

    const calibrateRes = mockResponse();
    await handlers.calibrateBurnIn(mockRequest({ body: { limit: 20 } }), calibrateRes);
    expect(calibrateRes.statusCode).toBe(201);
    expect((calibrateRes.body as { data: { sample_size: number } }).data.sample_size).toBeGreaterThan(0);

    const profileRes = mockResponse();
    await handlers.getBurnInProfile(mockRequest(), profileRes);
    expect((profileRes.body as { data: { profile_id: string } }).data.profile_id).toBeTruthy();
  });

  it("records and queries context memory for operator diagnosis", async () => {
    const { handlers } = await createHarness();

    await handlers.startSession(
      mockRequest({ body: { agent_id: "aid:executor", workspace: "/repo", session_id: "sess-memory" } }),
      mockResponse(),
    );
    await handlers.collectUserPrompt(
      mockRequest({ body: { session_id: "sess-memory", agent_id: "aid:executor", prompt: "Inspect MEMORY.md" } }),
      mockResponse(),
    );

    const queryRes = mockResponse();
    await handlers.queryContextMemory(
      mockRequest({ body: { session_id: "sess-memory", text: "Inspect", limit: 10 } }),
      queryRes,
    );
    expect((queryRes.body as { data: Array<{ kind: string }> }).data.length).toBeGreaterThan(0);

    const profileRes = mockResponse();
    await handlers.profileContextMemory(
      mockRequest({ query: { session_id: "sess-memory" } as never }),
      profileRes,
    );
    expect((profileRes.body as { data: { total_entries: number } }).data.total_entries).toBeGreaterThan(0);
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

    const templatesRes = mockResponse();
    await handlers.handleMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: "templates-1",
          method: "resources/templates/list",
        },
      }),
      templatesRes,
    );
    const templates = (templatesRes.body as { result: { resourceTemplates: Array<{ uriTemplate: string }> } }).result.resourceTemplates;
    expect(templates.some((template) => template.uriTemplate === "aegis://telemetry/{telemetry_id}")).toBe(true);

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
    const resourceContents = (resourceReadRes.body as { result: { contents: Array<{ uri: string }>; _meta: { "aegis/resourceUri": string } } }).result;
    expect(resourceContents._meta["aegis/resourceUri"]).toBe("aegis://telemetry/recent");
    const resourceRows = resourceContents.contents;
    expect(resourceRows[0]?.uri).toBe("aegis://telemetry/recent");

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

  it("forwards MCP calls through the proxy endpoint and attaches Aegis metadata", async () => {
    const { handlers } = await createHarness();
    await handlers.createIntegrityBaseline(mockRequest({ body: {} }), mockResponse());

    const res = mockResponse();
    await handlers.proxyMcpTransport(
      mockRequest({
        body: {
          jsonrpc: "2.0",
          id: "proxy-1",
          method: "tools/call",
          params: {
            name: "upstream.echo",
            arguments: { path: "MEMORY.md" },
          },
        },
        headerMap: {
          "x-aegis-agent-id": "aid:mcp:proxy",
          "x-aegis-session-id": "sess-proxy",
          "x-aegis-declared-intent": "inspect canonical memory only",
        },
      } as Partial<Request>),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { result: { _meta: Record<string, string> } };
    expect(body.result._meta["aegis/verdict"]).toBe("allow");
    expect(body.result._meta["aegis/telemetryId"]).toBeTruthy();
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
    expect(String(res.body)).toContain("Pin current detail");
    expect(String(res.body)).toContain("Refresh audit");
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
