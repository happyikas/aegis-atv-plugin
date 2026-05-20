import { describe, expect, it, vi } from "vitest";
import { main } from "../src/hook.js";

async function runWithPolicy(policy: string | undefined) {
  const writes: string[] = [];
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  const stdin = vi.spyOn(process.stdin, Symbol.asyncIterator as never).mockReturnValue((async function* () {
    yield Buffer.from('{"event":"UserPromptSubmit","session_id":"sess-1","prompt":"hello"}');
  })() as never);
  const original = process.env.AEGIS_HOOK_OUTAGE_POLICY;
  process.env.AEGIS_HOOK_OUTAGE_POLICY = policy;
  process.env.AEGIS_SIDECAR_URL = "http://127.0.0.1:9";

  try {
    await main();
  } finally {
    stdoutWrite.mockRestore();
    stdin.mockRestore();
    if (original === undefined) {
      delete process.env.AEGIS_HOOK_OUTAGE_POLICY;
    } else {
      process.env.AEGIS_HOOK_OUTAGE_POLICY = original;
    }
  }

  return JSON.parse(writes.join("").trim());
}

describe("hook outage policies", () => {
  it("fails open by default", async () => {
    const result = await runWithPolicy(undefined);
    expect(result.continue).toBe(true);
    expect(result.suppressed_hook_error).toBe(true);
  });

  it("can require approval on sidecar outage", async () => {
    const result = await runWithPolicy("require_approval");
    expect(result.continue).toBe(false);
    expect(result.approval_required).toBe(true);
    expect(result.reason).toBe("aegis_sidecar_unavailable");
  });

  it("can fail closed on sidecar outage", async () => {
    const result = await runWithPolicy("fail_closed");
    expect(result.continue).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("aegis_sidecar_unavailable");
  });
});
