# Aegis ATV Codex Plug-in MVP Release Notes

Version: `0.1.0-preview.1`  
Date: `2026-05-20`

## Summary

This update turns the Codex-facing Aegis ATV work into a clearer MVP package with a dedicated plug-in adapter, Codex deployment templates, and a more explicit `MCP proxy primary` operating model.

## Highlights

- Added `pkg/codex-plugin-aegis/` as the dedicated Codex hook adapter package.
- Added sample Codex hook payload fixtures for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`.
- Wired `deployment/codex/run-hook.sh` to execute the new package directly.
- Switched Codex hook launchers to an absolute Node path so minimal hook environments do not fail on missing `PATH` entries.
- Kept hook execution `fail-open` to avoid blocking developer workflows when the sidecar is unavailable.
- Preserved `MCP proxy` as the primary enforcement point for `allow`, `require_approval`, and `block` decisions.

## New package

- `pkg/codex-plugin-aegis/package.json`
- `pkg/codex-plugin-aegis/src/hook.ts`
- `pkg/codex-plugin-aegis/src/adapter.ts`
- `pkg/codex-plugin-aegis/src/sidecar-client.ts`
- `pkg/codex-plugin-aegis/src/verdict.ts`
- `pkg/codex-plugin-aegis/tests/*`

## Deployment updates

- `deployment/codex/run-hook.sh` now launches the packaged hook adapter.
- `deployment/codex/run-mcp-stdio.sh` now uses an absolute Node path as well.
- `deployment/codex/README.md` and `docs/CODEX_LOCAL_SETUP_CHECKLIST.md` were updated to reflect the packaged adapter flow.

## Operator-facing behavior

- Hook failures caused by unavailable sidecars now surface as suppressed fail-open results instead of hard local crashes.
- Desktop hooks remain `optional/non-blocking` in the tested Codex desktop build.
- Customer and pilot messaging should continue to position `Aegis MCP proxy` as the primary enforcement surface.

## Validation

- `npm test`
- `npm run build`
- `npx vitest run pkg/codex-plugin-aegis/tests`
- `cat pkg/codex-plugin-aegis/examples/pre-tool-use.json | npm run --silent hook:codex`

## Known limitation

Interactive Codex desktop hook execution has not yet been validated as a dependable hard-stop enforcement surface in the tested build. The supported deployment posture remains:

- `Codex plug-in surface`
- `Aegis MCP proxy primary enforcement`
- `telemetry / audit / replay services`
