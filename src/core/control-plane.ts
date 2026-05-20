import { isHighRiskAction } from "./policy.js";
import type { ApprovalQueue } from "./approval-queue.js";
import type { AuditLogger } from "./audit.js";
import { buildAtvLiteRecord, buildAtvLiteResultRecord } from "./atv-lite.js";
import type { AtmuLedger, IntentRecord, IntentState } from "./atmu-ledger.js";
import type { ContextMemoryStore } from "./context-memory.js";
import type { DualCheckReceipt, DualCheckStore } from "./dual-check.js";
import type { EventCollector } from "./event-collector.js";
import type { IntegrityBaselineStore } from "./integrity.js";
import type {
  ApprovalItem,
  PermissionRequestEventRequest,
  SessionStartRequest,
  StopEventRequest,
  ToolDecisionRequest,
  ToolResultEventRequest,
  UserPromptEventRequest,
} from "./types.js";
import { canonicalize, checksum, nowIso } from "./utils.js";
import type { OpenClawActionHarness } from "../adapters/mcporter-hook.js";

interface ControlPlaneDeps {
  approvals: ApprovalQueue;
  audit: AuditLogger;
  actions: OpenClawActionHarness;
  integrity: IntegrityBaselineStore;
  collector: EventCollector;
  atmu: AtmuLedger;
  dualCheck: DualCheckStore;
  contextMemory: ContextMemoryStore;
}

export interface SessionStartResponse {
  session: Record<string, unknown>;
  event_id: string;
}

export interface UserPromptRecordResponse {
  event_id: string;
  prompt_hash: string;
  prompt_length: number;
}

export interface ToolDecisionResponse {
  verdict: "allow" | "require_approval" | "block";
  evaluation: Awaited<ReturnType<OpenClawActionHarness["preview"]>>;
  atv_lite: ReturnType<typeof buildAtvLiteRecord>;
  event_id: string;
  intent?: IntentRecord;
  dual_check?: DualCheckReceipt;
}

export interface ToolResultRecordResponse {
  atv_lite: ReturnType<typeof buildAtvLiteResultRecord>;
  event_id: string;
  intent?: IntentRecord | null;
  dual_check?: DualCheckReceipt;
}

export interface ApprovalResponse {
  queued: boolean;
  item?: ApprovalItem;
  message?: string;
  event_id?: string;
}

export interface StopEventResponse {
  event_id: string;
  summary: Record<string, unknown>;
}

export interface AegisControlPlaneClient {
  startSession(payload: SessionStartRequest): Promise<SessionStartResponse>;
  recordUserPrompt(payload: UserPromptEventRequest): Promise<UserPromptRecordResponse>;
  decideTool(payload: ToolDecisionRequest): Promise<ToolDecisionResponse>;
  recordToolResult(payload: ToolResultEventRequest): Promise<ToolResultRecordResponse>;
  createApproval(payload: {
    action: PermissionRequestEventRequest["action"];
    requested_by?: string;
    payload: Record<string, unknown>;
  }): Promise<ApprovalResponse>;
  requestApproval(payload: PermissionRequestEventRequest): Promise<ApprovalResponse>;
  stopSession(payload: StopEventRequest): Promise<StopEventResponse>;
}

function deriveTraceId(payload: ToolDecisionRequest): string {
  return payload.trace_id ?? checksum(canonicalize({
    session_id: payload.session_id,
    span_id: payload.span_id,
    action: payload.action,
    requested_by: payload.requested_by ?? "aid:executor",
    payload: payload.payload,
  })).slice(0, 16);
}

function desiredIntentState(status: ToolResultEventRequest["status"]): IntentState | undefined {
  switch (status) {
    case "success":
      return "committed";
    case "error":
    case "blocked":
      return "aborted";
    default:
      return undefined;
  }
}

async function moveIntent(
  ledger: AtmuLedger,
  current: IntentRecord,
  target: IntentState,
  metadata?: Record<string, unknown>,
): Promise<IntentRecord> {
  let next = current;
  if (target === "committed" && next.state === "tentative") {
    next = await ledger.transition(next.intent_id, "prepared", metadata);
  }
  if (next.state === target) {
    return next;
  }
  return ledger.transition(next.intent_id, target, metadata);
}

export class AegisControlPlane implements AegisControlPlaneClient {
  constructor(private readonly deps: ControlPlaneDeps) {}

  async startSession(payload: SessionStartRequest): Promise<SessionStartResponse> {
    const sessionId = payload.session_id ?? checksum(canonicalize({
      agent_id: payload.agent_id,
      workspace: payload.workspace,
      started_at: nowIso(),
    })).slice(0, 16);
    const baselineReport = await this.deps.integrity.check();
    const session = {
      ...payload,
      session_id: sessionId,
      started_at: nowIso(),
      baseline_status: baselineReport
        ? {
            clean: baselineReport.clean,
            baseline_id: baselineReport.baseline_id,
            mutation_count: baselineReport.mutations.length,
          }
        : {
            clean: true,
            baseline_missing: true,
          },
    };
    const event = await this.deps.collector.record("session_start", session);
    await this.deps.contextMemory.append({
      session_id: sessionId,
      kind: "session",
      title: "Session started",
      content: `Agent ${payload.agent_id} started a ${payload.codex_surface ?? "codex-cli"} session in ${payload.workspace}.`,
      tags: ["session_start", payload.agent_id],
      metadata: session,
    });
    return {
      session,
      event_id: event.event_id,
    };
  }

  async recordUserPrompt(payload: UserPromptEventRequest): Promise<UserPromptRecordResponse> {
    const promptHash = checksum(payload.prompt);
    const redacted = {
      session_id: payload.session_id,
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id,
      declared_intent: payload.declared_intent,
      source_locator: payload.source_locator,
      prompt_hash: promptHash,
      prompt_length: payload.prompt.length,
      recorded_at: nowIso(),
    };
    const event = await this.deps.collector.record("user_prompt", redacted);
    await this.deps.contextMemory.append({
      session_id: payload.session_id,
      kind: "prompt",
      title: "User prompt submitted",
      content: payload.prompt,
      tags: ["prompt", payload.agent_id],
      metadata: redacted,
    });
    return {
      event_id: event.event_id,
      prompt_hash: promptHash,
      prompt_length: payload.prompt.length,
    };
  }

  async decideTool(payload: ToolDecisionRequest): Promise<ToolDecisionResponse> {
    const traceId = deriveTraceId(payload);
    const requestedBy = payload.requested_by ?? "aid:executor";
    const request = {
      action: payload.action,
      requested_by: requestedBy,
      payload: payload.payload,
      context: {
        ...payload.context,
        session_id: payload.session_id,
        step_id: payload.span_id,
      },
    };
    const evaluation = await this.deps.actions.preview(request);
    const payloadHash = checksum(canonicalize(payload.payload));
    const policyHash = checksum(canonicalize({
      verdict: evaluation.verdict,
      blast_radius: evaluation.blast_radius,
      signals: evaluation.signals,
      judge: evaluation.judge,
      divergence: evaluation.divergence,
    }));
    const initialIntent = await this.deps.atmu.beginIntent({
      session_id: payload.session_id,
      trace_id: traceId,
      action: payload.action,
      requested_by: requestedBy,
      payload_hash: payloadHash,
      policy_hash: policyHash,
      metadata: {
        blast_radius: evaluation.blast_radius,
        verdict: evaluation.verdict,
      },
    });

    let intent = initialIntent;
    if (intent.state === "tentative") {
      intent = await this.deps.atmu.transition(
        intent.intent_id,
        evaluation.verdict === "block" ? "aborted" : "prepared",
        {
          verdict: evaluation.verdict,
          signals: evaluation.signals,
        },
      );
    }

    const auditRecord = await this.deps.audit.log("tool.decision", {
      session_id: payload.session_id,
      trace_id: traceId,
      action: payload.action,
      verdict: evaluation.verdict,
      signals: evaluation.signals,
      judge: evaluation.judge,
      intent_id: intent.intent_id,
    });
    const atvLite = buildAtvLiteRecord({
      ...payload,
      trace_id: traceId,
      requested_by: requestedBy,
      payload: payload.payload,
      context: {
        ...payload.context,
        session_id: payload.session_id,
        step_id: payload.span_id,
      },
    }, evaluation, auditRecord, {
      intent_id: intent.intent_id,
    });
    const dualCheck = await this.deps.dualCheck.issue({
      session_id: payload.session_id,
      trace_id: traceId,
      verdict: evaluation.verdict,
      atv_hash: atvLite.commitment.atv_hash,
      audit_record_hash: auditRecord.record_hash,
      software_measurements: {
        payload_hash: payloadHash,
        policy_hash: policyHash,
        blast_radius: evaluation.blast_radius,
        divergence_score: evaluation.divergence.score,
        signals: evaluation.signals,
        telemetry_id: evaluation.telemetry.telemetry_id,
        vector_sha256: evaluation.telemetry.vector_sha256,
      },
    });
    atvLite.commitment.dual_check_receipt_id = dualCheck.receipt_id;
    atvLite.commitment.dual_check_consistent = dualCheck.consistent;

    const event = await this.deps.collector.record("tool_decision", {
      session_id: payload.session_id,
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id ?? payload.requested_by,
      trace_id: traceId,
      span_id: payload.span_id ?? atvLite.span_id,
      verdict: evaluation.verdict,
      action: payload.action,
      intent_id: intent.intent_id,
      dual_check_receipt_id: dualCheck.receipt_id,
    }, atvLite);
    await this.deps.contextMemory.append({
      session_id: payload.session_id,
      trace_id: traceId,
      kind: "decision",
      title: `Decision for ${payload.action}`,
      content: `Verdict ${evaluation.verdict}; blast radius ${evaluation.blast_radius}; signals: ${evaluation.signals.join(", ") || "none"}.`,
      tags: [payload.action, evaluation.verdict],
      metadata: {
        intent_id: intent.intent_id,
        dual_check_receipt_id: dualCheck.receipt_id,
        telemetry_id: evaluation.telemetry.telemetry_id,
        judge: evaluation.judge,
      },
    });
    return {
      verdict: evaluation.verdict,
      evaluation,
      atv_lite: atvLite,
      event_id: event.event_id,
      intent,
      dual_check: dualCheck,
    };
  }

  async recordToolResult(payload: ToolResultEventRequest): Promise<ToolResultRecordResponse> {
    let intent = await this.deps.atmu.findByTrace(payload.session_id, payload.trace_id);
    const targetState = desiredIntentState(payload.status);
    if (intent && targetState) {
      intent = await moveIntent(this.deps.atmu, intent, targetState, {
        status: payload.status,
        approval_id: payload.approval_id,
      });
    }

    const auditRecord = await this.deps.audit.log("tool.result", {
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      action: payload.action,
      status: payload.status,
      approval_id: payload.approval_id,
      intent_id: intent?.intent_id,
    });
    const atvLite = buildAtvLiteResultRecord(payload, auditRecord, {
      intent_id: intent?.intent_id,
    });
    const dualCheck = await this.deps.dualCheck.issue({
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      verdict: atvLite.verification.verdict,
      atv_hash: atvLite.commitment.atv_hash,
      audit_record_hash: auditRecord.record_hash,
      software_measurements: {
        status: payload.status,
        output_hash: payload.output_hash ?? (payload.output ? checksum(payload.output) : undefined),
        duration_ms: payload.duration_ms,
        approval_id: payload.approval_id,
        intent_id: intent?.intent_id,
      },
    });
    atvLite.commitment.dual_check_receipt_id = dualCheck.receipt_id;
    atvLite.commitment.dual_check_consistent = dualCheck.consistent;

    const event = await this.deps.collector.record("tool_result", {
      session_id: payload.session_id,
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id,
      trace_id: payload.trace_id,
      span_id: payload.span_id,
      action: payload.action,
      status: payload.status,
      output_hash: payload.output_hash ?? (payload.output ? checksum(payload.output) : undefined),
      intent_id: intent?.intent_id,
      dual_check_receipt_id: dualCheck.receipt_id,
    }, atvLite);
    await this.deps.contextMemory.append({
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      kind: "result",
      title: `Result for ${payload.action}`,
      content: `Status ${payload.status}; duration ${payload.duration_ms ?? 0} ms.`,
      tags: [payload.action, payload.status],
      metadata: {
        intent_id: intent?.intent_id,
        dual_check_receipt_id: dualCheck.receipt_id,
        approval_id: payload.approval_id,
      },
    });
    return {
      atv_lite: atvLite,
      event_id: event.event_id,
      intent,
      dual_check: dualCheck,
    };
  }

  async createApproval(payload: {
    action: PermissionRequestEventRequest["action"];
    requested_by?: string;
    payload: Record<string, unknown>;
  }): Promise<ApprovalResponse> {
    if (!isHighRiskAction(payload.action)) {
      return {
        queued: false,
        message: "Action is not high risk and does not require approval",
      };
    }

    const item = await this.deps.approvals.enqueue(
      payload.action,
      payload.requested_by ?? "aid:executor",
      payload.payload,
    );
    await this.deps.audit.log("approval.created", { id: item.id, action: item.action });
    return {
      queued: true,
      item,
    };
  }

  async requestApproval(payload: PermissionRequestEventRequest): Promise<ApprovalResponse> {
    const item = await this.deps.approvals.enqueue(
      payload.action,
      payload.requested_by ?? "aid:executor",
      payload.payload,
    );
    await this.deps.audit.log("approval.created", {
      id: item.id,
      action: item.action,
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      codex_reason: payload.codex_reason,
      proposed_scope: payload.proposed_scope,
    });
    const event = await this.deps.collector.record("permission_request", {
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id,
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      span_id: payload.span_id,
      action: payload.action,
      approval_id: item.id,
      codex_reason: payload.codex_reason,
      proposed_scope: payload.proposed_scope,
    });
    await this.deps.contextMemory.append({
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      kind: "approval",
      title: `Approval requested for ${payload.action}`,
      content: payload.codex_reason ?? `Approval required for ${payload.action}.`,
      tags: [payload.action, "approval_request"],
      metadata: {
        approval_id: item.id,
        proposed_scope: payload.proposed_scope,
      },
    });
    return {
      queued: true,
      item,
      event_id: event.event_id,
    };
  }

  async stopSession(payload: StopEventRequest): Promise<StopEventResponse> {
    const summary = {
      tenant_id: payload.tenant_id ?? "local-tenant",
      agent_id: payload.agent_id,
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      conversation_id: payload.conversation_id,
      result_summary: payload.result_summary,
      token_count: payload.token_count,
      status: payload.status ?? "completed",
      stopped_at: nowIso(),
    };
    const auditRecord = await this.deps.audit.log("session.stop", summary);
    const event = await this.deps.collector.record("session_stop", {
      ...summary,
      audit_sequence: auditRecord.sequence,
    });
    await this.deps.contextMemory.append({
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      kind: "stop",
      title: "Session stopped",
      content: payload.result_summary ?? `Session ended with status ${payload.status ?? "completed"}.`,
      tags: [payload.status ?? "completed", "session_stop"],
      metadata: summary,
    });
    return {
      event_id: event.event_id,
      summary,
    };
  }
}
