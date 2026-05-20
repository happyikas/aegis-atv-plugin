# Live Demo Talk Track

Use this sheet while running [scripts/live-demo-preview.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/scripts/live-demo-preview.sh).

## Demo framing

- "This is not a post-incident log viewer. It is a pre-execution trust layer."
- "The same runtime can return three different outcomes depending on risk, provenance, and intent alignment."
- "We want the audience focused on the verdict and evidence, not the full vector payload."

## 1. Allow

Expected result:

- `verdict`: `allow`
- `blast_radius`: `low`
- `signals`: none

Say:

- "This is the healthy path. Low-risk action, trusted intent, no policy conflict."
- "The telemetry still exists, but it stays quiet because nothing suspicious happened."

## 2. Require approval

Expected result:

- `verdict`: `require_approval`
- `blast_radius`: `high`
- `signals`: `directive_precedence_violation`

Say:

- "This action might be legitimate, but it is risky and it conflicts with a higher-trust instruction."
- "The system does not silently block everything risky. It escalates when a human decision still makes sense."

## 3. Block

Expected result:

- `verdict`: `block`
- `blast_radius`: `high`
- `signals`: directive-precedence plus intent/divergence flags

Say:

- "This is the hard stop case. The action conflicts with trusted intent and the realized action no longer matches the declared purpose."
- "This is where the product stops side effects before they happen."

## 4. MCP interception

Expected result:

- JSON-RPC-shaped response
- policy outcome returned in-band
- blocked or approval-required tool calls return structured errors instead of silent execution
- optional `/mcp` path now looks like a miniature real MCP server with `initialize`, `tools/list`, and `tools/call`

Say:

- "This is how the same policy layer fits into MCP transport instead of a custom preview endpoint."
- "The developer experience stays familiar, but the runtime now has a trust verdict before the tool call proceeds."

## 5. Reviewer attestation

Expected result:

- `trusted`: `false` when reviewer verdicts diverge
- reasons include `reviewer_verdict_mismatch`

Say:

- "Now we are not only reviewing the action. We are also reviewing whether the reviewers agree for good reasons."
- "That gives us a path from single-reviewer policy to stronger consensus and attestation products."

## What to highlight in every response

- `verdict`
- `signals`
- `provenance.directive_precedence_violation`
- `divergence.score`
- `telemetry.telemetry_id`
- `telemetry.vector_sha256`

## What not to highlight unless asked

- the full `telemetry.vector`
- every numeric feature in the ATV payload
- internal implementation detail before the verdict is understood
