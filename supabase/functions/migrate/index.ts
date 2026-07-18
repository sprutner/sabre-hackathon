// Temporary migration function: applies the Night Desk schema idempotently using the
// DB URL injected into edge functions. Bearer-protected. Delete after the hackathon.

import postgres from "npm:postgres@3.4.5";
import { json, requireBearer } from "../_shared/db.ts";

const SCHEMA_SQL = `
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
create table if not exists queue (id uuid primary key default gen_random_uuid(), tenant_id uuid, call_id uuid,
  reason text, context jsonb, status text default 'open', promised_by text);
create table if not exists offers (id uuid primary key default gen_random_uuid(), call_id uuid, kind text,
  ref text, speakable text, payload jsonb, valid_until timestamptz, created_at timestamptz default now());
`;

Deno.serve(async (req) => {
  const denied = requireBearer(req);
  if (denied) return denied;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return json({ error: "SUPABASE_DB_URL not injected" }, 500);
  const sql = postgres(dbUrl, { prepare: false });
  try {
    await sql.unsafe(SCHEMA_SQL);
    const [{ count }] = await sql`select count(*)::int as count from tenants`;
    return json({ applied: true, tenants_count: count });
  } catch (e) {
    return json({ applied: false, error: (e as Error).message }, 500);
  } finally {
    await sql.end();
  }
});
