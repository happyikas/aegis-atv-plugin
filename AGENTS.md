# AGENTS.md — Aegis ATV for Codex MVP

This file is the execution handbook for Codex or any AI coding agent working on the **Aegis ATV for Codex MVP** repository. It is intentionally concise enough to fit Codex project-instruction limits while preserving implementation-critical requirements.

## 0. Mission

Build **Aegis for Codex MVP**: a software-first trust layer that turns Codex CLI/IDE/devcontainer coding actions into **verifiable, replayable, policy-controlled agent transactions**.

**Positioning:** Codex accelerates software engineering. Aegis makes Codex safe enough for regulated enterprise engineering.

## 1. Core Product Hypothesis

Enterprise adoption of autonomous coding agents is constrained less by coding capability and more by trust, replayability, policy control, auditability, and recovery. The MVP must prove that Aegis can:

1. Intercept Codex lifecycle events and MCP tool calls.
2. Classify risky tool invocations before execution.
3. Record signed ATV-Lite action evidence.
4. Detect instruction/configuration mutation such as `AGENTS.md` or `.codex/config.toml` drift.
5. Preserve replayable traces for incident RCA and audit export.
6. Measure operational trust KPIs for customer pilots.

## 2. Scope Rules

### In scope for MVP

- Codex CLI / IDE / local devcontainer integration.
- Codex Hooks Adapter for lifecycle events.
- MCP runtime proxy for JSON-RPC tool invocation gating.
- ATV-Lite JSON event schema, not full ATV-2080 tensor generation.
- Software-only T2 implementation with T3 Context Memory / CXL SSD adapter interface stub.
- Action Firewall using deterministic rules plus lightweight scoring.
- Write-Ahead Intent Log in software.
- Config Baseline Monitor for `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json`, MCP configs, tool manifests, skills, and plugin manifests.
- Instruction provenance records with source type, trust level, content hash, and origin locator.
- Basic Context-Action Semantic Divergence Detection.
- Replay service and evidence export.
- KPI dashboard.

### Out of scope for MVP

- Codex Cloud native enforcement inside OpenAI-managed runtime.
- Full CXL SSD firmware or on-device sLLM inference.
- Full ATV-2080 tensor construction.
- Cross-tenant privacy aggregation.
- Full reviewer-agent ensemble beyond optional two-agent cross-check.
- Production-grade hardware attestation.

## 3. Non-Negotiable Development Principles

1. **Default to evidence before enforcement.** Start in `OBSERVE_ONLY` or `ALLOW_WITH_RECORD`, then enable `REQUIRE_APPROVAL` or `BLOCK` for high-confidence policy classes.
2. **Never store raw source code, raw prompts, or raw tool outputs by default.** Store hashes, lengths, classifications, redacted snippets, and commitments.
3. **Every action record must be replayable without re-executing side effects.** Replay reads persisted intent, decision, outcome, approval, and hash-chain records only.
4. **Every security-sensitive decision must produce an audit record.** Include sequence number, record hash, signature, policy version, and violation signals.
5. **Hooks are not hard enforcement by themselves.** Use hooks for event capture and soft gating; use MCP proxy, managed config, and devcontainer controls for stronger enforcement.
6. **Design all T2 software schemas so they can map to T3 hardware-backed ATV / Context Memory later.** Do not create an incompatible schema fork.
7. **Keep developer friction low.** Excessive false positives are a product failure.

## 4. Target Architecture

```text
Codex CLI / IDE / Devcontainer
   |
   |-- Codex Hooks Adapter ---------------> Aegis API
   |       SessionStart / UserPromptSubmit / PreToolUse /
   |       PermissionRequest / PostToolUse / Stop
   |
   |-- MCP Client ------------------------> Aegis MCP Proxy -----> MCP Servers
   |                                           |
   v                                           v
Action Firewall -----------------------> Policy Engine
   |
   +--> ATV-Lite Store
   +--> Write-Ahead Intent Log
   +--> Approval Service
   +--> Config Baseline Monitor
   +--> Replay Service
   +--> KPI Dashboard
   +--> Context Memory Adapter Stub
```

## 5. Repository Structure to Create

```text
aegis-codex-mvp/
  apps/
    api/                  # REST API, sessions, decisions, approvals, replay
    mcp-proxy/            # HTTP MCP proxy + stdio shim
    codex-hooks/          # Hook scripts invoked by Codex lifecycle events
    dashboard/            # Replay, approvals, KPI UI
    worker/               # Async replay export, baseline scans, policy tests
  packages/
    schemas/              # ATV-Lite, decision, provenance, audit schemas
    policy/               # Rule engine, DSL, policy packs
    crypto/               # Canonicalization, hash, signature, Merkle utilities
    context-memory-adapter/# T2 local stub, T3 hardware interface later
    redaction/            # Prompt/code/tool-output redaction helpers
  test-scenarios/         # Security scenarios S1-S8
  deploy/
    docker-compose.yml
    helm/
  docs/
    architecture.md
    codex-integration.md
    policy-authoring.md
    pilot-runbook.md
```

## 6. Primary Modules

### 6.1 Codex Hooks Adapter

Implement command scripts that transform Codex lifecycle events into Aegis API calls.

Required event handling:

| Hook Event | Aegis behavior |
|---|---|
| `SessionStart` | Create session; verify repo/config baseline. |
| `UserPromptSubmit` | Create prompt provenance record; run secret/PII precheck; store redacted/hash-only evidence. |
| `PreToolUse` | Create pre-execution tool decision request. |
| `PermissionRequest` | Route approval request to Aegis approval service. |
| `PostToolUse` | Store outcome hash, duration, status, redacted output metadata. |
| `Stop` | Finalize trace, close replay package, update KPIs. |

The adapter must tolerate Codex hook concurrency. Do not assume a single hook can prevent all others from starting.

### 6.2 Aegis MCP Proxy

Build the strongest MVP enforcement point here.

Required request flow:

1. Receive MCP JSON-RPC request from Codex MCP client.
2. Canonicalize `server_id + tool_name + arguments`.
3. Attach `agent_id`, `session_id`, `declared_intent`, and `provenance_manifest`.
4. Call `POST /v1/tool/decision`.
5. If `ALLOW`, forward to real MCP server.
6. If `REQUIRE_APPROVAL`, create approval request and either hold request or return MCP-compatible pending/error response.
7. If `BLOCK`, do not forward; return MCP-compatible JSON-RPC error with `verdict_record_id`.
8. Attach audit metadata to response or sidecar record.

### 6.3 ATV-Lite Assembler

Create structured JSON records first. Do not build full 2,080-dimension tensor in MVP.

ATV-Lite must include:

- `tenant_id`, `agent_id`, `session_id`, `trace_id`, `span_id`, `parent_span_id`
- `codex_surface`, workspace, repo, model, sandbox mode, approval policy
- declared intent and intent hash
- tool kind, handle, command/args hash, normalized args
- blast-radius classification
- provenance manifest
- policy checks and final verdict
- cost fields: tokens if available, duration, retry count, cache hit
- result status, result hash, side-effect receipt if available
- commitment: canonical record hash, signature, Merkle parent, sequence number

### 6.4 Action Firewall

Start with deterministic rules and a lightweight score. Add model-based scoring only after shadow data exists.

Verdicts:

- `OBSERVE_ONLY`
- `ALLOW`
- `ALLOW_WITH_RECORD`
- `REQUIRE_APPROVAL`
- `BLOCK`
- `QUARANTINE`

High-priority rules:

| Risk input | MVP rule |
|---|---|
| Destructive shell | `rm -rf`, recursive chmod/chown, `git push --force`, unbounded `DROP`, `TRUNCATE`, `DELETE`. |
| Network/exfiltration | `curl`, `wget`, `nc`, `scp`, `rsync`, suspicious URL, base64 payload, external POST. |
| Secret access | `.env`, cloud credentials, token/key files, `*_KEY`, `*_TOKEN`. |
| Workspace boundary | Any path outside allowed workspace. |
| MCP descriptor drift | Runtime descriptor hash differs from baseline. |
| Config mutation | Runtime artifact hash differs from signed baseline. |
| Intent-action divergence | Declared read/test/summarize intent but realized external write/delete/send action. |
| Loops | Same tool + args repeated above threshold. |
| Cost forecast | Forecasted cost-to-completion exceeds policy. |

### 6.5 Config Baseline Monitor

Create and verify signed baseline manifests.

Covered artifacts:

- `AGENTS.md`
- `AGENTS.override.md`
- `CLAUDE.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- MCP server config
- MCP manifests / tool schemas
- skill folders / plugin manifests

CLI expectations:

```bash
aegis baseline create --repo . --sign --out .aegis/baseline.json
aegis baseline verify --repo . --baseline .aegis/baseline.json
```

Mutation response:

- Write/destructive/network actions: `BLOCK` or `REQUIRE_APPROVAL`.
- Read-only actions: configurable `ALLOW_WITH_RECORD` or `REQUIRE_APPROVAL`.
- Re-attestation must be signed, TTL-bound, and auditable.

### 6.6 Instruction Provenance and Semantic Divergence

MVP must implement deterministic provenance, not full causal attention tracing.

Instruction source enum:

```text
direct-user-prompt
system-developer-prompt
session-developer-configuration-file
repository-ingested-agent-instruction-file
tool-invocation-output
web-retrieved-content
prior-agent-output
unknown-origin
```

Trust-level convention: lower number means higher trust.

Basic detectors:

- **ISPM:** source type, hash, origin locator, trust level.
- **DPAD:** lower-trust source materially supports or escalates high-risk action against higher-trust constraints.
- **CASDD:** declared intent class conflicts with realized action class or blast-radius escalation.
- **RAAM optional:** code/security review output requires corroboration by a second agent under disjoint provenance.

### 6.7 Replay Service

Replay must never re-execute external side effects.

Replay algorithm:

1. Select incident/action window by `trace_id` or `incident_id`.
2. Verify record signatures and hash chain.
3. Order records by sequence number and timestamp.
4. Reconstruct `intent -> decision -> approval -> execution -> outcome` timeline.
5. Re-evaluate stored policy version when possible.
6. Emit signed replay attestation.
7. Package RCA input bundle for Aegis Doctor.

## 7. API Contract

### 7.1 Required endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/sessions/start` | POST | Create Codex session and run baseline check. |
