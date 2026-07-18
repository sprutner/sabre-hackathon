---
name: deploy
description: Deploy or update a Night Desk Supabase edge function, set secrets, tail logs, or apply the schema. Use when changing anything under supabase/functions/ or when a deployed function misbehaves.
---

# Deploy edge functions

Project ref: `ppapponwxvfnmpcatyju` (nightdesk). Functions live in `supabase/functions/<name>/index.ts`; shared code in `supabase/functions/_shared/` (`db.ts` PostgREST helpers, `sabre.ts`, `tenant.ts`).

```bash
# Deploy one function (always --no-verify-jwt; we bearer-auth with our own shared secret):
supabase functions deploy <name> --project-ref ppapponwxvfnmpcatyju --no-verify-jwt

# Set/update secrets (server-side env for ALL functions):
supabase secrets set --project-ref ppapponwxvfnmpcatyju KEY=value [KEY2=value2 ...]

# List current secret names (values hidden):
supabase secrets list --project-ref ppapponwxvfnmpcatyju
```

Secrets the functions read: `SABRE_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `MODEL_FAST`, `TENANT_MCP_SHARED_SECRET`, `AVOSQUADO_DEV_SUPABASE_URL`, `AVOSQUADO_DEV_SUPABASE_KEY`, `SABRE_BOOKING_ARMED` (unset = simulated), `VB_CALL_URL`, `VOICEBRIDGE_KEY`. (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected — never set them.)

## Logs
Deployed-function logs are in the Supabase dashboard (Functions → <name> → Logs), or via MCP `get_logs` if the Supabase MCP server is connected. `console.error` in function code is your friend — spike-grade logging is fine.

## Schema changes
Edit the DDL in `supabase/functions/migrate/index.ts` (idempotent `create table if not exists` style — it may run against an existing schema), redeploy `migrate`, then:
```bash
curl -sX POST https://ppapponwxvfnmpcatyju.supabase.co/functions/v1/migrate \
  -H "Authorization: Bearer $TENANT_MCP_SHARED_SECRET"
```

## Rules
- Never deploy anything that writes to the AvoSquado DB — `_shared/tenant.ts` is GET-only by design; keep it that way.
- After any deploy that changes behavior, run a smoke call (see `test-call` skill) before moving on.