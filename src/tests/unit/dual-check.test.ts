import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DualCheckStore } from "../../core/dual-check.js";

const tempDirs: string[] = [];

describe("DualCheckStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("issues and verifies hardware-emulated receipts", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-dual-"));
    tempDirs.push(dataRoot);

    const store = new DualCheckStore(dataRoot);
    const receipt = await store.issue({
      session_id: "sess-1",
      trace_id: "trace-1",
      verdict: "allow",
      atv_hash: "atv-hash",
      audit_record_hash: "audit-hash",
      software_measurements: { verdict: "allow", signals: [] },
    });

    expect(receipt.receipt_id).toBeTruthy();
    expect(store.verifyReceipt(receipt)).toBe(true);
  });
});
