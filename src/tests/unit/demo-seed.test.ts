import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedDemoWorkspace } from "../../core/demo-seed.js";

const tempDirs: string[] = [];

describe("demo seed script", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("creates a runnable sample workspace layout", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-demo-"));
    tempDirs.push(workspaceRoot);

    const result = await seedDemoWorkspace(workspaceRoot);

    expect(result.workspaceRoot).toBe(workspaceRoot);
    expect(result.createdFiles).toEqual(["MEMORY.md", "memory/task-001.md", "DREAMS.md"]);
    await expect(fs.readFile(path.join(workspaceRoot, "MEMORY.md"), "utf8")).resolves.toContain(
      "OpenClaw Canonical Memory",
    );
    await expect(fs.readFile(path.join(workspaceRoot, "memory", "task-001.md"), "utf8")).resolves.toContain(
      "Validate sidecar metadata generation",
    );
  });
});
