import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandJudgeProvider, HeuristicJudgeProvider } from "../../core/judge-provider.js";
import type { JudgeProviderInput } from "../../core/judge-provider.js";

const tempDirs: string[] = [];

function sampleInput(): JudgeProviderInput {
  return {
    request: {
      action: "read_file",
      requested_by: "aid:executor",
      payload: { path: "MEMORY.md" },
      context: { declared_intent: "inspect memory only" },
    },
    blastRadius: "low",
    provenance: {
      sources: [],
      highest_trust_supporting: 100,
      highest_trust_opposing: 0,
      directive_precedence_violation: false,
      escalated_by_lower_trust: false,
      risk_flags: [],
    },
    divergence: {
      score: 0,
      threshold: 0.65,
      violated: false,
      reasons: [],
    },
  };
}

describe("judge providers", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("returns heuristic advice by default", async () => {
    const provider = new HeuristicJudgeProvider();
    const result = await provider.assess(sampleInput());
    expect(result.provider).toBe("heuristic-judge-v1");
  });

  it("supports an external command-based judge provider", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-judge-cmd-"));
    tempDirs.push(dir);
    const script = path.join(dir, "judge.mjs");
    await fs.writeFile(script, `
      process.stdin.setEncoding('utf8');
      let raw = '';
      process.stdin.on('data', (chunk) => raw += chunk);
      process.stdin.on('end', () => {
        JSON.parse(raw);
        process.stdout.write(JSON.stringify({
          provider: 'heuristic-judge-v1',
          score: 0.91,
          confidence: 0.88,
          recommendation: 'block',
          ambiguous: false,
          reasons: ['external_provider_rule'],
          advice: ['Block this action.']
        }));
      });
    `, 'utf8');
    const provider = new CommandJudgeProvider(process.execPath, [script]);
    const result = await provider.assess(sampleInput());
    expect(result.recommendation).toBe("block");
    expect(result.reasons).toContain("external_provider_rule");
  });
});
