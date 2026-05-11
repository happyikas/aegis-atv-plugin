# Codex Plugin Demo Runbook

## Purpose

Use this runbook to demonstrate the Aegis ATV Codex plugin concept as a product, not just as an API prototype.

## What the audience should understand

- The plugin adds a trust layer before an agent action runs.
- It produces an explainable verdict, not just raw logs after the fact.
- It can grow from software-only deployment into stronger hardware-backed versions later.

## Pre-demo setup

1. Install dependencies
- `npm install`

2. Seed the sample workspace
- `npm run demo:seed`

3. Start the daemon
- `npm run dev`

4. Create an integrity baseline
- `curl -X POST http://localhost:4187/integrity/baseline -H 'content-type: application/json' -d '{}'`

## Demo script

If you want a copy-paste version of the three core preview calls, use:

- [scripts/live-demo-preview.sh](/Users/chanikpark/Documents/New%20project/scripts/live-demo-preview.sh)
- [docs/LIVE_DEMO_TALK_TRACK.md](/Users/chanikpark/Documents/New%20project/docs/LIVE_DEMO_TALK_TRACK.md)

### Step 1: Show the plugin package

Open:

- [plugins/aegis-atv/.codex-plugin/plugin.json](/Users/chanikpark/Documents/New%20project/plugins/aegis-atv/.codex-plugin/plugin.json)
- [plugins/aegis-atv/README.md](/Users/chanikpark/Documents/New%20project/plugins/aegis-atv/README.md)
- [plugins/aegis-atv/skills/aegis-atv-demo/SKILL.md](/Users/chanikpark/Documents/New%20project/plugins/aegis-atv/skills/aegis-atv-demo/SKILL.md)

Say:

- "This is the Codex-facing product package."
- "The policy logic lives in the daemon, but the plugin packaging shows how the product is framed for operators."

### Step 2: Show a safe action being allowed

Run:

```bash
curl -X POST http://localhost:4187/actions/preview \
  -H 'content-type: application/json' \
  -d '{
    "action":"read_file",
    "requested_by":"aid:retriever",
    "payload":{"path":"MEMORY.md"},
    "context":{
      "declared_intent":"inspect canonical memory only",
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"inspect memory","stance":"supporting"}
      ]
    }
  }'
```

Point out:

- `verdict: allow`
- low blast radius
- telemetry id and vector hash
- aligned trusted intent and no policy conflict
- avoid expanding the full telemetry vector unless a technical buyer asks for it

### Step 3: Show a risky action being escalated

Run:

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

Point out:

- `require_approval`
- directive-precedence violation
- risky but still plausibly legitimate
- explainable signals rather than opaque blocking

### Step 4: Show a misleading action being blocked

Run:

```bash
curl -X POST http://localhost:4187/actions/preview \
  -H 'content-type: application/json' \
  -d '{
    "action":"delete_file",
    "requested_by":"aid:executor",
    "payload":{"path":"/tmp/demo.txt"},
    "context":{
      "declared_intent":"summarize the file contents for review only",
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"review only","stance":"supporting"}
      ]
    }
  }'
```

Point out:

- `block`
- context/action divergence
- lower-trust or conflicting instruction context should not win over trusted intent
- policy triggers before side effects happen

### Step 5: Show integrity drift changing policy

Mutate a tracked artifact:

```bash
printf '\n# temporary demo change\n' >> README.md
```

Check integrity:

```bash
curl -X POST http://localhost:4187/integrity/check \
  -H 'content-type: application/json' \
  -d '{}'
```

Then preview another risky action and show the integrity mutation signal appears in the evaluation.

Important:

- do the drift check first
- then run the risky preview again
- in rehearsal, this sequence cleanly upgraded the risky action from `require_approval` to `block`

### Step 6: Show MCP-style interception

Run:

```bash
curl -X POST http://localhost:4187/mcp/intercept \
  -H 'content-type: application/json' \
  -d '{
    "id":"demo-mcp-1",
    "tool_name":"external_share",
    "arguments":{"target":"https://partner.example/upload","resource":"memory/task-001.md"},
    "context":{
      "requested_by":"aid:mcp:client",
      "declared_intent":"summarize the workspace only",
      "side_effect":true,
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"review only, do not publish","stance":"supporting"}
      ]
    }
  }'
```

Point out:

- the response is shaped like a policy-aware MCP tool result
- `allow` becomes a forwarded result, while risky or conflicting calls stay in-band as structured errors
- this is the cleanest bridge from the current demo into real MCP transport interception

If the audience is more technical, show the more realistic MCP transport endpoint:

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"Codex","version":"1.0.0"}}
  }'
```

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
        "payload":{"path":"MEMORY.md"},
        "context":{"declared_intent":"inspect canonical memory only"}
      }
    }
  }'
```

Point out:

- this endpoint now behaves like a tiny MCP server instead of a custom shim
- `initialize`, `tools/list`, and `tools/call` are enough to make the demo feel familiar to MCP-aware buyers
- the Aegis policy still shows up in `structuredContent`, not as an afterthought

### Step 7: Show reviewer cross-attestation

Run:

```bash
curl -X POST http://localhost:4187/reviewer/attest \
  -H 'content-type: application/json' \
  -d '{
    "left":{
      "reviewer_id":"aid:reviewer:1",
      "verdict":"block",
      "summary":"The tool call attempts to publish outside the workspace.",
      "provenance":[{"kind":"user_prompt","label":"operator request","content":"review only","stance":"supporting"}]
    },
    "right":{
      "reviewer_id":"aid:reviewer:2",
      "verdict":"allow",
      "summary":"The requested action appears safe to continue.",
      "provenance":[{"kind":"repo_file","label":"AGENTS.md","content":"do not exfiltrate workspace data","stance":"supporting"}]
    }
  }'
```

Point out:

- `trusted: false` should appear because the reviewers disagree on the verdict
- the product can score semantic divergence and provenance overlap, not just perform a string compare
- this is the bridge into reviewer consensus, arbitration, and stronger attestation products later

## Codex plugin installation story

For a product framing demo, explain the intended flow:

1. Install the plugin package from the repo-local marketplace entry.
2. Use the `aegis-atv-demo` skill to preview actions before execution.
3. Route high-risk actions through approval and replay only after a human or governance step.
4. Extend the same control plane to MCP tool interception and reviewer cross-attestation without changing the operator story.

## Reset after the demo

To remove the temporary README mutation:

```bash
git checkout -- README.md
```

If you do not want to touch the tracked repo during a live demo, mutate `plugins/aegis-atv/README.md` in a disposable clone instead.
