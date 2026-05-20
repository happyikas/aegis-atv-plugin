# Aegis ATV Development And Validation Plan

## Development plan

### Day 1
- Lock scope to software-only demo aligned with ATV, AIA, and PPA patent themes
- Define API contract for action preview, integrity baseline, and integrity check

### Day 2
- Implement provenance model and action firewall decision engine
- Implement blast-radius and intent-divergence heuristics

### Day 3
- Implement `ATV-2080-v1-demo` vector generation and response wiring
- Add audit visibility and sample action payloads

### Day 4
- Implement build-to-runtime integrity baseline and mutation detection
- Connect integrity signals to gating decisions

### Day 5
- Package Codex plugin metadata and reusable skill
- Update README and demo instructions

### Day 6
- Run full tests and harden edge cases
- Produce demo script and investor/customer pitch framing

### Day 7
- GitHub repo cleanup for `happyikas`
- Branch, tag demo milestone, and prepare PR or showcase branch

## Validation plan

1. Functional validation
- Preview a low-risk read action and confirm `allow`
- Preview `external_share` with trusted support and confirm `require_approval`
- Preview `delete_file` with read-only declared intent and confirm `block`

2. Integrity validation
- Create baseline
- Modify `README.md` or plugin manifest
- Confirm `POST /integrity/check` reports mutation
- Confirm mutated artifact causes action block or escalation

3. Provenance validation
- Provide a trusted opposing instruction and lower-trust supporting instruction
- Confirm directive-precedence violation signal appears

4. Telemetry validation
- Confirm vector length is 2080
- Confirm telemetry hash and id are returned
- Confirm signal count changes vector values

5. Regression validation
- Run `npm test`
- Run `npm run build`

## Demo acceptance gate

- All tests green
- Demo commands reproducible in a fresh local workspace
- Screenshare-ready narrative under 7 minutes
- Customer and investor versions of the demo use the same working build
