# CLAUDE.md — Night Desk (spike repo)

Voice desk that answers when a travel agent can't — and transacts. Tonight is a falsification spike; the real build is tomorrow (Sat) at a hackathon, 10:00–16:00, in a fresh repo.

## Read order (do this before anything)
1. `STATE.md` — single source of truth. If it isn't in here, it didn't happen. If you learn something that contradicts it, flag Seth — never silently diverge.
2. `claude-code-spike-brief.md` — tonight's work: Phase −1 (intake) through Phase 4, then `SPIKE_REPORT.md`.

## Hard rules
- AvoSquado DB is **DEV/PREVIEW and SELECT-only**, wrapped in a read-only module. No exceptions, regardless of key power.
- **Ask Seth before any Sabre booking/exchange call.** Search freely; transact only with a yes.
- Never commit `.env` (gitignore it in your first commit). Never hardcode secrets.
- Stop-and-report beats workaround. A 403, a latency number, or a schema gap is a WIN tonight — surface it, don't paper it.
- Timeboxes in the brief are real. Unfinished = stubbed and labeled `live=false`, never half-done.
- Update `STATE.md` (SESSION LOG + OPEN QUESTIONS) after **every** phase.

## Environment
- `.env` contract is in the brief. Seth pastes values; ask via Phase −1 intake, including which nightdesk Supabase path he took (STATE Q11).
- Apply the nightdesk schema **idempotently** — it may already exist if it was pre-applied from chat.
- Models: `MODEL_FAST` on the call path, streaming on, **no extended thinking**. Run the Phase 3 comparison on both models before recommending.

## Conventions
- TypeScript, Node 20+, spike-grade but with clean module seams (`/pipes`, `/adapters`→contract, `/tools`, `/agent`) — tomorrow's repo cherry-picks *knowledge*, not code.
- One commit per phase: `phase-0: sabre handshake — <result>`. The git log is part of the report.
- Two packages, cleanly separable: `/nightdesk` (the product) and `/avosquado-mcp` (tenant-side connector; survives as its own repo).

## Definition of done tonight
`SPIKE_REPORT.md` exists with the full format from the brief — verdict line first, environment inventory, latency table, pipe/model recommendations, ranked questions for Seth, top 3 Saturday risks. More information, not less.
