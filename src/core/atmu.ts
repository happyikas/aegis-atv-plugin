import type { MemoryMetadata, MemoryState } from "./types.js";
import { nowIso } from "./utils.js";

const transitions: Record<MemoryState, MemoryState[]> = {
  draft: ["verified", "quarantined"],
  verified: ["committed", "quarantined"],
  committed: [],
  quarantined: [],
};

export function canTransition(from: MemoryState, to: MemoryState, force = false): boolean {
  if (force && from === "committed" && to === "quarantined") {
    return true;
  }

  return transitions[from].includes(to);
}

export function transitionMetadata(
  metadata: MemoryMetadata,
  nextState: MemoryState,
  force = false,
): MemoryMetadata {
  if (!canTransition(metadata.state, nextState, force)) {
    throw new Error(`Invalid state transition: ${metadata.state} -> ${nextState}`);
  }

  return {
    ...metadata,
    state: nextState,
    verified_at: nextState === "verified" ? nowIso() : metadata.verified_at,
    last_accessed_at: nowIso(),
  };
}
