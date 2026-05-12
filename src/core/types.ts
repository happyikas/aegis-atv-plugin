export type MemoryState = "draft" | "verified" | "committed" | "quarantined";

export type Sensitivity = "low" | "medium" | "high";

export type RetentionClass = "ephemeral" | "standard" | "long_term";

export interface AtsFields {
  created_at: string;
  last_accessed_at: string;
  verified_at?: string;
  expires_at?: string;
  checkpoint_at?: string;
}

export interface MemoryMetadata extends AtsFields {
  memory_id: string;
  source_path: string;
  aid: string;
  state: MemoryState;
  trust_score: number;
  sensitivity: Sensitivity;
  retention_class: RetentionClass;
  lineage: string[];
  checkpoint_refs: string[];
}

export interface MemoryRecord {
  metadata: MemoryMetadata;
  content: string;
}

export interface RecallOptions {
  mode?: "default" | "planner" | "retriever" | "verifier";
  includeSensitive?: boolean;
  query?: string;
  limit?: number;
}

export interface ApprovalItem {
  id: string;
  action: string;
  requested_at: string;
  requested_by: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  resolved_at?: string;
  resolved_by?: string;
}

export type ActionName =
  | "send_email"
  | "modify_calendar"
  | "delete_file"
  | "external_share"
  | "read_file"
  | "search_memory"
  | "mcp_tool";

export interface ActionRequest {
  action: ActionName;
  requested_by: string;
  payload: Record<string, unknown>;
  context?: ActionContext;
}

export interface ActionExecutionResult {
  executed: boolean;
  queued: boolean;
  action: string;
  output?: unknown;
  approval_id?: string;
  reason?: string;
  evaluation?: ActionEvaluation;
}

export interface CheckpointManifest {
  checkpoint_id: string;
  created_at: string;
  workspace_root: string;
  memory_files: Array<{
    source_path: string;
    checksum: string;
    metadata_path: string;
    copied: boolean;
  }>;
}

export type BlastRadius = "low" | "medium" | "high" | "critical";

export type FirewallVerdict = "allow" | "require_approval" | "block";

export type HumanOversight = "none" | "available" | "required";

export type InstructionSourceKind =
  | "user_prompt"
  | "system_prompt"
  | "developer_prompt"
  | "repo_file"
  | "plugin_manifest"
  | "skill_definition"
  | "tool_output"
  | "web_content"
  | "memory";

export type InstructionStance = "supporting" | "opposing" | "neutral";

export interface InstructionSourceInput {
  kind: InstructionSourceKind;
  label: string;
  locator?: string;
  content?: string;
  trust_level?: number;
  stance?: InstructionStance;
}

export interface ActionCostEstimate {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  estimated_usd?: number;
}

export interface McpToolPayload {
  server_name: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  read_only?: boolean;
  side_effect?: boolean;
}

export interface ActionContext {
  session_id?: string;
  step_id?: string;
  declared_intent?: string;
  human_oversight?: HumanOversight;
  sources?: InstructionSourceInput[];
  artifact_paths?: string[];
  cost?: ActionCostEstimate;
}

export interface InstructionSourceEvidence {
  id: string;
  kind: InstructionSourceKind;
  label: string;
  locator?: string;
  content_hash: string;
  trust_level: number;
  stance: InstructionStance;
}

export interface ProvenanceSummary {
  sources: InstructionSourceEvidence[];
  highest_trust_supporting: number;
  highest_trust_opposing: number;
  directive_precedence_violation: boolean;
  escalated_by_lower_trust: boolean;
  risk_flags: string[];
}

export interface IntegrityBaselineEntry {
  path: string;
  category: "instruction" | "plugin" | "runtime" | "config";
  sha256: string;
}

export interface IntegrityBaselineManifest {
  baseline_id: string;
  created_at: string;
  root: string;
  entries: IntegrityBaselineEntry[];
}

export interface IntegrityMutation {
  path: string;
  category: IntegrityBaselineEntry["category"];
  expected_sha256: string;
  actual_sha256?: string;
  status: "changed" | "missing";
}

export interface IntegrityCheckReport {
  baseline_id: string;
  checked_at: string;
  clean: boolean;
  checked_paths: string[];
  mutations: IntegrityMutation[];
}

export interface IntentDivergence {
  score: number;
  threshold: number;
  violated: boolean;
  reasons: string[];
}

export interface TelemetryVectorRecord {
  telemetry_id: string;
  schema_version: "ATV-2080-v1-demo";
  generated_at: string;
  agent_id: string;
  action: ActionName;
  verdict: FirewallVerdict;
  blast_radius: BlastRadius;
  signals: string[];
  vector: number[];
  vector_sha256: string;
}

export interface ActionEvaluation {
  verdict: FirewallVerdict;
  blast_radius: BlastRadius;
  signals: string[];
  provenance: ProvenanceSummary;
  integrity?: IntegrityCheckReport;
  divergence: IntentDivergence;
  telemetry: TelemetryVectorRecord;
}

export type TelemetryEventType =
  | "preview"
  | "blocked"
  | "queued_for_approval"
  | "executed"
  | "executed_from_approval";

export interface TelemetryEventRecord {
  telemetry_id: string;
  recorded_at: string;
  event_type: TelemetryEventType;
  action: ActionName;
  requested_by: string;
  verdict?: FirewallVerdict;
  blast_radius?: BlastRadius;
  approval_id?: string;
  signals: string[];
  declared_intent?: string;
  vector_sha256?: string;
  evaluation?: ActionEvaluation;
  result?: {
    executed: boolean;
    queued: boolean;
    reason?: string;
  };
}

export interface TelemetrySummary {
  telemetry_id: string;
  recorded_at: string;
  event_type: TelemetryEventType;
  action: ActionName;
  requested_by: string;
  verdict?: FirewallVerdict;
  blast_radius?: BlastRadius;
  signal_count: number;
  signals: string[];
  vector_sha256?: string;
}

export interface TelemetryComparison {
  telemetry_ids: string[];
  compared_at: string;
  shared_signals: string[];
  verdicts: Array<{
    telemetry_id: string;
    verdict?: FirewallVerdict;
    blast_radius?: BlastRadius;
    signal_count: number;
    vector_sha256?: string;
  }>;
}

export interface AuditRecord {
  event: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface McpInterceptRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: {
    requested_by: string;
    server_name: string;
    tool_name: string;
    arguments?: Record<string, unknown>;
    read_only?: boolean;
    side_effect?: boolean;
    context?: ActionContext;
  };
}

export interface McpInitializeRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "initialize";
  params?: {
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: {
      name: string;
      version?: string;
    };
  };
}

export interface McpToolsListRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "tools/list";
  params?: {
    cursor?: string;
  };
}

export interface McpToolsCallRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "tools/call";
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface McpResourcesListRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "resources/list";
  params?: {
    cursor?: string;
  };
}

export interface McpPromptsListRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "prompts/list";
  params?: {
    cursor?: string;
  };
}

export interface McpResourcesReadRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "resources/read";
  params: {
    uri: string;
  };
}

export interface McpPromptsGetRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "prompts/get";
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface McpPingRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "ping";
  params?: Record<string, unknown>;
}

export type McpTransportRequest =
  | McpInitializeRequest
  | McpToolsListRequest
  | McpToolsCallRequest
  | McpResourcesListRequest
  | McpPromptsListRequest
  | McpResourcesReadRequest
  | McpPromptsGetRequest
  | McpPingRequest;

export interface ReviewerAttestationRequest {
  artifact_id: string;
  primary: {
    reviewer_id: string;
    output: string;
    verdict: "approve" | "reject" | "needs_changes";
    sources?: InstructionSourceInput[];
  };
  secondary: {
    reviewer_id: string;
    output: string;
    verdict: "approve" | "reject" | "needs_changes";
    sources?: InstructionSourceInput[];
  };
}

export interface ReviewerAttestationResult {
  artifact_id: string;
  attested_at: string;
  trusted: boolean;
  primary_digest: string;
  secondary_digest: string;
  provenance_overlap: number;
  verdict_match: boolean;
  semantic_divergence: number;
  reasons: string[];
}
