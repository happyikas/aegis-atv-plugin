# Aegis ATV Customer Value Demos

## Purpose

Use this guide when you need to explain not just what Aegis ATV does, but why an enterprise customer should care.

The strongest story is to anchor the product in three practical outcomes:

- cost control
- performance protection
- security and governance

## Demo setup

1. Install dependencies
- `npm install`

2. Seed the workspace
- `npm run demo:seed`

3. Start the daemon
- `npm run dev`

4. Run the combined scenario script if you want a quick end-to-end pass
- `npm run demo:enterprise`

5. Keep the dashboard open for the customer view
- [dashboard](http://localhost:4187/dashboard)

## Value story 1: Cost control

### Customer problem

- AI agents can trigger expensive downstream actions even when the business intent is weak or contradictory.
- Security review often catches the issue after the action already happened.
- Cost leakage and compliance leakage can happen together.

### Aegis ATV value

- blocks or escalates costly side-effect actions before execution
- makes the decision explainable with cost-aware context, signals, and telemetry
- gives operators evidence for why the action should not proceed

### Demo call

```bash
curl -X POST http://localhost:4187/actions/preview \
  -H 'content-type: application/json' \
  -d '{
    "action":"external_share",
    "requested_by":"aid:executor",
    "payload":{"target":"https://partner.example/upload","resource":"memory/task-001.md"},
    "context":{
      "declared_intent":"inspect the workspace only",
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"review only, do not publish","stance":"supporting"}
      ],
      "cost":{"input_tokens":42000,"output_tokens":9000,"reasoning_tokens":15000,"estimated_usd":14.75}
    }
  }'
```

### What to highlight

- `verdict`
- `signals`
- `divergence.score`
- `telemetry.telemetry_id`
- the cost fields in `context.cost`

### One-line message

- "Aegis ATV does not just prevent unsafe actions. It prevents expensive unsafe actions before they consume more budget."

## Value story 2: Performance protection

### Customer problem

- Teams fear that adding governance will slow down all agent actions.
- If every action hits a human checkpoint, throughput collapses.

### Aegis ATV value

- keeps low-risk read paths on the fast lane
- only escalates when risk, provenance conflict, or divergence justify it
- preserves velocity for normal work while adding control to exceptional work

### Demo call

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
        {"kind":"user_prompt","label":"operator request","content":"inspect memory only","stance":"supporting"}
      ],
      "cost":{"input_tokens":500,"output_tokens":40,"reasoning_tokens":80,"estimated_usd":0.02}
    }
  }'
```

### What to highlight

- `verdict: allow`
- low `blast_radius`
- no signals
- telemetry still exists even when the action is clean

### One-line message

- "Aegis ATV adds policy without turning every safe read into a bureaucracy tax."

## Value story 3: Security and governance

### Customer problem

- Agents can drift away from declared intent.
- Dangerous tool calls can be framed as harmless review tasks.
- Teams need preventive control, not after-the-fact logging.

### Aegis ATV value

- catches intent/action divergence before side effects happen
- supports approval workflows for risky but plausible actions
- blocks clearly unsafe or deceptive execution paths

### Demo call

```bash
curl -X POST http://localhost:4187/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":"security-demo-1",
    "method":"tools/call",
    "params":{
      "name":"aegis.intercept_action",
      "arguments":{
        "action":"delete_file",
        "requested_by":"aid:mcp:client",
        "payload":{"path":"/tmp/demo.txt"},
        "context":{
          "declared_intent":"summarize file contents for review only",
          "sources":[
            {"kind":"user_prompt","label":"operator request","content":"review only","stance":"supporting"}
          ]
        }
      }
    }
  }'
```

### What to highlight

- `structuredContent.evaluation.verdict`
- `structuredContent.evaluation.signals`
- `structuredContent.evaluation.divergence`
- `_meta` values in the MCP response

### One-line message

- "This is a preventive security layer that understands intent, not just a logger that records the damage later."

## Suggested meeting flow

1. Start in the dashboard to frame the product.
2. Show the performance path first so the customer sees that safe work remains fast.
3. Show the cost-control path to connect governance to financial value.
4. End with the security path so the audience sees the hard-stop behavior.
5. Use the telemetry drawer and audit trail to show explainability.

## Dashboard callouts

- `Latest verdicts and evidence`: fast summary of recent agent decisions
- `Pending approval queue`: where human governance enters the loop
- `Latest drift status`: why artifact integrity matters
- `Recent verdict comparison`: compare neighboring decisions quickly
- `Selected telemetry drawer`: detail view for one event
- `Recent governance events`: audit trail for approvals and controls

## Recommended close

- "Aegis ATV gives you three things at once: safer execution, lower avoidable spend, and governance that does not crush throughput."
