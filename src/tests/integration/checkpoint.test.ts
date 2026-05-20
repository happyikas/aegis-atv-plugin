import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { CheckpointManager } from "../../daemon/checkpoint.js";
import { checkpointManifestSchema } from "../../core/schema.js";

const tempDirs: string[] = [];

describe("checkpoint manager", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("creates and lists checkpoints with schema-valid manifests", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(workspaceRoot, dataRoot);

    await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "MEMORY.md"), "# canonical\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# task\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(workspaceRoot);
    await workspace.scan();

    const manager = new CheckpointManager(workspace, dataRoot);
    const created = await manager.create();
    const listed = await manager.list();

    expect(checkpointManifestSchema.parse(created).checkpoint_id).toBe(created.checkpoint_id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.checkpoint_id).toBe(created.checkpoint_id);
  });

  it("restores metadata state without overwriting markdown files", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(workspaceRoot, dataRoot);

    await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# original\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(workspaceRoot);
    await workspace.scan();
    await workspace.metadata.transition("memory/task.md", "verified");

    const manager = new CheckpointManager(workspace, dataRoot);
    const checkpoint = await manager.create();

    await workspace.metadata.transition("memory/task.md", "committed");
    await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# changed\n", "utf8");

    await manager.restore(checkpoint.checkpoint_id, false, false);

    const restoredMeta = await workspace.metadata.read("memory/task.md");
    const liveFile = await fs.readFile(path.join(workspaceRoot, "memory", "task.md"), "utf8");

    expect(restoredMeta?.state).toBe("verified");
    expect(liveFile).toBe("# changed\n");
  });

  it("requires force to restore markdown files and restores them when forced", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(workspaceRoot, dataRoot);

    await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# original\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(workspaceRoot);
    await workspace.scan();

    const manager = new CheckpointManager(workspace, dataRoot);
    const checkpoint = await manager.create();

    await fs.writeFile(path.join(workspaceRoot, "memory", "task.md"), "# changed\n", "utf8");

    await expect(manager.restore(checkpoint.checkpoint_id, true, false)).rejects.toThrow(
      "File restore requires force=true",
    );

    await manager.restore(checkpoint.checkpoint_id, true, true);
    const restoredFile = await fs.readFile(path.join(workspaceRoot, "memory", "task.md"), "utf8");
    expect(restoredFile).toBe("# original\n");
  });
});
