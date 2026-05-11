import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MetadataStore } from "../../core/metadata.js";

const tempDirs: string[] = [];

describe("metadata transitions", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("persists state changes to sidecar metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-meta-"));
    tempDirs.push(root);

    const store = new MetadataStore(root);
    await store.getOrCreate("memory/task.md");
    const updated = await store.transition("memory/task.md", "verified");

    expect(updated.state).toBe("verified");

    const persisted = await store.read("memory/task.md");
    expect(persisted?.state).toBe("verified");
    expect(persisted?.verified_at).toBeDefined();
  });

  it("requires force for committed to quarantined persistence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-meta-"));
    tempDirs.push(root);

    const store = new MetadataStore(root);
    await store.getOrCreate("MEMORY.md");

    await expect(store.transition("MEMORY.md", "quarantined")).rejects.toThrow(
      "Invalid state transition",
    );

    const forced = await store.transition("MEMORY.md", "quarantined", true);
    expect(forced.state).toBe("quarantined");
  });
});
