import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { isTrackedMemoryPath, OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";
import { AuditLogger } from "./audit.js";

function relativeTrackedPath(workspaceRoot: string, filePath: string): string | null {
  const relativePath = path.relative(workspaceRoot, filePath);
  return isTrackedMemoryPath(relativePath) ? relativePath : null;
}

export async function handleWorkspaceFileEvent(
  workspace: OpenClawWorkspaceAdapter,
  audit: AuditLogger,
  event: "add" | "change" | "unlink",
  filePath: string,
): Promise<void> {
  const trackedPath = relativeTrackedPath(workspace.root, filePath);
  if (!trackedPath) {
    return;
  }

  if (event === "unlink") {
    await audit.log("workspace.file_deleted", { file_path: trackedPath });
    return;
  }

  await workspace.readRecord(trackedPath);
  const auditEvent = event === "add" ? "workspace.file_added" : "workspace.file_changed";
  await audit.log(auditEvent, { file_path: trackedPath });
}

export function startWorkspaceWatcher(
  workspace: OpenClawWorkspaceAdapter,
  audit: AuditLogger,
): FSWatcher {
  const watcher = chokidar.watch(
    [
      path.join(workspace.root, "MEMORY.md"),
      path.join(workspace.root, "DREAMS.md"),
      path.join(workspace.root, "memory"),
    ],
    {
      ignored: [/^\./, /(^|[/\\])\../, /\/\.meta\//],
      depth: 1,
      ignoreInitial: true,
    },
  );

  watcher.on("error", (error) => {
    void audit.log("workspace.watch_error", {
      message: error instanceof Error ? error.message : String(error),
    });
  });

  watcher.on("add", async (filePath) => {
    await handleWorkspaceFileEvent(workspace, audit, "add", filePath);
  });

  watcher.on("change", async (filePath) => {
    await handleWorkspaceFileEvent(workspace, audit, "change", filePath);
  });

  watcher.on("unlink", async (filePath) => {
    await handleWorkspaceFileEvent(workspace, audit, "unlink", filePath);
  });

  return watcher;
}
