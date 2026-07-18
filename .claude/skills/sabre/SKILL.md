---
name: sabre
description: Work with the Sabre CERT environment — flight search, the REST vs MCP pipes, and the booking gate. Use for anything touching Sabre APIs, offers, PNRs, bookings, or when a Sabre call fails.
---

# Sabre CERT

Auth: `SABRE_ACCESS_TOKEN` in `.env` — a long-lived CERT session token that works on **both** surfaces below. There is no client id/secret to mint a fresh one (top Saturday risk: unknown TTL — if calls start returning 401, tell Seth immediately; do not thrash).

## Two pipes (decision already made — don't relitigate)
- **Direct REST — the call path.** `api.cert.platform.sabre.com`, ~2.2s search. Code: `supabase/functions/_shared/sabre.ts` (deployed) and `nightdesk/src/pipes/sabre-rest.ts` (local reference). `POST /v1/offers/flightShop` for search; create/get/cancelBooking implemented.
- **MCP connector — fallback/knowledge only.** `mcp.cert.sabre.com/mcp`, Streamable HTTP + Bearer, 10 tools (verbatim dump: `sabre-tools-verbatim.json`), ~12.9s for the same search via a 3-tool chain. Workflow tools take only a `conversationId` and return instructions; spec tools mint the conversationId.

```bash
# Quick live search sanity check (local, prints speakable top offers):
npx tsx nightdesk/scripts/phase1-search.ts 2026-07-19 rest
```

## The booking gate (hard rule)
- **Search freely. Never fire a booking/exchange/cancel against Sabre without Seth's explicit yes for that attempt.**
- The gate is mechanical: bookings are simulated (`SIM-*`, `live=false`) unless the `SABRE_BOOKING_ARMED=yes` secret is set. Never set it on your own initiative, and unset it after the approved attempt.
- Hotels: search + quote + hold only. Never book a hotel. No payment cards ever; refunds always escalate.

## Conventions
- Speakable-first canonical model (`nightdesk/src` `model.ts` shapes): tools return short `speakable` strings + opaque `offer_ref`s; full supplier payloads are cached server-side in the `offers` table, never fed into LLM context.
- A Sabre 403/4xx or weird latency is a *finding* — log it in STATE.md, don't work around it silently.