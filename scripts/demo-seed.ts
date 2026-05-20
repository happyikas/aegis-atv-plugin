import { pathToFileURL } from "node:url";
import { seedDemoWorkspace } from "../src/core/demo-seed.js";

async function main(): Promise<void> {
  const result = await seedDemoWorkspace(process.env.OPENCLAW_WORKSPACE);
  console.log(`Seeded demo workspace: ${result.workspaceRoot}`);
  console.log(`Files: ${result.createdFiles.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
