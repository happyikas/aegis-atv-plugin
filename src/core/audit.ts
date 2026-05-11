import fs from "node:fs/promises";
import path from "node:path";
import { nowIso } from "./utils.js";

export class AuditLogger {
  private readonly filePath: string;

  constructor(dataRoot: string) {
    this.filePath = path.join(dataRoot, "audit", "audit.log");
  }

  async log(event: string, details: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify({
      event,
      timestamp: nowIso(),
      details,
    });
    await fs.appendFile(this.filePath, `${line}\n`, "utf8");
  }
}
