#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${AEGIS_BASE_URL:-http://localhost:4187}"

echo ""
echo "Aegis ATV enterprise value demo"
echo "Base URL: ${BASE_URL}"
echo ""

echo "1) Create integrity baseline"
curl -sS -X POST "${BASE_URL}/integrity/baseline" \
  -H 'content-type: application/json' \
  -d '{}'
echo ""
echo ""

echo "2) Cost control scenario"
echo "   Show that a low-value but high-cost external share is blocked before side effects happen."
curl -sS -X POST "${BASE_URL}/actions/preview" \
  -H 'content-type: application/json' \
  -d '{
    "action":"external_share",
    "requested_by":"aid:executor",
    "payload":{"target":"https://partner.example/upload","resource":"memory/task-001.md"},
    "context":{
      "declared_intent":"inspect the workspace only",
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"review only, do not publish","stance":"supporting"}
      ],
      "cost":{"input_tokens":42000,"output_tokens":9000,"reasoning_tokens":15000,"estimated_usd":14.75}
    }
  }'
echo ""
echo ""

echo "3) Performance scenario"
echo "   Show that a low-risk read path stays fast and unblocked."
curl -sS -X POST "${BASE_URL}/actions/preview" \
  -H 'content-type: application/json' \
  -d '{
    "action":"read_file",
    "requested_by":"aid:retriever",
    "payload":{"path":"MEMORY.md"},
    "context":{
      "declared_intent":"inspect canonical memory only",
      "sources":[
        {"kind":"user_prompt","label":"operator request","content":"inspect memory only","stance":"supporting"}
      ],
      "cost":{"input_tokens":500,"output_tokens":40,"reasoning_tokens":80,"estimated_usd":0.02}
    }
  }'
echo ""
echo ""

echo "4) Security scenario"
echo "   Show that conflicting intent plus side effects escalates or blocks execution."
curl -sS -X POST "${BASE_URL}/mcp" \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":"security-demo-1",
    "method":"tools/call",
    "params":{
      "name":"aegis.intercept_action",
      "arguments":{
        "action":"delete_file",
        "requested_by":"aid:mcp:client",
        "payload":{"path":"/tmp/demo.txt"},
        "context":{
          "declared_intent":"summarize file contents for review only",
          "sources":[
            {"kind":"user_prompt","label":"operator request","content":"review only","stance":"supporting"}
          ]
        }
      }
    }
  }'
echo ""
echo ""

echo "5) Dashboard and telemetry surfaces"
echo "   Open ${BASE_URL}/dashboard in a browser and compare the latest two telemetry records."
curl -sS "${BASE_URL}/telemetry?limit=2"
echo ""
echo ""

echo "Done. For the full operator script, see docs/AEGIS_ATV_CUSTOMER_VALUE_DEMOS.md"
