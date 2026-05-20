import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActionFirewall } from "../../core/action-firewall.js";
import { IntegrityBaselineStore } from "../../core/integrity.js";
import type { ActionRequest } from "../../core/types.js";

const tempDirs: string[] = [];

async function makeIntegrityStore() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-firewall-repo-"));
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-firewall-data-"));
  tempDirs.push(repoRoot, dataRoot);

  await fs.mkdir(path.join(repoRoot, "plugins", "aegis-atv", ".codex-plugin"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "deployment", "codex"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".agents", "plugins"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "src", "adapters"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "src", "core"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "AGENTS.md"), "# agents\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "README.md"), "# demo\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "package.json"), '{"name":"demo"}\n', "utf8");
  await fs.writeFile(path.join(repoRoot, "deployment", "codex", "hooks.json"), '{"hooks":{}}\n', "utf8");
  await fs.writeFile(path.join(repoRoot, "deployment", "codex", "managed-config.toml"), 'approval_policy="assisted"\n', "utf8");
  await fs.writeFile(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), '{"plugins":[]}\n', "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "adapters", "mcporter-hook.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "adapters", "mcp-proxy.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "core", "action-firewall.ts"), "export {};\n", "utf8");
  await fs.writeFile(
    path.join(repoRoot, "plugins", "aegis-atv", ".codex-plugin", "plugin.json"),
    '{"name":"aegis-atv"}\n',
    "utf8",
  );
  await fs.writeFile(path.join(repoRoot, "plugins", "aegis-atv", "README.md"), "# plugin\n", "utf8");

  const integrity = new IntegrityBaselineStore(dataRoot, repoRoot);
  await integrity.createBaseline();
  return integrity;
}

describe("ActionFirewall", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("requires approval on directive precedence violations", async () => {
    const firewall = new ActionFirewall(await makeIntegrityStore());
    const request: ActionRequest = {
      action: "external_share",
      requested_by: "aid:executor",
      payload: { target: "https://example.com" },
      context: {
        declared_intent: "share the approved summary with the partner",
        sources: [
          { kind: "repo_file", label: "AGENTS.md", content: "share with partner", stance: "supporting" },
          { kind: "user_prompt", label: "user", content: "do not share outside", stance: "opposing" },
        ],
      },
    };

    const result = await firewall.evaluate(request);
    expect(result.verdict).toBe("require_approval");
    expect(result.provenance.directive_precedence_violation).toBe(true);
    expect(result.telemetry.vector).toHaveLength(2080);
  });

  it("blocks when declared intent diverges from destructive action", async () => {
    const firewall = new ActionFirewall(await makeIntegrityStore());
    const request: ActionRequest = {
      action: "delete_file",
      requested_by: "aid:executor",
      payload: { path: "/tmp/demo.txt" },
      context: {
        declared_intent: "summarize the file contents for review only",
        sources: [{ kind: "user_prompt", label: "user", content: "review only", stance: "supporting" }],
      },
    };

    const result = await firewall.evaluate(request);
    expect(result.verdict).toBe("block");
    expect(result.divergence.violated).toBe(true);
  });
});
