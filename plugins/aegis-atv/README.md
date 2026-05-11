# Aegis ATV Codex Plugin

This repo packages a demo-ready Codex plugin profile for the AegisData ATV concept described in the attached patent drafts.

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
