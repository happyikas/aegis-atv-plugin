import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalQueue } from "../../core/approval-queue.js";
import { approvalItemSchema } from "../../core/schema.js";
import { isHighRiskAction } from "../../core/policy.js";

const tempDirs: string[] = [];

describe("approval queue", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("stores high-risk actions as pending queue items in local JSON", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-approvals-"));
    tempDirs.push(dataRoot);

    const queue = new ApprovalQueue(dataRoot);
    expect(isHighRiskAction("delete_file")).toBe(true);

    const item = await queue.enqueue("delete_file", "aid:executor", { path: "/tmp/file.txt" });
    expect(item.status).toBe("pending");

    const raw = JSON.parse(await fs.readFile(path.join(dataRoot, "approvals.json"), "utf8")) as unknown[];
    const stored = raw.map((entry) => approvalItemSchema.parse(entry));

    expect(stored).toHaveLength(1);
    expect(stored[0]?.action).toBe("delete_file");
    expect(stored[0]?.status).toBe("pending");
  });

  it("approves and rejects pending items and persists the resolved state", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-approvals-"));
    tempDirs.push(dataRoot);

    const queue = new ApprovalQueue(dataRoot);
    const first = await queue.enqueue("send_email", "aid:executor", { to: "user@example.com" });
    const second = await queue.enqueue("external_share", "aid:executor", { target: "drive" });

    const approved = await queue.resolve(first.id, "approved", "aid:user-main");
    const rejected = await queue.resolve(second.id, "rejected", "aid:user-main");

    expect(approved.status).toBe("approved");
    expect(rejected.status).toBe("rejected");
    expect(approved.resolved_at).toBeDefined();
    expect(rejected.resolved_by).toBe("aid:user-main");

    const stored = await queue.list();
    expect(stored.map((item) => item.status)).toEqual(["approved", "rejected"]);
  });

  it("rejects resolving an already resolved item twice", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-approvals-"));
    tempDirs.push(dataRoot);

    const queue = new ApprovalQueue(dataRoot);
    const item = await queue.enqueue("modify_calendar", "aid:executor", { event: "board-meeting" });

    await queue.resolve(item.id, "approved", "aid:user-main");
    await expect(queue.resolve(item.id, "rejected", "aid:user-main")).rejects.toThrow(
      "Approval already resolved",
    );
  });
});
