# Aegis ATV Codex Plugin

This repo packages a demo-ready Codex plugin profile for the AegisData ATV concept described in the attached patent drafts.

## Product framing

- Entry point: Codex plugin package
- Enforcement engine: local Aegis ATV daemon
- Evidence surface: verdicts, telemetry ids, vector hashes, provenance, and integrity checks

## What the demo plugin does

- evaluates agent actions before execution
- assigns a blast-radius verdict of `allow`, `require_approval`, or `block`
- builds a demo `ATV-2080-v1` telemetry vector for every action review
- checks instruction provenance for directive-precedence anomalies
- checks repo and plugin artifacts against a signed local integrity baseline

## Current demo surfaces

- Local REST daemon endpoints in the main app:
  - `POST /actions/preview`
  - `POST /actions/intercept`
  - `POST /integrity/baseline`
  - `POST /integrity/check`
- Local plugin metadata in `.codex-plugin/plugin.json`
- A reusable Codex skill in `skills/aegis-atv-demo/SKILL.md`

## Intended GitHub target

- GitHub owner: `happyikas`
- Suggested repo: `aegis-atv-plugin`

## Demo positioning

This version is optimized for:

- customer trust and compliance demos
- investor storytelling around defensible agent infrastructure
- engineering validation of product shape before deeper hardware integration

## See also

- Install notes: [INSTALL.md](/Users/chanikpark/Documents/New%20project/plugins/aegis-atv/INSTALL.md)
- Live demo runbook: [docs/CODEX_PLUGIN_DEMO_RUNBOOK.md](/Users/chanikpark/Documents/New%20project/docs/CODEX_PLUGIN_DEMO_RUNBOOK.md)
