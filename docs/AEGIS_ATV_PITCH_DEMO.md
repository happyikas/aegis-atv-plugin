# Aegis ATV Customer And Investor Demo

## Demo objective

Show that AegisData can turn advanced agent-safety IP into a product wedge today, without waiting for custom hardware.

## Story in one line

Aegis ATV is a trust layer for autonomous agents that decides, before an action runs, whether to allow it, require approval, or block it, while producing auditable telemetry and integrity evidence.

## 5-minute demo flow

1. Start the daemon
- `npm run dev`

2. Seed a clean integrity baseline
- `curl -X POST http://localhost:4187/integrity/baseline -H 'content-type: application/json' -d '{}'`

3. Preview a normal read action
- Show `allow`
- Point out telemetry id, vector hash, and low blast radius

4. Preview a suspicious share or delete action
- Include declared intent that sounds harmless
- Show `block` or `require_approval`
- Point out directive-precedence or divergence signals

5. Mutate an artifact and re-check integrity
- Change plugin manifest or README
- Call `POST /integrity/check`
- Show that follow-on action preview now reflects mutated artifacts

## What to emphasize on the call

### For customers

- "You do not need to rip out your current agent runtime."
- "This sits in front of high-risk actions and adds explainable control."
- "The same evidence surface can support internal governance and future compliance asks."

### For investors

- "This is the software wedge that proves the product behavior now."
- "The same control plane can later anchor hardware attestation and cross-tenant intelligence."
- "The patent story is already visible in a runnable branch, not just in slides."

## Pitch points for customers

- Works with existing agent runtimes instead of replacing them
- Gives a pre-commit control plane, not just post-incident logging
- Creates evidence for audit, review, and policy governance

## Pitch points for investors

- Starts as a software wedge with near-term adoption potential
- Expands naturally into hardware attestation, CSD integration, and privacy-preserving cross-tenant intelligence
- Converts patent language into visible product behavior quickly

## Suggested GitHub demo branch

- `codex/aegis-atv-demo`

## Supporting assets

- Product overview and setup: [README.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/README.md)
- Codex plugin package: [plugins/aegis-atv/README.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/plugins/aegis-atv/README.md)
- Live runbook: [docs/CODEX_PLUGIN_DEMO_RUNBOOK.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/CODEX_PLUGIN_DEMO_RUNBOOK.md)
- Two-slide architecture and value brief: [docs/AEGIS_ATV_TWO_SLIDE_BRIEF.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/AEGIS_ATV_TWO_SLIDE_BRIEF.md)
- Codex deployment templates: [deployment/codex/README.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/README.md)
