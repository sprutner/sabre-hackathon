---
name: test-call
description: Exercise the Night Desk agent — seed demo data, send a single utterance, run the scripted 4-turn conversation with latency stats, or inspect the actions ledger. Use when testing the brain, tools, prompts, or measuring TTFT.
---

# Test a call

Agent endpoint: `POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/agent`
Body: `{"tenant_id": "<uuid>", "phone": "<caller>", "utterance": "<text>", "call_id": "<uuid, optional — continues a call>", "model": "<optional override>"}`
Auth: `Authorization: Bearer $TENANT_MCP_SHARED_SECRET`. Response includes `reply`, `call_id`, `ttft_ms`, tool trail.

Default test tenant: `760651bf-d739-4c1b-ad2b-93249848cf49` ("Seth's Travel Co", generic adapter, Dana + Marcus seeded). The AvoSquado tenant exercises the live tenant-MCP pipe instead (`profiles` RLS gap: lookup may return not-found until the skitrip-dev service key is set).

```bash
# Seed/refresh demo data (idempotent — safe to rerun):
npx tsx nightdesk/scripts/seed.ts

# One-shot utterance:
curl -sX POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/agent \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET" -H "Content-Type: application/json" \
  -d '{"tenant_id":"760651bf-d739-4c1b-ad2b-93249848cf49","phone":"4155550100","utterance":"my flight tonight got cancelled"}'
# → note the call_id; pass it back in the next request to continue the same call.

# Full scripted 4-turn convo (cancel → search → book → refund-escalate) with per-turn TTFT + tool trail:
npx tsx nightdesk/scripts/phase3-convo.ts [tenant_id] [model]

# Inspect results:
open "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/dashboard?t=$TENANT_MCP_SHARED_SECRET"
curl -s "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/desk-data?resource=actions" \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET"
```

## What good looks like
- Haiku TTFT ≲ 700ms, tool turns ≲ 6s (Friday baselines: 639ms / 5.8s avg).
- Every tool dispatch = one `actions` row with an honest `live` flag; escalations also write a `queue` row.
- Bookings return `SIM-*` ids unless `SABRE_BOOKING_ARMED=yes` — which requires Seth's explicit yes first, no exceptions.

## Known failure modes (from the spike — check these first)
- Model invents an `offer_ref` → rebook rejects it (by design) and the model re-searches, costing ~10s. Fix direction: durable short refs in `offers` injected per turn.
- Model *says* "I'll escalate" without calling the tool → the prompt has a must-call-tool line; if you edit the system prompt, keep it.