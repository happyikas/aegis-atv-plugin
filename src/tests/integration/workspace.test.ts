import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { memoryMetadataSchema } from "../../core/schema.js";

const tempDirs: string[] = [];

describe("workspace adapter", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("scans markdown files and creates sidecar metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    tempDirs.push(root);

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "MEMORY.md"), "# canonical\n", "utf8");
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task\n", "utf8");

    const adapter = new OpenClawWorkspaceAdapter(root);
    const records = await adapter.scan();

    expect(records).toHaveLength(2);
    const metaFiles = await fs.readdir(path.join(root, ".meta"));
    expect(metaFiles.length).toBe(2);
  });

  it("discovers only tracked files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    tempDirs.push(root);

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.mkdir(path.join(root, "notes"), { recursive: true });
    await fs.writeFile(path.join(root, "MEMORY.md"), "# canonical\n", "utf8");
    await fs.writeFile(path.join(root, "DREAMS.md"), "# dreams\n", "utf8");
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task\n", "utf8");
    await fs.writeFile(path.join(root, "memory", "nested.txt"), "skip\n", "utf8");
    await fs.writeFile(path.join(root, "notes", "other.md"), "# ignore\n", "utf8");

    const adapter = new OpenClawWorkspaceAdapter(root);
    const files = await adapter.memoryFiles();

    expect(files.sort()).toEqual(["DREAMS.md", "MEMORY.md", "memory/task.md"]);
  });

  it("creates schema-valid metadata with deterministic defaults", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    tempDirs.push(root);

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "MEMORY.md"), "# canonical\n", "utf8");
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task\n", "utf8");

    const adapter = new OpenClawWorkspaceAdapter(root);
    await adapter.scan();

    const metaRoot = path.join(root, ".meta");
    const primaryMetaFile = (await fs.readdir(metaRoot)).find((name) => name.includes("MEMORY.md")) ?? "";
    const taskMetaFile = (await fs.readdir(metaRoot)).find((name) => name.includes("memory__task.md")) ?? "";

    const primaryMeta = memoryMetadataSchema.parse(
      JSON.parse(await fs.readFile(path.join(metaRoot, primaryMetaFile), "utf8")),
    );
    const taskMeta = memoryMetadataSchema.parse(
      JSON.parse(await fs.readFile(path.join(metaRoot, taskMetaFile), "utf8")),
    );

    expect(primaryMeta.state).toBe("committed");
    expect(primaryMeta.trust_score).toBe(0.95);
    expect(taskMeta.state).toBe("draft");
    expect(taskMeta.source_path).toBe("memory/task.md");
  });
});
