import { describe, expect, it } from "vitest";
import { verifyEvidenceChain } from "../../core/evidence.js";
import type { AuditRecord, CollectedEventRecord } from "../../core/types.js";
import { canonicalize, checksum } from "../../core/utils.js";

function makeAudit(sequence: number, event: string, prev_record_hash: string | undefined, details: Record<string, unknown>): AuditRecord {
  const base = {
    sequence,
    event,
    timestamp: `2026-05-20T00:00:0${sequence}Z`,
    prev_record_hash,
    details,
  };
  const record_hash = checksum(canonicalize(base));
  return {
    ...base,
    record_hash,
    signature: checksum(`${record_hash}:aegis-t2-signature`),
  };
}

describe("verifyEvidenceChain", () => {
  it("marks a complete session as complete when event links are present", () => {
    const audit1 = makeAudit(1, "collector.session_start", undefined, { session_id: "sess-1" });
    const audit2 = makeAudit(2, "collector.user_prompt", audit1.record_hash, { session_id: "sess-1" });
    const audit3 = makeAudit(3, "collector.tool_decision", audit2.record_hash, { session_id: "sess-1", trace_id: "trace-1" });
    const audit4 = makeAudit(4, "collector.tool_result", audit3.record_hash, { session_id: "sess-1", trace_id: "trace-1" });
    const audit5 = makeAudit(5, "collector.session_stop", audit4.record_hash, { session_id: "sess-1" });
    const audits: AuditRecord[] = [audit1, audit2, audit3, audit4, audit5];
    const events: CollectedEventRecord[] = [
      { event_id: "evt-1", event_type: "session_start", recorded_at: "2026-05-20T00:00:01Z", session_id: "sess-1", payload_hash: "p1", audit_sequence: 1, data: { session_id: "sess-1" } },
      { event_id: "evt-2", event_type: "user_prompt", recorded_at: "2026-05-20T00:00:02Z", session_id: "sess-1", payload_hash: "p2", audit_sequence: 2, data: { session_id: "sess-1" } },
      { event_id: "evt-3", event_type: "tool_decision", recorded_at: "2026-05-20T00:00:03Z", session_id: "sess-1", trace_id: "trace-1", payload_hash: "p3", audit_sequence: 3, data: { session_id: "sess-1", trace_id: "trace-1" } },
      { event_id: "evt-4", event_type: "tool_result", recorded_at: "2026-05-20T00:00:04Z", session_id: "sess-1", trace_id: "trace-1", payload_hash: "p4", audit_sequence: 4, data: { session_id: "sess-1", trace_id: "trace-1" } },
      { event_id: "evt-5", event_type: "session_stop", recorded_at: "2026-05-20T00:00:05Z", session_id: "sess-1", payload_hash: "p5", audit_sequence: 5, data: { session_id: "sess-1" } },
    ];

    const report = verifyEvidenceChain(events, audits, { session_id: "sess-1" });
    expect(report.complete).toBe(true);
    expect(report.audit_chain_valid).toBe(true);
    expect(report.trace_links.decisions_without_results).toHaveLength(0);
  });

  it("detects missing tool results", () => {
    const report = verifyEvidenceChain([
      { event_id: "evt-1", event_type: "session_start", recorded_at: "2026-05-20T00:00:01Z", session_id: "sess-1", payload_hash: "p1", audit_sequence: 1, data: { session_id: "sess-1" } },
      { event_id: "evt-2", event_type: "user_prompt", recorded_at: "2026-05-20T00:00:02Z", session_id: "sess-1", payload_hash: "p2", audit_sequence: 2, data: { session_id: "sess-1" } },
      { event_id: "evt-3", event_type: "tool_decision", recorded_at: "2026-05-20T00:00:03Z", session_id: "sess-1", trace_id: "trace-missing", payload_hash: "p3", audit_sequence: 3, data: { session_id: "sess-1", trace_id: "trace-missing" } },
    ], [], { session_id: "sess-1" });

    expect(report.complete).toBe(false);
    expect(report.trace_links.decisions_without_results).toContain("trace-missing");
  });
});
