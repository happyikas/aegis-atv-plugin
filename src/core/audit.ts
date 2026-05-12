import fs from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "./types.js";
import { nowIso } from "./utils.js";

export class AuditLogger {
  private readonly filePath: string;

  constructor(dataRoot: string) {
    this.filePath = path.join(dataRoot, "audit", "audit.log");
  }

  async log(event: string, details: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify({
      event,
      timestamp: nowIso(),
      details,
    });
    await fs.appendFile(this.filePath, `${line}\n`, "utf8");
  }

  async list(limit = 20, eventPrefix?: string): Promise<AuditRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AuditRecord)
        .filter((entry) => !eventPrefix || entry.event.startsWith(eventPrefix))
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
