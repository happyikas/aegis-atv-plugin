import crypto from "node:crypto";
import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function checksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function stableMemoryId(sourcePath: string): string {
  return crypto.createHash("sha1").update(sourcePath).digest("hex");
}

export function metaFileName(sourcePath: string): string {
  const normalized = sourcePath.replaceAll(path.sep, "__");
  return `${normalized}.json`;
}
