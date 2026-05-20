import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultLaunchdConfig,
  renderBridgeTemplate,
  renderLaunchdPlist,
} from "../src/core/macos-deploy.js";

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const homeDirectory = os.homedir();
  const config = defaultLaunchdConfig(projectRoot, homeDirectory);
  const plist = renderLaunchdPlist({
    ...config,
    bridgeCommand: process.env.OPENCLAW_BRIDGE_COMMAND,
    bridgeArgs: process.env.OPENCLAW_BRIDGE_ARGS ? JSON.parse(process.env.OPENCLAW_BRIDGE_ARGS) : undefined,
    bridgeCwd: process.env.OPENCLAW_BRIDGE_CWD,
  });

  const outputDir = path.join(projectRoot, "deployment");
  await fs.mkdir(outputDir, { recursive: true });

  const plistPath = path.join(outputDir, `${config.label}.plist`);
  const bridgePath = path.join(outputDir, "openclaw-bridge-template.sh");

  await fs.writeFile(plistPath, plist, "utf8");
  await fs.writeFile(bridgePath, renderBridgeTemplate(), "utf8");
  await fs.chmod(bridgePath, 0o755);

  console.log(`Generated launchd plist: ${plistPath}`);
  console.log(`Generated bridge template: ${bridgePath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
