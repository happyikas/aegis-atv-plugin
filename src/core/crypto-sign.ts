import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalize, checksum } from "./utils.js";

export interface SignatureBundle {
  signature: string;
  public_key: string;
  signer_key_id: string;
  signature_algorithm: "ed25519";
}

export { canonicalize };

export async function signWithPrivateKey(privateKeyPem: string, message: string): Promise<string> {
  return crypto.sign(null, Buffer.from(message, "utf8"), privateKeyPem).toString("base64");
}

export function verifyWithPublicKey(publicKeyPem: string, message: string, signature: string): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(message, "utf8"),
      publicKeyPem,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

export class Ed25519KeyStore {
  private readonly dir: string;
  private readonly privateKeyPath: string;
  private readonly publicKeyPath: string;

  constructor(dataRoot: string, namespace: string) {
    this.dir = path.join(dataRoot, "keys");
    this.privateKeyPath = path.join(this.dir, `${namespace}.private.pem`);
    this.publicKeyPath = path.join(this.dir, `${namespace}.public.pem`);
  }

  private async ensurePair(): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const [privateKeyPem, publicKeyPem] = await Promise.all([
        fs.readFile(this.privateKeyPath, "utf8"),
        fs.readFile(this.publicKeyPath, "utf8"),
      ]);
      return { privateKeyPem, publicKeyPem };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
      const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
      await fs.writeFile(this.privateKeyPath, privateKeyPem, { encoding: "utf8", mode: 0o600 });
      await fs.writeFile(this.publicKeyPath, publicKeyPem, { encoding: "utf8", mode: 0o644 });
      return { privateKeyPem, publicKeyPem };
    }
  }

  async sign(message: string): Promise<SignatureBundle> {
    const { privateKeyPem, publicKeyPem } = await this.ensurePair();
    return {
      signature: await signWithPrivateKey(privateKeyPem, message),
      public_key: publicKeyPem,
      signer_key_id: checksum(canonicalize({ publicKeyPem })).slice(0, 16),
      signature_algorithm: "ed25519",
    };
  }

  async publicKey(): Promise<string> {
    const { publicKeyPem } = await this.ensurePair();
    return publicKeyPem;
  }
}
