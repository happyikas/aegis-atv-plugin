import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { recall } from "../../core/recall.js";

const tempDirs: string[] = [];

describe("recall integration", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("excludes quarantined memory from default recall and includes draft in planner mode", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-recall-"));
    tempDirs.push(workspaceRoot);

    await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "MEMORY.md"), "# canonical\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "memory", "draft.md"), "draft memory\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "memory", "reviewed.md"), "reviewed memory\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(workspaceRoot);
    await workspace.scan();
    await workspace.metadata.transition("memory/reviewed.md", "verified");
    await workspace.metadata.transition("MEMORY.md", "quarantined", true);

    const records = await workspace.scan();

    const defaultResults = recall(records, { mode: "default" });
    const plannerResults = recall(records, { mode: "planner" });

    expect(defaultResults.map((item) => item.metadata.source_path)).toEqual(["memory/reviewed.md"]);
    expect(plannerResults.map((item) => item.metadata.source_path)).toContain("memory/draft.md");
    expect(defaultResults.map((item) => item.metadata.source_path)).not.toContain("MEMORY.md");
  });
});
