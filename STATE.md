# NIGHT DESK — PROJECT STATE
Single source of truth. Lives in repo root. Updated by Seth, chat-Claude, and Claude Code after every phase or session. **If it isn't in here, it didn't happen.**
Last updated: Fri Jul 17, 2026 — pre-spike, late evening.

## One-liner
Drop-in after-hours voice desk that transacts. Agencies = wedge tenant. AvoSquado = tenant #2 proving the drop-in via the tenant MCP contract. Built at the DeepLearning.AI × Sabre × Vocal Bridge hackathon, Sat Jul 18.

## FACTS THAT MUST NOT DRIFT
- Hackathon is **Saturday Jul 18**. Doors 8:00, hacking 10:00–16:00, pitches 16:00.
- AvoSquado access = **DEV/PREVIEW environment only**. Never prod. Read-only regardless of key provided.
- Night Desk is its **own repo and product** — not an AvoSquado feature. AvoSquado appears only as tenant #2.
- Tenant integration boundary = **MCP contract** (3 tools: lookup_reservation_by_phone, get_trip_context, get_group_state). Plain-HTTP fallback with identical shapes. Transport swappable; contract invariant.
- Provenance line: tenant-side connector (avosquado-mcp) = pre-existing product surface (scoped June 2026, resurrected tonight). The **desk itself is built Saturday**. Disclosed in the close.
- Sabre = **tools-based MCP server**, mcp.cert.sabre.com/mcp, CERT env, Streamable HTTP + Bearer. Flights get the live transaction (exchange/reshop). Hotels = search + spoken quote + HOLD, never book.
- Voice = **real PSTN both directions** via Vocal Bridge. In-app = one config line, never built.
- **No payment card handling, ever. Refunds always escalate.**
- Never speak a real user's name on stage. Demo trip is created through the app in dev/preview.
- Pitch: never fake a live ring; SIM/CACHED badges auto-render from `actions.live=false`.
- Supabase refs: nightdesk = **ppapponwxvfnmpcatyju** (new free org — outside chat-Claude's connector scope; Claude Code applies schema). AvoSquado dev/preview = **umlzbhwhfcniyotnvred** ("skitrip-dev" — confirm in intake). AvoSquado prod = wzlrfdjpqjvguflgnauf — **never touch**.

## LOCKED DECISIONS
- Demo arc: one night at the agency — inbound IRROPS reshop (+hotel ripple, +refund escalation) → outbound schedule-change ring → morning dashboard reveal → tenant flip + config flash.
- Coherence rule: every live beat traces to the 11pm cancellation; everything else is a dashboard row.
- Escalation is a feature (queue + callback promise), never "I can't help."
- Model: **Haiku 4.5 default** on call path, Sonnet 4.6 promotion path — spike decides by stopwatch. No extended thinking on call path. Streaming on.
- Pitch cut order: hotel beat → curveball → outbound last. **Escalation queue never cut.**
- Closing disclosure: "Everything you watched was built today — but I've been aiming at it for two years without knowing it. I run a group-travel app, and I hold the agent license. I'd be my own first two customers."
- Data shaping: **internal canonical model, speakable-first** (`model.ts`: Reservation/FlightOffer/HotelOffer/OrderResult + `say` strings + opaque `ref`s; full supplier payloads cached server-side in `offers`, never in LLM context). NDC-aligned *vocabulary* (offers→orders), no standard schemas adopted. Rapid (EPS) = future lodging pipe — Q&A line tying the agent license to the architecture.

## OPEN QUESTIONS / PENDING GATES
| # | Question | Decided by |
|---|----------|-----------|
| 1 | Sabre MCP reachable, or 403 (PCC/EPR attribute)? | Spike Phase 0 |
| 2 | ~~VB outbound available on current tier?~~ **RESOLVED (intake):** outbound enabled per Seth; but `vb` CLI not on PATH — locate before Phase 4 | intake Fri |
| 3 | VB delegation: full conversation history or last utterance only? | Seth, VB docs/test |
| 4 | Claude-in-path vs VB-native tools (decision rule set Fri) | Gate 2 findings |
| 5 | ~~Haiku vs Sonnet~~ **RESOLVED: Haiku.** TTFT 639ms vs 1194ms, avg turn 5.8s vs 14.0s, same tool-error rate (1 each, identical failure mode) | Phase 3 stopwatch |
| 6 | ~~Sabre pipe~~ **RESOLVED: direct REST on the call path** (2.2s deterministic vs 12.9s model-driven 3-tool chain). MCP connector kept as fallback/knowledge | Phase 1 |
| 7 | ~~Tenant pipe~~ **RESOLVED: MCP contract works** (deployed as edge function; 3 tools verified over JSON-RPC). One gap: profiles RLS needs dev service key | Phase 2 |
| 8 | Beat 1 branch if CERT PNR unavailable → run on AvoSquado tenant? | Spike report |
| 9 | Damir confirmed for 1am Belgrade cameo? | Seth |
| 10 | Live "call it yourself" closing slide? | Sat 3:45, two clean rehearsals |
| 11 | ~~Nightdesk Supabase path~~ **RESOLVED:** new free org, project `ppapponwxvfnmpcatyju`. Schema application → Claude Code Phase 3 (idempotent). Seth pastes URL + service key into `.env` | done Fri |

## ARTIFACTS LEDGER
| File | Status | Purpose |
|------|--------|---------|
| avi-system-prompt.md | superseded | v1 generic voice-TA prompt |
| avi-night-desk-system-prompt.md | CURRENT | Avi prompt for VB voice layer, incl. outbound first-ten-seconds protocol |
| night-desk-pitch-script.md | CURRENT | 3-beat script, caller beats, 90s cut, contingencies |
| night-desk-saturday-runbook.md | CURRENT (see DELTAS) | Friday gates, schema, Saturday build order, wireframe, risk table |
| claude-code-spike-brief.md | CURRENT (v2.1) | Friday-night falsification harness w/ intake + tenant-MCP; idempotent schema |
| CLAUDE.md | CURRENT | Claude Code entry point: read order, hard rules, conventions, definition of done |
| STATE.md | CURRENT | this file (renamed from night-desk-state.md Fri late) |

## DELTAS vs RUNBOOK (do not re-edit the runbook; this section wins)
1. AvoSquado env is dev/preview, not prod (runbook says "prod read-only" — superseded).
2. Tenant integration = avosquado-mcp mini server (own package/repo) fronting the dev DB; direct adapter demoted to fallback pipe behind `TENANT_PIPE=mcp|direct`.
3. Config modal JSON gains: `"integration": {"type": "mcp", "url": "https://<tenant>/mcp"}` — flash this in Beat 3.
4. Fresh `night-desk` repo created Saturday; tonight's spike repo is throwaway reference only.
5. Pitch wording: "reading live from the real app" — not "production data."

## ARCHITECTURE (current)
```
caller ⇄ PSTN ⇄ Vocal Bridge (voice layer; Avi night-desk prompt)
                    ⇄ [delegation — pending Q3/Q4] ⇄ brain (Claude Haiku, streaming, no thinking)
                          tools:
                            • Sabre MCP (CERT) — search / exchange / hotel avail / PNR retrieve
                            • tenant MCP (avosquado-mcp → AvoSquado DEV db, read-only)
                            • nightdesk db — reservations, calls, actions(live flag), holds, queue
dashboard (realtime) ⇄ nightdesk db
outbound trigger → VB call API → same brain, outbound prompt section
```

## SESSION LOG
- **Wed:** concept locked (Night Desk; opts 1+2 folded as outbound beat + roadmap teaser). Avi prompt v1→v2. Pitch script drafted.
- **Thu (planned; Seth to confirm what happened):** VB signup + outbound check, DLAI short course, Discord join, Sabre provisioning.
- **Fri:** Sabre hackathon docs reviewed → MCP-first integration. Runbook + schema delivered. Model call: Haiku default. Spike brief v1 → v2 (intake phase, tenant-MCP contract, richer reporting). Corrections absorbed: dev/preview env; own-repo + MCP boundary. STATE.md created.
- **Fri (late):** CLAUDE.md added. Seth stood up nightdesk Supabase in a new free org (`ppapponwxvfnmpcatyju`); chat connector can't reach it (org-scoped OAuth) → schema moves to CC Phase 3. Dev/prod refs recorded in FACTS.
- **Fri (late):** Canonical model locked (speakable-first, ref-cached payloads, offers table added to schema). "Rapid" decoded as EPS Rapid → roadmap pipe, not internal standard.
- **NOTE (merge):** this file was overwritten mid-spike by a parallel chat-Claude edit (which added the canonical-model locked decision); Claude Code re-appended the spike entries below from git history. Both lines of work are preserved.
- **Fri (Phase −1 intake, via Claude Code):** Sabre = long-lived session TOKEN from Seth (no id/secret; `SABRE_ACCESS_TOKEN` in `.env`, OAuth mint skipped). AvoSquado dev confirmed `umlzbhwhfcniyotnvred`; introspected read-only: `trips(uuid,trip_name,location,start_date,end_date,status,trip_type)`, `trip_users(trip_uuid,user_uuid,is_admin,deleted)`, `profiles(uuid,first_name,phone,…)`, `accommodations(trip_uuid,name,physical_address,check_in,check_out,bedrooms)`, `bedrooms`/`bedroom_users`. ⚠️ Demo trip is **"VB demo"** (San Diego, Wedding, Jul 29–Aug 3, ONE member = Seth 4153239619, NO lodging) — not Cabo/6-pax/Dana+Marcus; enrich before Saturday pitch. Node v24.1.0/tsx OK. `TENANT_MCP_SHARED_SECRET` generated. Nightdesk service key pasted by Seth later (Phase 3 unblocked). Thursday outcomes + Q9 (Damir) never answered — still open. Dev hygiene note: 13 dev tables have RLS disabled (advisor-flagged, incl. trip_users/accommodations); remediation deferred.
- **Sat (Phase 0 — Sabre handshake): PASS, no 403 — Q1 RESOLVED.** `mcp.cert.sabre.com/mcp` → 200 with Seth's token. Server `ai-gateway-mcp-server 0.1.3`, protocol 2025-03-26, stateless. **10 tools** (verbatim in `sabre-tools-verbatim.json`): 3 workflows (`SearchAndBookFlightWorkflow`, `FlightIssuedTicketManagementWorkflow`, `SearchAndBookHotelWorkflow`), 6 OpenAPI-spec tools, generic `callSabreAPI` (13 whitelisted paths). Workflow tools take only `conversationId` → return instructions; spec tools mint the conversationId.
- **Sat (Phase 1 — transaction pipes): PARTIAL.** **Pipe B (REST) LIVE:** token works directly on `api.cert.platform.sabre.com`; `flightShop` SFO→SJD 2026-07-19 → 50 offers in **2.2s**, top-2 speakable verified (AM 699 via MEX, $280.08). create/get/cancelBooking implemented (`nightdesk/src/pipes/sabre-rest.ts`), booking NOT attempted — awaiting Seth's yes. **Pipe A (MCP connector) BLOCKED: Anthropic key has zero credits** — blocks pipe A + Phase 3 brain/model stopwatch. Seth adding credits.
- **Sat (Phase 2 — tenant contract): PARTIAL, contract-breaking gap found.** `avosquado-mcp` built (3 contract tools, Streamable HTTP, bearer) + `tenant-mcp`/`tenant-direct` pipes in nightdesk. Both pipes run; but **RLS on `profiles` silently blocks anon SELECT** (empty rows) → `lookup_reservation_by_phone` returns not-found and member names unresolvable. trips/trip_users/accommodations DO allow anon reads. **Fix: Seth pastes skitrip-dev service_role key over `AVOSQUADO_DEV_SUPABASE_KEY` (read-only enforced by GET-only module).** Also: Anthropic-connector consumption of avosquado-mcp will additionally need a public URL (tunnel) — localhost unreachable from Anthropic's side; local JSON-RPC consumption verified instead.
- **Sat ~00:30 (ARCHITECTURE PIVOT, Seth's call):** local Hono server dropped — **all callable surface = Supabase Edge Functions on nightdesk project** (`ppapponwxvfnmpcatyju`), publicly reachable so Vocal Bridge can call in. Deployed & verified: `agent` (brain), `avosquado-mcp` (tenant MCP), `desk-data`, `trigger-outbound`, `dashboard`, `migrate` (temp; applied schema idempotently — 8 tables incl. `offers`). Supabase CLI was already authed; secrets set server-side. Prisma kept only as local tooling (Deno functions use PostgREST). NEW DELTA vs runbook/brief: server code lives in `/supabase/functions/`, `nightdesk/src` is Node-flavored reference.
- **Sat (Phase 3 — brain + ledger): PASS.** Anthropic credits added by Seth mid-spike. 4-turn scripted convo (cancelled→search→read-back→book→refund-escalate) on BOTH models against deployed `agent`: **Haiku avg TTFT 639ms / turn 5.8s; Sonnet 1194ms / 14.0s; tool errors 1 each (same mode)** → **Haiku on call path, confirmed**. ACCOUNTS proof live: full actions trail with honest LIVE/SIM flags; escalation queue row written. **Two behavioral findings for Saturday:** (1) per-turn transcript rebuild drops tool results → models hallucinate offer_refs (both did; both self-recovered by re-searching, costing ~10s) — fix = durable short refs ("option one") in `offers` table keyed per call; (2) Haiku initially *said* "I'll escalate" without calling the tool — fixed with an explicit must-call-tool prompt line; keep that line.
- **Sat (Phase 1 retry — Pipe A): verified.** MCP-connector search works: 12.9s, chain SearchAndBookFlightWorkflow → FlightShopAPI_OpenAPISpec → callSabreAPI, same offers as REST. Q6 closed.
- **Sat (Phase 4 — dashboard + outbound): PASS (seam).** Dashboard function serves (tenant switcher, transcript, LIVE/SIM chips, queue) at `/functions/v1/dashboard?t=<secret>`. `trigger-outbound` writes outbound call row + action; VB API call attempted only when `VB_CALL_URL` secret set (not yet known) → logged "seam verified, wire tomorrow". `vb` CLI never found on PATH.
- **STILL OPEN at report time:** (a) ONE live CERT booking+retrieve+cancel — awaiting Seth's explicit yes (`SABRE_BOOKING_ARMED=yes` secret + rerun); (b) profiles RLS gap — awaiting skitrip-dev service key (or deploy avosquado-mcp onto skitrip-dev); (c) Q3 (VB delegation history), Q9 (Damir), Thursday outcomes — never answered; (d) demo trip enrichment before pitch.
- **Sat AM (HACKATHON session 1 — booking armed, "keep going" from Seth):**
  - **ACTS FULLY LIVE.** `SABRE_BOOKING_ARMED=yes` set (secret + .env). Scripted cycle: search 2.7s → **createBooking locator RNZROP** 2.6s → getBooking 0.9s (DANA WHITFIELD, Confirmed) → cancelBooking 1.6s. **E2E book→retrieve→cancel 5.1s.**
  - **REMEMBERS FULLY LIVE.** avosquado-mcp deployed **onto skitrip-dev itself** (`umlzbhwhfcniyotnvred/functions/v1/avosquado-mcp`) — injected service role reads `profiles`, RLS gap closed with zero key handover (this is the product story: tenant runs our function, we never hold their keys). Agent's avosquado adapter now consumes `tenant.config.integration.url` via JSON-RPC — the drop-in contract path, live: caller 4153239619 → spoken trip context, no interview.
  - **Lookup bugs found+fixed in `_shared/tenant.ts`:** (1) oldest-active-trip won (Japanuary Niseko 2024) → now current-or-upcoming first, stale active as last resort; (2) dev data has 3 profiles sharing Seth's phone (incl. "John Doe" test artifact) → newest profile first. **Data ask for Seth: delete/complete the "Test" Jaipur trip in the dev app** — it outranks "VB demo" (in-progress beats upcoming, which is correct night-desk behavior).
  - **Offer-ref hallucination FIXED** (was risk #3): offers persist per call in `offers` table and are injected into the system prompt each turn (+ mid-call refresh). Rerun: **4/4 turns, 0 tool errors** (was 1/run), avg TTFT 556ms, avg turn 4.9s, and the convo did a REAL rebook — locator **RHQZMF** (cancelled after to keep CERT clean).
  - Remaining open: VB voice loop (Q3/Q4, `VB_CALL_URL`), demo-trip enrichment + Test-trip deletion, Q9. Skills added for teammates: onboard/deploy/test-call/sabre/wrap-up.
- **Sat AM (HACKATHON session 2 — VB voice loop wired):**
  - **`vb` CLI found: `pip install vocal-bridge`** (v0.23.0), authed with VOICEBRIDGE_KEY. Agent **"Avi" pre-exists** (Seth's 3–5am session): phone **+14844813750**, gpt-realtime-1.5, deploy both, 8.8k-char prompt that already scripts the full in-app + phone + outbound-IRROPS playbook.
  - **VB config was the spec:** 5 custom HTTP tools + 1 MCP server, all pointing at skitrip-dev function URLs that didn't exist. Built + deployed them to match: `sabre-flight-search` (5 cheapest, 1.9s, fields shaped for book_flight), `sabre-book-flight` (REAL createBooking; traveler from profile_uuid), `voice-tool` (lookup_trip_by_phone / lookup_trip_by_join_code / get_trip_summary / search_bookable_activities / add_activity / remove_activity), `sabre-mcp-proxy` (Sabre MCP with our bearer, ?key= auth). Auth: `X-Voice-Tool-Secret` header, verified 401 on wrong secret. All dispatches ledger to nightdesk `actions` (ACCOUNTS holds across the VB-native path).
  - **Q3/Q4 RESOLVED by VB docs+config:** realtime model holds full session history; tools are VB-native (gpt-realtime calls our HTTP tools directly; Claude Sonnet 4.6 runs VB's background AI). Our Claude `agent` fn remains the non-voice/API brain — two brains, one ledger.
  - **Outbound PSTN fired for real:** `vb call +14153239619 --name "irrops Seth …"` → call 616cc0af, 57s — hit Seth's carrier voicemail-not-set-up message; Avi ended gracefully. Dial + agent + transcript + recording all verified. INITIATES = fully live.
  - **get_trip_context now includes the itinerary** (activities array + speakable line) — the outbound IRROPS beat expects a "CANCELLED …" activity to narrate from.
  - **⚠️ Flags for Seth:** (1) `AVOSQUADO_WRITES_ARMED` gate added — book_flight itinerary write-back + add/remove_activity refuse honestly until armed; hard rule says dev DB SELECT-only, arming is YOUR call. (2) VB session config showed Sabre MCP proxy `tool_count: 0` — background-MCP channel needs a look (HTTP tools unaffected). (3) Still: delete junk "Test" Jaipur trip; VB demo trip needs members/lodging/CANCELLED-flight activity for the demo arc. (4) `SABRE_BOOKING_ARMED=yes` is set on skitrip-dev too — voice book_flight makes REAL PNRs.
- **[append below as work happens]**

## QUESTIONS FOR SETH (standing)
- Confirm Thursday outcomes (Q2, Q3, Q9) and paste spike verdict block + STATE delta after the run.