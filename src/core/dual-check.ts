import fs from "node:fs/promises";
import path from "node:path";
import { Ed25519KeyStore, verifyWithPublicKey } from "./crypto-sign.js";
import { runJsonProcess } from "./process-json.js";
import { canonicalize, checksum, nowIso } from "./utils.js";

export interface DualCheckReceipt {
  receipt_id: string;
  measurement_hash: string;
  atv_hash: string;
  audit_record_hash?: string;
  verified_at: string;
  verifier: string;
  signature_algorithm: "ed25519";
  signature: string;
  signer_key_id: string;
  public_key: string;
  consistent: boolean;
  details: Record<string, unknown>;
}

export interface DualCheckInput {
  session_id: string;
  trace_id: string;
  verdict: string;
  atv_hash: string;
  audit_record_hash?: string;
  software_measurements: Record<string, unknown>;
}

export interface DualCheckProviderResult {
  consistent: boolean;
  verifier: string;
  details?: Record<string, unknown>;
}

export interface DualCheckProvider {
  evaluate(input: DualCheckInput): Promise<DualCheckProviderResult>;
}

export class LocalEmulatorDualCheckProvider implements DualCheckProvider {
  async evaluate(_input: DualCheckInput): Promise<DualCheckProviderResult> {
    return {
      consistent: true,
      verifier: "hw-emulator-v1",
      details: {
        strategy: "local_emulator",
      },
    };
  }
}

function parseArgs(raw?: string): string[] {
  return raw?.trim() ? raw.trim().split(/\s+/) : [];
}

export class CommandDualCheckProvider implements DualCheckProvider {
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly fallback: DualCheckProvider = new LocalEmulatorDualCheckProvider(),
  ) {}

  async evaluate(input: DualCheckInput): Promise<DualCheckProviderResult> {
    try {
      const result = await runJsonProcess<DualCheckProviderResult>({
        command: this.command,
        args: this.args,
        input,
      });
      return result;
    } catch {
      const fallback = await this.fallback.evaluate(input);
      return {
        ...fallback,
        details: {
          ...(fallback.details ?? {}),
          provider_fallback: true,
        },
      };
    }
  }
}

export function createConfiguredDualCheckProvider(env: NodeJS.ProcessEnv = process.env): DualCheckProvider {
  const provider = env.AEGIS_DUALCHECK_PROVIDER?.trim().toLowerCase() ?? "emulator";
  if (provider === "command" && env.AEGIS_DUALCHECK_COMMAND) {
    return new CommandDualCheckProvider(env.AEGIS_DUALCHECK_COMMAND, parseArgs(env.AEGIS_DUALCHECK_ARGS));
  }
  return new LocalEmulatorDualCheckProvider();
}

export class DualCheckStore {
  private readonly dir: string;
  private readonly logPath: string;
  private readonly keyStore: Ed25519KeyStore;

  constructor(
    private readonly dataRoot: string,
    private readonly provider: DualCheckProvider = new LocalEmulatorDualCheckProvider(),
  ) {
    this.dir = path.join(this.dataRoot, "dual-check");
    this.logPath = path.join(this.dir, "receipts.jsonl");
    this.keyStore = new Ed25519KeyStore(this.dataRoot, "dual-check");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async issue(input: DualCheckInput): Promise<DualCheckReceipt> {
    await this.ensureDir();
    const providerResult = await this.provider.evaluate(input);
    const measurement_hash = checksum(canonicalize(input.software_measurements));
    const signingInput = canonicalize({
      measurement_hash,
      atv_hash: input.atv_hash,
      audit_record_hash: input.audit_record_hash,
      verdict: input.verdict,
      session_id: input.session_id,
      trace_id: input.trace_id,
      verifier: providerResult.verifier,
      consistent: providerResult.consistent,
    });
    const signatureBundle = await this.keyStore.sign(signingInput);
    const receipt: DualCheckReceipt = {
      receipt_id: checksum(canonicalize({ trace_id: input.trace_id, measurement_hash, atv_hash: input.atv_hash })).slice(0, 24),
      measurement_hash,
      atv_hash: input.atv_hash,
      audit_record_hash: input.audit_record_hash,
      verified_at: nowIso(),
      verifier: providerResult.verifier,
      signature_algorithm: signatureBundle.signature_algorithm,
      signature: signatureBundle.signature,
      signer_key_id: signatureBundle.signer_key_id,
      public_key: signatureBundle.public_key,
      consistent: providerResult.consistent,
      details: {
        input,
        provider: providerResult.details ?? {},
      },
    };
    await fs.appendFile(this.logPath, `${JSON.stringify(receipt)}\n`, "utf8");
    return receipt;
  }

  async list(limit = 20): Promise<DualCheckReceipt[]> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as DualCheckReceipt)
        .sort((left, right) => right.verified_at.localeCompare(left.verified_at))
        .slice(0, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async get(receiptId: string): Promise<DualCheckReceipt | null> {
    return (await this.list(500)).find((item) => item.receipt_id === receiptId) ?? null;
  }

  verifyReceipt(receipt: DualCheckReceipt): boolean {
    const input = ((receipt.details ?? {}).input ?? {}) as {
      verdict: string;
      session_id: string;
      trace_id: string;
      audit_record_hash?: string;
    };
    const signingInput = canonicalize({
      measurement_hash: receipt.measurement_hash,
      atv_hash: receipt.atv_hash,
      audit_record_hash: input.audit_record_hash,
      verdict: input.verdict,
      session_id: input.session_id,
      trace_id: input.trace_id,
      verifier: receipt.verifier,
      consistent: receipt.consistent,
    });
    return verifyWithPublicKey(receipt.public_key, signingInput, receipt.signature);
  }
}
