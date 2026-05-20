import fs from "node:fs/promises";
import { CodexHooksAdapter } from "../src/adapters/codex-hooks.js";
import { buildAegisRuntime } from "../src/runtime/bootstrap.js";
import type { CodexHookEvent } from "../src/core/types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function loadEvent(): Promise<CodexHookEvent | null> {
  const raw = await readStdin();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CodexHookEvent;
  } catch {
    return null;
  }
}

async function ensureWorkspace(runtime: ReturnType<typeof buildAegisRuntime>) {
  await fs.mkdir(runtime.workspaceRoot, { recursive: true });
  await fs.mkdir(runtime.dataRoot, { recursive: true });
  await runtime.workspace.scan().catch(() => {
    // Hook scripts should still function even if the workspace is not fully initialized yet.
  });
  await runtime.integrity.createBaseline().catch(() => {
    // Baseline creation remains best-effort in local hook mode.
  });
}

async function main(): Promise<void> {
  const event = await loadEvent();
  if (!event) {
    return;
  }
  const runtime = buildAegisRuntime();
  await ensureWorkspace(runtime);
  const adapter = new CodexHooksAdapter(runtime.controlPlane);
  const outcome = await adapter.handle(event);
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      suppressed_hook_error: true,
      detail: message,
    })}\n`,
  );
});
