---
name: aegis-atv-demo
description: Evaluate a candidate agent action with Aegis ATV telemetry, provenance checks, and artifact integrity gating before execution.
---

# Aegis ATV Demo

Use this skill when the operator wants a quick trust-and-safety review of an agent action before it runs.

## Workflow

1. Call the local Aegis ATV daemon `POST /actions/preview` with:
   - `action`
   - `requested_by`
   - `payload`
   - `context.declared_intent`
   - `context.sources`
   - optional `context.artifact_paths`
2. Inspect:
   - `verdict`
   - `blast_radius`
   - `signals`
   - `provenance.directive_precedence_violation`
   - `divergence`
   - `integrity`
   - `telemetry.telemetry_id`
3. If the verdict is acceptable, call `POST /actions/intercept` to execute or queue the action.

## Demo framing

- `allow`: low-risk and aligned with trusted intent
- `require_approval`: risky or lower-trust influenced, but potentially legitimate
- `block`: mutated artifacts or strong intent/action divergence
