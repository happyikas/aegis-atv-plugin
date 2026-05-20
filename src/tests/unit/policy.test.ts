import { describe, expect, it } from "vitest";
import { isHighRiskAction } from "../../core/policy.js";

describe("high-risk action policy", () => {
  it("flags configured high-risk actions", () => {
    expect(isHighRiskAction("send_email")).toBe(true);
    expect(isHighRiskAction("modify_calendar")).toBe(true);
    expect(isHighRiskAction("delete_file")).toBe(true);
    expect(isHighRiskAction("external_share")).toBe(true);
  });

  it("ignores non-risky actions", () => {
    expect(isHighRiskAction("read_file")).toBe(false);
    expect(isHighRiskAction("search_memory")).toBe(false);
  });
});
