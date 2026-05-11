import type { Express, NextFunction, Request, Response } from "express";
import {
  actionInterceptRequestSchema,
  approvalRequestSchema,
  integrityArtifactRequestSchema,
  mcpInterceptRequestSchema,
  recallRequestSchema,
  reviewerAttestationRequestSchema,
  restoreByParamRequestSchema,
  restoreRequestSchema,
  telemetryCompareRequestSchema,
} from "../core/schema.js";
import type { OpenClawActionHarness } from "../adapters/mcporter-hook.js";
import { recall } from "../core/recall.js";
import { isHighRiskAction } from "../core/policy.js";
import type { ApprovalQueue } from "../core/approval-queue.js";
import type { AuditLogger } from "../core/audit.js";
import type { CheckpointManager } from "../daemon/checkpoint.js";
import type { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";
import type { MemoryRecord } from "../core/types.js";
import type { IntegrityBaselineStore } from "../core/integrity.js";
import type { TelemetryStore } from "../core/telemetry-store.js";
import { evaluateReviewerAttestation } from "../core/reviewer-attestation.js";

interface RouteDeps {
  workspace: OpenClawWorkspaceAdapter;
  approvals: ApprovalQueue;
  audit: AuditLogger;
  checkpoints: CheckpointManager;
  actions: OpenClawActionHarness;
  integrity: IntegrityBaselineStore;
  telemetry: TelemetryStore;
}

export interface RouteHandlers {
  health: (req: Request, res: Response) => void;
  scanWorkspace: (req: Request, res: Response) => Promise<void>;
  listMemories: (req: Request, res: Response) => Promise<void>;
  getMemory: (req: Request, res: Response) => Promise<void>;
  verifyMemory: (req: Request, res: Response) => Promise<void>;
  quarantineMemory: (req: Request, res: Response) => Promise<void>;
  recallMemories: (req: Request, res: Response) => Promise<void>;
  interceptAction: (req: Request, res: Response) => Promise<void>;
  previewAction: (req: Request, res: Response) => Promise<void>;
  replayApprovedAction: (req: Request, res: Response) => Promise<void>;
  listApprovalQueue: (req: Request, res: Response) => Promise<void>;
  createApproval: (req: Request, res: Response) => Promise<void>;
  approveQueueItem: (req: Request, res: Response) => Promise<void>;
  rejectQueueItem: (req: Request, res: Response) => Promise<void>;
  listCheckpoints: (req: Request, res: Response) => Promise<void>;
  createCheckpoint: (req: Request, res: Response) => Promise<void>;
  restoreCheckpointByParam: (req: Request, res: Response) => Promise<void>;
  restoreCheckpointByBody: (req: Request, res: Response) => Promise<void>;
  createIntegrityBaseline: (req: Request, res: Response) => Promise<void>;
  checkIntegrityBaseline: (req: Request, res: Response) => Promise<void>;
  listTelemetry: (req: Request, res: Response) => Promise<void>;
  getTelemetry: (req: Request, res: Response) => Promise<void>;
  compareTelemetry: (req: Request, res: Response) => Promise<void>;
  telemetryDashboard: (req: Request, res: Response) => void;
  interceptMcpTool: (req: Request, res: Response) => Promise<void>;
  attestReviewers: (req: Request, res: Response) => Promise<void>;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

async function memoryById(workspace: OpenClawWorkspaceAdapter, id: string): Promise<MemoryRecord> {
  const records = await workspace.scan();
  const record = records.find((item) => item.metadata.memory_id === id);

  if (!record) {
    throw new Error(`Memory not found: ${id}`);
  }

  return record;
}

export function createRouteHandlers(deps: RouteDeps): RouteHandlers {
  return {
    health: (_req: Request, res: Response) => {
      ok(res, { status: "healthy" });
    },
    scanWorkspace: async (_req: Request, res: Response) => {
      const records = await deps.workspace.scan();
      await deps.audit.log("workspace.scanned", { count: records.length });
      ok(res, { count: records.length, records });
    },
    listMemories: async (_req: Request, res: Response) => {
      ok(res, await deps.workspace.scan());
    },
    getMemory: async (req: Request, res: Response) => {
      ok(res, await memoryById(deps.workspace, routeParam(req.params.id)));
    },
    verifyMemory: async (req: Request, res: Response) => {
      const record = await memoryById(deps.workspace, routeParam(req.params.id));
      const metadata = await deps.workspace.metadata.transition(record.metadata.source_path, "verified");
      await deps.audit.log("memory.verified", {
        memory_id: metadata.memory_id,
        source_path: metadata.source_path,
      });
      ok(res, metadata);
    },
    quarantineMemory: async (req: Request, res: Response) => {
      const record = await memoryById(deps.workspace, routeParam(req.params.id));
      const force = req.body?.force === true;
      const metadata = await deps.workspace.metadata.transition(
        record.metadata.source_path,
        "quarantined",
        force,
      );
      await deps.audit.log("memory.quarantined", {
        memory_id: metadata.memory_id,
        source_path: metadata.source_path,
        force,
      });
      ok(res, metadata);
    },
    recallMemories: async (req: Request, res: Response) => {
      const options = recallRequestSchema.parse(req.body ?? {});
      const records = await deps.workspace.scan();
      const results = recall(records, options);
      await deps.audit.log("memory.recall", {
        count: results.length,
        mode: options.mode ?? "default",
      });
      ok(res, results);
    },
    interceptAction: async (req: Request, res: Response) => {
      const payload = actionInterceptRequestSchema.parse(req.body ?? {});
      ok(res, await deps.actions.intercept(payload), 201);
    },
    previewAction: async (req: Request, res: Response) => {
      const payload = actionInterceptRequestSchema.parse(req.body ?? {});
      ok(res, await deps.actions.preview(payload));
    },
    replayApprovedAction: async (req: Request, res: Response) => {
      ok(res, await deps.actions.replayApproved(routeParam(req.params.approvalId)));
    },
    listApprovalQueue: async (_req: Request, res: Response) => {
      ok(res, await deps.approvals.list());
    },
    createApproval: async (req: Request, res: Response) => {
      const payload = approvalRequestSchema.parse(req.body ?? {});

      if (!isHighRiskAction(payload.action)) {
        ok(res, {
          queued: false,
          message: "Action is not high risk and does not require approval",
        });
        return;
      }

      const item = await deps.approvals.enqueue(payload.action, payload.requested_by, payload.payload);
      await deps.audit.log("approval.created", { id: item.id, action: item.action });
      ok(res, { queued: true, item }, 201);
    },
    approveQueueItem: async (req: Request, res: Response) => {
      const item = await deps.approvals.resolve(routeParam(req.params.id), "approved");
      await deps.audit.log("approval.approved", { id: item.id, action: item.action });
      ok(res, item);
    },
    rejectQueueItem: async (req: Request, res: Response) => {
      const item = await deps.approvals.resolve(routeParam(req.params.id), "rejected");
      await deps.audit.log("approval.rejected", { id: item.id, action: item.action });
      ok(res, item);
    },
    listCheckpoints: async (_req: Request, res: Response) => {
      ok(res, await deps.checkpoints.list());
    },
    createCheckpoint: async (_req: Request, res: Response) => {
      const checkpoint = await deps.checkpoints.create(await deps.workspace.scan());
      await deps.audit.log("checkpoint.created", { checkpoint_id: checkpoint.checkpoint_id });
      ok(res, checkpoint, 201);
    },
    restoreCheckpointByParam: async (req: Request, res: Response) => {
      const payload = restoreByParamRequestSchema.parse(req.body ?? {});
      const checkpoint = await deps.checkpoints.restore(
        routeParam(req.params.checkpointId),
        payload.restore_files,
        payload.force,
      );
      await deps.audit.log("checkpoint.restored", {
        checkpoint_id: checkpoint.checkpoint_id,
        restore_files: payload.restore_files,
      });
      ok(res, checkpoint);
    },
    restoreCheckpointByBody: async (req: Request, res: Response) => {
      const payload = restoreRequestSchema.parse(req.body ?? {});
      const checkpoint = await deps.checkpoints.restore(
        payload.checkpoint_id,
        payload.restore_files,
        payload.force,
      );
      await deps.audit.log("checkpoint.restored", {
        checkpoint_id: checkpoint.checkpoint_id,
        restore_files: payload.restore_files,
      });
      ok(res, checkpoint);
    },
    createIntegrityBaseline: async (req: Request, res: Response) => {
      const payload = integrityArtifactRequestSchema.parse(req.body ?? {});
      const baseline = await deps.integrity.createBaseline(payload.artifact_paths);
      await deps.audit.log("integrity.baseline_created", {
        baseline_id: baseline.baseline_id,
        count: baseline.entries.length,
      });
      ok(res, baseline, 201);
    },
    checkIntegrityBaseline: async (req: Request, res: Response) => {
      const payload = integrityArtifactRequestSchema.parse(req.body ?? {});
      const report = await deps.integrity.check(payload.artifact_paths);
      ok(res, report ?? { clean: true, baseline_missing: true });
    },
    listTelemetry: async (req: Request, res: Response) => {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20) || 20));
      ok(res, await deps.telemetry.list(limit));
    },
    getTelemetry: async (req: Request, res: Response) => {
      const record = await deps.telemetry.get(routeParam(req.params.telemetryId));
      if (!record) {
        throw new Error(`Telemetry not found: ${routeParam(req.params.telemetryId)}`);
      }
      ok(res, record);
    },
    compareTelemetry: async (req: Request, res: Response) => {
      const payload = telemetryCompareRequestSchema.parse(req.body ?? {});
      ok(res, await deps.telemetry.compare(payload.telemetry_ids));
    },
    telemetryDashboard: (_req: Request, res: Response) => {
      res
        .status(200)
        .type("html")
        .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aegis ATV Dashboard</title>
    <style>
      :root { color-scheme: light; --bg: #f6f4ef; --panel: #fffdf8; --ink: #182028; --muted: #61707f; --line: #d7d2c7; --accent: #14532d; --warn: #9a3412; --block: #991b1b; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: linear-gradient(180deg, #f6f4ef 0%, #ece8dc 100%); color: var(--ink); }
      main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      p { color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 24px 0; }
      .card, table { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 12px 30px rgba(24, 32, 40, 0.06); }
      .card { padding: 18px; }
      .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
      .value { margin-top: 6px; font-size: 28px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; overflow: hidden; }
      th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
      th { color: var(--muted); font-weight: 600; background: rgba(20, 83, 45, 0.03); }
      tr:last-child td { border-bottom: 0; }
      .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
      .allow { background: rgba(20, 83, 45, 0.12); color: var(--accent); }
      .require_approval { background: rgba(154, 52, 18, 0.12); color: var(--warn); }
      .block { background: rgba(153, 27, 27, 0.12); color: var(--block); }
      code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Aegis ATV Operator Dashboard</h1>
      <p>Recent action previews and enforcement outcomes with verdict, signal count, and telemetry references.</p>
      <div id="summary" class="grid"></div>
      <table>
        <thead>
          <tr><th>Recorded</th><th>Action</th><th>Verdict</th><th>Signals</th><th>Telemetry</th></tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </main>
    <script>
      async function load() {
        const response = await fetch('/telemetry?limit=20');
        const payload = await response.json();
        const rows = payload.data || [];
        const counts = rows.reduce((acc, row) => {
          const key = row.verdict || 'unknown';
          acc.total += 1;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, { total: 0, allow: 0, require_approval: 0, block: 0 });
        document.getElementById('summary').innerHTML = [
          ['Recent events', counts.total],
          ['Allow', counts.allow],
          ['Require approval', counts.require_approval],
          ['Block', counts.block],
        ].map(([label, value]) => '<div class=\"card\"><div class=\"label\">' + label + '</div><div class=\"value\">' + value + '</div></div>').join('');
        document.getElementById('rows').innerHTML = rows.map((row) => {
          const verdict = row.verdict || row.event_type;
          return '<tr>' +
            '<td><code>' + row.recorded_at + '</code></td>' +
            '<td><strong>' + row.action + '</strong><br /><span class=\"label\">' + row.requested_by + '</span></td>' +
            '<td><span class=\"pill ' + verdict + '\">' + verdict + '</span></td>' +
            '<td>' + (row.signals.length ? row.signals.join('<br />') : '<span class=\"label\">none</span>') + '</td>' +
            '<td><code>' + row.telemetry_id + '</code><br /><span class=\"label\">sha: ' + (row.vector_sha256 || 'n/a') + '</span></td>' +
          '</tr>';
        }).join('');
      }
      load().catch((error) => {
        document.getElementById('rows').innerHTML = '<tr><td colspan=\"5\">Failed to load telemetry: ' + error.message + '</td></tr>';
      });
    </script>
  </body>
</html>`);
    },
    interceptMcpTool: async (req: Request, res: Response) => {
      const payload = mcpInterceptRequestSchema.parse(req.body ?? {});
      const actionRequest = {
        action: "mcp_tool" as const,
        requested_by: payload.params.requested_by,
        payload: {
          server_name: payload.params.server_name,
          tool_name: payload.params.tool_name,
          arguments: payload.params.arguments ?? {},
          read_only: payload.params.read_only,
          side_effect: payload.params.side_effect,
        },
        context: payload.params.context,
      };

      const result = await deps.actions.intercept(actionRequest);
      const statusCode = result.evaluation?.verdict === "block" ? 403 : result.queued ? 202 : 200;
      const mcpResponse =
        result.evaluation?.verdict === "block"
          ? {
              jsonrpc: "2.0" as const,
              id: payload.id,
              error: {
                code: 403,
                message: "Blocked by Aegis ATV action firewall",
                data: {
                  verdict: result.evaluation?.verdict,
                  signals: result.evaluation?.signals ?? [],
                  telemetry_id: result.evaluation?.telemetry.telemetry_id,
                },
              },
            }
          : result.queued
            ? {
                jsonrpc: "2.0" as const,
                id: payload.id,
                error: {
                  code: 409,
                  message: "Requires approval before forwarding to MCP tool",
                  data: {
                    approval_id: result.approval_id,
                    verdict: result.evaluation?.verdict,
                    signals: result.evaluation?.signals ?? [],
                    telemetry_id: result.evaluation?.telemetry.telemetry_id,
                  },
                },
              }
            : {
                jsonrpc: "2.0" as const,
                id: payload.id,
                result: {
                  forwarded: true,
                  verdict: result.evaluation?.verdict,
                  telemetry_id: result.evaluation?.telemetry.telemetry_id,
                  output: result.output ?? {
                    server_name: payload.params.server_name,
                    tool_name: payload.params.tool_name,
                    accepted: true,
                  },
                },
              };

      ok(
        res,
        {
          forwarded: !result.queued && result.executed,
          approval_id: result.approval_id,
          evaluation: result.evaluation,
          mcp_response: mcpResponse,
        },
        statusCode,
      );
    },
    attestReviewers: async (req: Request, res: Response) => {
      const payload = reviewerAttestationRequestSchema.parse(req.body ?? {});
      ok(res, evaluateReviewerAttestation(payload));
    },
  };
}

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const handlers = createRouteHandlers(deps);

  app.get("/health", handlers.health);

  app.post("/workspace/scan", asyncRoute(handlers.scanWorkspace));

  app.get("/memories", asyncRoute(handlers.listMemories));

  app.get("/memories/:id", asyncRoute(handlers.getMemory));

  app.post("/verify/:id", asyncRoute(handlers.verifyMemory));

  app.post("/quarantine/:id", asyncRoute(handlers.quarantineMemory));

  app.post("/recall", asyncRoute(handlers.recallMemories));

  app.post("/actions/intercept", asyncRoute(handlers.interceptAction));

  app.post("/actions/preview", asyncRoute(handlers.previewAction));

  app.post("/actions/replay/:approvalId", asyncRoute(handlers.replayApprovedAction));

  app.get("/approval-queue", asyncRoute(handlers.listApprovalQueue));

  app.get("/approvals", asyncRoute(handlers.listApprovalQueue));

  app.post("/approvals", asyncRoute(handlers.createApproval));

  app.post("/approval-queue/:id/approve", asyncRoute(handlers.approveQueueItem));

  app.post("/approval-queue/:id/reject", asyncRoute(handlers.rejectQueueItem));

  app.post("/approvals/:id/approve", asyncRoute(handlers.approveQueueItem));

  app.post("/approvals/:id/reject", asyncRoute(handlers.rejectQueueItem));

  app.get("/checkpoints", asyncRoute(handlers.listCheckpoints));

  app.post("/checkpoint", asyncRoute(handlers.createCheckpoint));

  app.post("/checkpoints", asyncRoute(handlers.createCheckpoint));

  app.post("/restore/:checkpointId", asyncRoute(handlers.restoreCheckpointByParam));

  app.post("/restore", asyncRoute(handlers.restoreCheckpointByBody));

  app.post("/integrity/baseline", asyncRoute(handlers.createIntegrityBaseline));

  app.post("/integrity/check", asyncRoute(handlers.checkIntegrityBaseline));

  app.get("/telemetry", asyncRoute(handlers.listTelemetry));

  app.get("/telemetry/:telemetryId", asyncRoute(handlers.getTelemetry));

  app.post("/telemetry/compare", asyncRoute(handlers.compareTelemetry));

  app.get("/dashboard", handlers.telemetryDashboard);

  app.post("/mcp/intercept", asyncRoute(handlers.interceptMcpTool));

  app.post("/reviewer/attest", asyncRoute(handlers.attestReviewers));
}
