import { nowIso } from "./utils.js";

export function createAtsFields() {
  const timestamp = nowIso();

  return {
    created_at: timestamp,
    last_accessed_at: timestamp,
  };
}

export function touchAtsFields<T extends { last_accessed_at: string }>(record: T): T {
  return {
    ...record,
    last_accessed_at: nowIso(),
  };
}
