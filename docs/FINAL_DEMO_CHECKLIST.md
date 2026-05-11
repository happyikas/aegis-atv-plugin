# Final Demo Checklist

Use this checklist right before a customer or investor demo.

## Codex UI check

1. Open the Codex plugin picker or installed plugin list.
2. Confirm `Aegis ATV` appears as an available local plugin.
3. Confirm the demo skill is visible or invocable as `aegis-atv-demo`.
4. If the plugin does not appear, restart the Codex app after the local marketplace update and re-check.

## Runtime check

1. Run `npm run build`
2. Seed a sample workspace if needed:
   - `npm run demo:seed`
3. Start the built daemon
4. Create a fresh integrity baseline

## Demo flow check

1. Safe preview returns `allow`
2. Risky preview returns `require_approval`
3. Misleading preview returns `block`
4. Artifact drift check returns `clean: false`
5. Risky preview after drift returns `block`

## Presentation check

1. Show summary fields only:
   - `verdict`
   - `signals`
   - `telemetry.telemetry_id`
   - `telemetry.vector_sha256`
2. Avoid opening the full telemetry vector unless explicitly asked.
3. Use the product story in `README.md` rather than starting with low-level implementation detail.

## PR readiness rule

Keep PR #1 in `draft` until the Codex UI check is completed once on the actual app.

After that, it is reasonable to move the PR to `ready for review`.
