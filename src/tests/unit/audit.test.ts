import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../../core/audit.js";

const tempDirs: string[] = [];

describe("audit logger", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("appends records with sequence and hash chaining", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-audit-"));
    tempDirs.push(dataRoot);

    const audit = new AuditLogger(dataRoot);
    const first = await audit.log("event.one", { ok: true });
    const second = await audit.log("event.two", { ok: false });

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(second.prev_record_hash).toBe(first.record_hash);
    expect(first.signature).toBeTruthy();

    const listed = await audit.list(10);
    expect(listed).toHaveLength(2);
  });
});
