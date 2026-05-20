import fs from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "./types.js";
import { checksum, nowIso } from "./utils.js";

export class AuditLogger {
  private readonly filePath: string;

  constructor(dataRoot: string) {
    this.filePath = path.join(dataRoot, "audit", "audit.log");
  }

  private async readAllInternal(): Promise<AuditRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AuditRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async log(event: string, details: Record<string, unknown>): Promise<AuditRecord> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const existing = await this.readAllInternal();
    const previous = existing.at(-1);
    const baseRecord = {
      sequence: (previous?.sequence ?? 0) + 1,
      event,
      timestamp: nowIso(),
      prev_record_hash: previous?.record_hash,
      details,
    };
    const recordHash = checksum(JSON.stringify(baseRecord));
    const record: AuditRecord = {
      ...baseRecord,
      record_hash: recordHash,
      signature: checksum(`${recordHash}:aegis-t2-signature`),
    };
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async list(limit = 20, eventPrefix?: string): Promise<AuditRecord[]> {
    const records = await this.readAllInternal();
    return records
      .filter((entry) => !eventPrefix || entry.event.startsWith(eventPrefix))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit);
  }
}
