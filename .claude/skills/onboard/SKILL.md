---
name: onboard
description: Get a new teammate oriented in the Night Desk repo — read order, env setup, and a smoke test proving the deployed stack is alive. Use on first session in this repo, or when someone asks "where do I start", "catch me up", or "is the stack working".
---

# Onboard

## 1. Read, in this order
1. `STATE.md` — single source of truth. Decisions, open questions, session log. If it isn't in here, it didn't happen.
2. `README.md` — the four proofs, architecture, run commands, current blockers.
3. `SPIKE_REPORT.md` — Friday-night verdict, latency table, top Saturday risks.
4. `CLAUDE.md` — hard rules (they bind you too).

## 2. Environment
- Get `.env` pasted from Seth (seth@avosquado.com). It is gitignored — **never commit it, never hardcode any value from it**.
- Node 20+ required (`node -v`), then `npm install`.
- No Supabase CLI login needed for testing (curl + shared secret covers it); deploying needs `supabase` CLI authed to the nightdesk project.

## 3. Smoke test (proves the deployed stack, ~30s)
```bash
source .env 2>/dev/null || export $(grep -v '^#' .env | xargs)

# Agent brain answers (expect JSON with reply + ttft_ms + call_id):
curl -sX POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/agent \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET" -H "Content-Type: application/json" \
  -d '{"tenant_id":"760651bf-d739-4c1b-ad2b-93249848cf49","phone":"4155550100","utterance":"hi, checking my reservation"}'

# Dashboard renders (open in browser):
open "https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/dashboard?t=$TENANT_MCP_SHARED_SECRET"
```
If the agent call fails: check `TENANT_MCP_SHARED_SECRET` matches the deployed secret, then see the `deploy` skill for logs.

## 4. Hard rules (non-negotiable, from CLAUDE.md)
- AvoSquado DB (`umlzbhwhfcniyotnvred`, skitrip-dev) is DEV/PREVIEW and **SELECT-only**, regardless of key power. Prod (`wzlrfdjpqjvguflgnauf`) is never touched.
- **Ask Seth before any Sabre booking/exchange call.** Search freely.
- Simulated results are honest: `live=false` on the actions row, `SIM-*` ids. Never fake a live result.
- Stop-and-report beats workaround — a 403 or schema gap surfaced is a win, papered over is a loss.