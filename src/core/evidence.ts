import type { AuditRecord, CollectedEventRecord, CollectedEventType } from "./types.js";
import { verifyWithPublicKey } from "./crypto-sign.js";
import { canonicalize, checksum, nowIso } from "./utils.js";

export interface EvidenceVerificationScope {
  session_id?: string;
  trace_id?: string;
}

export interface EvidenceVerificationReport {
  scope: EvidenceVerificationScope;
  verified_at: string;
  event_count: number;
  audit_count: number;
  audit_chain_valid: boolean;
  audit_issues: string[];
  required_event_types: Record<CollectedEventType, boolean>;
  trace_links: {
    tool_decisions: number;
    tool_results: number;
    permission_requests: number;
    decisions_without_results: string[];
    results_without_decisions: string[];
  };
  complete: boolean;
  recommendations: string[];
}

function matchesScope(record: CollectedEventRecord, scope: EvidenceVerificationScope): boolean {
  if (scope.trace_id) {
    return record.trace_id === scope.trace_id;
  }
  if (scope.session_id) {
    return record.session_id === scope.session_id;
  }
  return true;
}

function verifyAuditSignature(record: AuditRecord): boolean {
  if (record.signature_algorithm === "ed25519" && record.public_key) {
    return verifyWithPublicKey(record.public_key, record.record_hash, record.signature);
  }
  return record.signature === checksum(`${record.record_hash}:aegis-t2-signature`);
}

function validateAuditChain(records: AuditRecord[]): string[] {
  const issues: string[] = [];
  const ordered = [...records].sort((left, right) => left.sequence - right.sequence);

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const previous = ordered[index - 1];
    const expectedBase = {
      sequence: current.sequence,
      event: current.event,
      timestamp: current.timestamp,
      prev_record_hash: current.prev_record_hash,
      details: current.details,
    };
    const expectedHash = checksum(canonicalize(expectedBase));

    if (current.record_hash !== expectedHash) {
      issues.push(`record_hash_mismatch:${current.sequence}`);
    }
    if (!verifyAuditSignature(current)) {
      issues.push(`signature_mismatch:${current.sequence}`);
    }
    if (index === 0) {
      if (current.prev_record_hash) {
        issues.push(`unexpected_prev_hash:${current.sequence}`);
      }
      continue;
    }
    if (!previous || current.sequence !== previous.sequence + 1) {
      issues.push(`sequence_gap:${current.sequence}`);
    }
    if (current.prev_record_hash !== previous?.record_hash) {
      issues.push(`prev_hash_mismatch:${current.sequence}`);
    }
  }

  return issues;
}

export function verifyEvidenceChain(
  records: CollectedEventRecord[],
  auditRecords: AuditRecord[],
  scope: EvidenceVerificationScope,
): EvidenceVerificationReport {
  const scoped = records
    .filter((record) => matchesScope(record, scope))
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at));

  const requiredEventTypes: Record<CollectedEventType, boolean> = {
    session_start: scoped.some((record) => record.event_type === "session_start"),
    user_prompt: scoped.some((record) => record.event_type === "user_prompt"),
    tool_decision: scoped.some((record) => record.event_type === "tool_decision"),
    tool_result: scoped.some((record) => record.event_type === "tool_result"),
    permission_request: scoped.some((record) => record.event_type === "permission_request"),
    session_stop: scoped.some((record) => record.event_type === "session_stop"),
  };

  const scopedAuditSequences = new Set(
    scoped
      .map((record) => record.audit_sequence)
      .filter((value): value is number => typeof value === "number"),
  );
  const scopedAuditRecords = auditRecords.filter((record) => scopedAuditSequences.has(record.sequence));
  const auditIssues = validateAuditChain(scopedAuditRecords);

  const decisionTraceIds = new Set(
    scoped
      .filter((record) => record.event_type === "tool_decision")
      .map((record) => record.trace_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const resultTraceIds = new Set(
    scoped
      .filter((record) => record.event_type === "tool_result")
      .map((record) => record.trace_id)
      .filter((value): value is string => typeof value === "string"),
  );

  const decisionsWithoutResults = [...decisionTraceIds].filter((traceId) => !resultTraceIds.has(traceId));
  const resultsWithoutDecisions = [...resultTraceIds].filter((traceId) => !decisionTraceIds.has(traceId));

  const recommendations: string[] = [];
  if (!requiredEventTypes.session_start) {
    recommendations.push("Record SessionStart events before tool activity for this workflow.");
  }
  if (!requiredEventTypes.user_prompt) {
    recommendations.push("Capture at least one UserPromptSubmit event for replayable provenance.");
  }
  if (decisionsWithoutResults.length > 0) {
    recommendations.push("Some tool decisions have no matching tool result. Verify PostToolUse coverage or blocked-result recording.");
  }
  if (resultsWithoutDecisions.length > 0) {
    recommendations.push("Some tool results have no matching pre-execution decision. Verify PreToolUse or MCP proxy capture.");
  }
  if (auditIssues.length > 0) {
    recommendations.push("Audit chain verification found gaps or hash mismatches. Run forensic review before treating this evidence as complete.");
  }

  const complete =
    requiredEventTypes.session_start &&
    requiredEventTypes.user_prompt &&
    requiredEventTypes.tool_decision &&
    auditIssues.length === 0 &&
    decisionsWithoutResults.length === 0 &&
    resultsWithoutDecisions.length === 0;

  return {
    scope,
    verified_at: nowIso(),
    event_count: scoped.length,
    audit_count: scopedAuditRecords.length,
    audit_chain_valid: auditIssues.length === 0,
    audit_issues: auditIssues,
    required_event_types: requiredEventTypes,
    trace_links: {
      tool_decisions: decisionTraceIds.size,
      tool_results: resultTraceIds.size,
      permission_requests: scoped.filter((record) => record.event_type === "permission_request").length,
      decisions_without_results: decisionsWithoutResults,
      results_without_decisions: resultsWithoutDecisions,
    },
    complete,
    recommendations,
  };
}
