import { spawn } from "node:child_process";
import { parseActionPayload } from "../core/schema.js";
import type { ActionExecutionResult, ActionRequest } from "../core/types.js";

export interface OpenClawBridge {
  invoke(action: ActionRequest["action"], payload: Record<string, unknown>): Promise<unknown>;
}

export class InMemoryOpenClawBridge implements OpenClawBridge {
  async invoke(action: ActionRequest["action"], payload: Record<string, unknown>): Promise<unknown> {
    return {
      bridge: "in-memory-openclaw",
      action,
      payload,
      invoked_at: new Date().toISOString(),
    };
  }
}

export class CommandOpenClawBridge implements OpenClawBridge {
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly cwd?: string,
  ) {}

  async invoke(action: ActionRequest["action"], payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`OpenClaw bridge command failed with code ${code}: ${stderr.trim()}`));
          return;
        }

        try {
          const parsed = stdout.trim().length > 0 ? JSON.parse(stdout) : null;
          resolve(parsed);
        } catch (error) {
          reject(
            new Error(
              `OpenClaw bridge returned invalid JSON: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      });

      child.stdin.write(JSON.stringify({ action, payload }));
      child.stdin.end();
    });
  }
}

export function createConfiguredOpenClawBridge(
  env: NodeJS.ProcessEnv = process.env,
): OpenClawBridge {
  const command = env.OPENCLAW_BRIDGE_COMMAND;
  if (!command) {
    return new InMemoryOpenClawBridge();
  }

  const args = env.OPENCLAW_BRIDGE_ARGS ? JSON.parse(env.OPENCLAW_BRIDGE_ARGS) : [];
  if (!Array.isArray(args) || !args.every((value) => typeof value === "string")) {
    throw new Error("OPENCLAW_BRIDGE_ARGS must be a JSON array of strings");
  }

  return new CommandOpenClawBridge(command, args, env.OPENCLAW_BRIDGE_CWD);
}

export async function executeViaOpenClawBridge(
  bridge: OpenClawBridge,
  request: ActionRequest,
): Promise<ActionExecutionResult["output"]> {
  const validatedPayload = parseActionPayload(request.action, request.payload);
  return bridge.invoke(request.action, validatedPayload);
}
