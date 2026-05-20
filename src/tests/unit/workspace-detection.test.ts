import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OpenClawWorkspaceAdapter } from "../../adapters/openclaw-workspace.js";

describe("workspace detection", () => {
  it("uses ~/.openclaw/workspace by default", () => {
    const root = OpenClawWorkspaceAdapter.defaultRoot("/Users/tester");
    expect(root).toBe(path.join("/Users/tester", ".openclaw", "workspace"));
  });

  it("allows environment override", () => {
    const adapter = OpenClawWorkspaceAdapter.fromEnvironment({
      OPENCLAW_WORKSPACE: "/tmp/custom-workspace",
    });

    expect(adapter.root).toBe("/tmp/custom-workspace");
  });

  it("falls back to os home when environment override is missing", () => {
    const spy = vi.spyOn(os, "homedir").mockReturnValue("/Users/fallback");
    const adapter = OpenClawWorkspaceAdapter.fromEnvironment({});

    expect(adapter.root).toBe(path.join("/Users/fallback", ".openclaw", "workspace"));
    spy.mockRestore();
  });
});
