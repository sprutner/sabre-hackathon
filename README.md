# Night Desk — Friday-night spike

**What this is:** the falsification spike for **Night Desk**, a drop-in after-hours voice desk for travel agencies that actually *transacts* (built at the DeepLearning.AI × Sabre × Vocal Bridge hackathon, Sat Jul 18). Tonight's repo proves/falsifies the risky parts; **the real product gets built fresh Saturday** — we carry knowledge forward, not code.

**Read order if you're new:** [STATE.md](STATE.md) (single source of truth — decisions, open questions, session log) → [claude-code-spike-brief.md](claude-code-spike-brief.md) (what tonight is testing) → this file (how to run it).

**Using Claude Code?** The repo ships skills in `.claude/skills/` — start with `/onboard` (orientation + stack smoke test), then `/test-call`, `/deploy`, `/sabre`, and `/wrap-up` (STATE.md + commit conventions).

## The four proofs (a chatbot has none)

| # | Proof | Status tonight |
|---|-------|----------------|
| 1 | **ACTS** — real Sabre CERT transaction end-to-end | Search LIVE on both pipes (REST 2.2s, MCP connector 12.9s → REST wins the call path). Booking code ready, not fired (needs Seth's explicit go: `SABRE_BOOKING_ARMED=yes`) |
| 2 | **REMEMBERS** — caller context from the real app (AvoSquado DEV), no interview | Contract + both pipes built and deployed. Blocked by RLS on `profiles` (needs dev service key or deploy-on-tenant) |
| 3 | **INITIATES** — outbound-call trigger seam | Seam verified: `trigger-outbound` writes call + action rows; real VB dial awaits `VB_CALL_URL` secret |
| 4 | **ACCOUNTS** — every tool call writes an auditable row + dashboard | **LIVE.** Schema applied (8 tables incl. `offers`); Phase 3 convo produced full actions trail + escalation queue row; dashboard renders LIVE/SIM chips |

## Architecture (post-pivot: everything callable lives on Supabase)

```
caller ⇄ PSTN ⇄ Vocal Bridge (voice layer, Avi prompt)
                    ⇄ POST /functions/v1/agent          ← Supabase Edge Function (public URL, bearer-authed)
                          brain: Claude Haiku 4.5, streaming, no extended thinking
                          7 tools: lookup_reservation · search_flights · rebook_flight ·
                                   search_hotels · place_hold · escalate · send_sms(stub)
                          every dispatch → actions row (live flag is HONEST — SIM badges render from it)
        Sabre CERT ⇄ direct REST (pipe B, live) or Anthropic MCP connector (pipe A)
        AvoSquado  ⇄ avosquado-mcp (3-tool tenant MCP contract; any tenant implementing it is onboardable)
        dashboard  ⇄ `dashboard` fn (HTML, LIVE/SIM chips) + `desk-data` fn (JSON: calls / actions / queue)
```

Two products, cleanly separable:
- **`/supabase/functions/`** + **`/nightdesk/`** — the Night Desk product (edge functions are the runtime; `nightdesk/src` is the Node-flavored reference from Phases 0–2 + scripts)
- **`/avosquado-mcp/`** — tenant-side connector (AvoSquado's product surface, survives as its own repo). Contract = 3 tools: `lookup_reservation_by_phone`, `get_trip_context`, `get_group_state`. First names only in payloads.

## Environment

Copy `.env` from Seth (never committed). Key vars:

| Var | What / where to get it |
|-----|------------------------|
| `SABRE_ACCESS_TOKEN` | Long-lived CERT session token (works on both `mcp.cert.sabre.com/mcp` and `api.cert.platform.sabre.com` — no OAuth mint needed) |
| `ANTHROPIC_API_KEY` | Brain + MCP-connector pipe (credits added mid-spike; working) |
| `NIGHTDESK_SUPABASE_URL/_SERVICE_KEY` | Project `ppapponwxvfnmpcatyju` (Night Desk DB) |
| `NIGHTDESK_DATABASE_URL` | Session-pooler URI (only needed for local Prisma tooling) |
| `AVOSQUADO_DEV_SUPABASE_URL/_KEY` | skitrip-dev `umlzbhwhfcniyotnvred`. **Read-only by policy, always** — anon key can't read `profiles` (RLS), see STATE |
| `TENANT_MCP_SHARED_SECRET` | Bearer for our own function endpoints + avosquado-mcp |
| `VOICEBRIDGE_KEY` | Vocal Bridge API key |

Hard rules: AvoSquado DB is dev/preview and SELECT-only regardless of key power. Never touch prod (`wzlrfdjpqjvguflgnauf`). No payment cards ever; refunds always escalate. Ask Seth before any Sabre **booking** call (search freely).

## Run it

```bash
npm install                                  # node 20+ (machine has v24)

# Local reference pipes (phases 0–2):
npx tsx nightdesk/scripts/phase1-search.ts 2026-07-19 rest   # live Sabre search
npx tsx avosquado-mcp/src/server.ts                          # tenant MCP on :8788/mcp
npx tsx nightdesk/scripts/phase2-verify.ts <phone>           # contract check, both pipes
npx tsx nightdesk/scripts/seed.ts                            # idempotent nightdesk seed (2 tenants, Dana + Marcus)
npx tsx nightdesk/scripts/phase3-convo.ts [tenant] [model]   # 4-turn convo vs deployed agent fn; prints TTFT + tool trail

# Edge functions (the real runtime):
supabase functions deploy <fn> --project-ref ppapponwxvfnmpcatyju --no-verify-jwt
supabase secrets set --project-ref ppapponwxvfnmpcatyju SABRE_ACCESS_TOKEN=... ANTHROPIC_API_KEY=... TENANT_MCP_SHARED_SECRET=...
curl -X POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/migrate \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET"        # applies schema idempotently
curl -X POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/agent \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET" -H "Content-Type: application/json" \
  -d '{"tenant_id":"<uuid>","phone":"4155550100","utterance":"my flight got cancelled"}'

# Dashboard (ugly-but-truthful; LIVE/SIM chips render from actions.live):
open "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/dashboard?t=$TENANT_MCP_SHARED_SECRET"
```

One commit per phase (`phase-N: …`) — the git log is part of the spike report.

## Current blockers (who: what)

1. **skitrip-dev service key** (Seth) *or* deploy `avosquado-mcp` onto the skitrip-dev project (injected service role solves it): without one, phone lookup can't see `profiles` (RLS) and the REMEMBERS proof stays broken.
2. **Booking go/no-go** (Seth): one real CERT `createBooking` + retrieve + cancel (`SABRE_BOOKING_ARMED=yes` secret + rerun), or stay simulated.
3. **Demo trip shape**: "VB demo" trip = 1 member, no lodging — enrich in the app before the pitch (arc assumes a group + lodging beat).
4. **`VB_CALL_URL` unknown** (`vb` CLI never found on PATH) — outbound stays a verified seam until VB's call API URL is set as a secret.

Resolved during the spike: Anthropic credits added (brain live); **Haiku won the stopwatch** (TTFT 639ms vs Sonnet 1194ms, avg turn 5.8s vs 14.0s, same error rate); **direct REST won the Sabre call path** (2.2s vs 12.9s). Details + two behavioral findings (durable offer refs; must-call-tool prompt line) in STATE.md session log.

## End state tonight

`SPIKE_REPORT.md` — verdict (NIGHT DESK vs CHATBOT WITH EXTRA STEPS), environment inventory, latency table, model/pipe recommendations, ranked questions, top-3 Saturday risks. If it's not in STATE.md, it didn't happen.
