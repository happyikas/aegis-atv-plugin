import fs from "node:fs/promises";
import path from "node:path";
import { checkpointManifestSchema } from "../core/schema.js";
import { checksum, nowIso } from "../core/utils.js";
import type { CheckpointManifest, MemoryRecord } from "../core/types.js";
import { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";

export class CheckpointManager {
  constructor(
    private readonly workspace: OpenClawWorkspaceAdapter,
    private readonly dataRoot: string,
  ) {}

  private get snapshotRoot(): string {
    return path.join(this.dataRoot, "snapshots");
  }

  async list(): Promise<CheckpointManifest[]> {
    try {
      const ids = await fs.readdir(this.snapshotRoot);
      const manifests = await Promise.all(
        ids.map(async (id) => {
          const raw = await fs.readFile(path.join(this.snapshotRoot, id, "manifest.json"), "utf8");
          return checkpointManifestSchema.parse(JSON.parse(raw));
        }),
      );

      return manifests.sort((left, right) => right.created_at.localeCompare(left.created_at));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async create(records?: MemoryRecord[]): Promise<CheckpointManifest> {
    const snapshotRecords = records ?? (await this.workspace.scan());
    const checkpointId = `ckpt-${Date.now()}`;
    const checkpointDir = path.join(this.snapshotRoot, checkpointId);
    await fs.mkdir(checkpointDir, { recursive: true });

    const memoryFiles = await Promise.all(
      snapshotRecords.map(async (record) => {
        const sourcePath = path.join(this.workspace.root, record.metadata.source_path);
        const metadataPath = this.workspace.metadata.metaPathFor(record.metadata.source_path);
        const sourceCopyPath = path.join(checkpointDir, "files", record.metadata.source_path);
        const metadataCopyPath = path.join(checkpointDir, "meta", path.basename(metadataPath));

        await fs.mkdir(path.dirname(sourceCopyPath), { recursive: true });
        await fs.mkdir(path.dirname(metadataCopyPath), { recursive: true });
        await fs.copyFile(sourcePath, sourceCopyPath);
        await fs.copyFile(metadataPath, metadataCopyPath);

        return {
          source_path: record.metadata.source_path,
          checksum: checksum(record.content),
          metadata_path: record.metadata.source_path,
          copied: true,
        };
      }),
    );

    const manifest: CheckpointManifest = {
      checkpoint_id: checkpointId,
      created_at: nowIso(),
      workspace_root: this.workspace.root,
      memory_files: memoryFiles,
    };

    await fs.writeFile(
      path.join(checkpointDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    return checkpointManifestSchema.parse(manifest);
  }

  async restore(checkpointId: string, restoreFiles: boolean, force: boolean): Promise<CheckpointManifest> {
    const checkpointDir = path.join(this.snapshotRoot, checkpointId);
    const raw = await fs.readFile(path.join(checkpointDir, "manifest.json"), "utf8");
    const manifest = checkpointManifestSchema.parse(JSON.parse(raw));

    await Promise.all(
      manifest.memory_files.map(async (file) => {
        const savedMetaPath = path.join(
          checkpointDir,
          "meta",
          path.basename(this.workspace.metadata.metaPathFor(file.source_path)),
        );
        const liveMetaPath = this.workspace.metadata.metaPathFor(file.source_path);
        await fs.mkdir(path.dirname(liveMetaPath), { recursive: true });
        await fs.copyFile(savedMetaPath, liveMetaPath);

        if (restoreFiles) {
          if (!force) {
            throw new Error("File restore requires force=true because it overwrites live files");
          }

          const savedSourcePath = path.join(checkpointDir, "files", file.source_path);
          const liveSourcePath = path.join(this.workspace.root, file.source_path);
          await fs.mkdir(path.dirname(liveSourcePath), { recursive: true });
          await fs.copyFile(savedSourcePath, liveSourcePath);
        }
      }),
    );

    return manifest;
  }
}
