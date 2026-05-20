# Aegis ATV User Manual

## Overview

Aegis ATV is a pre-execution trust layer for agent actions. It evaluates a proposed action before execution and returns one of three outcomes:

- `allow`
- `require_approval`
- `block`

It also records telemetry, tracks artifact integrity, and exposes operator surfaces for approvals, audit review, and MCP-oriented integration.

## Who this manual is for

- platform engineers deploying the daemon
- security or governance operators reviewing actions
- product teams running customer demos
- technical buyers evaluating the Codex plug-in surface

## Core components

- daemon: local Aegis runtime and API server
- dashboard: browser-based operator surface
- approval queue: human review path for risky actions
- telemetry store: persisted event evidence
- integrity baseline: tracked artifact drift detection
- MCP transport: `initialize`, `tools/list`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `tools/call`

## Installation

1. Install dependencies
- `npm install`

2. Seed the local workspace
- `npm run demo:seed`

3. Start the daemon
- `npm run dev`

4. Optional production-style start after build
- `npm run build`
- `npm run start`

## Configuration

Supported environment variables:

- `OPENCLAW_WORKSPACE`
- `AEGIS_DATA_DIR`
- `PORT`
- `OPENCLAW_BRIDGE_COMMAND`
- `OPENCLAW_BRIDGE_ARGS`
- `OPENCLAW_BRIDGE_CWD`
- `AEGIS_MCP_UPSTREAM_URL`
- `AEGIS_MCP_UPSTREAM_COMMAND`
- `AEGIS_MCP_UPSTREAM_ARGS`
- `AEGIS_MCP_UPSTREAM_CWD`

Example:

```bash
export OPENCLAW_WORKSPACE=/path/to/openclaw/workspace
export AEGIS_DATA_DIR=/path/to/aegis-data
export PORT=4187
```

Codex-facing deployment templates:

- [deployment/codex/hooks.json](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/hooks.json)
- [deployment/codex/managed-config.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/managed-config.toml)
- [deployment/codex/requirements.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/requirements.toml)

Operational note for Codex desktop:

- In the currently tested Codex desktop build, desktop hooks should be treated as `optional/non-blocking` telemetry aids.
- Use the `Aegis MCP proxy` as the primary enforcement point for policy decisions and customer-facing security guarantees.
- Managed requirements are still useful for enterprise rollout consistency, but pilot claims should center on proxy enforcement rather than hook-only blocking.

## Daily operator workflow

### 1. Check service health

```bash
curl http://localhost:4187/health
```

### 2. Review the dashboard

Open:

- [dashboard](http://localhost:4187/dashboard)

Key sections:

- Latest verdicts and evidence
- Pending approval queue
- Latest drift status
- Recent verdict comparison
- Selected telemetry drawer
- Recent governance events

### 3. Review approvals

List approvals:

```bash
curl http://localhost:4187/approval-queue
```

Approve:

```bash
curl -X POST http://localhost:4187/approval-queue/<approval_id>/approve
```

Reject:

```bash
curl -X POST http://localhost:4187/approval-queue/<approval_id>/reject
```

Replay an approved action:

```bash
curl -X POST http://localhost:4187/actions/replay/<approval_id>
```

### 4. Review telemetry

Recent telemetry:

```bash
curl http://localhost:4187/telemetry?limit=10
```

One telemetry record:

```bash
curl http://localhost:4187/telemetry/<telemetry_id>
```

Compare telemetry:

```bash
curl -X POST http://localhost:4187/telemetry/compare \
  -H 'content-type: application/json' \
  -d '{"telemetry_ids":["id-1","id-2"]}'
```

### 5. Check integrity drift

Create baseline:

```bash
curl -X POST http://localhost:4187/integrity/baseline \
  -H 'content-type: application/json' \
  -d '{}'
```

Check drift:

```bash
curl -X POST http://localhost:4187/integrity/check \
  -H 'content-type: application/json' \
  -d '{}'
```

### 6. Run Codex hook commands locally

Session start example:

```bash
cat /Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/examples/session-start.json | npm run hook:codex
```

Pre-tool decision example:

```bash
cat /Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/examples/pre-tool-use.json | npm run hook:codex
```

### 7. Run the stdio MCP shim

Probe the proxy as a stdio MCP server:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp:stdio
```

If you want to connect a real upstream MCP server:

```bash
export AEGIS_MCP_UPSTREAM_URL=http://localhost:9000/mcp
```

or:

```bash
export AEGIS_MCP_UPSTREAM_COMMAND=/path/to/upstream-mcp
export AEGIS_MCP_UPSTREAM_ARGS='["--stdio"]'
export AEGIS_MCP_UPSTREAM_CWD=/path/to/upstream-runtime
```

## Using the MCP surface

### Initialize

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'
```

### List tools

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### List resources

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/list"}'
```

### Read a resource

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"aegis://telemetry/recent"}}'
```

### List prompt definitions

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"prompts/list"}'
```

### Get one prompt

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":6,"method":"prompts/get","params":{"name":"aegis_demo_walkthrough","arguments":{"audience":"customer"}}}'
```

### Call a tool

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":"call-1",
    "method":"tools/call",
    "params":{
      "name":"aegis.preview_action",
      "arguments":{
        "action":"read_file",
        "requested_by":"aid:mcp:client",
        "payload":{"path":"MEMORY.md"}
      }
    }
  }'
```

### Forward a real MCP call through the proxy

```bash
curl -X POST http://localhost:4187/mcp/proxy \
  -H 'content-type: application/json' \
  -H 'x-aegis-agent-id: aid:mcp:proxy' \
  -H 'x-aegis-session-id: sess-proxy' \
  -H 'x-aegis-declared-intent: inspect canonical memory only' \
  -d '{
    "jsonrpc":"2.0",
    "id":"proxy-1",
    "method":"tools/call",
    "params":{
      "name":"upstream.echo",
      "arguments":{"path":"MEMORY.md"}
    }
  }'
```

## Understanding the verdicts

### `allow`

- safe enough to proceed immediately
- typical for read-only or low-risk actions

### `require_approval`

- plausible but risky
- human governance should decide

### `block`

- conflicts with trusted intent, policy, or integrity conditions
- should not execute

## Recommended customer demo workflow

1. Run `npm run demo:enterprise`
2. Keep the dashboard open
3. Walk through:
- performance value
- cost-control value
- security/governance value
4. Use telemetry detail and approval audit trail as proof points

See:

- [customer value demos](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/AEGIS_ATV_CUSTOMER_VALUE_DEMOS.md)

## Troubleshooting

### The dashboard is empty

- confirm the daemon is running
- confirm you have created a baseline
- run one or more preview calls to generate telemetry

### Approval queue is empty

- run a risky action such as `send_email` or `external_share`

### Integrity shows `baseline_missing`

- create a baseline first with `POST /integrity/baseline`

### MCP calls fail

- confirm the JSON body includes `"jsonrpc":"2.0"`
- confirm the method name is supported
- confirm the target tool or resource name exists
- confirm upstream MCP connection variables are set correctly when using `POST /mcp/proxy` or `npm run mcp:stdio`

### MCP tool calls suddenly start blocking after an upstream change

- call `tools/list` or `POST /mcp/proxy` once to confirm the proxy has captured a descriptor baseline
- inspect the returned `_meta` fields for `descriptorHash`, `descriptorBaselineHash`, and `descriptorClean`
- if the upstream schema changed intentionally, recreate the local runtime baseline before re-running the demo

## Operational notes

- audit logs are stored under `data/audit/audit.log`
- approvals are stored under `data/approvals.json`
- telemetry is stored under `data/telemetry/`
- checkpoints are stored under `data/snapshots/`
- MCP descriptor baselines are stored under `data/integrity/mcp-descriptors/`

## What this manual does not promise yet

This MVP is still a product prototype. It does not yet include:

- enterprise SSO
- multi-tenant RBAC
- production database backends
- hardened cryptographic audit immutability
- formal compliance packaging

For enterprise-gap analysis, use the product readiness notes separately.
