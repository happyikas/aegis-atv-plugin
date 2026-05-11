import fs from "node:fs/promises";
import path from "node:path";
import { checksum, nowIso } from "./utils.js";
import type {
  IntegrityBaselineEntry,
  IntegrityBaselineManifest,
  IntegrityCheckReport,
  IntegrityMutation,
} from "./types.js";

const DEFAULT_ARTIFACT_PATHS = [
  "README.md",
  "package.json",
  "src/adapters/mcporter-hook.ts",
  "src/core/action-firewall.ts",
  "plugins/aegis-atv/.codex-plugin/plugin.json",
  "plugins/aegis-atv/README.md",
];

function uniqueSorted(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right));
}

function classifyCategory(relativePath: string): IntegrityBaselineEntry["category"] {
  if (relativePath.endsWith(".json") && relativePath.includes(".codex-plugin")) {
    return "plugin";
  }
  if (relativePath.includes("plugins/")) {
    return "plugin";
  }
  if (relativePath.endsWith(".md")) {
    return "instruction";
  }
  if (relativePath.endsWith(".json")) {
    return "config";
  }
  return "runtime";
}

async function hashFile(absolutePath: string): Promise<string> {
  const content = await fs.readFile(absolutePath, "utf8");
  return checksum(content);
}

export class IntegrityBaselineStore {
  private readonly integrityDir: string;

  constructor(
    private readonly dataRoot: string,
    private readonly repoRoot: string = process.cwd(),
  ) {
    this.integrityDir = path.join(this.dataRoot, "integrity");
  }

  defaultArtifactPaths(): string[] {
    return DEFAULT_ARTIFACT_PATHS;
  }

  resolveArtifacts(requested?: string[]): string[] {
    return uniqueSorted((requested && requested.length > 0 ? requested : this.defaultArtifactPaths()).map((item) => item.replaceAll("\\", "/")));
  }

  async createBaseline(paths?: string[]): Promise<IntegrityBaselineManifest> {
    const artifactPaths = this.resolveArtifacts(paths);
    const entries: IntegrityBaselineEntry[] = [];

    for (const relativePath of artifactPaths) {
      const absolutePath = path.join(this.repoRoot, relativePath);
      const sha256 = await hashFile(absolutePath);
      entries.push({
        path: relativePath,
        category: classifyCategory(relativePath),
        sha256,
      });
    }

    const createdAt = nowIso();
    const baselineId = `baseline-${createdAt.replaceAll(/[:.]/g, "-")}`;
    const manifest: IntegrityBaselineManifest = {
      baseline_id: baselineId,
      created_at: createdAt,
      root: this.repoRoot,
      entries,
    };

    await fs.mkdir(this.integrityDir, { recursive: true });
    await fs.writeFile(
      path.join(this.integrityDir, `${baselineId}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(this.integrityDir, "baseline-latest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    return manifest;
  }

  async loadLatest(): Promise<IntegrityBaselineManifest | null> {
    try {
      const raw = await fs.readFile(path.join(this.integrityDir, "baseline-latest.json"), "utf8");
      return JSON.parse(raw) as IntegrityBaselineManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async check(paths?: string[]): Promise<IntegrityCheckReport | undefined> {
    const baseline = await this.loadLatest();
    if (!baseline) {
      return undefined;
    }

    const requested = this.resolveArtifacts(paths);
    const baselineEntries = baseline.entries.filter((entry) => requested.includes(entry.path));
    const mutations: IntegrityMutation[] = [];

    for (const entry of baselineEntries) {
      const absolutePath = path.join(this.repoRoot, entry.path);

      try {
        const actualSha = await hashFile(absolutePath);
        if (actualSha !== entry.sha256) {
          mutations.push({
            path: entry.path,
            category: entry.category,
            expected_sha256: entry.sha256,
            actual_sha256: actualSha,
            status: "changed",
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          mutations.push({
            path: entry.path,
            category: entry.category,
            expected_sha256: entry.sha256,
            status: "missing",
          });
          continue;
        }
        throw error;
      }
    }

    return {
      baseline_id: baseline.baseline_id,
      checked_at: nowIso(),
      clean: mutations.length === 0,
      checked_paths: baselineEntries.map((entry) => entry.path),
      mutations,
    };
  }
}
