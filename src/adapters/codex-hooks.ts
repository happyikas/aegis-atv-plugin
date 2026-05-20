import type { AegisControlPlaneClient } from "../core/control-plane.js";
import type { CodexHookEvent, CodexHookOutcome } from "../core/types.js";

export class CodexHooksAdapter {
  constructor(private readonly controlPlane: AegisControlPlaneClient) {}

  async handle(event: CodexHookEvent): Promise<CodexHookOutcome> {
    switch (event.event) {
      case "SessionStart": {
        const response = await this.controlPlane.startSession(event);
        return {
          event: event.event,
          continue: true,
          event_id: response.event_id,
          detail: String(response.session.session_id),
        };
      }
      case "UserPromptSubmit": {
        const response = await this.controlPlane.recordUserPrompt(event);
        return {
          event: event.event,
          continue: true,
          event_id: response.event_id,
          detail: response.prompt_hash,
        };
      }
      case "PreToolUse": {
        const response = await this.controlPlane.decideTool(event);
        return {
          event: event.event,
          continue: response.verdict === "allow",
          event_id: response.event_id,
          verdict: response.verdict,
          telemetry_id: response.evaluation.telemetry.telemetry_id,
        };
      }
      case "PermissionRequest": {
        const response = await this.controlPlane.requestApproval(event);
        return {
          event: event.event,
          continue: false,
          event_id: response.event_id,
          approval_id: response.item?.id,
          detail: response.item?.status ?? "pending",
        };
      }
      case "PostToolUse": {
        const response = await this.controlPlane.recordToolResult(event);
        return {
          event: event.event,
          continue: true,
          event_id: response.event_id,
          detail: response.atv_lite.result?.status,
        };
      }
      case "Stop": {
        const response = await this.controlPlane.stopSession(event);
        return {
          event: event.event,
          continue: true,
          event_id: response.event_id,
          detail: String(response.summary.status),
        };
      }
    }
  }
}
