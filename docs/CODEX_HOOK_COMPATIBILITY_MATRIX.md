# Codex Hook Compatibility Matrix

This matrix defines the Codex hook payload compatibility contract for the Aegis ATV Codex plug-in MVP.

## Supported events

| Event | Required fields | Optional fields | Adapter behavior |
|---|---|---|---|
| `SessionStart` | none beyond `event` | `session_id`, `workspace`, `repo`, `model`, `sandbox_mode`, `approval_policy` | Creates a session with inferred workspace and generated fallback session id when needed |
| `UserPromptSubmit` | `prompt` preferred | `session_id`, `declared_intent`, `source_locator`, `workspace` | Records prompt provenance; falls back to `prompt-unavailable` if prompt text is absent |
| `PreToolUse` | `tool_name` or `tool` preferred | `session_id`, `trace_id`, `command`, `cwd`, `declared_intent`, `model`, `sandbox_mode` | Builds a pre-execution decision request and infers `action` from tool and command shape |
| `PermissionRequest` | none beyond `event` | `session_id`, `trace_id`, `tool_name`, `command`, `reason`, `scope` | Creates an approval request with best-effort action inference |
| `PostToolUse` | none beyond `event` | `session_id`, `trace_id`, `tool_name`, `command`, `status`, `duration_ms`, `output` | Records the tool result and hashes output if available |
| `Stop` | none beyond `event` | `session_id`, `trace_id`, `conversation_id`, `summary`, `token_count`, `status` | Finalizes a session summary with safe defaults |

## Fallback behavior

- Missing `session_id`: generates a deterministic local fallback session id.
- Missing `trace_id`: generates a random trace id.
- Missing `workspace` or `cwd`: falls back to `process.cwd()`.
- Missing `tool_name`: uses `unknown`.
- Invalid or empty stdin: exits successfully and emits no payload.

## Outage policy

`AEGIS_HOOK_OUTAGE_POLICY` supports:

- `fail_open`
- `require_approval`
- `fail_closed`

Default behavior is `fail_open`.

## Important limitation

Desktop hook payload capture remains a best-effort visibility layer in the tested Codex desktop build. The primary enforcement point for customer and pilot operation remains the `Aegis MCP proxy`.
