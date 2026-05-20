# Aegis ATV 1-Week Delivery Spec

## Goal

Deliver a demo-capable Codex-aligned Aegis ATV plugin that turns the patent narrative into a software-first product slice for customer, investor, and design-partner conversations.

## Week-1 deliverables

1. Action Firewall demo
- Pre-execution action review for `read_file`, `search_memory`, `send_email`, `modify_calendar`, `external_share`, `delete_file`
- Verdicts: `allow`, `require_approval`, `block`
- Blast-radius classification and signal explanation

2. Agent Telemetry Vector demo
- Generate a fixed-length `ATV-2080-v1-demo` vector
- Persist vector hash and telemetry id in API responses
- Support simple cost and oversight features in the vector

3. Instruction provenance demo
- Track instruction sources with trust levels
- Flag directive-precedence anomalies
- Flag lower-trust escalation on higher-blast-radius actions

4. Build-to-runtime integrity demo
- Create a local signed baseline of instruction and plugin artifacts
- Detect changed or missing files
- Feed mutation results into action gating

5. Codex packaging
- Repo-local plugin manifest
- Repo-local marketplace entry
- Reusable skill definition for previewing guarded actions

6. Demo documentation
- Engineering plan
- Validation plan
- Customer/investor demo narrative

## Non-goals for week 1

- Hardware TEE signing
- FPGA or CSD execution
- Real MCP transport interception
- Multi-tenant aggregation
- Production UI

## Success criteria

- A risky action can be previewed and returns a telemetry-backed verdict
- A changed plugin or instruction artifact causes integrity failure detection
- A directive-precedence conflict causes approval escalation
- A misleading declared intent can cause a block
- Unit and integration tests pass
