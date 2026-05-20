import express from "express";
import { ZodError } from "zod";
import { registerRoutes } from "./routes.js";
import type { OpenClawActionHarness } from "../adapters/mcporter-hook.js";
import type { ApprovalQueue } from "../core/approval-queue.js";
import type { AtmuLedger } from "../core/atmu-ledger.js";
import type { BurnInProfiler } from "../core/burnin.js";
import type { ContextMemoryStore } from "../core/context-memory.js";
import type { AuditLogger } from "../core/audit.js";
import type { DualCheckStore } from "../core/dual-check.js";
import type { CheckpointManager } from "../daemon/checkpoint.js";
import type { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";
import type { IntegrityBaselineStore } from "../core/integrity.js";
import type { TelemetryStore } from "../core/telemetry-store.js";
import type { EventCollector } from "../core/event-collector.js";
import type { AegisControlPlane } from "../core/control-plane.js";
import type { AegisMcpProxy } from "../adapters/mcp-proxy.js";

interface ServerDeps {
  workspace: OpenClawWorkspaceAdapter;
  approvals: ApprovalQueue;
  audit: AuditLogger;
  checkpoints: CheckpointManager;
  actions: OpenClawActionHarness;
  integrity: IntegrityBaselineStore;
  telemetry: TelemetryStore;
  collector: EventCollector;
  atmu: AtmuLedger;
  dualCheck: DualCheckStore;
  burnin: BurnInProfiler;
  contextMemory: ContextMemoryStore;
  controlPlane: AegisControlPlane;
  mcpProxy: AegisMcpProxy;
}

export function handleApiError(error: unknown, res: express.Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: "bad_request",
        message: "Invalid request payload",
        details: error.issues,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const status =
    message.includes("not found") ? 404 : message.includes("Invalid state transition") ? 409 : 500;

  res.status(status).json({
    ok: false,
    error: {
      code: status === 404 ? "not_found" : status === 409 ? "conflict" : "internal_error",
      message,
    },
  });
}

export function createServer(deps: ServerDeps) {
  const app = express();
  app.use(express.json());
  registerRoutes(app, deps);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    handleApiError(error, res);
  });
  return app;
}
