# AegIsDATA-lite for macOS + OpenClaw MVP

Aegis ATV is a software-first trust layer for autonomous agents. This repo turns the attached patent concepts into a working demo that can decide, before an agent action runs, whether to `allow`, `require_approval`, or `block`, while emitting explainable telemetry and integrity evidence.

## Why this matters

- For customers: it adds pre-commit control, audit evidence, and action gating without replacing the existing agent runtime.
- For investors: it shows a near-term software wedge that can expand into hardware attestation, MCP enforcement, and privacy-preserving telemetry products.
- For engineering teams: it provides a runnable MVP for action firewalling, provenance-aware policy, and ATV-style telemetry.

## What this demo includes

Local file-backed harness that wraps an existing OpenClaw workspace with:

- memory metadata sidecars
- ATMU-lite memory state transitions
- recall filtering
- risky action approvals
- Aegis ATV action preview firewall
- instruction-source provenance checks
- local artifact integrity baseline + mutation detection
- demo Agent Telemetry Vector generation
- audit logging
- checkpoint and restore
- file watching
- local REST API

## Demo outcomes

Within one short demo, you can show:

- a normal agent action being allowed
- a risky action being sent to approval
- a misleading action being blocked before execution
- telemetry ids and vector hashes being generated per action review
- instruction-source provenance influencing policy decisions
- build-to-runtime artifact drift causing policy escalation

## Audience-specific message

### Customer message

- Keep your existing agent stack.
- Add a policy and evidence layer in front of risky actions.
- Reduce trust in opaque agent behavior by making decisions inspectable.

### Investor message

- The product can start as software and land quickly.
- The architecture naturally expands into hardware-rooted telemetry and attestation.
- The IP is visible as product behavior, not just as a filing narrative.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Seed a local demo workspace in the default OpenClaw location:

```bash
npm run demo:seed
```

3. By default, the daemon watches `~/.openclaw/workspace`. You can override it:

```bash
export OPENCLAW_WORKSPACE=/path/to/openclaw/workspace
export AEGIS_DATA_DIR=/path/to/aegis-openclaw-lite/data
export PORT=4187
```

4. Run the daemon:

```bash
npm run dev
```

5. In another terminal, scan the workspace:

```bash
curl -X POST http://localhost:4187/workspace/scan
```

6. Inspect generated sidecar metadata:

```bash
ls ~/.openclaw/workspace/.meta
cat ~/.openclaw/workspace/.meta/MEMORY.md.json
```

Starting the daemon or calling the scan endpoint creates sidecar JSON files in `~/.openclaw/workspace/.meta/`.

The daemon also watches tracked files and appends newline-delimited JSON audit entries to `data/audit/audit.log`.

Checkpoints are stored under `data/snapshots/` and can restore metadata alone or restore markdown files when an explicit force flag is provided.

Recall defaults to `verified` and `committed` memories, excludes `quarantined`, allows `draft` only in planner or retriever mode, and redacts high-sensitivity content unless explicitly requested.

High-risk actions (`send_email`, `modify_calendar`, `delete_file`, `external_share`) are stored in `data/approvals.json` as local pending approvals until they are explicitly approved or rejected.

Action requests now use a small standardized contract:

- `send_email`: `{ "to": string, "subject"?: string, "body"?: string }`
- `modify_calendar`: `{ "event": string, "date"?: string, "calendar_id"?: string }`
- `delete_file`: `{ "path": string }`
- `external_share`: `{ "target": string, "resource"?: string }`
- `read_file`: `{ "path": string }`
- `search_memory`: `{ "query": string, "limit"?: number }`

## 5-minute demo flow

1. Run `npm install`.
2. Run `npm run demo:seed`.
3. Run `npm run dev`.
4. Call `curl -X POST http://localhost:4187/workspace/scan`.
5. Call `curl http://localhost:4187/memories`.
6. Call `curl -X POST http://localhost:4187/checkpoint`.
7. Call `curl -X POST http://localhost:4187/approvals -H 'content-type: application/json' -d '{"action":"send_email","requested_by":"aid:executor","payload":{"to":"demo@example.com"}}'`.
8. Or call `curl -X POST http://localhost:4187/actions/intercept -H 'content-type: application/json' -d '{"action":"send_email","requested_by":"aid:executor","payload":{"to":"demo@example.com"}}'`.

Within a few minutes you should see:

- `.meta/*.json` sidecar files in the workspace
- `data/audit/audit.log`
- `data/snapshots/ckpt-*/manifest.json`
- `data/approvals.json`

## OpenClaw integration

This MVP does not replace OpenClaw. It wraps the same local workspace and treats OpenClaw memory Markdown as the source documents.

- `MEMORY.md`, `memory/*.md`, and optional `DREAMS.md` remain plain Markdown files used by OpenClaw.
- AegIsDATA-lite adds `.meta/*.json` sidecars beside that workspace.
- Risky tool-origin actions can be routed into the local approval queue and replayed only after approval through the OpenClaw action harness.
- Checkpoints and audit logs stay local on disk.

## API summary

- `GET /health`
- `POST /workspace/scan`
- `GET /memories`
- `GET /memories/:id`
- `POST /verify/:id`
- `POST /quarantine/:id`
- `POST /recall`
- `POST /actions/intercept`
- `POST /actions/preview`
- `POST /actions/replay/:approvalId`
- `POST /integrity/baseline`
- `POST /integrity/check`
- `GET /approval-queue`
- `POST /approval-queue/:id/approve`
- `POST /approval-queue/:id/reject`
- `POST /checkpoint`
- `POST /restore/:checkpointId`
- `GET /approvals`
- `POST /approvals`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`
- `POST /checkpoints`
- `GET /checkpoints`
- `POST /restore`

Success responses use `{ "ok": true, "data": ... }`.
Error responses use `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

## Aegis ATV demo flow

1. Create a fresh integrity baseline:

```bash
curl -X POST http://localhost:4187/integrity/baseline \
  -H 'content-type: application/json' \
  -d '{}'
```

2. Preview a guarded action:

```bash
curl -X POST http://localhost:4187/actions/preview \
  -H 'content-type: application/json' \
  -d '{
    "action":"external_share",
    "requested_by":"aid:executor",
    "payload":{"target":"https://partner.example/upload","resource":"memory/task-001.md"},
    "context":{
      "declared_intent":"share the approved summary with the partner",
      "sources":[
        {"kind":"repo_file","label":"AGENTS.md","content":"share the summary","stance":"supporting"},
        {"kind":"user_prompt","label":"direct user request","content":"do not share outside the workspace","stance":"opposing"}
      ],
      "cost":{"input_tokens":1600,"output_tokens":220,"reasoning_tokens":400,"estimated_usd":0.12}
    }
  }'
```

The response includes:

- `verdict`
- `blast_radius`
- `signals`
- `provenance`
- `integrity`
- `telemetry.telemetry_id`
- `telemetry.vector_sha256`

For a live demo, focus the audience on those summary fields.
Do not expand the full `telemetry.vector` unless the audience specifically wants the raw schema-level representation.

For a customer or investor walkthrough, use the full runbook in [docs/CODEX_PLUGIN_DEMO_RUNBOOK.md](/Users/chanikpark/Documents/New%20project/docs/CODEX_PLUGIN_DEMO_RUNBOOK.md).
Use the final pre-demo gate in [docs/FINAL_DEMO_CHECKLIST.md](/Users/chanikpark/Documents/New%20project/docs/FINAL_DEMO_CHECKLIST.md) before changing PR status or going live.

## Action harness demo

1. `curl -X POST http://localhost:4187/actions/intercept -H 'content-type: application/json' -d '{"action":"send_email","requested_by":"aid:executor","payload":{"to":"demo@example.com"}}'`
2. Read the returned `approval_id`.
3. `curl -X POST http://localhost:4187/approval-queue/<approval_id>/approve`
4. `curl -X POST http://localhost:4187/actions/replay/<approval_id>`

High-risk actions are queued first. Non-risk actions execute immediately through the demo executor currently wired into the daemon.
The daemon currently routes execution through an OpenClaw bridge adapter. By default it uses an in-memory bridge, but you can point it at a real local command:

```bash
export OPENCLAW_BRIDGE_COMMAND=/path/to/openclaw-bridge
export OPENCLAW_BRIDGE_ARGS='["--stdio"]'
export OPENCLAW_BRIDGE_CWD=/path/to/openclaw/runtime
```

The command bridge contract is simple:

- stdin receives one JSON object: `{ "action": "...", "payload": { ... } }`
- stdout must return one JSON object with the execution result
- non-zero exit codes are treated as bridge failures

## Best live-demo order

Use this order for the cleanest 5-minute walkthrough:

1. `POST /integrity/baseline`
2. safe preview showing `allow`
3. risky preview showing `require_approval`
4. misleading preview showing `block`
5. mutate one tracked artifact
6. `POST /integrity/check`
7. re-run the risky preview and show that integrity drift now upgrades the result to `block`

## Data layout

- `data/audit/audit.log`
- `data/approvals.json`
- `data/snapshots/<checkpoint-id>/`
- `<workspace>/.meta/*.json`

## Development

- `npm test`
- `npm run build`
- `npm run demo:seed`
- `npm run launchd:generate`

## Mac mini deployment

1. Build the project:

```bash
npm run build
```

2. Generate deployment artifacts:

```bash
npm run launchd:generate
```

This creates:

- `deployment/com.aegisdata.openclaw-lite.plist`
- `deployment/openclaw-bridge-template.sh`

3. If you have a real OpenClaw bridge command, export it before generating:

```bash
export OPENCLAW_BRIDGE_COMMAND=/absolute/path/to/openclaw-bridge
export OPENCLAW_BRIDGE_ARGS='["--stdio"]'
export OPENCLAW_BRIDGE_CWD=/absolute/path/to/openclaw/runtime
```

4. Copy the plist into `~/Library/LaunchAgents/`:

```bash
cp deployment/com.aegisdata.openclaw-lite.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.aegisdata.openclaw-lite.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.aegisdata.openclaw-lite.plist
launchctl start com.aegisdata.openclaw-lite
```

5. Check logs:

```bash
tail -f data/launchd.stdout.log
tail -f data/launchd.stderr.log
```

The generated bridge shell script is a template only. Replace its command body with the real OpenClaw invocation path used on your Mac mini.
