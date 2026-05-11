import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "../api/server.js";
import { OpenClawActionHarness, type ActionExecutor } from "../adapters/mcporter-hook.js";
import { createConfiguredOpenClawBridge, executeViaOpenClawBridge } from "../adapters/openclaw-bridge.js";
import { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";
import { ApprovalQueue } from "../core/approval-queue.js";
import { ActionFirewall } from "../core/action-firewall.js";
import { IntegrityBaselineStore } from "../core/integrity.js";
import { TelemetryStore } from "../core/telemetry-store.js";
import { AuditLogger } from "./audit.js";
import { CheckpointManager } from "./checkpoint.js";
import { startWorkspaceWatcher } from "./watcher.js";

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

const bridge = createConfiguredOpenClawBridge();

const demoExecutor: ActionExecutor = async (request) => executeViaOpenClawBridge(bridge, request);

async function main(): Promise<void> {
  const workspace = OpenClawWorkspaceAdapter.fromEnvironment();
  const workspaceRoot = workspace.root;
  const dataRoot = process.env.AEGIS_DATA_DIR ?? path.join(process.cwd(), "data");
  const port = Number(process.env.PORT ?? 4187);

  await ensureDir(workspaceRoot);
  await ensureDir(dataRoot);

  const approvals = new ApprovalQueue(dataRoot);
  const audit = new AuditLogger(dataRoot);
  const checkpoints = new CheckpointManager(workspace, dataRoot);
  const integrity = new IntegrityBaselineStore(dataRoot, process.cwd());
  const telemetry = new TelemetryStore(dataRoot);
  const firewall = new ActionFirewall(integrity);
  const actions = new OpenClawActionHarness(approvals, audit, demoExecutor, firewall, telemetry);

  await workspace.scan();
  await integrity.createBaseline().catch(() => {
    // Baseline creation is best-effort so the daemon can still start during partial setup.
  });
  startWorkspaceWatcher(workspace, audit);

  const app = createServer({
    workspace,
    approvals,
    audit,
    checkpoints,
    actions,
    integrity,
    telemetry,
  });

  app.listen(port, () => {
    console.log(`AegIsDATA-lite listening on http://localhost:${port}`);
    console.log(`Workspace: ${workspaceRoot}`);
    console.log(`Data root: ${dataRoot}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
