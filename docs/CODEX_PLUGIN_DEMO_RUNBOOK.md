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

## Codex plugin installation story

For a product framing demo, explain the intended flow:

1. Install the plugin package from the repo-local marketplace entry.
2. Use the `aegis-atv-demo` skill to preview actions before execution.
3. Route high-risk actions through approval and replay only after a human or governance step.

## Reset after the demo

To remove the temporary README mutation:

```bash
git checkout -- README.md
```

If you do not want to touch the tracked repo during a live demo, mutate `plugins/aegis-atv/README.md` in a disposable clone instead.
