# Live Demo Talk Track

Use this sheet while running [scripts/live-demo-preview.sh](/Users/chanikpark/Documents/New%20project/scripts/live-demo-preview.sh).

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
