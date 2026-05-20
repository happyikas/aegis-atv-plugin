import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalItem } from "./types.js";
import { approvalItemSchema } from "./schema.js";
import { checksum, nowIso } from "./utils.js";

export class ApprovalQueue {
  private readonly filePath: string;

  constructor(dataRoot: string) {
    this.filePath = path.join(dataRoot, "approvals.json");
  }

  private async readAllInternal(): Promise<ApprovalItem[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown[];
      return parsed.map((item) => approvalItemSchema.parse(item));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  private async writeAll(items: ApprovalItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }

  async list(): Promise<ApprovalItem[]> {
    return this.readAllInternal();
  }

  async get(id: string): Promise<ApprovalItem | null> {
    const items = await this.readAllInternal();
    return items.find((item) => item.id === id) ?? null;
  }

  async enqueue(action: string, requestedBy: string, payload: Record<string, unknown>): Promise<ApprovalItem> {
    const items = await this.readAllInternal();
    const requestedAt = nowIso();
    const item: ApprovalItem = {
      id: `approval-${checksum(JSON.stringify({
        action,
        requestedBy,
        payload,
        requestedAt,
        ordinal: items.length,
      })).slice(0, 16)}`,
      action,
      requested_at: requestedAt,
      requested_by: requestedBy,
      payload,
      status: "pending",
    };

    items.push(item);
    await this.writeAll(items);
    return item;
  }

  async resolve(id: string, status: "approved" | "rejected", resolvedBy = "aid:user-main"): Promise<ApprovalItem> {
    const items = await this.readAllInternal();
    const index = items.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new Error(`Approval not found: ${id}`);
    }

    if (items[index]?.status !== "pending") {
      throw new Error(`Approval already resolved: ${id}`);
    }

    const updated: ApprovalItem = {
      ...items[index],
      status,
      resolved_at: nowIso(),
      resolved_by: resolvedBy,
    };

    items[index] = updated;
    await this.writeAll(items);
    return updated;
  }
}
