import { isHighRiskAction } from "./policy.js";
import type { ApprovalQueue } from "./approval-queue.js";
import type { AuditLogger } from "./audit.js";
import { buildAtvLiteRecord, buildAtvLiteResultRecord } from "./atv-lite.js";
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
import { checksum, nowIso } from "./utils.js";
import type { OpenClawActionHarness } from "../adapters/mcporter-hook.js";

interface ControlPlaneDeps {
  approvals: ApprovalQueue;
  audit: AuditLogger;
  actions: OpenClawActionHarness;
  integrity: IntegrityBaselineStore;
  collector: EventCollector;
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
}

export interface ToolResultRecordResponse {
  atv_lite: ReturnType<typeof buildAtvLiteResultRecord>;
  event_id: string;
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

export class AegisControlPlane implements AegisControlPlaneClient {
  constructor(private readonly deps: ControlPlaneDeps) {}

  async startSession(payload: SessionStartRequest): Promise<SessionStartResponse> {
    const sessionId = payload.session_id ?? checksum(JSON.stringify({
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
    return {
      event_id: event.event_id,
      prompt_hash: promptHash,
      prompt_length: payload.prompt.length,
    };
  }

  async decideTool(payload: ToolDecisionRequest): Promise<ToolDecisionResponse> {
    const evaluation = await this.deps.actions.preview({
      action: payload.action,
      requested_by: payload.requested_by ?? "aid:executor",
      payload: payload.payload,
      context: {
        ...payload.context,
        session_id: payload.session_id,
        step_id: payload.span_id,
      },
    });
    const auditRecord = await this.deps.audit.log("tool.decision", {
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      action: payload.action,
      verdict: evaluation.verdict,
      signals: evaluation.signals,
    });
    const atvLite = buildAtvLiteRecord({
      ...payload,
      requested_by: payload.requested_by ?? "aid:executor",
      payload: payload.payload,
      context: {
        ...payload.context,
        session_id: payload.session_id,
        step_id: payload.span_id,
      },
    }, evaluation, auditRecord);
    const event = await this.deps.collector.record("tool_decision", {
      session_id: payload.session_id,
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id ?? payload.requested_by,
      trace_id: payload.trace_id ?? atvLite.trace_id,
      span_id: payload.span_id ?? atvLite.span_id,
      verdict: evaluation.verdict,
      action: payload.action,
    }, atvLite);
    return {
      verdict: evaluation.verdict,
      evaluation,
      atv_lite: atvLite,
      event_id: event.event_id,
    };
  }

  async recordToolResult(payload: ToolResultEventRequest): Promise<ToolResultRecordResponse> {
    const auditRecord = await this.deps.audit.log("tool.result", {
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      action: payload.action,
      status: payload.status,
      approval_id: payload.approval_id,
    });
    const atvLite = buildAtvLiteResultRecord(payload, auditRecord);
    const event = await this.deps.collector.record("tool_result", {
      session_id: payload.session_id,
      tenant_id: payload.tenant_id,
      agent_id: payload.agent_id,
      trace_id: payload.trace_id,
      span_id: payload.span_id,
      action: payload.action,
      status: payload.status,
      output_hash: payload.output_hash ?? (payload.output ? checksum(payload.output) : undefined),
    }, atvLite);
    return {
      atv_lite: atvLite,
      event_id: event.event_id,
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
    const event = await this.deps.collector.record("session_stop", summary);
    await this.deps.audit.log("session.stopped", {
      session_id: payload.session_id,
      trace_id: payload.trace_id,
      status: payload.status ?? "completed",
    });
    return {
      event_id: event.event_id,
      summary,
    };
  }
}
