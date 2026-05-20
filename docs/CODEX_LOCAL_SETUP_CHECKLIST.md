# Codex Local Setup Checklist

Use this checklist to apply the `deployment/codex` templates to the current local environment.

## Paths

- Repo root: `/Users/chanikpark/Documents/aegis_atv_codex_mvp`
- Workspace default: `/Users/chanikpark/.openclaw/workspace`
- Aegis data dir default: `/Users/chanikpark/Documents/aegis_atv_codex_mvp/data`

## Files to review

- [deployment/codex/managed-config.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/managed-config.toml)
- [deployment/codex/requirements.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/requirements.toml)
- [deployment/codex/install-managed-config.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-managed-config.sh)
- [deployment/codex/install-requirements.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-requirements.sh)
- [deployment/codex/run-hook.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/run-hook.sh)
- [deployment/codex/run-mcp-stdio.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/run-mcp-stdio.sh)
- [pkg/codex-plugin-aegis/src/hook.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/src/hook.ts)
- [pkg/codex-plugin-aegis/examples/pre-tool-use.json](/Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/examples/pre-tool-use.json)

## Desktop config that actually matters

- User-local hook experiments: [~/.codex/config.toml](/Users/chanikpark/.codex/config.toml)
- System managed defaults: `/etc/codex/managed_config.toml`
- System managed hooks and security requirements: `/etc/codex/requirements.toml`
- Hook scripts referenced by managed requirements must live under the configured `managed_dir`
- In the tested Codex desktop build, managed hooks were not observed to produce local Aegis events during interactive sessions, so they should not be the only enforcement dependency

## Checklist

1. Confirm the repo path in the deployment templates still matches the local machine.
2. Run:
   `sudo /Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-managed-config.sh`
3. Run:
   `sudo /Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-requirements.sh`
4. Confirm `/etc/codex/managed_config.toml` exists.
5. Confirm `/etc/codex/requirements.toml` exists.
6. Confirm `/etc/codex/requirements.toml` contains `[hooks] managed_dir = "/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex"`.
7. Confirm `/etc/codex/requirements.toml` contains `[[hooks.SessionStart]]`, `[[hooks.UserPromptSubmit]]`, `[[hooks.PreToolUse]]`, `[[hooks.PermissionRequest]]`, `[[hooks.PostToolUse]]`, and `[[hooks.Stop]]`.
8. Restart Codex desktop fully.
9. Open the trusted workspace under `/Users/chanikpark/Documents/aegis_atv_codex_mvp`.
10. Submit one real prompt or tool-using action.
11. If hook events appear in Aegis data or dashboard, record that as build-specific extra visibility.
12. If hook events do not appear, keep the deployment posture as `MCP proxy primary` and treat desktop hooks as optional/non-blocking for this build.

## Quick local probe

```bash
cat /Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/examples/session-start.json | npm run hook:codex
cat /Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/examples/pre-tool-use.json | npm run hook:codex
```
