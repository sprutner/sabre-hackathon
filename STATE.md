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

## OPEN QUESTIONS / PENDING GATES
| # | Question | Decided by |
|---|----------|-----------|
| 1 | Sabre MCP reachable, or 403 (PCC/EPR attribute)? | Spike Phase 0 |
| 2 | ~~VB outbound available on current tier?~~ **RESOLVED (intake):** Seth confirms outbound enabled. BUT `vb` CLI not found on PATH — locate binary or npx equivalent before Phase 4 | intake Fri |
| 3 | VB delegation: full conversation history or last utterance only? | Seth, VB docs/test |
| 4 | Claude-in-path vs VB-native tools (decision rule set Fri) | Gate 2 findings |
| 5 | Haiku vs Sonnet on call path | Spike Phase 3 TTFT + error count |
| 6 | Sabre pipe: MCP connector vs direct REST | Spike Phase 1 |
| 7 | Tenant pipe: MCP contract vs direct adapter fallback | Spike Phase 2 |
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
- **Fri (Phase −1 intake, via Claude Code):**
  - **Sabre creds:** Seth has a long-lived session TOKEN (works through demo, "won't expire"), not a client id/secret pair. Stored as `SABRE_ACCESS_TOKEN` in `.env`; Phase 0 skips OAuth minting. No Discord issues reported (not checked by Seth).
  - **AvoSquado dev confirmed:** `umlzbhwhfcniyotnvred` (skitrip-dev). Introspected read-only via Supabase MCP connector. Tables for tenant contract: `trips(uuid, trip_name, location, start_date, end_date, status, trip_type)`, `trip_users(trip_uuid, user_uuid, is_admin, deleted)`, `profiles(uuid, first_name, phone, phone_country_code, …)`, `accommodations(trip_uuid, name, physical_address, check_in, check_out, bedrooms)`, plus `bedrooms`/`bedroom_users` for room config. Anon key VERIFIED working for REST SELECTs on trips + trip_users (RLS permits anon read). Anon key in `.env` as `AVOSQUADO_DEV_SUPABASE_KEY`.
  - **⚠️ Demo trip gap:** trip is **"VB demo"** — San Diego, Wedding, Jul 29–Aug 3 2026, ONE member (Seth, phone 4153239619), NO lodging rows. Not the Cabo/6-pax/Dana+Marcus arc. OK for spike proofs; must be enriched (or script adjusted) before Saturday pitch.
  - **Nightdesk Supabase:** project `ppapponwxvfnmpcatyju` NOT reachable via connector (as expected) and NO service key yet — **Seth to paste service_role key into `.env` (blocks Phase 3)**.
  - **VB:** Seth says CLI installed + outbound enabled, but `vb` not on PATH (checked). `VOICEBRIDGE_KEY` present in `.env`. Delegation history question (Q3) still unknown.
  - **Env:** Node v24.1.0, tsx 4.23.1. Repo `sabre-hackathon` confirmed for spike. `TENANT_MCP_SHARED_SECRET` generated. `.env` gitignored in first commit.
  - **Thursday outcomes / Q9 (Damir):** not answered in intake — still open.
  - **skitrip-dev security note (dev hygiene, not tonight's job):** 13 tables have RLS disabled (incl. `trip_users`, `accommodations`, `outreach_*`); Supabase advisor flags them as anon-writable. Recorded for later remediation.
- **Fri/Sat (Phase 0 — Sabre handshake): PASS.** No 403 — Q1 RESOLVED, Sabre MCP reachable. `POST https://mcp.cert.sabre.com/mcp` with Seth's session token → 200. Server `ai-gateway-mcp-server 0.1.3`, protocol 2025-03-26, stateless (no session id). **10 tools** (verbatim JSON in `sabre-tools-verbatim.json`): 3 workflow tools (`SearchAndBookFlightWorkflow`, `FlightIssuedTicketManagementWorkflow`, `SearchAndBookHotelWorkflow` — each self-described as "the one and only valid entry point"), 5 OpenAPI-spec tools (`FlightShopAPI`, `FlightReshopAPI`, `BookingManagementAPI`, `HotelsSearchAPI`, `HotelPriceCheckAPI`, `HotelRatesAPI` specs), plus generic `callSabreAPI` (JSON to any path defined in the specs — this is Pipe B's lever). Token TTL unprintable (no mint step; Seth-provided session token, "won't expire during demo").
- **[append below as work happens]**

## QUESTIONS FOR SETH (standing)
- Confirm Thursday outcomes (Q2, Q3, Q9) and paste spike verdict block + STATE delta after the run.
