import fs from "node:fs/promises";
import path from "node:path";
import type { AuditLogger } from "./audit.js";
import type { AtvLiteRecord, CollectedEventRecord, CollectedEventType } from "./types.js";
import { checksum, nowIso } from "./utils.js";

export class EventCollector {
  private readonly eventsDir: string;
  private readonly eventsPath: string;

  constructor(
    private readonly dataRoot: string,
    private readonly audit: AuditLogger,
  ) {
    this.eventsDir = path.join(this.dataRoot, "events");
    this.eventsPath = path.join(this.eventsDir, "events.jsonl");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.eventsDir, { recursive: true });
  }

  async record(
    eventType: CollectedEventType,
    data: Record<string, unknown>,
    atvLite?: AtvLiteRecord,
  ): Promise<CollectedEventRecord> {
    await this.ensureDir();

    const recordedAt = nowIso();
    const payloadHash = checksum(JSON.stringify(data));
    const auditRecord = await this.audit.log(`collector.${eventType}`, {
      payload_hash: payloadHash,
      atv_hash: atvLite?.commitment.atv_hash,
      session_id: data.session_id,
      trace_id: data.trace_id,
    });

    const record: CollectedEventRecord = {
      event_id: checksum(JSON.stringify({
        eventType,
        payloadHash,
        recordedAt,
      })).slice(0, 24),
      event_type: eventType,
      recorded_at: recordedAt,
      tenant_id: typeof data.tenant_id === "string" ? data.tenant_id : undefined,
      agent_id: typeof data.agent_id === "string" ? data.agent_id : undefined,
      session_id: typeof data.session_id === "string" ? data.session_id : undefined,
      trace_id: typeof data.trace_id === "string" ? data.trace_id : undefined,
      span_id: typeof data.span_id === "string" ? data.span_id : undefined,
      payload_hash: payloadHash,
      atv_hash: atvLite?.commitment.atv_hash,
      audit_sequence: auditRecord.sequence,
      data,
    };

    await fs.appendFile(this.eventsPath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async list(limit = 20): Promise<CollectedEventRecord[]> {
    await this.ensureDir();

    try {
      const raw = await fs.readFile(this.eventsPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as CollectedEventRecord)
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
        .slice(0, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
