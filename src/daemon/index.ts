import fs from "node:fs/promises";
import { createServer } from "../api/server.js";
import { buildAegisRuntime } from "../runtime/bootstrap.js";
import { startWorkspaceWatcher } from "./watcher.js";

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function main(): Promise<void> {
  const runtime = buildAegisRuntime();
  const { workspace, workspaceRoot, dataRoot, approvals, audit, checkpoints, actions, integrity, telemetry, collector, controlPlane, mcpProxy } = runtime;
  const port = Number(process.env.PORT ?? 4187);

  await ensureDir(workspaceRoot);
  await ensureDir(dataRoot);

  await workspace.scan();
  await integrity.createBaseline().catch(() => {
    // Baseline creation is best-effort so the daemon can still start during partial setup.
  });
  await mcpProxy.primeDescriptorBaseline().catch(() => {
    // Descriptor baseline is also best-effort so local startup is resilient without an upstream.
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
    collector,
    controlPlane,
    mcpProxy,
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
