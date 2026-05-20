import path from "node:path";
import type { OpenClawActionHarness } from "../adapters/mcporter-hook.js";
import { OpenClawActionHarness as Harness, type ActionExecutor } from "../adapters/mcporter-hook.js";
import { AegisMcpProxy, createConfiguredMcpTransport } from "../adapters/mcp-proxy.js";
import { createConfiguredOpenClawBridge, executeViaOpenClawBridge } from "../adapters/openclaw-bridge.js";
import { OpenClawWorkspaceAdapter } from "../adapters/openclaw-workspace.js";
import { ApprovalQueue } from "../core/approval-queue.js";
import { ActionFirewall } from "../core/action-firewall.js";
import { AegisControlPlane } from "../core/control-plane.js";
import { EventCollector } from "../core/event-collector.js";
import { IntegrityBaselineStore } from "../core/integrity.js";
import { TelemetryStore } from "../core/telemetry-store.js";
import { AuditLogger } from "../daemon/audit.js";
import { CheckpointManager } from "../daemon/checkpoint.js";

export interface AegisRuntime {
  workspace: OpenClawWorkspaceAdapter;
  approvals: ApprovalQueue;
  audit: AuditLogger;
  checkpoints: CheckpointManager;
  integrity: IntegrityBaselineStore;
  telemetry: TelemetryStore;
  collector: EventCollector;
  actions: OpenClawActionHarness;
  controlPlane: AegisControlPlane;
  mcpProxy: AegisMcpProxy;
  dataRoot: string;
  workspaceRoot: string;
}

const bridge = createConfiguredOpenClawBridge();
const defaultExecutor: ActionExecutor = async (request) => executeViaOpenClawBridge(bridge, request);

export function buildAegisRuntime(
  env: NodeJS.ProcessEnv = process.env,
  executor: ActionExecutor = defaultExecutor,
): AegisRuntime {
  const workspace = OpenClawWorkspaceAdapter.fromEnvironment(env);
  const workspaceRoot = workspace.root;
  const dataRoot = env.AEGIS_DATA_DIR ?? path.join(process.cwd(), "data");

  const approvals = new ApprovalQueue(dataRoot);
  const audit = new AuditLogger(dataRoot);
  const checkpoints = new CheckpointManager(workspace, dataRoot);
  const integrity = new IntegrityBaselineStore(dataRoot, process.cwd());
  const telemetry = new TelemetryStore(dataRoot);
  const collector = new EventCollector(dataRoot, audit);
  const firewall = new ActionFirewall(integrity);
  const actions = new Harness(approvals, audit, executor, firewall, telemetry);
  const controlPlane = new AegisControlPlane({
    approvals,
    audit,
    actions,
    integrity,
    collector,
  });
  const mcpProxy = new AegisMcpProxy(controlPlane, createConfiguredMcpTransport(env), dataRoot);

  return {
    workspace,
    approvals,
    audit,
    checkpoints,
    integrity,
    telemetry,
    collector,
    actions,
    controlPlane,
    mcpProxy,
    dataRoot,
    workspaceRoot,
  };
}
