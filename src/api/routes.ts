import type { Express, NextFunction, Request, Response } from "express";
import {
  actionInterceptRequestSchema,
  approvalRequestSchema,
  integrityArtifactRequestSchema,
  mcpInterceptRequestSchema,
  mcpTransportRequestSchema,
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
  handleMcpTransport: (req: Request, res: Response) => Promise<void>;
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

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_SERVER_INFO = {
  name: "aegis-atv-demo",
  version: "0.1.0",
};

function mcpResult(id: string | number, result: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    result,
  };
}

function mcpError(id: string | number, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

function mcpTextContent(text: string) {
  return [{ type: "text", text }];
}

function actionSummary(action: string, verdict: string, signals: string[]): string {
  const signalSummary = signals.length ? signals.join(", ") : "none";
  return `Aegis ATV reviewed ${action} and returned ${verdict}. Signals: ${signalSummary}.`;
}

function mcpToolEnvelope(
  summary: string,
  structuredContent: unknown,
  isError: boolean,
  meta?: Record<string, unknown>,
) {
  return {
    content: mcpTextContent(summary),
    structuredContent,
    isError,
    _meta: {
      "aegis/summary": summary,
      "aegis/isError": isError,
      ...meta,
    },
  };
}

function buildMcpTools() {
  return [
    {
      name: "aegis.preview_action",
      title: "Preview Action",
      description: "Evaluate a candidate action and return Aegis ATV verdict, provenance, divergence, and telemetry without executing it.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string" },
          requested_by: { type: "string" },
          payload: { type: "object", additionalProperties: true },
          context: { type: "object", additionalProperties: true },
        },
      },
    },
    {
      name: "aegis.intercept_action",
      title: "Intercept Action",
      description: "Evaluate and, if permitted, execute or queue a candidate action through the Aegis ATV control plane.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string" },
          requested_by: { type: "string" },
          payload: { type: "object", additionalProperties: true },
          context: { type: "object", additionalProperties: true },
        },
      },
    },
    {
      name: "aegis.reviewer_attest",
      title: "Reviewer Cross-Attestation",
      description: "Compare two reviewer outputs and determine whether the pair is trustworthy enough to accept.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: "object",
        required: ["artifact_id", "primary", "secondary"],
        properties: {
          artifact_id: { type: "string" },
          primary: { type: "object", additionalProperties: true },
          secondary: { type: "object", additionalProperties: true },
        },
      },
    },
    {
      name: "aegis.telemetry_lookup",
      title: "Telemetry Lookup",
      description: "List recent telemetry records or fetch a single telemetry record for operator review.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          telemetry_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  ];
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
      :root { color-scheme: light; --bg: #efe8db; --bg2: #f8f4ec; --panel: rgba(255, 252, 245, 0.9); --ink: #14202d; --muted: #60707f; --line: rgba(79, 90, 102, 0.16); --accent: #0f766e; --accent2: #d97706; --allow: #166534; --approval: #b45309; --block: #b91c1c; --shadow: 0 22px 60px rgba(20, 32, 45, 0.10); }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 32%),
        radial-gradient(circle at top right, rgba(217, 119, 6, 0.12), transparent 28%),
        linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%);
        color: var(--ink); }
      main { max-width: 1240px; margin: 0 auto; padding: 36px 20px 72px; }
      h1, h2, h3, .hero-metric-value { font-family: Georgia, "Times New Roman", serif; }
      h1 { margin: 0 0 10px; font-size: clamp(36px, 5vw, 58px); line-height: 1; }
      h2 { margin: 0 0 14px; font-size: 24px; }
      p { color: var(--muted); line-height: 1.55; }
      .hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr); gap: 20px; align-items: stretch; margin-bottom: 24px; }
      .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; box-shadow: var(--shadow); backdrop-filter: blur(10px); }
      .hero-copy, .hero-metrics, .rail, .table-panel, .timeline-panel { padding: 24px; }
      .hero-kicker { display: inline-flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 999px; background: rgba(20, 32, 45, 0.05); color: var(--ink); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .hero-copy p { max-width: 62ch; }
      .hero-metrics { display: grid; gap: 14px; align-content: start; }
      .hero-metric { padding: 16px; border-radius: 18px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(79, 90, 102, 0.12); }
      .hero-metric-label, .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
      .hero-metric-value { margin-top: 4px; font-size: 34px; line-height: 1; }
      .hero-metric-subtle { margin-top: 6px; font-size: 13px; color: var(--muted); }
      .grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 20px; }
      .subgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 20px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
      .card { padding: 18px; border-radius: 20px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(79, 90, 102, 0.12); }
      .value { margin-top: 8px; font-size: 30px; font-weight: 700; }
      .stack { display: grid; gap: 12px; }
      .signal-item, .timeline-item { padding: 14px 16px; border-radius: 18px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(79, 90, 102, 0.12); }
      .mini-list { display: grid; gap: 10px; }
      .mini-item { padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(79, 90, 102, 0.12); }
      .signal-name { font-weight: 700; margin-bottom: 4px; }
      .signal-bar { margin-top: 10px; height: 8px; background: rgba(20, 32, 45, 0.08); border-radius: 999px; overflow: hidden; }
      .signal-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 999px; }
      table { width: 100%; border-collapse: collapse; overflow: hidden; }
      th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
      th { color: var(--muted); font-weight: 600; background: rgba(15, 118, 110, 0.04); }
      tr:last-child td { border-bottom: 0; }
      .pill { display: inline-block; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
      .allow { background: rgba(22, 101, 52, 0.12); color: var(--allow); }
      .require_approval { background: rgba(180, 83, 9, 0.14); color: var(--approval); }
      .block { background: rgba(185, 28, 28, 0.14); color: var(--block); }
      .unknown { background: rgba(20, 32, 45, 0.08); color: var(--ink); }
      .eyebrow { margin: 0 0 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
      code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; word-break: break-all; }
      .muted { color: var(--muted); }
      .tiny { font-size: 12px; }
      @media (max-width: 980px) {
        .hero, .grid, .subgrid { grid-template-columns: 1fr; }
        .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        main { padding-inline: 14px; }
        .summary-grid { grid-template-columns: 1fr; }
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        td { padding: 12px 16px; }
        tr { border-bottom: 1px solid var(--line); }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="hero-copy panel">
          <div class="hero-kicker">Aegis ATV customer demo surface</div>
          <h1>Pre-execution trust for agent actions</h1>
          <p>Show operators and buyers how one control plane can explain low-risk allows, human-review escalations, hard blocks, and telemetry-backed evidence without replacing the existing agent stack.</p>
          <div id="summary" class="summary-grid"></div>
        </div>
        <div class="hero-metrics panel" id="heroMetrics"></div>
      </section>
      <section class="grid">
        <div class="table-panel panel">
          <div class="eyebrow">Recent telemetry</div>
          <h2>Latest verdicts and evidence</h2>
          <table>
            <thead>
              <tr><th>Recorded</th><th>Action</th><th>Verdict</th><th>Signals</th><th>Telemetry</th></tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
        <div class="stack">
          <div class="rail panel">
            <div class="eyebrow">Top risk signals</div>
            <h2>What is driving decisions</h2>
            <div id="signals" class="stack"></div>
          </div>
          <div class="timeline-panel panel">
            <div class="eyebrow">Demo storyline</div>
            <h2>How to narrate the board</h2>
            <div id="timeline" class="stack"></div>
          </div>
        </div>
      </section>
      <section class="subgrid">
        <div class="panel rail">
          <div class="eyebrow">Human approvals</div>
          <h2>Pending approval queue</h2>
          <div id="approvals" class="mini-list"></div>
        </div>
        <div class="panel rail">
          <div class="eyebrow">Artifact integrity</div>
          <h2>Latest drift status</h2>
          <div id="integrity" class="mini-list"></div>
        </div>
      </section>
    </main>
    <script>
      async function load() {
        const [telemetryResponse, approvalsResponse, integrityResponse] = await Promise.all([
          fetch('/telemetry?limit=20'),
          fetch('/approval-queue'),
          fetch('/integrity/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
        ]);
        const payload = await telemetryResponse.json();
        const approvalsPayload = await approvalsResponse.json();
        const integrityPayload = await integrityResponse.json();
        const rows = payload.data || [];
        const approvals = approvalsPayload.data || [];
        const integrity = integrityPayload.data || integrityPayload;
        const counts = rows.reduce((acc, row) => {
          const key = row.verdict || 'unknown';
          acc.total += 1;
          acc[key] = (acc[key] || 0) + 1;
          acc.signalTotal += row.signal_count || 0;
          return acc;
        }, { total: 0, allow: 0, require_approval: 0, block: 0, unknown: 0, signalTotal: 0 });
        const signalCounts = {};
        rows.forEach((row) => {
          (row.signals || []).forEach((signal) => {
            signalCounts[signal] = (signalCounts[signal] || 0) + 1;
          });
        });
        const topSignals = Object.entries(signalCounts)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 4);
        const approvalRate = counts.total ? Math.round((counts.require_approval / counts.total) * 100) : 0;
        const blockRate = counts.total ? Math.round((counts.block / counts.total) * 100) : 0;
        const avgSignals = counts.total ? (counts.signalTotal / counts.total).toFixed(1) : '0.0';
        const hottestSignal = topSignals.length ? topSignals[0][0] : 'none';
        document.getElementById('summary').innerHTML = [
          ['Recent events', counts.total],
          ['Allow', counts.allow],
          ['Require approval', counts.require_approval],
          ['Block', counts.block],
        ].map(([label, value]) => '<div class=\"card\"><div class=\"label\">' + label + '</div><div class=\"value\">' + value + '</div></div>').join('');
        document.getElementById('heroMetrics').innerHTML = [
          ['Escalation rate', approvalRate + '%', 'Share of recent events requiring a human decision'],
          ['Block rate', blockRate + '%', 'Share of events stopped before side effects'],
          ['Average signal density', avgSignals, 'How much evidence accompanies each verdict'],
          ['Most frequent signal', hottestSignal, 'The strongest recurring policy narrative in the current window'],
        ].map(([label, value, note]) =>
          '<div class=\"hero-metric\"><div class=\"hero-metric-label\">' + label + '</div><div class=\"hero-metric-value\">' + value + '</div><div class=\"hero-metric-subtle\">' + note + '</div></div>'
        ).join('');
        document.getElementById('signals').innerHTML = topSignals.length
          ? topSignals.map(([name, count]) => {
              const width = Math.max(16, Math.min(100, Math.round((count / Math.max(...topSignals.map((entry) => entry[1]))) * 100)));
              return '<div class=\"signal-item\"><div class=\"signal-name\">' + name + '</div><div class=\"muted tiny\">Seen in ' + count + ' recent event' + (count === 1 ? '' : 's') + '</div><div class=\"signal-bar\"><div class=\"signal-fill\" style=\"width:' + width + '%\"></div></div></div>';
            }).join('')
          : '<div class=\"signal-item\"><div class=\"signal-name\">No risk signals yet</div><div class=\"muted tiny\">Run the demo previews to populate evidence.</div></div>';
        document.getElementById('timeline').innerHTML = [
          ['Allow', 'Start with a low-risk read to show that safe work flows through quietly.'],
          ['Require approval', 'Then escalate to a risky but plausible action to show governance, not blanket blocking.'],
          ['Block', 'Finish with a conflicting action so the audience sees the hard stop before side effects happen.'],
        ].map(([title, body]) => '<div class=\"timeline-item\"><strong>' + title + '</strong><div class=\"muted tiny\">' + body + '</div></div>').join('');
        document.getElementById('approvals').innerHTML = approvals.length
          ? approvals.slice(0, 5).map((item) =>
              '<div class=\"mini-item\"><strong>' + item.action + '</strong><div class=\"muted tiny\">' + item.status + ' · ' + item.requested_by + '</div><div class=\"tiny\"><code>' + item.id + '</code></div></div>'
            ).join('')
          : '<div class=\"mini-item\"><strong>No pending approvals</strong><div class=\"muted tiny\">High-risk actions will appear here when escalation is required.</div></div>';
        document.getElementById('integrity').innerHTML = integrity && integrity.clean === false
          ? '<div class=\"mini-item\"><strong>Drift detected</strong><div class=\"muted tiny\">' + integrity.mutations.length + ' mutation(s) found in tracked artifacts.</div><div class=\"tiny\">' +
              integrity.mutations.slice(0, 3).map((mutation) => mutation.status + ': ' + mutation.path).join('<br />') +
            '</div></div>'
          : '<div class=\"mini-item\"><strong>Baseline clean</strong><div class=\"muted tiny\">No tracked artifact drift is currently changing policy behavior.</div></div>';
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
        document.getElementById('signals').innerHTML = '<div class=\"signal-item\">Unable to load signals.</div>';
        document.getElementById('heroMetrics').innerHTML = '<div class=\"hero-metric\"><div class=\"hero-metric-label\">Status</div><div class=\"hero-metric-value\">offline</div><div class=\"hero-metric-subtle\">The dashboard could not reach the telemetry endpoint.</div></div>';
        document.getElementById('approvals').innerHTML = '<div class=\"mini-item\">Approval queue unavailable.</div>';
        document.getElementById('integrity').innerHTML = '<div class=\"mini-item\">Integrity status unavailable.</div>';
      });
    </script>
  </body>
</html>`);
    },
    handleMcpTransport: async (req: Request, res: Response) => {
      const payload = mcpTransportRequestSchema.parse(req.body ?? {});

      if (payload.method === "initialize") {
        res.status(200).json(mcpResult(payload.id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: MCP_SERVER_INFO,
        }));
        return;
      }

      if (payload.method === "ping") {
        res.status(200).json(mcpResult(payload.id, {}));
        return;
      }

      if (payload.method === "tools/list") {
        res.status(200).json(mcpResult(payload.id, { tools: buildMcpTools() }));
        return;
      }

      const toolArgs = payload.params.arguments ?? {};

      if (payload.params.name === "aegis.preview_action") {
        const actionRequest = actionInterceptRequestSchema.parse(toolArgs);
        const evaluation = await deps.actions.preview(actionRequest);
        res.status(200).json(mcpResult(payload.id, {
          ...mcpToolEnvelope(
            actionSummary(actionRequest.action, evaluation.verdict, evaluation.signals),
            evaluation,
            false,
            {
              "aegis/verdict": evaluation.verdict,
              "aegis/telemetryId": evaluation.telemetry.telemetry_id,
              "aegis/vectorSha256": evaluation.telemetry.vector_sha256,
            },
          ),
        }));
        return;
      }

      if (payload.params.name === "aegis.intercept_action") {
        const actionRequest = actionInterceptRequestSchema.parse(toolArgs);
        const result = await deps.actions.intercept(actionRequest);
        const isError = result.evaluation?.verdict !== "allow";
        res
          .status(result.evaluation?.verdict === "block" ? 403 : result.queued ? 202 : 200)
          .json(mcpResult(payload.id, {
            ...mcpToolEnvelope(
              actionSummary(
                actionRequest.action,
                result.evaluation?.verdict ?? "allow",
                result.evaluation?.signals ?? [],
              ),
              result,
              isError,
              {
                "aegis/verdict": result.evaluation?.verdict ?? "allow",
                "aegis/approvalId": result.approval_id,
                "aegis/telemetryId": result.evaluation?.telemetry.telemetry_id,
                "aegis/vectorSha256": result.evaluation?.telemetry.vector_sha256,
              },
            ),
          }));
        return;
      }

      if (payload.params.name === "aegis.reviewer_attest") {
        const request = reviewerAttestationRequestSchema.parse(toolArgs);
        const result = evaluateReviewerAttestation(request);
        res.status(200).json(mcpResult(payload.id, {
          ...mcpToolEnvelope(
            `Reviewer attestation for ${request.artifact_id} is ${result.trusted ? "trusted" : "untrusted"}.`,
            result,
            !result.trusted,
            {
              "aegis/artifactId": request.artifact_id,
              "aegis/provenanceOverlap": result.provenance_overlap,
              "aegis/semanticDivergence": result.semantic_divergence,
            },
          ),
        }));
        return;
      }

      if (payload.params.name === "aegis.telemetry_lookup") {
        const telemetryId = typeof toolArgs.telemetry_id === "string" ? toolArgs.telemetry_id : undefined;
        const limit =
          typeof toolArgs.limit === "number"
            ? Math.max(1, Math.min(20, Math.floor(toolArgs.limit)))
            : 10;
        const result = telemetryId
          ? await deps.telemetry.get(telemetryId)
          : await deps.telemetry.list(limit);
        res.status(result === null ? 404 : 200).json(mcpResult(payload.id, {
          ...mcpToolEnvelope(
            telemetryId ? `Fetched telemetry record ${telemetryId}.` : `Fetched ${limit} recent telemetry summaries.`,
            result,
            result === null,
            {
              "aegis/telemetryId": telemetryId,
              "aegis/resultCount": Array.isArray(result) ? result.length : result ? 1 : 0,
            },
          ),
        }));
        return;
      }

      res.status(404).json(mcpError(payload.id, -32601, "Unknown Aegis ATV MCP tool", {
        available_tools: buildMcpTools().map((tool) => tool.name),
      }));
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

  app.post("/mcp", asyncRoute(handlers.handleMcpTransport));

  app.post("/mcp/intercept", asyncRoute(handlers.interceptMcpTool));

  app.post("/reviewer/attest", asyncRoute(handlers.attestReviewers));
}
