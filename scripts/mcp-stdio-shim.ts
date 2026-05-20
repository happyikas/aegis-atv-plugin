import fs from "node:fs/promises";
import readline from "node:readline";
import { buildAegisRuntime } from "../src/runtime/bootstrap.js";
import type { McpTransportRequest } from "../src/core/types.js";

async function main(): Promise<void> {
  const runtime = buildAegisRuntime();
  await fs.mkdir(runtime.workspaceRoot, { recursive: true });
  await fs.mkdir(runtime.dataRoot, { recursive: true });
  await runtime.mcpProxy.primeDescriptorBaseline().catch(() => {
    // Shim startup stays resilient when the upstream MCP server is temporarily unavailable.
  });

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const request = JSON.parse(trimmed) as McpTransportRequest;
    const response = await runtime.mcpProxy.handle(request, {
      tenant_id: process.env.AEGIS_TENANT_ID ?? "local-tenant",
      agent_id: process.env.AEGIS_AGENT_ID ?? "aid:mcp:stdio",
      session_id: process.env.AEGIS_SESSION_ID ?? "session-mcp-stdio",
      requested_by: process.env.AEGIS_REQUESTED_BY ?? "aid:mcp:stdio",
      declared_intent: process.env.AEGIS_DECLARED_INTENT,
      workspace: process.env.AEGIS_WORKSPACE,
      repo: process.env.AEGIS_REPO,
      model: process.env.AEGIS_MODEL,
      sandbox_mode: process.env.AEGIS_SANDBOX_MODE,
      approval_policy: process.env.AEGIS_APPROVAL_POLICY,
    });

    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
