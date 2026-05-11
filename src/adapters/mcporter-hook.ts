import type { ApprovalQueue } from "../core/approval-queue.js";
import { ActionFirewall } from "../core/action-firewall.js";
import type { AuditLogger } from "../core/audit.js";
import { parseActionPayload } from "../core/schema.js";
import type { ActionExecutionResult, ActionRequest } from "../core/types.js";

export type ActionExecutor = (request: ActionRequest) => Promise<unknown>;

export class OpenClawActionHarness {
  constructor(
    private readonly approvals: ApprovalQueue,
    private readonly audit: AuditLogger,
    private readonly executor: ActionExecutor,
    private readonly firewall: ActionFirewall = new ActionFirewall(),
  ) {}

  async preview(request: ActionRequest) {
    const validatedPayload = parseActionPayload(request.action, request.payload);
    return this.firewall.evaluate({
      ...request,
      payload: validatedPayload,
    });
  }

  async intercept(request: ActionRequest): Promise<ActionExecutionResult> {
    const evaluation = await this.preview(request);
    const validatedRequest: ActionRequest = {
      ...request,
      payload: parseActionPayload(request.action, request.payload),
    };

    if (evaluation.verdict === "block") {
      await this.audit.log("action.blocked", {
        action: validatedRequest.action,
        requested_by: validatedRequest.requested_by,
        signals: evaluation.signals,
      });

      return {
        executed: false,
        queued: false,
        action: validatedRequest.action,
        reason: "action_blocked_by_firewall",
        evaluation,
      };
    }

    if (evaluation.verdict === "require_approval") {
      const approval = await this.approvals.enqueue(
        validatedRequest.action,
        validatedRequest.requested_by,
        validatedRequest.payload,
      );
      await this.audit.log("action.blocked_pending_approval", {
        approval_id: approval.id,
        action: validatedRequest.action,
        requested_by: validatedRequest.requested_by,
        signals: evaluation.signals,
      });

      return {
        executed: false,
        queued: true,
        action: validatedRequest.action,
        approval_id: approval.id,
        reason: "action_requires_approval",
        evaluation,
      };
    }

    const output = await this.executor(validatedRequest);
    await this.audit.log("action.executed", {
      action: validatedRequest.action,
      requested_by: validatedRequest.requested_by,
      telemetry_id: evaluation.telemetry.telemetry_id,
    });

    return {
      executed: true,
      queued: false,
      action: validatedRequest.action,
      output,
      evaluation,
    };
  }

  async replayApproved(approvalId: string): Promise<ActionExecutionResult> {
    const approval = await this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== "approved") {
      throw new Error(`Approval is not approved: ${approvalId}`);
    }

    const request: ActionRequest = {
      action: approval.action as ActionRequest["action"],
      requested_by: approval.requested_by,
      payload: approval.payload,
    };

    const output = await this.executor({
      ...request,
      payload: parseActionPayload(request.action, request.payload),
    });
    await this.audit.log("action.executed_from_approval", {
      approval_id: approval.id,
      action: approval.action,
      requested_by: approval.requested_by,
    });

    return {
      executed: true,
      queued: false,
      action: approval.action,
      approval_id: approval.id,
      output,
    };
  }
}
