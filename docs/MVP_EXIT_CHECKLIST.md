# MVP Exit Checklist

This checklist records the current closure status for the Aegis ATV for Codex MVP.

## MVP status

- Overall status: `demo-ready MVP complete`
- Remaining status before "operationally closed": `desktop-hook hard enforcement remains unverified in the tested Codex desktop build`

## Closed items

1. `ATV-Lite` schema implemented
   Evidence:
   - [src/core/atv-lite.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/core/atv-lite.ts)
   - [src/tests/unit/atv-lite.test.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/tests/unit/atv-lite.test.ts)

2. Event collector implemented
   Evidence:
   - [src/core/event-collector.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/core/event-collector.ts)

3. Append-only audit log implemented
   Evidence:
   - [src/core/audit.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/core/audit.ts)
   - [src/tests/unit/audit.test.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/tests/unit/audit.test.ts)

4. Basic Action Firewall decision API implemented
   Evidence:
   - [src/api/routes.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/api/routes.ts)
   - [src/core/action-firewall.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/core/action-firewall.ts)

5. Codex hooks adapter implemented
   Evidence:
   - [src/adapters/codex-hooks.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/adapters/codex-hooks.ts)
   - [pkg/codex-plugin-aegis/src/hook.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/pkg/codex-plugin-aegis/src/hook.ts)

6. MCP proxy forwarding and stdio shim implemented
   Evidence:
   - [src/adapters/mcp-proxy.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/src/adapters/mcp-proxy.ts)
   - [scripts/mcp-stdio-shim.ts](/Users/chanikpark/Documents/aegis_atv_codex_mvp/scripts/mcp-stdio-shim.ts)

7. Deployment templates written for local Codex setup
   Evidence:
   - [deployment/codex/hooks.json](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/hooks.json)
   - [deployment/codex/managed-config.toml](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/managed-config.toml)
   - [deployment/codex/README.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/deployment/codex/README.md)

8. User-facing demo and pitch assets produced
   Evidence:
   - [docs/AEGIS_ATV_TWO_SLIDE_BRIEF.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/AEGIS_ATV_TWO_SLIDE_BRIEF.md)
   - [Aegis_ATV_Two_Slide_Brief.pptx](/Users/chanikpark/Documents/aegis_atv_codex_mvp/outputs/aegis-atv-two-slide/Aegis_ATV_Two_Slide_Brief.pptx)
   - [docs/AEGIS_ATV_USER_MANUAL.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/AEGIS_ATV_USER_MANUAL.md)
   - [docs/CODEX_PLUGIN_DEMO_RUNBOOK.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/CODEX_PLUGIN_DEMO_RUNBOOK.md)
   - [docs/CODEX_LOCAL_SETUP_CHECKLIST.md](/Users/chanikpark/Documents/aegis_atv_codex_mvp/docs/CODEX_LOCAL_SETUP_CHECKLIST.md)

## Verified in this closure pass

1. Test suite passes
   Result:
   - `npm test`
   - `24` test files passed
   - `89` tests passed

2. Production build passes
   Result:
   - `npm run build`
   - TypeScript build completed successfully

3. Codex hook script runs against a sample event
   Result:
   - Command: `npm run hook:codex`
   - Sample outcome: `PreToolUse -> allow`
   - Telemetry id returned successfully

4. MCP stdio shim responds to a sample MCP request
   Result:
   - Command: `npm run mcp:stdio`
   - Sample request: `tools/list`
   - Returned upstream tool list plus Aegis descriptor metadata

5. Local daemon starts successfully
   Result:
   - Command: `npm run dev`
   - Health endpoint returned `{"status":"healthy"}`

6. Integrity baseline creation works
   Result:
   - Endpoint: `POST /integrity/baseline`
   - Baseline created successfully for the current repo root

7. Verdict spectrum works end-to-end
   Result:
   - Safe preview: `allow`
   - Risky preview: `require_approval`
   - Divergent preview: `block`

8. Approval queue and replay work end-to-end
   Result:
   - Intercepted action created an approval item
   - Approval transitioned to `approved`
   - Replay executed successfully

## Remaining manual closure items

1. Treat desktop hooks as optional/non-blocking in the current desktop build
   Result:
   - live Codex desktop sessions were created successfully
   - user config, managed defaults, and managed requirements were all applied
   - interactive Aegis hook events did not appear in local Aegis telemetry or audit logs

2. Operate the MVP with MCP proxy primary enforcement
   Result:
   - MCP proxy forwarding and descriptor drift blocking were validated live
   - this is the recommended pilot and customer deployment posture

## Closed deployment and live integration items

1. Deployment templates applied to the real local Codex config
   Result:
   - Installed [~/.codex/config.toml](/Users/chanikpark/.codex/config.toml) with Aegis hook and MCP entries
   - Installed [~/.codex/hooks.json](/Users/chanikpark/.codex/hooks.json)
   - Installed [~/.codex/managed-config.toml](/Users/chanikpark/.codex/managed-config.toml)
   - Backup created at `/Users/chanikpark/.codex/config.toml.bak-20260512-160738`

2. Live upstream MCP forwarding verified
   Result:
   - Clean baseline run forwarded `upstream.echo`
   - Proxy returned `allow`
   - Upstream text result returned successfully

3. Live upstream MCP descriptor drift verified
   Result:
   - Drifted `tools/list` changed descriptor hash and tool count
   - Proxy returned `block`
   - Signal included `mcp_descriptor_drift`

## Explicitly out of scope for this MVP

- Hardware attestation or secure element integration
- Enterprise SSO or tenant-grade RBAC
- Production-scale observability, HA, backup, or disaster recovery
- Compliance packaging for public enterprise GA

## Exit recommendation

- You can treat the MVP as `complete for demo, design partner discussion, and pilot setup`.
- You should treat it as `operationally usable for demo and pilot` when deployed as `MCP proxy primary`.
- You should not claim `desktop hook hard enforcement validated` for the currently tested Codex desktop build.
