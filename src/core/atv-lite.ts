import { checksum, nowIso } from "./utils.js";
import type {
  ActionEvaluation,
  ActionRequest,
  AtvLiteRecord,
  AuditRecord,
  ToolResultEventRequest,
} from "./types.js";

function normalizedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

export function buildAtvLiteRecord(
  request: ActionRequest & {
    tenant_id?: string;
    agent_id?: string;
    session_id?: string;
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
    codex_surface?: string;
    workspace?: string;
    repo?: string;
    model?: string;
    sandbox_mode?: string;
    approval_policy?: string;
  },
  evaluation: ActionEvaluation,
  auditRecord?: AuditRecord,
): AtvLiteRecord {
  const payload = normalizedPayload(request.payload);
  const generatedAt = nowIso();
  const atvWithoutCommitment = {
    schema_version: "ATV-Lite-v1" as const,
    tenant_id: request.tenant_id ?? "local-tenant",
    agent_id: request.agent_id ?? request.requested_by,
    session_id: request.context?.session_id ?? "session-local",
    trace_id: request.trace_id ?? checksum(JSON.stringify({
      action: request.action,
      requested_by: request.requested_by,
      generated_at: generatedAt,
    })).slice(0, 16),
    span_id: request.span_id ?? checksum(JSON.stringify(payload)).slice(0, 16),
    parent_span_id: request.parent_span_id,
    codex_surface: request.codex_surface ?? "codex-cli",
    workspace: request.workspace,
    repo: request.repo,
    model: request.model,
    sandbox_mode: request.sandbox_mode,
    approval_policy: request.approval_policy,
    declared_intent: request.context?.declared_intent,
    declared_intent_hash: request.context?.declared_intent
      ? checksum(request.context.declared_intent)
      : undefined,
    action: {
      action_type: request.action,
      tool_handle: request.action === "mcp_tool"
        ? String((request.payload as { tool_name?: string }).tool_name ?? "mcp_tool")
        : request.action,
      payload_hash: checksum(JSON.stringify(payload)),
      normalized_payload: payload,
      blast_radius: evaluation.blast_radius,
    },
    provenance: {
      source_count: evaluation.provenance.sources.length,
      highest_trust_supporting: evaluation.provenance.highest_trust_supporting,
      highest_trust_opposing: evaluation.provenance.highest_trust_opposing,
      directive_precedence_violation: evaluation.provenance.directive_precedence_violation,
      escalated_by_lower_trust: evaluation.provenance.escalated_by_lower_trust,
      risk_flags: evaluation.provenance.risk_flags,
    },
    verification: {
      verdict: evaluation.verdict,
      signals: evaluation.signals,
      divergence_score: evaluation.divergence.score,
      divergence_violated: evaluation.divergence.violated,
      integrity_clean: evaluation.integrity?.clean,
    },
    cost: {
      input_tokens: request.context?.cost?.input_tokens,
      output_tokens: request.context?.cost?.output_tokens,
      reasoning_tokens: request.context?.cost?.reasoning_tokens,
      estimated_usd: request.context?.cost?.estimated_usd,
    },
    generated_at: generatedAt,
  };

  const atvHash = checksum(JSON.stringify(atvWithoutCommitment));

  return {
    ...atvWithoutCommitment,
    commitment: {
      atv_hash: atvHash,
      sequence: auditRecord?.sequence,
      audit_record_hash: auditRecord?.record_hash,
      signature: auditRecord?.signature,
    },
  };
}

export function buildAtvLiteResultRecord(
  request: ToolResultEventRequest,
  auditRecord?: AuditRecord,
): AtvLiteRecord {
  const generatedAt = nowIso();
  const outputHash = request.output_hash ?? (request.output ? checksum(request.output) : undefined);
  const atvWithoutCommitment = {
    schema_version: "ATV-Lite-v1" as const,
    tenant_id: request.tenant_id ?? "local-tenant",
    agent_id: request.agent_id,
    session_id: request.session_id,
    trace_id: request.trace_id,
    span_id: request.span_id ?? checksum(JSON.stringify({
      action: request.action,
      trace_id: request.trace_id,
    })).slice(0, 16),
    codex_surface: "codex-cli",
    action: {
      action_type: request.action,
      tool_handle: request.action,
      payload_hash: checksum(JSON.stringify({ status: request.status, output_hash: outputHash })),
      normalized_payload: {},
      blast_radius: "low" as const,
    },
    provenance: {
      source_count: 0,
      highest_trust_supporting: 0,
      highest_trust_opposing: 0,
      directive_precedence_violation: false,
      escalated_by_lower_trust: false,
      risk_flags: [],
    },
    verification: {
      verdict: request.status === "blocked" ? "block" as const : request.status === "queued" ? "require_approval" as const : "allow" as const,
      signals: [],
      divergence_score: 0,
      divergence_violated: false,
      integrity_clean: true,
    },
    cost: {},
    result: {
      status: request.status,
      result_hash: outputHash,
      duration_ms: request.duration_ms,
      approval_id: request.approval_id,
    },
    generated_at: generatedAt,
  };

  const atvHash = checksum(JSON.stringify(atvWithoutCommitment));

  return {
    ...atvWithoutCommitment,
    commitment: {
      atv_hash: atvHash,
      sequence: auditRecord?.sequence,
      audit_record_hash: auditRecord?.record_hash,
      signature: auditRecord?.signature,
    },
  };
}
