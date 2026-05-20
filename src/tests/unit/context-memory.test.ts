import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContextMemoryStore } from "../../core/context-memory.js";

const tempDirs: string[] = [];

describe("ContextMemoryStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("appends, queries, and profiles context entries", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-context-"));
    tempDirs.push(dataRoot);

    const store = new ContextMemoryStore(dataRoot);
    await store.append({
      session_id: "sess-1",
      trace_id: "trace-1",
      kind: "prompt",
      title: "Prompt",
      content: "Inspect MEMORY.md",
      tags: ["prompt"],
    });
    await store.append({
      session_id: "sess-1",
      trace_id: "trace-1",
      kind: "decision",
      title: "Decision",
      content: "Verdict allow",
      tags: ["allow"],
    });

    const queried = await store.query({ session_id: "sess-1", text: "allow" });
    expect(queried).toHaveLength(1);
    expect(queried[0]?.kind).toBe("decision");

    const profile = await store.profile("sess-1");
    expect(profile.total_entries).toBe(2);
    expect(profile.by_kind.prompt).toBe(1);
  });
});
