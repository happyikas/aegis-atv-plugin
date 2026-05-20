# Codex Deployment Notes

These templates now follow the official Codex split between managed defaults and managed requirements.

## Repo templates

- [managed-config.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/managed-config.toml)
- [requirements.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/requirements.toml)
- [hooks.json](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/hooks.json)
- [run-hook.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/run-hook.sh)
- [run-mcp-stdio.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/run-mcp-stdio.sh)
- [install-managed-config.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-managed-config.sh)
- [install-requirements.sh](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-requirements.sh)

## Deployment model

1. `managed_config.toml` is for managed defaults and MCP server wiring.
2. `requirements.toml` is the correct enterprise surface for enforced hook policies.
3. User-local experimentation can still use `~/.codex/config.toml` or `~/.codex/hooks.json`, but enterprise enforcement should move to `/etc/codex/requirements.toml`.

## Install commands

```bash
sudo /Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-managed-config.sh
sudo /Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/install-requirements.sh
```

## Validation note

- `managed_config.toml` and `requirements.toml` can be installed successfully.
- In the tested Codex desktop build, interactive desktop sessions still did not emit local Aegis hook events.
- Treat desktop hooks as optional/non-blocking and use the Aegis MCP proxy as the primary enforcement surface.

## Hook launcher

- `run-hook.sh` now executes [`pkg/codex-plugin-aegis/src/hook.ts`](/Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/src/hook.ts) as the canonical Codex hook adapter.
- It exports stable defaults for `AEGIS_SIDECAR_URL`, `AEGIS_AGENT_ID`, `AEGIS_TENANT_ID`, and `AEGIS_CODEX_SURFACE`.
- It uses an absolute Node path (`/opt/homebrew/bin/node` by default) so Codex hook environments with minimal `PATH` do not fail.

## Outage policy

The packaged Codex hook adapter supports three outage modes when the sidecar is unavailable:

- `fail_open`
- `require_approval`
- `fail_closed`

Set `AEGIS_HOOK_OUTAGE_POLICY` in the hook launcher environment to choose the desired posture.
