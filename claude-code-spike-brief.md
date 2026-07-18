# CLAUDE CODE BRIEF — Night Desk Spike v2 ("Is this a chatbot?")

## Before anything: STATE.md
`STATE.md` sits in this repo root. Read it first — it is the source of truth. After EVERY phase, append your findings to its SESSION LOG and update OPEN QUESTIONS with answers you've produced. If you learn something that contradicts STATE.md, flag it to Seth; do not silently diverge.

## Mission
Build the smallest vertical slice that proves — or falsifies — four properties tonight. This is a SPIKE: throwaway quality is fine, but module seams must be clean because the real build happens tomorrow in a fresh repo at a hackathon. Verify each phase by RUNNING it. Stop-and-report beats workaround.

The four proofs (a chatbot has none):
1. **ACTS** — a real Sabre CERT transaction (search → booking or exchange) completes end-to-end.
2. **REMEMBERS** — reservation context arrives from the real app (AvoSquado DEV) through the tenant MCP contract; no interview needed.
3. **INITIATES** — the outbound-call trigger seam exists and fires (stub OK; the seam is the proof).
4. **ACCOUNTS** — every tool invocation writes an auditable row and a minimal dashboard renders the trail.

## Phase −1 — INTAKE (ask Seth, don't assume)
Ask these, record answers in STATE.md before writing code:
1. AvoSquado **DEV/PREVIEW** Supabase URL + key. Confirm it is dev/preview. Has the demo trip (Cabo, 6 pax, Dana + Marcus) been created in the app yet?
2. Table/column names for trips, trip members, lodging — or permission to introspect `information_schema` read-only and confirm findings back.
3. Sabre CERT credential format actually received (client id/secret pair vs EPR/PCC composite)? Any Discord-reported MCP issues tonight?
4. Vocal Bridge: CLI installed? Outbound enabled on current tier?
5. Repo name/location preference; Node version available.
6. Anything from Thursday that changes STATE.md's open questions (Q2, Q3, Q9).
7. Which nightdesk Supabase path (STATE Q11): new free org, or $10 project in sprutner's Org? Get the project URL + service key, and whether the schema was already applied from chat.

## Environment contract (Seth fills .env — never hardcode, never commit; add .env to .gitignore in your first commit)
```
# Sabre CERT
SABRE_CLIENT_ID=            # adapt if intake reveals composite format
SABRE_CLIENT_SECRET=
SABRE_TOKEN_URL=https://api.cert.platform.sabre.com/v2/auth/token
SABRE_MCP_URL=https://mcp.cert.sabre.com/mcp

# Anthropic
ANTHROPIC_API_KEY=
MODEL_FAST=claude-haiku-4-5-20251001
MODEL_STRONG=claude-sonnet-4-6

# Night Desk DB (project ppapponwxvfnmpcatyju — full read/write; Seth pastes service key from dashboard Settings → API)
NIGHTDESK_SUPABASE_URL=https://ppapponwxvfnmpcatyju.supabase.co
NIGHTDESK_SUPABASE_SERVICE_KEY=

# AvoSquado DEV/PREVIEW (read-only by policy regardless of key power; "skitrip-dev" — confirm in intake)
AVOSQUADO_DEV_SUPABASE_URL=https://umlzbhwhfcniyotnvred.supabase.co
AVOSQUADO_DEV_SUPABASE_KEY=

# Tenant MCP
TENANT_MCP_SHARED_SECRET=   # bearer for avosquado-mcp
TENANT_PIPE=mcp             # mcp | direct
SABRE_PIPE=mcp              # mcp | rest
```
HARD RULE: the AvoSquado client only ever SELECTs. Wrap it in a module exposing read functions only. It is dev data, but the rule stands — it becomes prod posture later.

## Stack & layout
Local TypeScript (Node 20+, tsx), thin Fastify or Hono. Two packages in one spike repo, cleanly separable:
```
/nightdesk                 # THE PRODUCT (rebuilt fresh tomorrow)
  /src
    /pipes/sabre-mcp.ts    # pipe A: Sabre via Claude MCP connector
    /pipes/sabre-rest.ts   # pipe B: direct REST fallback
    /pipes/tenant-mcp.ts   # consumes any tenant MCP implementing the contract
    /pipes/tenant-direct.ts# fallback: direct adapter (queries AvoSquado dev)
    /tools/registry.ts     # 7 tools + dispatch + actions logging
    /agent/brain.ts        # Claude, MODEL_FAST, streaming, NO extended thinking
    /db/schema.sql
    /dashboard/index.html  # polls the API; LIVE/SIM badges from actions.live
    server.ts              # POST /agent, GET /calls /actions /queue, POST /trigger-outbound
/avosquado-mcp             # TENANT-SIDE CONNECTOR (AvoSquado product surface; survives as its own repo)
  /src/server.ts           # Streamable HTTP MCP, bearer = TENANT_MCP_SHARED_SECRET
STATE.md
SPIKE_REPORT.md            # you write this at the end
```

## Tenant MCP contract (the drop-in)
avosquado-mcp exposes exactly three tools against the DEV db:
- `lookup_reservation_by_phone(phone)` → `{trip_id, tripName, destination, start_date, end_date, groupSize, members[{first_name_only}], organizer}`
- `get_trip_context(trip_id)` → full speakable summary incl. lodging status
- `get_group_state(trip_id)` → `{confirmed, unconfirmed, pairs/room_config if derivable}`
First names only in member payloads. Any tenant implementing these three tools is onboardable — that sentence is the product claim; make the code make it true.

## Canonical model (speakable-first — ALL pipes return these; suppliers/tenants map IN at the boundary)
Put in `/nightdesk/src/model.ts`; both pipes and the tenant contract return these shapes. Rules: (1) full supplier payloads NEVER enter the LLM context — cache by `ref` in the `offers` table and resolve server-side when a booking tool fires; (2) every object carries a pre-rendered `say` one-liner computed at the pipe, so the model reads speech, not schemas; (3) money = decimal string + currency, humanized only in `say`; (4) vocabulary is NDC-aligned: search yields **offers**, transacting creates **orders**.
```ts
type Money = { amount: string; currency: string };
type FlightOffer = { ref: string; departIso: string; arriveIso: string; airports: [string,string];
  carrier: string; stops: number; priceDelta?: Money; total?: Money; say: string };
type HotelOffer = { ref: string; property: string; perRoomNight: Money; total: Money;
  refundable: boolean; say: string };
type Reservation = { id: string; source: "sabre"|"tenant"; adapterRef: string; tripName?: string;
  destination: string; startIso: string; endIso: string; travelers: {firstName: string}[];
  groupSize: number; rooms?: number; say: string };
type OrderResult = { orderRef: string; status: "confirmed"|"held"|"simulated"; say: string };
```

## Phase 0 — Sabre handshake
Mint OAuth v2 token (print TTL). Connect to SABRE_MCP_URL (Streamable HTTP, Bearer). List tools; print names **verbatim** into SPIKE_REPORT. On 403: STOP, dump headers/body, tell Seth — that's a PCC/EPR provisioning issue for Discord, not a code problem.

## Phase 1 — Transaction pipe (proof: ACTS) — timebox 45 min/pipe
Both pipes behind one interface: `searchFlights(origin,dest,date,pax)`, `bookOrExchange(offerRef)`; select via SABRE_PIPE.
- Pipe A syntax: `mcp_servers:[{type:"url", url, name:"sabre", authorization_token:<sabre_token>}]` + `tools:[{type:"mcp_toolset", mcp_server_name:"sabre"}]` + beta header `mcp-client-2025-11-20` (fallback `mcp-client-2025-04-04`). Parse `mcp_tool_result` blocks by TYPE, never position.
- Pipe B: direct REST using API names discovered in Phase 0; if blocked, clearly-labeled cached fixture with `live=false`.
- Verify: real CERT search SFO→SJD (+1 day); print top-2 as speakable one-liners. Then ONE booking/exchange attempt — **ask Seth before any booking call**. On success: print locator, retrieve it back, then void/cancel if tooling allows.

## Phase 2 — Tenant contract (proof: REMEMBERS) — timebox 60 min on the MCP path
1. Build avosquado-mcp (three tools above) against the DEV db using intake's table names.
2. nightdesk consumes it via the SAME MCP-connector mechanics as Sabre — two entries in `mcp_servers`, one Messages call. Use `tool_configuration` allowlists per server to prevent name collisions.
3. tenant-direct.ts implements the identical interface by querying dev directly — flip `TENANT_PIPE=direct` if the mini server fights you, note it, move on. Contract preserved either way.
- Verify: `lookup_reservation_by_phone` for the demo trip; print the context object. Flag any missing field that would force Avi to interview the caller — a gap here = broken proof, name it loudly.

## Phase 3 — Brain + ledger (proof: ACCOUNTS)
1. Apply schema (below) to Night Desk DB; seed two tenants ("Seth's Travel Co" adapter=sabre; "AvoSquado" adapter=avosquado + `integration:{type:"mcp",url:...}` in config), Dana + Marcus, one reservation each.
2. brain.ts: 7 tools — lookup_reservation, search_flights, rebook_flight, search_hotels, place_hold, escalate, send_sms(stub). Tight system prompt: tools + tenant policy only (rebook ceiling, refunds ALWAYS escalate, full read-back before any booking tool). Streaming on.
3. Every dispatch writes `actions` (`live` flag honest). POST /agent: `{tenant_id, phone, utterance, call_id?}` → creates/extends `calls` + transcript.
- Verify: scripted 4-turn curl conversation: cancelled → lookup+search → "the earlier one" → read-back → "yes" → rebook → "hotel refund?" → escalate + queue row. Print full actions trail. Run on MODEL_FAST and MODEL_STRONG; record TTFT + tool-call error count for both.

## Phase 4 — Dashboard + outbound seam (proofs: ACCOUNTS + INITIATES)
1. dashboard/index.html: tonight's calls, latest transcript, action chips with LIVE/SIM badges, queue panel, tenant switcher (two tenants). Ugly fine; truthful mandatory.
2. POST /trigger-outbound: writes outbound `calls` row; shells to `vb call <number>` if CLI present, else logs `VB_CLI_ABSENT — seam verified, wire tomorrow.`

## Schema (idempotent — safe whether or not it was pre-applied from chat; verify with `select count(*) from tenants` before assuming fresh)
```sql
create table if not exists tenants (id uuid primary key default gen_random_uuid(), name text, greeting text,
  policy jsonb, adapter text, channel text default 'pstn', config jsonb, vb_agent_id text);
create table if not exists clients (id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, phone text unique, email text);
create table if not exists reservations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid,
  adapter_ref text, summary jsonb, group_size int default 1, room_config jsonb, status text default 'active');
create table if not exists calls (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid,
  direction text, started_at timestamptz default now(), ended_at timestamptz, transcript jsonb default '[]', status text default 'live');
create table if not exists actions (id uuid primary key default gen_random_uuid(), call_id uuid, type text,
  payload jsonb, result jsonb, live boolean default true, created_at timestamptz default now());
create table if not exists holds (id uuid primary key default gen_random_uuid(), reservation_id uuid, kind text, details jsonb, expires_at timestamptz);
create table if not exists offers (ref text primary key, kind text, say text, supplier_payload jsonb, created_at timestamptz default now());
create table if not exists queue (id uuid primary key default gen_random_uuid(), tenant_id uuid, call_id uuid,
  reason text, context jsonb, status text default 'open', promised_by text);
```

## Working rules
- Run-and-verify every phase; paste real output into SPIKE_REPORT.md as you go; update STATE.md after each phase.
- Ask Seth: intake answers (Phase −1), table shapes (Phase 2 confirm), and before ANY Sabre booking call.
- Timeboxes are real. Unfinished = stubbed and labeled, never half-done.
- A discovered 403, latency number, or schema gap is a WIN tonight.

## SPIKE_REPORT.md format (the whole point — return MORE info, not less)
```
VERDICT: [NIGHT DESK | CHATBOT WITH EXTRA STEPS] — one sentence why.

PROOFS
1 ACTS:      live|stubbed — pipe used, locator, e2e latency
2 REMEMBERS: live|stubbed — context object printed; missing fields listed
3 INITIATES: live|stubbed — seam status
4 ACCOUNTS:  live|stubbed — actions trail sample

ENVIRONMENT INVENTORY
- node/tsx versions; which cred formats worked; Sabre token TTL
- Sabre MCP tool list, VERBATIM
- avosquado-mcp tool list + AvoSquado DEV tables/columns actually used
- any endpoint URLs discovered

LATENCY TABLE
- per tool × per pipe × per model (TTFT and total), incl. Sabre workflow-tool internal chain time if observable

MODEL: haiku vs sonnet — TTFT, tool-call errors → recommendation
PIPES: sabre mcp vs rest; tenant mcp vs direct → recommendations
DECISION BRANCH: CERT PNR unavailable → Beat 1 on AvoSquado tenant? yes|no + why

QUESTIONS FOR SETH: everything ambiguous, ranked by how much it blocks Saturday
STATE.MD DELTA: what you changed/added there
TOP 3 RISKS FOR SATURDAY, ranked, each with the 10am mitigation.
```