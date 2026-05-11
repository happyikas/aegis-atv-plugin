# PROJECT_NOTES.md
## AegIsDATA-lite for macOS + OpenClaw MVP

### Purpose
Build a software-first MVP that wraps an existing OpenClaw deployment on a Mac mini with a local memory/action/recovery harness.

This is not an SSD firmware project yet.
This MVP should work as a local macOS service layered on top of OpenClaw.

---

## 1. Product concept

AegIsDATA-lite for macOS is a local harness layer for OpenClaw that adds:

- memory harness
- action harness
- recovery harness

OpenClaw remains the main agent runtime.
AegIsDATA-lite wraps its workspace, memory files, and tool/MCP execution paths.

---

## 2. Problem being solved

OpenClaw is useful on a Mac mini, but as usage grows, the following problems appear:

- memory accumulates without strong trust/state control
- old or low-quality context can be reused
- tool outputs may be used before verification
- risky actions need approval
- there is no simple checkpoint/rollback model
- incident replay and auditability are weak

The MVP should make OpenClaw safer and more controllable without heavily changing OpenClaw core.

---

## 3. Core design principles

1. Do not heavily modify OpenClaw core.
2. Use wrapper architecture around the OpenClaw workspace.
3. Keep all state local.
4. Use plain files and JSON, not a database.
5. Make the design easy to extend later into a stronger AegIsDATA product.
6. Prefer deterministic control under a simple prompt-friendly interface.

---

## 4. Environment assumptions

### Target machine
- Mac mini
- macOS
- local OpenClaw installation already in use

### OpenClaw assumptions
- OpenClaw stores memory as plain Markdown files in its workspace
- likely tracked files include:
  - MEMORY.md
  - memory/*.md
  - DREAMS.md
- MCP/tool integrations may exist and should be wrapped, not deeply rewritten

### macOS assumptions
Use native macOS security wherever possible:
- FileVault
- Secure Enclave-backed keychain if useful later
- launchd daemon model
- local filesystem watcher

---

## 5. MVP scope

### Must-have features
- AID tagging
- ATS timestamping
- sidecar metadata
- memory state machine
- checkpoint / restore
- approval queue for high-risk actions

### Explicitly in scope
- local daemon
- local REST API
- workspace scanner
- file watcher
- audit log
- recall filter
- simple approval queue
- sidecar metadata files
- local snapshots

### Explicitly out of scope for MVP v1
- SSD firmware changes
- custom APFS kernel work
- distributed architecture
- cloud backend
- database
- full FHE
- heavy UI
- full Supermemory implementation
- replacing OpenClaw runtime

---

## 6. Required architecture

### Layer 1. OpenClaw runtime
Existing agent runtime remains intact.

### Layer 2. AegIsDATA-lite harness
New components:
- AID manager
- ATS manager
- ATMU-lite
- memory indexer
- recall filter
- policy engine
- checkpoint manager
- approval queue
- audit logger

### Layer 3. macOS integration
- launchd-compatible daemon
- file watcher
- local REST service
- filesystem-safe snapshot storage

### Layer 4. local storage
- internal SSD
- local JSON and Markdown files
- snapshot folders
- audit folders

---

## 7. Core concepts

### AID
Agent identity tag.

Use simple local forms such as:
- aid:user-main
- aid:planner
- aid:executor
- aid:retriever
- aid:verifier
- aid:mcp:<server-name>
- aid:channel:<channel-name>

### ATS
Agent timestamp fields, including:
- created_at
- last_accessed_at
- verified_at
- expires_at
- checkpoint_at

### ATMU-lite
A lightweight transaction/state model for memory objects.

States:
- draft
- verified
- committed
- quarantined

Expected transition model:
- draft -> verified
- verified -> committed
- draft -> quarantined
- verified -> quarantined
- committed -> quarantined only with force/admin path

---

## 8. Memory model

Do not replace OpenClaw Markdown memory files.
Add sidecar metadata in a parallel metadata directory.

### Example
- memory/2026-04-09-task.md
- .meta/2026-04-09-task.json

### Sidecar metadata fields
At minimum:
- memory_id
- source_path
- aid
- created_at
- last_accessed_at
- state
- trust_score
- sensitivity
- retention_class
- lineage
- checkpoint_refs

### Default behavior
- MEMORY.md defaults to committed and high trust
- memory/*.md defaults to draft
- quarantined items are excluded from default recall
- high-sensitivity items may return redacted or summary view only

---

## 9. Recall behavior

Default recall should:
- include verified and committed memory
- exclude quarantined memory
- allow draft memory only in planner/retriever mode
- rank by recency and trust_score
- support redacted output for high-sensitivity items

This is the first version of the memory harness.

---

## 10. Action harness behavior

The system should gate risky tool-origin actions.

### High-risk actions
- send_email
- modify_calendar
- delete_file
- external_share

### Rule
Tool-origin actions should enter a pending approval queue unless explicitly whitelisted.

This is the first version of the action harness.

---

## 11. Recovery harness behavior

Support local checkpoint and restore.

### Checkpoint should capture
- tracked memory file list
- current metadata states
- checksums of markdown files
- timestamp
- optional backup copies when safe

### Restore should support
- metadata restore
- optional file restore with explicit safety confirmation
- rollback to last safe local state

This is the first version of the recovery harness.

---

## 12. Suggested implementation stack

Use:
- Node.js
- TypeScript
- Express
- chokidar
- zod
- vitest

Avoid:
- databases
- Electron
- large frontend frameworks for MVP
- heavy infrastructure dependencies

---

## 13. Recommended project structure

```text
aegis-openclaw-lite/
  README.md
  package.json
  src/
    daemon/
      index.ts
      watcher.ts
      checkpoint.ts
      audit.ts
    adapters/
      openclaw-workspace.ts
      mcporter-hook.ts
    core/
      aid.ts
      ats.ts
      atmu.ts
      metadata.ts
      policy.ts
      recall.ts
      quarantine.ts
    api/
      server.ts
      routes.ts
    schemas/
      memory-meta.schema.json
      checkpoint.schema.json
    tests/
      unit/
      integration/
  data/
    snapshots/
    audit/
  scripts/
    bootstrap.ts
    demo-seed.ts
```
