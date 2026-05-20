import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IntegrityBaselineStore } from "../../core/integrity.js";

const tempDirs: string[] = [];

async function makeRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-integrity-repo-"));
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-integrity-data-"));
  tempDirs.push(repoRoot, dataRoot);
  await fs.mkdir(path.join(repoRoot, "plugins", "aegis-atv", ".codex-plugin"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "deployment", "codex"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".agents", "plugins"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "README.md"), "# readme\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "AGENTS.md"), "# agents\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "package.json"), '{"name":"demo"}\n', "utf8");
  await fs.writeFile(path.join(repoRoot, "deployment", "codex", "hooks.json"), '{"hooks":{}}\n', "utf8");
  await fs.writeFile(path.join(repoRoot, "deployment", "codex", "managed-config.toml"), 'approval_policy="assisted"\n', "utf8");
  await fs.writeFile(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), '{"plugins":[]}\n', "utf8");
  await fs.writeFile(
    path.join(repoRoot, "plugins", "aegis-atv", ".codex-plugin", "plugin.json"),
    '{"name":"aegis-atv"}\n',
    "utf8",
  );
  await fs.writeFile(path.join(repoRoot, "plugins", "aegis-atv", "README.md"), "# plugin\n", "utf8");
  await fs.mkdir(path.join(repoRoot, "src", "adapters"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "src", "core"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "src", "adapters", "mcporter-hook.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "adapters", "mcp-proxy.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "core", "action-firewall.ts"), "export {};\n", "utf8");
  return { repoRoot, dataRoot };
}

describe("IntegrityBaselineStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("creates a baseline and detects file mutations", async () => {
    const { repoRoot, dataRoot } = await makeRepo();
    const store = new IntegrityBaselineStore(dataRoot, repoRoot);

    const baseline = await store.createBaseline();
    expect(baseline.entries.length).toBeGreaterThan(0);

    await fs.writeFile(path.join(repoRoot, "README.md"), "# changed\n", "utf8");

    const report = await store.check();
    expect(report?.clean).toBe(false);
    expect(report?.mutations.some((mutation) => mutation.path === "README.md")).toBe(true);
  });

  it("rejects artifact paths that escape the repository", async () => {
    const { repoRoot, dataRoot } = await makeRepo();
    const store = new IntegrityBaselineStore(dataRoot, repoRoot);

    await expect(store.createBaseline(["../secrets.txt"])).rejects.toThrow(
      /Artifact path must stay within the repository/,
    );
    await expect(store.createBaseline(["/tmp/secrets.txt"])).rejects.toThrow(
      /Artifact path must stay within the repository/,
    );
  });
});
