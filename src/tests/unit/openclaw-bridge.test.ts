import { describe, expect, it } from "vitest";
import {
  CommandOpenClawBridge,
  createConfiguredOpenClawBridge,
  executeViaOpenClawBridge,
  InMemoryOpenClawBridge,
} from "../../adapters/openclaw-bridge.js";

describe("OpenClaw bridge", () => {
  it("validates payloads before invoking the bridge", async () => {
    const bridge = new InMemoryOpenClawBridge();

    const result = await executeViaOpenClawBridge(bridge, {
      action: "delete_file",
      requested_by: "aid:executor",
      payload: { path: "/tmp/demo.txt" },
    });

    expect(result).toMatchObject({
      bridge: "in-memory-openclaw",
      action: "delete_file",
      payload: { path: "/tmp/demo.txt" },
    });
  });

  it("rejects invalid action payloads", async () => {
    const bridge = new InMemoryOpenClawBridge();

    await expect(
      executeViaOpenClawBridge(bridge, {
        action: "read_file",
        requested_by: "aid:executor",
        payload: {},
      }),
    ).rejects.toThrow();
  });

  it("invokes a command bridge with stdin/stdout JSON", async () => {
    const bridge = new CommandOpenClawBridge(process.execPath, [
      "-e",
      'process.stdin.on("data",chunk=>{const input=JSON.parse(chunk.toString());process.stdout.write(JSON.stringify({received:input.action,payload:input.payload}));});',
    ]);

    const result = await bridge.invoke("read_file", { path: "/tmp/demo.txt" });
    expect(result).toEqual({
      received: "read_file",
      payload: { path: "/tmp/demo.txt" },
    });
  });

  it("creates a command bridge from environment configuration", () => {
    const bridge = createConfiguredOpenClawBridge({
      OPENCLAW_BRIDGE_COMMAND: process.execPath,
      OPENCLAW_BRIDGE_ARGS: JSON.stringify(["-e", "process.exit(0)"]),
      OPENCLAW_BRIDGE_CWD: process.cwd(),
    });

    expect(bridge).toBeInstanceOf(CommandOpenClawBridge);
  });

  it("rejects invalid OPENCLAW_BRIDGE_ARGS configuration", () => {
    expect(() =>
      createConfiguredOpenClawBridge({
        OPENCLAW_BRIDGE_COMMAND: process.execPath,
        OPENCLAW_BRIDGE_ARGS: '{"bad":true}',
      }),
    ).toThrow("OPENCLAW_BRIDGE_ARGS must be a JSON array of strings");
  });
});
