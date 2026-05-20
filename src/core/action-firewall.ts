import { isHighRiskAction } from "./policy.js";
import { summarizeProvenance } from "./provenance.js";
import { buildTelemetryVector } from "./telemetry.js";
import { HeuristicJudgeProvider, type JudgeProvider } from "./judge-provider.js";
import type { IntegrityBaselineStore } from "./integrity.js";
import type {
  ActionEvaluation,
  ActionRequest,
  BlastRadius,
  FirewallVerdict,
  IntentDivergence,
} from "./types.js";

function classifyBlastRadius(request: ActionRequest): BlastRadius {
  switch (request.action) {
    case "read_file":
    case "search_memory":
      return "low";
    case "modify_calendar":
    case "send_email":
      return "medium";
    case "external_share":
      return "high";
    case "delete_file":
      return "critical";
    case "mcp_tool": {
      const payload = request.payload as {
        tool_name?: string;
        read_only?: boolean;
        side_effect?: boolean;
      };
      const toolName = (payload.tool_name ?? "").toLowerCase();
      if (payload.side_effect === true) {
        return "high";
      }
      if (payload.read_only === true) {
        return "low";
      }
      if (
        keywordHit(toolName, ["delete", "share", "send", "write", "update", "publish", "deploy"])
      ) {
        return "high";
      }
      return "medium";
    }
  }
}

function keywordHit(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function stricterVerdict(left: FirewallVerdict, right: FirewallVerdict): FirewallVerdict {
  const order: Record<FirewallVerdict, number> = {
    allow: 0,
    require_approval: 1,
    block: 2,
  };
  return order[right] > order[left] ? right : left;
}

export function detectIntentDivergence(request: ActionRequest, blastRadius: BlastRadius): IntentDivergence {
  const intent = (request.context?.declared_intent ?? "").toLowerCase();
  const reasons: string[] = [];

  if (!intent) {
    return {
      score: 0,
      threshold: 0.65,
      violated: false,
      reasons,
    };
  }

  const safeIntent =
    keywordHit(intent, ["summar", "review", "inspect", "read", "analy", "search", "audit"]) &&
    !keywordHit(intent, ["delete", "share", "email", "calendar", "send"]);
  const destructiveAction =
    blastRadius === "high" || blastRadius === "critical" || request.action === "send_email";
  let score = 0;

  if (safeIntent && destructiveAction) {
    score += 0.8;
    reasons.push("declared_intent_looks_observational_but_action_has_side_effects");
  }

  if (request.action === "external_share" && !keywordHit(intent, ["share", "send", "export"])) {
    score += 0.4;
    reasons.push("external_share_without_share_language_in_intent");
  }

  if (request.action === "delete_file" && !keywordHit(intent, ["delete", "remove", "purge"])) {
    score += 0.5;
    reasons.push("delete_file_without_delete_language_in_intent");
  }

  if (request.action === "mcp_tool") {
    const payload = request.payload as { tool_name?: string; side_effect?: boolean };
    const toolName = (payload.tool_name ?? "").toLowerCase();
    if (
      payload.side_effect === true &&
      !keywordHit(intent, ["share", "send", "write", "update", "deploy", "publish", "delete"])
    ) {
      score += 0.55;
      reasons.push("mcp_side_effect_without_matching_intent_language");
    }
    if (
      keywordHit(toolName, ["share", "send", "publish", "delete", "write"]) &&
      !keywordHit(intent, ["share", "send", "publish", "delete", "write"])
    ) {
      score += 0.35;
      reasons.push("mcp_tool_name_implies_side_effect_but_intent_does_not");
    }
  }

  return {
    score: Math.min(1, score),
    threshold: 0.65,
    violated: score >= 0.65,
    reasons,
  };
}

export class ActionFirewall {
  constructor(
    private readonly integrity?: IntegrityBaselineStore,
    private readonly judgeProvider: JudgeProvider = new HeuristicJudgeProvider(),
  ) {}

  async evaluate(request: ActionRequest): Promise<ActionEvaluation> {
    const blastRadius = classifyBlastRadius(request);
    const provenance = summarizeProvenance(request.context?.sources, blastRadius);
    const divergence = detectIntentDivergence(request, blastRadius);
    const integrity = this.integrity
      ? await this.integrity.check(request.context?.artifact_paths)
      : undefined;

    const signals = [
      ...provenance.risk_flags,
      ...divergence.reasons,
      ...(integrity?.mutations.map((mutation) => `artifact_${mutation.status}:${mutation.path}`) ?? []),
    ];

    if (request.action === "mcp_tool") {
      const payload = request.payload as {
        descriptor_drift?: boolean;
      };
      if (payload.descriptor_drift === true) {
        signals.push("mcp_descriptor_drift");
      }
    }

    let verdict: FirewallVerdict = "allow";
    if (
      (request.action === "mcp_tool" &&
        (request.payload as { descriptor_drift?: boolean }).descriptor_drift === true) ||
      (integrity && !integrity.clean) ||
      divergence.violated
    ) {
      verdict = "block";
    } else if (
      provenance.directive_precedence_violation ||
      provenance.escalated_by_lower_trust ||
      isHighRiskAction(request.action) ||
      blastRadius === "high" ||
      blastRadius === "critical"
    ) {
      verdict = "require_approval";
    }

    const judge = await this.judgeProvider.assess({
      request,
      blastRadius,
      provenance,
      divergence,
      integrity,
    });
    verdict = stricterVerdict(verdict, judge.recommendation);
    if (judge.reasons.length > 0) {
      signals.push(...judge.reasons.map((reason) => `judge:${reason}`));
    }

    const evaluationWithoutTelemetry = {
      verdict,
      blast_radius: blastRadius,
      signals,
      provenance,
      integrity,
      divergence,
      judge,
    };

    return {
      ...evaluationWithoutTelemetry,
      telemetry: buildTelemetryVector(request, evaluationWithoutTelemetry),
    };
  }
}
