import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";
import { AuditLogger } from "../../daemon/audit.js";
import { handleWorkspaceFileEvent } from "../../daemon/watcher.js";

const tempDirs: string[] = [];

describe("workspace watcher handlers", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("creates metadata and audit records for newly added tracked files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-watch-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(root, dataRoot);

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(root);
    const audit = new AuditLogger(dataRoot);

    await handleWorkspaceFileEvent(workspace, audit, "add", path.join(root, "memory", "task.md"));

    const metaFiles = await fs.readdir(path.join(root, ".meta"));
    expect(metaFiles.some((file) => file.includes("memory__task.md"))).toBe(true);

    const auditLog = await fs.readFile(path.join(dataRoot, "audit", "audit.log"), "utf8");
    expect(auditLog).toContain("workspace.file_added");
    expect(auditLog).toContain("memory/task.md");
  });

  it("updates last_accessed_at and appends audit entries on tracked file changes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-watch-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(root, dataRoot);

    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(root);
    await workspace.scan();
    const before = await workspace.metadata.read("memory/task.md");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await fs.writeFile(path.join(root, "memory", "task.md"), "# task updated\n", "utf8");

    const audit = new AuditLogger(dataRoot);
    await handleWorkspaceFileEvent(workspace, audit, "change", path.join(root, "memory", "task.md"));

    const after = await workspace.metadata.read("memory/task.md");
    expect(after).not.toBeNull();
    expect(Date.parse(after!.last_accessed_at)).toBeGreaterThan(Date.parse(before!.last_accessed_at));

    const auditLog = await fs.readFile(path.join(dataRoot, "audit", "audit.log"), "utf8");
    expect(auditLog).toContain("workspace.file_changed");
  });

  it("ignores untracked markdown files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-watch-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-data-"));
    tempDirs.push(root, dataRoot);

    await fs.mkdir(path.join(root, "notes"), { recursive: true });
    await fs.writeFile(path.join(root, "notes", "ignore.md"), "# ignore\n", "utf8");

    const workspace = new OpenClawWorkspaceAdapter(root);
    const audit = new AuditLogger(dataRoot);

    await handleWorkspaceFileEvent(workspace, audit, "add", path.join(root, "notes", "ignore.md"));

    await expect(fs.readdir(path.join(root, ".meta"))).rejects.toThrow();
    await expect(fs.readFile(path.join(dataRoot, "audit", "audit.log"), "utf8")).rejects.toThrow();
  });
});
