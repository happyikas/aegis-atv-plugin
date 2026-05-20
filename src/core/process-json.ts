import { spawn } from "node:child_process";

export interface JsonProcessOptions {
  command: string;
  args?: string[];
  input: unknown;
  timeoutMs?: number;
}

export async function runJsonProcess<T = unknown>(options: JsonProcessOptions): Promise<T> {
  const { command, args = [], input, timeoutMs = 5000 } = options;

  return new Promise<T>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`Process timed out: ${command}`));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Process failed: ${command} (${code}) ${stderr.trim()}`.trim()));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (error) {
        reject(new Error(`Invalid JSON from process ${command}: ${(error as Error).message}`));
      }
    });

    child.stdin.write(`${JSON.stringify(input)}\n`, "utf8");
    child.stdin.end();
  });
}
