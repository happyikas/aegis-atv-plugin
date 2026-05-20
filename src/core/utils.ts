import crypto from "node:crypto";
import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function checksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function stableMemoryId(sourcePath: string): string {
  return crypto.createHash("sha1").update(sourcePath).digest("hex");
}

export function metaFileName(sourcePath: string): string {
  const normalized = sourcePath.replaceAll(path.sep, "__");
  return `${normalized}.json`;
}
