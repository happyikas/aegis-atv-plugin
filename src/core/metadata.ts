import fs from "node:fs/promises";
import path from "node:path";
import { transitionMetadata } from "./atmu.js";
import { normalizeAid } from "./aid.js";
import { createAtsFields } from "./ats.js";
import { memoryMetadataSchema } from "./schema.js";
import type { MemoryMetadata, MemoryState } from "./types.js";
import { metaFileName, stableMemoryId } from "./utils.js";

export class MetadataStore {
  constructor(private readonly workspaceRoot: string) {}

  get metaRoot(): string {
    return path.join(this.workspaceRoot, ".meta");
  }

  async ensureMetaRoot(): Promise<void> {
    await fs.mkdir(this.metaRoot, { recursive: true });
  }

  metaPathFor(sourcePath: string): string {
    return path.join(this.metaRoot, metaFileName(sourcePath));
  }

  createDefault(sourcePath: string): MemoryMetadata {
    const normalizedPath = sourcePath.replaceAll(path.sep, "/");
    const isPrimaryMemory = normalizedPath === "MEMORY.md";
    const defaults = createAtsFields();

    return {
      memory_id: stableMemoryId(normalizedPath),
      source_path: normalizedPath,
      aid: normalizeAid(isPrimaryMemory ? "user-main" : "planner"),
      ...defaults,
      state: isPrimaryMemory ? "committed" : "draft",
      trust_score: isPrimaryMemory ? 0.95 : 0.5,
      sensitivity: "medium",
      retention_class: "standard",
      lineage: [],
      checkpoint_refs: [],
    };
  }

  async read(sourcePath: string): Promise<MemoryMetadata | null> {
    const metaPath = this.metaPathFor(sourcePath);

    try {
      const raw = await fs.readFile(metaPath, "utf8");
      return memoryMetadataSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async write(metadata: MemoryMetadata): Promise<void> {
    await this.ensureMetaRoot();
    const metaPath = this.metaPathFor(metadata.source_path);
    await fs.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  async getOrCreate(sourcePath: string): Promise<MemoryMetadata> {
    const existing = await this.read(sourcePath);
    if (existing) {
      return existing;
    }

    const created = this.createDefault(sourcePath);
    await this.write(created);
    return created;
  }

  async transition(sourcePath: string, nextState: MemoryState, force = false): Promise<MemoryMetadata> {
    const metadata = await this.getOrCreate(sourcePath);
    const updated = transitionMetadata(metadata, nextState, force);
    await this.write(updated);
    return updated;
  }
}
