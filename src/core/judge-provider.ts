import type {
  ActionRequest,
  BlastRadius,
  IntegrityCheckReport,
  IntentDivergence,
  JudgeAssessment,
  ProvenanceSummary,
} from "./types.js";
import { assessWithHeuristicJudge } from "./judge.js";
import { runJsonProcess } from "./process-json.js";

export interface JudgeProviderInput {
  request: ActionRequest;
  blastRadius: BlastRadius;
  provenance: ProvenanceSummary;
  divergence: IntentDivergence;
  integrity?: IntegrityCheckReport;
}

export interface JudgeProvider {
  assess(input: JudgeProviderInput): Promise<JudgeAssessment>;
}

export class HeuristicJudgeProvider implements JudgeProvider {
  async assess(input: JudgeProviderInput): Promise<JudgeAssessment> {
    return assessWithHeuristicJudge(
      input.request,
      input.blastRadius,
      input.provenance,
      input.divergence,
      input.integrity,
    );
  }
}

function parseArgs(raw?: string): string[] {
  return raw?.trim() ? raw.trim().split(/\s+/) : [];
}

export class CommandJudgeProvider implements JudgeProvider {
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly fallback: JudgeProvider = new HeuristicJudgeProvider(),
  ) {}

  async assess(input: JudgeProviderInput): Promise<JudgeAssessment> {
    try {
      const result = await runJsonProcess<JudgeAssessment>({
        command: this.command,
        args: this.args,
        input,
      });
      return result;
    } catch {
      const fallback = await this.fallback.assess(input);
      return {
        ...fallback,
        provider: "heuristic-judge-v1",
        reasons: [...fallback.reasons, "judge_provider_fallback"],
        advice: [...fallback.advice, "External judge provider was unavailable; using heuristic fallback."],
      };
    }
  }
}

export function createConfiguredJudgeProvider(env: NodeJS.ProcessEnv = process.env): JudgeProvider {
  const provider = env.AEGIS_JUDGE_PROVIDER?.trim().toLowerCase() ?? "heuristic";
  if (provider === "command" && env.AEGIS_JUDGE_COMMAND) {
    return new CommandJudgeProvider(env.AEGIS_JUDGE_COMMAND, parseArgs(env.AEGIS_JUDGE_ARGS));
  }
  return new HeuristicJudgeProvider();
}
