import type { Express, NextFunction, Request, Response } from "express";
import {
  actionInterceptRequestSchema,
  approvalRequestSchema,
  integrityArtifactRequestSchema,
  recallRequestSchema,
  restoreByParamRequestSchema,
  restoreRequestSchema,
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

interface RouteDeps {
  workspace: OpenClawWorkspaceAdapter;
  approvals: ApprovalQueue;
  audit: AuditLogger;
  checkpoints: CheckpointManager;
  actions: OpenClawActionHarness;
  integrity: IntegrityBaselineStore;
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
}
