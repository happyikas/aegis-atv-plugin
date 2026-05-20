import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandDualCheckProvider, DualCheckStore } from "../../core/dual-check.js";

const tempDirs: string[] = [];

describe("dual-check command provider", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("uses an external verifier process and still emits a verifiable receipt", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-dual-cmd-"));
    tempDirs.push(dir);
    const script = path.join(dir, "dual-check.mjs");
    await fs.writeFile(script, `
      process.stdin.setEncoding('utf8');
      let raw = '';
      process.stdin.on('data', (chunk) => raw += chunk);
      process.stdin.on('end', () => {
        JSON.parse(raw);
        process.stdout.write(JSON.stringify({
          consistent: false,
          verifier: 'hw-command-v1',
          details: { reason: 'simulated_mismatch' }
        }));
      });
    `, 'utf8');

    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-dual-store-"));
    tempDirs.push(dataRoot);
    const provider = new CommandDualCheckProvider(process.execPath, [script]);
    const store = new DualCheckStore(dataRoot, provider);
    const receipt = await store.issue({
      session_id: "sess-1",
      trace_id: "trace-1",
      verdict: "block",
      atv_hash: "atv-hash",
      audit_record_hash: "audit-hash",
      software_measurements: { verdict: "block" },
    });

    expect(receipt.verifier).toBe("hw-command-v1");
    expect(receipt.consistent).toBe(false);
    expect(store.verifyReceipt(receipt)).toBe(true);
  });
});
