# @aegis/codex-plugin-aegis

A Codex hook adapter that forwards `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, and `Stop` events to an Aegis ATV sidecar.

## What it does

- Converts Codex lifecycle hook payloads into Aegis ATV sidecar requests.
- Translates Aegis verdicts into Codex-friendly hook outcomes.
- Defaults to fail-open behavior so local development is not blocked by adapter transport issues.

## Environment

- `AEGIS_SIDECAR_URL`
  - Default: `http://127.0.0.1:4187`
- `AEGIS_AGENT_ID`
  - Default: `aid:codex`
- `AEGIS_TENANT_ID`
  - Default: `local-tenant`
- `AEGIS_CODEX_SURFACE`
  - Default: `codex-desktop`
- `AEGIS_HOOK_FAIL_OPEN`
  - Default: `1`

## Usage

```bash
cat examples/session-start.json | node --import tsx src/hook.ts
cat examples/user-prompt-submit.json | node --import tsx src/hook.ts
cat examples/pre-tool-use.json | node --import tsx src/hook.ts
```

The hook writes a JSON result to stdout and exits with code `0` even when fail-open suppression is triggered.

## Example fixtures

- `examples/session-start.json`
- `examples/user-prompt-submit.json`
- `examples/pre-tool-use.json`
- `examples/post-tool-use.json`
