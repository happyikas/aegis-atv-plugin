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

export interface SessionRecord {
  session_id: string;
  tenant_id: string;
  agent_id: string;
  codex_surface: string;
  workspace: string;
  repo?: string;
  model?: string;
  sandbox_mode?: string;
  approval_policy?: string;
  started_at: string;
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
  descriptor_hash?: string;
  descriptor_baseline_hash?: string;
  descriptor_drift?: boolean;
  tool_count?: number;
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

export interface JudgeAssessment {
  provider: "heuristic-judge-v1";
  score: number;
  confidence: number;
  recommendation: FirewallVerdict;
  ambiguous: boolean;
  reasons: string[];
  advice: string[];
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
  judge?: JudgeAssessment;
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
  sequence: number;
  event: string;
  timestamp: string;
  prev_record_hash?: string;
  record_hash: string;
  signature: string;
  signature_algorithm?: "ed25519";
  signer_key_id?: string;
  public_key?: string;
  details: Record<string, unknown>;
}

export interface AtvLiteRecord {
  schema_version: "ATV-Lite-v1";
  tenant_id: string;
  agent_id: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  codex_surface: string;
  workspace?: string;
  repo?: string;
  model?: string;
  sandbox_mode?: string;
  approval_policy?: string;
  declared_intent?: string;
  declared_intent_hash?: string;
  action: {
    action_type: ActionName;
    tool_handle: string;
    payload_hash: string;
    normalized_payload: Record<string, unknown>;
    blast_radius: BlastRadius;
  };
  provenance: {
    source_count: number;
    highest_trust_supporting: number;
    highest_trust_opposing: number;
    directive_precedence_violation: boolean;
    escalated_by_lower_trust: boolean;
    risk_flags: string[];
  };
  verification: {
    verdict: FirewallVerdict;
    signals: string[];
    divergence_score: number;
    divergence_violated: boolean;
    integrity_clean?: boolean;
  };
  cost: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    estimated_usd?: number;
  };
  result?: {
    status: "success" | "error" | "blocked" | "queued";
    result_hash?: string;
    duration_ms?: number;
    approval_id?: string;
  };
  commitment: {
    atv_hash: string;
    sequence?: number;
    audit_record_hash?: string;
    signature?: string;
    signature_algorithm?: "ed25519";
    signer_key_id?: string;
    intent_id?: string;
    dual_check_receipt_id?: string;
    dual_check_consistent?: boolean;
  };
  generated_at: string;
}

export type CollectedEventType =
  | "session_start"
  | "user_prompt"
  | "tool_decision"
  | "tool_result"
  | "permission_request"
  | "session_stop";

export interface CollectedEventRecord {
  event_id: string;
  event_type: CollectedEventType;
  recorded_at: string;
  tenant_id?: string;
  agent_id?: string;
  session_id?: string;
  trace_id?: string;
  span_id?: string;
  payload_hash: string;
  atv_hash?: string;
  audit_sequence?: number;
  data: Record<string, unknown>;
}

export interface SessionStartRequest {
  session_id?: string;
  tenant_id?: string;
  agent_id: string;
  codex_surface?: string;
  workspace: string;
  repo?: string;
  model?: string;
  sandbox_mode?: string;
  approval_policy?: string;
}

export interface UserPromptEventRequest {
  session_id: string;
  tenant_id?: string;
  agent_id: string;
  prompt: string;
  declared_intent?: string;
  source_locator?: string;
}

export interface ToolDecisionRequest {
  tenant_id?: string;
  agent_id?: string;
  session_id: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  codex_surface?: string;
  workspace?: string;
  repo?: string;
  model?: string;
  sandbox_mode?: string;
  approval_policy?: string;
  action: ActionName;
  requested_by?: string;
  payload: Record<string, unknown>;
  context?: ActionContext;
}

export interface ToolResultEventRequest {
  tenant_id?: string;
  agent_id: string;
  session_id: string;
  trace_id: string;
  span_id?: string;
  action: ActionName;
  status: "success" | "error" | "blocked" | "queued";
  duration_ms?: number;
  output?: string;
  output_hash?: string;
  approval_id?: string;
}

export interface PermissionRequestEventRequest {
  tenant_id?: string;
  agent_id: string;
  session_id: string;
  trace_id?: string;
  span_id?: string;
  action: ActionName;
  requested_by?: string;
  payload: Record<string, unknown>;
  codex_reason?: string;
  proposed_scope?: string;
}

export interface StopEventRequest {
  tenant_id?: string;
  agent_id: string;
  session_id: string;
  trace_id?: string;
  conversation_id?: string;
  result_summary?: string;
  token_count?: number;
  status?: "completed" | "cancelled" | "error";
}

export interface CodexHookSessionStartEvent extends SessionStartRequest {
  event: "SessionStart";
}

export interface CodexHookUserPromptEvent extends UserPromptEventRequest {
  event: "UserPromptSubmit";
}

export interface CodexHookPreToolUseEvent extends ToolDecisionRequest {
  event: "PreToolUse";
}

export interface CodexHookPermissionRequestEvent extends PermissionRequestEventRequest {
  event: "PermissionRequest";
}

export interface CodexHookPostToolUseEvent extends ToolResultEventRequest {
  event: "PostToolUse";
}

export interface CodexHookStopEvent extends StopEventRequest {
  event: "Stop";
}

export type CodexHookEvent =
  | CodexHookSessionStartEvent
  | CodexHookUserPromptEvent
  | CodexHookPreToolUseEvent
  | CodexHookPermissionRequestEvent
  | CodexHookPostToolUseEvent
  | CodexHookStopEvent;

export interface CodexHookOutcome {
  event: CodexHookEvent["event"];
  continue: boolean;
  event_id?: string;
  verdict?: FirewallVerdict;
  telemetry_id?: string;
  approval_id?: string;
  detail?: string;
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

export interface McpResourceTemplatesListRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "resources/templates/list";
  params?: {
    cursor?: string;
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

export interface McpProxyContext {
  tenant_id?: string;
  agent_id: string;
  session_id: string;
  requested_by?: string;
  declared_intent?: string;
  workspace?: string;
  repo?: string;
  model?: string;
  sandbox_mode?: string;
  approval_policy?: string;
  read_only?: boolean;
  side_effect?: boolean;
  sources?: InstructionSourceInput[];
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
  | McpResourceTemplatesListRequest
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
