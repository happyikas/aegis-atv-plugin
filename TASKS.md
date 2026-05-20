# TASKS.md
## AegIsDATA-lite for macOS + OpenClaw MVP

### Operating rules
- Read `PROJECT_NOTES.md` first.
- Treat `PROJECT_NOTES.md` as the source of truth.
- Work milestone by milestone.
- Keep code minimal, readable, and local-first.
- Do not add a database.
- Do not heavily modify OpenClaw core.
- Add tests for each milestone.

---

## Milestone 1 — Bootstrap + Workspace Scanner + Sidecar Metadata

### Goal
Create a clean TypeScript Node.js project that can detect an existing OpenClaw workspace and create sidecar metadata files for tracked memory Markdown files.

### Tasks
- Initialize the project with:
  - TypeScript
  - Express
  - chokidar
  - zod
  - vitest
- Create the folder structure from `PROJECT_NOTES.md`
- Implement workspace detection:
  - default path: `~/.openclaw/workspace`
  - allow override via env variable
- Identify tracked files:
  - `MEMORY.md`
  - `memory/*.md`
  - `DREAMS.md` if present
- Create `.meta/` directory under the workspace if missing
- For each tracked Markdown file, create sidecar metadata JSON
- Add unit tests for:
  - workspace detection
  - tracked file discovery
  - metadata creation
  - schema validation

### Deliverables
- working project bootstrap
- `src/adapters/openclaw-workspace.ts`
- `src/core/metadata.ts`
- `src/core/aid.ts`
- `src/core/ats.ts`
- schema files
- tests
- README run instructions

### Definition of done
- Running the scanner on a sample OpenClaw workspace creates sidecar metadata for all tracked files
- Tests pass

---

## Milestone 2 — ATMU-lite State Machine

### Goal
Implement the memory state machine.

### Tasks
- Define states:
  - `draft`
  - `verified`
  - `committed`
  - `quarantined`
- Implement state transition rules:
  - `draft -> verified`
  - `verified -> committed`
  - `draft -> quarantined`
  - `verified -> quarantined`
  - `committed -> quarantined` only via force/admin path
- Make state transitions pure and testable
- Update metadata model to persist state changes
- Add tests for valid/invalid transitions

### Deliverables
- `src/core/atmu.ts`
- tests for transition logic

### Definition of done
- All state transitions are enforced by code
- Invalid transitions fail predictably
- Tests pass

---

## Milestone 3 — Daemon + Watcher + Audit Log

### Goal
Run a local daemon that watches the OpenClaw workspace and updates metadata/audit records.

### Tasks
- Build a daemon entrypoint
- Watch tracked files with `chokidar`
- On new file:
  - create metadata
- On file change:
  - update `last_accessed_at`
  - append audit entry
- Default state rules:
  - `MEMORY.md` => `committed`, higher trust
  - `memory/*.md` => `draft`
- Store audit logs in `data/audit/`
- Add tests with temporary directories

### Deliverables
- `src/daemon/index.ts`
- `src/daemon/watcher.ts`
- `src/daemon/audit.ts`
- audit schema or helper
- tests

### Definition of done
- Daemon watches a sample workspace and updates metadata correctly
- Audit records are created
- Tests pass

---

## Milestone 4 — Checkpoint + Restore

### Goal
Support local snapshotting and safe restore.

### Tasks
- Implement checkpoint creation:
  - tracked file list
  - metadata state snapshot
  - checksums of markdown files
  - timestamp
- Store checkpoint files in `data/snapshots/`
- Implement restore:
  - validate checkpoint
  - restore metadata state
  - optionally restore markdown files only with safety flag
- Add tests

### Deliverables
- `src/daemon/checkpoint.ts`
- checkpoint schema
- tests

### Definition of done
- A checkpoint can be created and listed
- Metadata can be restored from a checkpoint
- Tests pass

---

## Milestone 5 — Recall Filter

### Goal
Implement memory recall rules.

### Tasks
- Build a recall filter module
- Default recall behavior:
  - include `verified` and `committed`
  - exclude `quarantined`
  - allow `draft` only in planner/retriever mode
- Rank by:
  - recency
  - trust_score
- Add redacted output mode for high-sensitivity memories
- Add integration tests

### Deliverables
- `src/core/recall.ts`
- tests

### Definition of done
- Default recall excludes quarantined items
- Ranking works
- Redacted mode works
- Tests pass

---

## Milestone 6 — Approval Queue for High-Risk Actions

### Goal
Require approval for risky tool-origin actions.

### Tasks
- Define risky actions:
  - `send_email`
  - `modify_calendar`
  - `delete_file`
  - `external_share`
- Create a local JSON-based approval queue
- Add queue states:
  - `pending`
  - `approved`
  - `rejected`
- Expose queue helpers
- Add tests

### Deliverables
- `src/core/policy.ts`
- `src/core/quarantine.ts` if needed
- approval queue module
- tests

### Definition of done
- High-risk actions are added to pending queue
- Approve/reject works
- Tests pass

---

## Milestone 7 — Local REST API

### Goal
Expose a minimal local API for inspection and control.

### Tasks
- Implement Express server
- Add endpoints:
  - `GET /health`
  - `GET /memories`
  - `GET /memories/:id`
  - `POST /verify/:id`
  - `POST /quarantine/:id`
  - `POST /checkpoint`
  - `POST /restore/:checkpointId`
  - `GET /approval-queue`
  - `POST /approval-queue/:id/approve`
  - `POST /approval-queue/:id/reject`
- Add consistent JSON response shape
- Add error handling
- Add API tests where practical

### Deliverables
- `src/api/server.ts`
- `src/api/routes.ts`
- tests
- README API usage examples

### Definition of done
- API starts locally
- Endpoints function correctly
- Tests pass

---

## Milestone 8 — Cleanup + README + Demo Script

### Goal
Make the MVP easy to run locally on a Mac mini.

### Tasks
- Clean up structure and naming
- Improve type safety
- Improve error messages
- Write a practical README:
  - install
  - run
  - env vars
  - sample workspace setup
  - how it integrates with OpenClaw
- Add `scripts/demo-seed.ts`
- Add a simple end-to-end demo flow

### Deliverables
- polished README
- demo seed script
- stable run instructions

### Definition of done
- A developer can run the MVP in under 5 minutes
- Demo flow works locally

---

## Acceptance criteria

1. When a tracked OpenClaw memory file is added, sidecar metadata is automatically created.
2. Metadata state defaults are deterministic and tested.
3. Quarantined memory is excluded from default recall.
4. A checkpoint can be created and listed.
5. Restore can recover metadata state from a selected checkpoint.
6. High-risk actions enter a pending approval queue.
7. All local state is stored in JSON/Markdown only.
8. README allows a developer on macOS to run the daemon and API in under 5 minutes.

---

## How Codex should work

For each milestone:
1. explain the plan briefly
2. implement the code
3. add tests
4. run tests
5. summarize what changed
6. update README if needed

Do not jump ahead to future milestones unless current milestone is complete.

---

## Start here

Begin with **Milestone 1**.

Read `PROJECT_NOTES.md` first, then:
- propose the implementation plan
- create the project structure
- bootstrap the TypeScript project
- implement workspace scanning
- implement sidecar metadata creation
- add tests
