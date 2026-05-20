import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenClawActionHarness } from "../../adapters/mcporter-hook.js";
import { ApprovalQueue } from "../../core/approval-queue.js";
import { AuditLogger } from "../../daemon/audit.js";

const tempDirs: string[] = [];

describe("OpenClaw action harness", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("executes non-risk actions immediately", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-action-"));
    tempDirs.push(dataRoot);

    const executor = vi.fn(async () => ({ ok: true }));
    const harness = new OpenClawActionHarness(
      new ApprovalQueue(dataRoot),
      new AuditLogger(dataRoot),
      executor,
    );

    const result = await harness.intercept({
      action: "read_file",
      requested_by: "aid:executor",
      payload: { path: "memory/task.md" },
    });

    expect(result.executed).toBe(true);
    expect(result.queued).toBe(false);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid payloads before queueing or execution", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-action-"));
    tempDirs.push(dataRoot);

    const executor = vi.fn(async () => ({ ok: true }));
    const harness = new OpenClawActionHarness(
      new ApprovalQueue(dataRoot),
      new AuditLogger(dataRoot),
      executor,
    );

    await expect(
      harness.intercept({
        action: "send_email",
        requested_by: "aid:executor",
        payload: {},
      }),
    ).rejects.toThrow();
    expect(executor).not.toHaveBeenCalled();
  });

  it("queues high-risk actions instead of executing them", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-action-"));
    tempDirs.push(dataRoot);

    const executor = vi.fn(async () => ({ ok: true }));
    const approvals = new ApprovalQueue(dataRoot);
    const harness = new OpenClawActionHarness(approvals, new AuditLogger(dataRoot), executor);

    const result = await harness.intercept({
      action: "send_email",
      requested_by: "aid:executor",
      payload: { to: "demo@example.com" },
    });

    expect(result.executed).toBe(false);
    expect(result.queued).toBe(true);
    expect(result.approval_id).toBeDefined();
    expect(executor).not.toHaveBeenCalled();

    const queued = await approvals.get(result.approval_id!);
    expect(queued?.status).toBe("pending");
  });

  it("replays approved actions through the executor", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-action-"));
    tempDirs.push(dataRoot);

    const executor = vi.fn(async (request) => ({ delivered: request.payload.to }));
    const approvals = new ApprovalQueue(dataRoot);
    const harness = new OpenClawActionHarness(approvals, new AuditLogger(dataRoot), executor);

    const queued = await harness.intercept({
      action: "send_email",
      requested_by: "aid:executor",
      payload: { to: "demo@example.com" },
    });

    await approvals.resolve(queued.approval_id!, "approved", "aid:user-main");
    const replayed = await harness.replayApproved(queued.approval_id!);

    expect(replayed.executed).toBe(true);
    expect(replayed.approval_id).toBe(queued.approval_id);
    expect(replayed.output).toEqual({ delivered: "demo@example.com" });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("rejects replay for unresolved approvals", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-action-"));
    tempDirs.push(dataRoot);

    const executor = vi.fn(async () => ({ ok: true }));
    const approvals = new ApprovalQueue(dataRoot);
    const harness = new OpenClawActionHarness(approvals, new AuditLogger(dataRoot), executor);
    const queued = await harness.intercept({
      action: "delete_file",
      requested_by: "aid:executor",
      payload: { path: "/tmp/demo.txt" },
    });

    await expect(harness.replayApproved(queued.approval_id!)).rejects.toThrow("Approval is not approved");
    expect(executor).not.toHaveBeenCalled();
  });
});
