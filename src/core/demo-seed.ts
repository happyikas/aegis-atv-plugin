import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";

export interface DemoSeedResult {
  workspaceRoot: string;
  createdFiles: string[];
}

export async function seedDemoWorkspace(workspaceRoot?: string): Promise<DemoSeedResult> {
  const root = workspaceRoot ?? OpenClawWorkspaceAdapter.defaultRoot(os.homedir());
  const memoryDir = path.join(root, "memory");
  await fs.mkdir(memoryDir, { recursive: true });

  const files = [
    {
      relativePath: "MEMORY.md",
      content: [
        "# OpenClaw Canonical Memory",
        "",
        "- Deployment: Mac mini local runtime",
        "- Harness: AegIsDATA-lite MVP",
        "- Status: committed baseline memory",
        "",
      ].join("\n"),
    },
    {
      relativePath: path.join("memory", "task-001.md"),
      content: [
        "# Task 001",
        "",
        "- Goal: Validate sidecar metadata generation",
        "- Owner: aid:planner",
        "- State: draft candidate memory",
        "",
      ].join("\n"),
    },
    {
      relativePath: "DREAMS.md",
      content: [
        "# DREAMS",
        "",
        "- Future: wrap MCP action paths with approval hooks",
        "- Future: add launchd plist and recovery CLI",
        "",
      ].join("\n"),
    },
  ];

  await Promise.all(
    files.map(async (file) => {
      await fs.mkdir(path.dirname(path.join(root, file.relativePath)), { recursive: true });
      await fs.writeFile(path.join(root, file.relativePath), file.content, "utf8");
    }),
  );

  return {
    workspaceRoot: root,
    createdFiles: files.map((file) => file.relativePath.replaceAll(path.sep, "/")),
  };
}
