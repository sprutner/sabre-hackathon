# SPIKE REPORT — Night Desk, Friday-night falsification run

VERDICT: **NIGHT DESK** — it acts (live CERT search feeding a spoken rebook flow, booking gated only by permission, not capability), remembers (tenant MCP contract runs end-to-end minus one RLS key), initiates (outbound seam writes rows on a public URL), and accounts (honest LIVE/SIM ledger that caught the model lying about escalating). Not a chatbot: the failure modes we found are transaction-system failure modes.

## PROOFS

**1 ACTS: live (search) / gated (booking).** Pipe used: direct REST (`api.cert.platform.sabre.com/v1/offers/flightShop`) with Seth's long-lived CERT session token. SFO→SJD 2026-07-19: 50 offers in **2.2s**, e2e through the brain: caller utterance → lookup → search → spoken top-3 in **9.3s** (Haiku). Booking: `createBooking`/`getBooking`/`cancelBooking` implemented and reachable behind `SABRE_BOOKING_ARMED=yes` — **no locator yet; one live attempt awaits Seth's explicit yes** (hard rule). Simulated bookings return honest `SIM-*` confirmation ids flagged `live=false`.

**2 REMEMBERS: live minus one key.** avosquado-mcp deployed as a public edge function; 3-tool contract verified over JSON-RPC (tools/list + tools/call). Context object printed for the "VB demo" trip via direct SQL during intake (trip name, San Diego, Jul 29–Aug 3, member Seth + phone). **Missing fields that would force an interview:** at runtime the anon key gets empty rows from `profiles` (RLS) → phone lookup and member names fail until the skitrip-dev service key is set (or the function is deployed onto the skitrip-dev project, where the injected service role fixes it natively). Demo-trip data gaps: 1 member (not 6), no lodging rows, no Dana/Marcus.

**3 INITIATES: seam live.** `POST /functions/v1/trigger-outbound` → outbound `calls` row + `actions` row, on a public URL VB can hit. Actual VB dial-out attempted only when `VB_CALL_URL` is configured (VB's call-API endpoint unknown tonight; `vb` CLI absent from PATH despite intake claim). Output: `"seam verified, wire tomorrow"`.

**4 ACCOUNTS: live.** Every dispatch writes `actions` with honest `live`. Sample trail from the scripted call:
```
LIVE lookup_reservation → found Dana, SFO→SJD cancelled
LIVE search_flights     → 3 offers cached to offers table (AS 455 nonstop $560.16 …)
SIM  rebook_flight      → {"error":"unknown offer_ref"}   ← model hallucinated ref, recovered
LIVE escalate           → queue row, "promised by within 2 hours"
LIVE search_flights     → re-search
SIM  rebook_flight      → SIM-7D5F1D (booking not armed)
```
Dashboard renders calls/transcript/action chips (LIVE blue / SIM purple)/queue with tenant switcher at `/functions/v1/dashboard?t=<secret>`.

## ENVIRONMENT INVENTORY
- Node v24.1.0, tsx 4.23.1, supabase CLI 2.90.0 (pre-authed), Deno edge runtime. Prisma 7.8 (local tooling only — `url` moved to `prisma.config.ts` in v7).
- **Creds that worked:** Sabre long-lived session token (`T1RLAQ…`) — works on BOTH `mcp.cert.sabre.com/mcp` AND direct REST `api.cert.platform.sabre.com`; no OAuth mint, TTL unknown ("won't expire during demo" — single point of failure, see risks). Anthropic key live after mid-spike top-up. Nightdesk service key + skitrip-dev anon key work; skitrip-dev anon key **cannot read `profiles`** (RLS).
- **Sabre MCP tool list, VERBATIM** (`sabre-tools-verbatim.json` for full JSON): `BookingManagementAPI_OpenAPISpec`, `FlightReshopAPI_OpenAPISpec`, `callSabreAPI`, `HotelsSearchAPI_OpenAPISpec`, `HotelPriceCheckAPI_OpenAPISpec`, `FlightIssuedTicketManagementWorkflow`, `SearchAndBookHotelWorkflow`, `HotelRatesAPI_OpenAPISpec`, `SearchAndBookFlightWorkflow`, `FlightShopAPI_OpenAPISpec`. Server: `ai-gateway-mcp-server 0.1.3`, protocol 2025-03-26, stateless. Workflow tools take only `conversationId`, return instruction scripts; spec tools mint the conversationId; `callSabreAPI` whitelists 13 paths: cancelBooking, voidFlightTickets, refundFlightTickets, checkFlightTickets, fulfillFlightTickets, getBooking, createBooking, modifyBooking, flightReshop, flightShop, checkHotelRate, getHotelRates, hotelSearch.
- **avosquado-mcp tools:** `lookup_reservation_by_phone`, `get_trip_context`, `get_group_state`. AvoSquado DEV tables used: `trips(uuid,trip_name,location,start_date,end_date,status,trip_type,created_by)`, `trip_users(trip_uuid,user_uuid,is_admin,deleted)`, `profiles(uuid,first_name,phone)`, `accommodations(trip_uuid,name,physical_address,check_in,check_out,bedrooms)`, `bedroom_users(trip_uuid,bedroom_uuid,user_uuid)`.
- **Endpoints stood up tonight** (project `ppapponwxvfnmpcatyju`, all bearer-authed): `/functions/v1/agent`, `/avosquado-mcp`, `/desk-data`, `/trigger-outbound`, `/dashboard?t=`, `/migrate` (temp — delete after hackathon).

## LATENCY TABLE
| Operation | Pipe | Model | TTFT | Total |
|---|---|---|---|---|
| flightShop search | REST direct | — | — | **2.2s** |
| flightShop search | MCP connector (3-tool chain) | Haiku | — | 12.9s |
| agent turn: lookup+search+speak | REST inside brain | Haiku | 923ms | 9.3s |
| agent turn: plain answer | — | Haiku | 475–750ms | 0.9–1.7s |
| agent turn: rebook incl. 1 recovery re-search | REST | Haiku | 613ms | 12.9s |
| agent 4-turn avg | REST | **Haiku** | **639ms** | **5.8s** |
| agent 4-turn avg | REST | Sonnet | 1194ms | 14.0s |
| Sabre workflow internal chain (workflow→spec→callSabreAPI) | MCP | Haiku | — | ~10.7s of the 12.9s |

## MODEL: **Haiku 4.5.** Half the TTFT, 2.4× faster turns, identical tool-error rate (1 each, same failure mode: invented offer_ref when tool results dropped from rebuilt context). Sonnet adds latency, not accuracy, on this task shape. Keep Sonnet as the escalation-summary/complex-case path only.

## PIPES
- **Sabre: REST direct on the call path.** 6× faster, deterministic, no model in the loop, same offers. Keep the MCP connector as documented fallback and for tools we haven't reverse-engineered (hotel workflows).
- **Tenant: MCP contract, deployed at the tenant.** The contract holds through an edge function; `TENANT_PIPE=direct` fallback also works. The RLS lesson IS the product lesson: deploy the connector **on the tenant's project** so the tenant's own service role covers it — nothing to hand over, cleaner story ("the tenant runs our 100-line function; we never hold their keys").

## DECISION BRANCH: CERT PNR unavailable → Beat 1 on AvoSquado tenant? **No — run Beat 1 on the agency tenant with SIM booking.** The SIM badge system was built for exactly this and reads as honesty, not weakness. AvoSquado tenant carries Beat 3 (context flip) regardless. Flip to live booking iff tonight's/tomorrow-morning's armed attempt returns a locator cleanly.

## QUESTIONS FOR SETH (ranked by Saturday blockage)
1. **Booking go/no-go** — say yes and I arm + fire one createBooking→getBooking→cancelBooking cycle and we have a locator for the report/pitch.
2. **skitrip-dev service key** (or ok to deploy avosquado-mcp onto skitrip-dev) — REMEMBERS proof stays broken until then.
3. **VB call API**: what's the outbound endpoint/curl (and where is the `vb` binary)? Q3 (delegation history depth) also still unknown — it decides Claude-in-path vs VB-native tools.
4. **Demo trip**: add 5 more members (incl. "Dana"/"Marcus" personas), lodging row, and organizer flag in the app — or re-script the pitch around a 1-person trip.
5. Sabre token TTL — is there a refresh path if it dies mid-demo? (Single credential, unknown expiry.)
6. Q9: Damir 1am cameo confirmed?

## STATE.MD DELTA
Q1/Q2/Q5/Q6/Q7 resolved (see OPEN QUESTIONS table edits); session log gained Phase −1 through Phase 4 entries + the supabase pivot entry; artifacts ledger renamed night-desk-state.md → STATE.md; flagged mid-spike overwrite of STATE.md by parallel chat edit (merged, nothing lost).

## TOP 3 RISKS FOR SATURDAY
1. **Sabre session token dies mid-day** (unknown TTL, no mint path — client id/secret never received). *10am mitigation:* request proper client credentials via Discord first thing; test `SABRE_TOKEN_URL` mint; keep a fresh cached search fixture with `live=false` as demo floor.
2. **Voice loop unproven** — VB↔agent delegation (Q3/Q4) untouched tonight; TTFT budget on a phone call is unforgiving and our tool-turns run 6–13s. *10am mitigation:* first hour = one real PSTN call into `/agent` via VB with a hard "let me check that for you" filler-phrase pattern; if delegation can't stream, pre-compute lookup at call-answer time.
3. **Offer-ref hallucination under stateless turns** — both models invented refs when tool results weren't in context; recovery costs ~10s of dead air. *10am mitigation:* short-lived spoken refs ("option one/two") mapped server-side per call in `offers`; reject any ref not in the table (already done) AND inject the live offer list into each turn's system prompt.
