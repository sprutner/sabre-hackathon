-- Night Desk schema — idempotent (safe to re-run).
-- Brief schema + `offers` table per the canonical-model locked decision
-- (full supplier payloads cached server-side, never in LLM context).

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
