import { z } from "zod";

export const actionNameSchema = z.enum([
  "send_email",
  "modify_calendar",
  "delete_file",
  "external_share",
  "read_file",
  "search_memory",
  "mcp_tool",
]);

export const instructionSourceKindSchema = z.enum([
  "user_prompt",
  "system_prompt",
  "developer_prompt",
  "repo_file",
  "plugin_manifest",
  "skill_definition",
  "tool_output",
  "web_content",
  "memory",
]);

export const instructionStanceSchema = z.enum(["supporting", "opposing", "neutral"]);

export const actionContextSchema = z
  .object({
    session_id: z.string().optional(),
    step_id: z.string().optional(),
    declared_intent: z.string().optional(),
    human_oversight: z.enum(["none", "available", "required"]).optional(),
    artifact_paths: z.array(z.string()).optional(),
    cost: z
      .object({
        input_tokens: z.number().nonnegative().optional(),
        output_tokens: z.number().nonnegative().optional(),
        reasoning_tokens: z.number().nonnegative().optional(),
        estimated_usd: z.number().nonnegative().optional(),
      })
      .optional(),
    sources: z
      .array(
        z.object({
          kind: instructionSourceKindSchema,
          label: z.string().min(1),
          locator: z.string().optional(),
          content: z.string().optional(),
          trust_level: z.number().min(0).max(100).optional(),
          stance: instructionStanceSchema.optional(),
        }),
      )
      .optional(),
  })
  .optional();

export const memoryStateSchema = z.enum([
  "draft",
  "verified",
  "committed",
  "quarantined",
]);

export const memoryMetadataSchema = z.object({
  memory_id: z.string(),
  source_path: z.string(),
  aid: z.string(),
  created_at: z.string(),
  last_accessed_at: z.string(),
  verified_at: z.string().optional(),
  expires_at: z.string().optional(),
  checkpoint_at: z.string().optional(),
  state: memoryStateSchema,
  trust_score: z.number().min(0).max(1),
  sensitivity: z.enum(["low", "medium", "high"]),
  retention_class: z.enum(["ephemeral", "standard", "long_term"]),
  lineage: z.array(z.string()),
  checkpoint_refs: z.array(z.string()),
});

export const approvalItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  requested_at: z.string(),
  requested_by: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(["pending", "approved", "rejected"]),
  resolved_at: z.string().optional(),
  resolved_by: z.string().optional(),
});

export const checkpointManifestSchema = z.object({
  checkpoint_id: z.string(),
  created_at: z.string(),
  workspace_root: z.string(),
  memory_files: z.array(
    z.object({
      source_path: z.string(),
      checksum: z.string(),
      metadata_path: z.string(),
      copied: z.boolean(),
    }),
  ),
});

export const recallRequestSchema = z.object({
  mode: z.enum(["default", "planner", "retriever", "verifier"]).optional(),
  includeSensitive: z.boolean().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const approvalRequestSchema = z.object({
  action: actionNameSchema,
  requested_by: z.string().default("aid:executor"),
  payload: z.record(z.unknown()).default({}),
});

export const sessionStartRequestSchema = z.object({
  session_id: z.string().optional(),
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().min(1),
  codex_surface: z.string().default("codex-cli"),
  workspace: z.string().min(1),
  repo: z.string().optional(),
  model: z.string().optional(),
  sandbox_mode: z.string().optional(),
  approval_policy: z.string().optional(),
});

export const userPromptEventRequestSchema = z.object({
  session_id: z.string().min(1),
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().min(1),
  prompt: z.string().min(1),
  declared_intent: z.string().optional(),
  source_locator: z.string().optional(),
});

export const toolDecisionRequestSchema = z.object({
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().optional(),
  session_id: z.string().min(1),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  parent_span_id: z.string().optional(),
  codex_surface: z.string().default("codex-cli"),
  workspace: z.string().optional(),
  repo: z.string().optional(),
  model: z.string().optional(),
  sandbox_mode: z.string().optional(),
  approval_policy: z.string().optional(),
  action: actionNameSchema,
  requested_by: z.string().default("aid:executor"),
  payload: z.record(z.unknown()).default({}),
  context: actionContextSchema,
});

export const toolResultEventRequestSchema = z.object({
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().min(1),
  session_id: z.string().min(1),
  trace_id: z.string().min(1),
  span_id: z.string().optional(),
  action: actionNameSchema,
  status: z.enum(["success", "error", "blocked", "queued"]),
  duration_ms: z.number().int().nonnegative().optional(),
  output: z.string().optional(),
  output_hash: z.string().optional(),
  approval_id: z.string().optional(),
});

export const permissionRequestEventRequestSchema = z.object({
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().min(1),
  session_id: z.string().min(1),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  action: actionNameSchema,
  requested_by: z.string().default("aid:executor"),
  payload: z.record(z.unknown()).default({}),
  codex_reason: z.string().optional(),
  proposed_scope: z.string().optional(),
});

export const stopEventRequestSchema = z.object({
  tenant_id: z.string().default("local-tenant"),
  agent_id: z.string().min(1),
  session_id: z.string().min(1),
  trace_id: z.string().optional(),
  conversation_id: z.string().optional(),
  result_summary: z.string().optional(),
  token_count: z.number().int().nonnegative().optional(),
  status: z.enum(["completed", "cancelled", "error"]).optional(),
});

export const sendEmailPayloadSchema = z.object({
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export const modifyCalendarPayloadSchema = z.object({
  event: z.string().min(1),
  date: z.string().optional(),
  calendar_id: z.string().optional(),
});

export const deleteFilePayloadSchema = z.object({
  path: z.string().min(1),
});

export const externalSharePayloadSchema = z.object({
  target: z.string().min(1),
  resource: z.string().optional(),
});

export const readFilePayloadSchema = z.object({
  path: z.string().min(1),
});

export const searchMemoryPayloadSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});

export const mcpToolPayloadSchema = z.object({
  server_name: z.string().min(1),
  tool_name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  read_only: z.boolean().optional(),
  side_effect: z.boolean().optional(),
  descriptor_hash: z.string().optional(),
  descriptor_baseline_hash: z.string().optional(),
  descriptor_drift: z.boolean().optional(),
  tool_count: z.number().int().nonnegative().optional(),
});

export const actionInterceptRequestSchema = z.object({
  action: actionNameSchema,
  requested_by: z.string().default("aid:executor"),
  payload: z.record(z.unknown()).default({}),
  context: actionContextSchema,
});

export const integrityArtifactRequestSchema = z.object({
  artifact_paths: z.array(z.string()).optional(),
});

export const telemetryCompareRequestSchema = z.object({
  telemetry_ids: z.array(z.string().min(1)).min(2).max(5),
});

export const mcpInterceptRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.object({
    requested_by: z.string().default("aid:mcp:client"),
    server_name: z.string().min(1),
    tool_name: z.string().min(1),
    arguments: z.record(z.unknown()).optional(),
    read_only: z.boolean().optional(),
    side_effect: z.boolean().optional(),
    context: actionContextSchema,
  }),
});

const mcpJsonRpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
});

export const mcpInitializeRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("initialize"),
  params: z
    .object({
      protocolVersion: z.string().optional(),
      capabilities: z.record(z.unknown()).optional(),
      clientInfo: z
        .object({
          name: z.string().min(1),
          version: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const mcpToolsListRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("tools/list"),
  params: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
});

export const mcpToolsCallRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string().min(1),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export const mcpResourcesListRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("resources/list"),
  params: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
});

export const mcpPromptsListRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("prompts/list"),
  params: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
});

export const mcpResourcesReadRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("resources/read"),
  params: z.object({
    uri: z.string().min(1),
  }),
});

export const mcpResourceTemplatesListRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("resources/templates/list"),
  params: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
});

export const mcpPromptsGetRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("prompts/get"),
  params: z.object({
    name: z.string().min(1),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export const mcpPingRequestSchema = mcpJsonRpcSchema.extend({
  method: z.literal("ping"),
  params: z.record(z.unknown()).optional(),
});

export const mcpTransportRequestSchema = z.discriminatedUnion("method", [
  mcpInitializeRequestSchema,
  mcpToolsListRequestSchema,
  mcpToolsCallRequestSchema,
  mcpResourcesListRequestSchema,
  mcpPromptsListRequestSchema,
  mcpResourcesReadRequestSchema,
  mcpResourceTemplatesListRequestSchema,
  mcpPromptsGetRequestSchema,
  mcpPingRequestSchema,
]);

export const reviewerAttestationRequestSchema = z.object({
  artifact_id: z.string().min(1),
  primary: z.object({
    reviewer_id: z.string().min(1),
    output: z.string().min(1),
    verdict: z.enum(["approve", "reject", "needs_changes"]),
    sources: z
      .array(
        z.object({
          kind: instructionSourceKindSchema,
          label: z.string().min(1),
          locator: z.string().optional(),
          content: z.string().optional(),
          trust_level: z.number().min(0).max(100).optional(),
          stance: instructionStanceSchema.optional(),
        }),
      )
      .optional(),
  }),
  secondary: z.object({
    reviewer_id: z.string().min(1),
    output: z.string().min(1),
    verdict: z.enum(["approve", "reject", "needs_changes"]),
    sources: z
      .array(
        z.object({
          kind: instructionSourceKindSchema,
          label: z.string().min(1),
          locator: z.string().optional(),
          content: z.string().optional(),
          trust_level: z.number().min(0).max(100).optional(),
          stance: instructionStanceSchema.optional(),
        }),
      )
      .optional(),
  }),
});

export const restoreRequestSchema = z.object({
  checkpoint_id: z.string(),
  restore_files: z.boolean().default(false),
  force: z.boolean().default(false),
});

export const restoreByParamRequestSchema = z.object({
  restore_files: z.boolean().default(false),
  force: z.boolean().default(false),
});

export function parseActionPayload(action: z.infer<typeof actionNameSchema>, payload: Record<string, unknown>) {
  switch (action) {
    case "send_email":
      return sendEmailPayloadSchema.parse(payload);
    case "modify_calendar":
      return modifyCalendarPayloadSchema.parse(payload);
    case "delete_file":
      return deleteFilePayloadSchema.parse(payload);
    case "external_share":
      return externalSharePayloadSchema.parse(payload);
    case "read_file":
      return readFilePayloadSchema.parse(payload);
    case "search_memory":
      return searchMemoryPayloadSchema.parse(payload);
    case "mcp_tool":
      return mcpToolPayloadSchema.parse(payload);
  }
}
