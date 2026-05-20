import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultLaunchdConfig,
  renderBridgeTemplate,
  renderLaunchdPlist,
} from "../../core/macos-deploy.js";

describe("macOS deployment helpers", () => {
  it("renders a launchd plist with environment variables", () => {
    const config = defaultLaunchdConfig("/Users/test/project", "/Users/test");
    const plist = renderLaunchdPlist({
      ...config,
      bridgeCommand: "/Users/test/project/deployment/openclaw-bridge-template.sh",
      bridgeArgs: ["--stdio"],
      bridgeCwd: "/Users/test/openclaw",
    });

    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("com.aegisdata.openclaw-lite");
    expect(plist).toContain(path.join("/Users/test", ".openclaw", "workspace"));
    expect(plist).toContain("OPENCLAW_BRIDGE_COMMAND");
    expect(plist).toContain("OPENCLAW_BRIDGE_ARGS");
  });

  it("renders a shell bridge template", () => {
    const script = renderBridgeTemplate();
    expect(script).toContain("#!/bin/zsh");
    expect(script).toContain("unsupported_action");
    expect(script).toContain('"bridge":"shell-template"');
  });
});
