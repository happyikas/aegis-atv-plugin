import fs from "node:fs/promises";
import path from "node:path";
import { checksum, nowIso } from "./utils.js";

interface McpDescriptorBaseline {
  server_id: string;
  descriptor_hash: string;
  tool_count: number;
  created_at: string;
  tools: unknown[];
}

export interface McpDescriptorCheck {
  server_id: string;
  clean: boolean;
  baseline_missing: boolean;
  descriptor_hash: string;
  baseline_hash?: string;
  tool_count: number;
  checked_at: string;
}

function canonicalHash(tools: unknown[]): string {
  return checksum(JSON.stringify(tools));
}

export class McpDescriptorStore {
  private readonly descriptorDir: string;

  constructor(private readonly dataRoot: string) {
    this.descriptorDir = path.join(this.dataRoot, "integrity", "mcp-descriptors");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.descriptorDir, { recursive: true });
  }

  private filePath(serverId: string): string {
    const safe = serverId.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.descriptorDir, `${safe}.json`);
  }

  private async load(serverId: string): Promise<McpDescriptorBaseline | null> {
    try {
      const raw = await fs.readFile(this.filePath(serverId), "utf8");
      return JSON.parse(raw) as McpDescriptorBaseline;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async ensureBaseline(serverId: string, tools: unknown[]): Promise<McpDescriptorCheck> {
    await this.ensureDir();
    const currentHash = canonicalHash(tools);
    const baseline = await this.load(serverId);

    if (!baseline) {
      const created: McpDescriptorBaseline = {
        server_id: serverId,
        descriptor_hash: currentHash,
        tool_count: tools.length,
        created_at: nowIso(),
        tools,
      };
      await fs.writeFile(this.filePath(serverId), `${JSON.stringify(created, null, 2)}\n`, "utf8");
      return {
        server_id: serverId,
        clean: true,
        baseline_missing: true,
        descriptor_hash: currentHash,
        baseline_hash: currentHash,
        tool_count: tools.length,
        checked_at: nowIso(),
      };
    }

    return {
      server_id: serverId,
      clean: baseline.descriptor_hash === currentHash,
      baseline_missing: false,
      descriptor_hash: currentHash,
      baseline_hash: baseline.descriptor_hash,
      tool_count: tools.length,
      checked_at: nowIso(),
    };
  }
}
