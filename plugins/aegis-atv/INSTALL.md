# Install And Demo Notes

## What this package is

This folder is the Codex-facing packaging layer for the Aegis ATV demo.

It includes:

- plugin manifest: `.codex-plugin/plugin.json`
- plugin overview: `README.md`
- reusable demo skill: `skills/aegis-atv-demo/SKILL.md`

## Intended installation model

Repo-local marketplace entry:

- [.agents/plugins/marketplace.json](/Users/chanikpark/Documents/New%20project/.agents/plugins/marketplace.json)

Plugin root:

- [plugins/aegis-atv](/Users/chanikpark/Documents/New%20project/plugins/aegis-atv)

## Demo operator flow

1. Start the Aegis daemon from the project root.
2. Create an integrity baseline.
3. Use the `aegis-atv-demo` skill to preview actions.
4. Execute only approved actions through the local harness.

## Best demo framing

- Present the plugin as the product entry point.
- Present the local daemon as the enforcement engine.
- Present telemetry and integrity records as the evidence surface.
