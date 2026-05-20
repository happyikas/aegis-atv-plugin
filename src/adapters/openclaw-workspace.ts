import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MetadataStore } from "../core/metadata.js";
import { touchAtsFields } from "../core/ats.js";
import type { MemoryRecord } from "../core/types.js";

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".meta") {
          return [];
        }

        return walk(fullPath);
      }

      return [fullPath];
    }),
  );

  return files.flat();
}

export function isTrackedMemoryPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll(path.sep, "/");
  return (
    normalized === "MEMORY.md" ||
    normalized === "DREAMS.md" ||
    /^memory\/[^/]+\.md$/.test(normalized)
  );
}

export class OpenClawWorkspaceAdapter {
  readonly metadata: MetadataStore;

  constructor(public readonly root: string) {
    this.metadata = new MetadataStore(root);
  }

  static defaultRoot(homeDirectory = os.homedir()): string {
    return path.join(homeDirectory, ".openclaw", "workspace");
  }

  static fromEnvironment(
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory = os.homedir(),
  ): OpenClawWorkspaceAdapter {
    const root = env.OPENCLAW_WORKSPACE ?? OpenClawWorkspaceAdapter.defaultRoot(homeDirectory);
    return new OpenClawWorkspaceAdapter(root);
  }

  async memoryFiles(): Promise<string[]> {
    const files = await walk(this.root);

    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => path.relative(this.root, file))
      .filter((relativePath) => isTrackedMemoryPath(relativePath));
  }

  async scan(): Promise<MemoryRecord[]> {
    const memoryFiles = await this.memoryFiles();
    const records = await Promise.all(
      memoryFiles.map(async (relativePath) => {
        const content = await fs.readFile(path.join(this.root, relativePath), "utf8");
        const metadata = touchAtsFields(await this.metadata.getOrCreate(relativePath));
        await this.metadata.write(metadata);

        return {
          metadata,
          content,
        };
      }),
    );

    return records;
  }

  async readRecord(sourcePath: string): Promise<MemoryRecord> {
    const content = await fs.readFile(path.join(this.root, sourcePath), "utf8");
    const metadata = touchAtsFields(await this.metadata.getOrCreate(sourcePath));
    await this.metadata.write(metadata);

    return {
      metadata,
      content,
    };
  }
}
