import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Ed25519KeyStore, verifyWithPublicKey } from "../../core/crypto-sign.js";
import { canonicalize } from "../../core/utils.js";

const tempDirs: string[] = [];

describe("crypto-sign", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("creates reusable Ed25519 signatures for canonicalized messages", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-sign-"));
    tempDirs.push(dataRoot);

    const store = new Ed25519KeyStore(dataRoot, "unit");
    const message = canonicalize({ b: 2, a: 1 });
    const bundle = await store.sign(message);

    expect(bundle.signature_algorithm).toBe("ed25519");
    expect(verifyWithPublicKey(bundle.public_key, message, bundle.signature)).toBe(true);
  });
});
