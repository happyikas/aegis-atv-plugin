import { describe, expect, it } from "vitest";
import { translateVerdict } from "../src/verdict.js";

describe("translateVerdict", () => {
  it("passes through allow verdicts", () => {
    expect(
      translateVerdict({
        event: "PreToolUse",
        verdict: "allow",
        event_id: "evt-1",
        telemetry_id: "tel-1",
      }),
    ).toMatchObject({
      continue: true,
      verdict: "allow",
      event_id: "evt-1",
      telemetry_id: "tel-1",
    });
  });

  it("marks approval verdicts as non-continuing", () => {
    expect(
      translateVerdict({
        event: "PreToolUse",
        verdict: "require_approval",
        approval_id: "apr-1",
      }),
    ).toMatchObject({
      continue: false,
      approval_required: true,
      approval_id: "apr-1",
      reason: "aegis_requires_approval",
    });
  });

  it("marks block verdicts as blocked", () => {
    expect(
      translateVerdict({
        event: "PreToolUse",
        verdict: "block",
      }),
    ).toMatchObject({
      continue: false,
      blocked: true,
      reason: "aegis_blocked",
    });
  });
});
