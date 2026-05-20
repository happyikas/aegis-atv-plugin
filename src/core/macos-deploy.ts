import path from "node:path";

export interface LaunchdConfig {
  label: string;
  workingDirectory: string;
  nodeBinary: string;
  programPath: string;
  workspaceRoot: string;
  dataRoot: string;
  port: number;
  logPath: string;
  errorLogPath: string;
  bridgeCommand?: string;
  bridgeArgs?: string[];
  bridgeCwd?: string;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function defaultLaunchdConfig(projectRoot: string, homeDirectory: string): LaunchdConfig {
  const dataRoot = path.join(projectRoot, "data");
  return {
    label: "com.aegisdata.openclaw-lite",
    workingDirectory: projectRoot,
    nodeBinary: process.execPath,
    programPath: path.join(projectRoot, "dist", "daemon", "index.js"),
    workspaceRoot: path.join(homeDirectory, ".openclaw", "workspace"),
    dataRoot,
    port: 4187,
    logPath: path.join(dataRoot, "launchd.stdout.log"),
    errorLogPath: path.join(dataRoot, "launchd.stderr.log"),
  };
}

export function renderLaunchdPlist(config: LaunchdConfig): string {
  const envVars: Array<[string, string]> = [
    ["OPENCLAW_WORKSPACE", config.workspaceRoot],
    ["AEGIS_DATA_DIR", config.dataRoot],
    ["PORT", String(config.port)],
  ];

  if (config.bridgeCommand) {
    envVars.push(["OPENCLAW_BRIDGE_COMMAND", config.bridgeCommand]);
  }
  if (config.bridgeArgs) {
    envVars.push(["OPENCLAW_BRIDGE_ARGS", JSON.stringify(config.bridgeArgs)]);
  }
  if (config.bridgeCwd) {
    envVars.push(["OPENCLAW_BRIDGE_CWD", config.bridgeCwd]);
  }

  const envXml = envVars
    .map(
      ([key, value]) =>
        `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(config.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(config.nodeBinary)}</string>
    <string>${xmlEscape(config.programPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(config.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(config.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(config.errorLogPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
</dict>
</plist>
`;
}

export function renderBridgeTemplate(): string {
  return `#!/bin/zsh
set -euo pipefail

input="$(cat)"
action="$(printf '%s' "$input" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["action"])')"

case "$action" in
  send_email|modify_calendar|delete_file|external_share|read_file|search_memory)
    ;;
  *)
    echo '{"error":"unsupported_action"}'
    exit 1
    ;;
esac

# Replace this section with a real OpenClaw command or wrapper invocation.
# The contract is:
#   stdin  -> {"action":"...","payload":{...}}
#   stdout -> one JSON object with the execution result

printf '%s' "$input" | /usr/bin/python3 -c 'import json,sys; data=json.load(sys.stdin); print(json.dumps({"bridge":"shell-template","action":data["action"],"payload":data["payload"],"executed":True}))'
`;
}
