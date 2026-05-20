import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AtmuLedger } from "../../core/atmu-ledger.js";

const tempDirs: string[] = [];

describe("AtmuLedger", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("begins, transitions, and recovers intent records", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-atmu-"));
    tempDirs.push(dataRoot);

    const ledger = new AtmuLedger(dataRoot);
    const begun = await ledger.beginIntent({
      session_id: "sess-1",
      trace_id: "trace-1",
      action: "read_file",
      requested_by: "aid:executor",
      payload_hash: "payload-hash",
      policy_hash: "policy-hash",
    });
    const prepared = await ledger.transition(begun.intent_id, "prepared", { verdict: "allow" });
    const committed = await ledger.transition(prepared.intent_id, "committed", { status: "success" });

    expect(committed.state).toBe("committed");
    expect((await ledger.recover())[0]?.intent_id).toBe(begun.intent_id);
  });
});
