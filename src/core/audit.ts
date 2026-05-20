import fs from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "./types.js";
import { Ed25519KeyStore } from "./crypto-sign.js";
import { canonicalize, checksum, nowIso } from "./utils.js";

export class AuditLogger {
  private readonly filePath: string;
  private readonly keyStore: Ed25519KeyStore;

  constructor(dataRoot: string) {
    this.filePath = path.join(dataRoot, "audit", "audit.log");
    this.keyStore = new Ed25519KeyStore(dataRoot, "audit");
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
    const recordHash = checksum(canonicalize(baseRecord));
    const signatureBundle = await this.keyStore.sign(recordHash);
    const record: AuditRecord = {
      ...baseRecord,
      record_hash: recordHash,
      signature: signatureBundle.signature,
      signature_algorithm: signatureBundle.signature_algorithm,
      signer_key_id: signatureBundle.signer_key_id,
      public_key: signatureBundle.public_key,
    };
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async listAll(): Promise<AuditRecord[]> {
    return this.readAllInternal();
  }

  async list(limit = 20, eventPrefix?: string): Promise<AuditRecord[]> {
    const records = await this.readAllInternal();
    return records
      .filter((entry) => !eventPrefix || entry.event.startsWith(eventPrefix))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit);
  }
}
