// VB multi-tool endpoint: lookup_trip_by_phone | lookup_trip_by_join_code | get_trip_summary |
// search_bookable_activities | add_activity | remove_activity.
// Reads are live against the tenant DB (SELECT only). Writes are gated by AVOSQUADO_WRITES_ARMED.

import { getTripContext, lookupReservationByPhone } from "../_shared/tenant.ts";
import { json, ledger, voiceAuth } from "../_shared/voice.ts";

const base = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const key = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sel(q: string): Promise<any[]> {
  const res = await fetch(`${base()}/rest/v1/${q}`, { headers: { apikey: key(), Authorization: `Bearer ${key()}` } });
  if (!res.ok) throw new Error(`tenant GET ${q} HTTP ${res.status}`);
  return res.json();
}

const WRITES_ARMED = () => Deno.env.get("AVOSQUADO_WRITES_ARMED") === "yes";
const WRITE_REFUSAL = { ok: false, note: "AvoSquado dev DB is read-only by policy — writes not armed. Tell the caller the change is noted and the team will apply it." };

async function lookupByPhone(phone: string) {
  const found: any = await lookupReservationByPhone(phone);
  if (!found.found) return found;
  // Voice tools need uuids for follow-on calls (never spoken aloud).
  const last10 = String(phone).replace(/\D/g, "").slice(-10);
  const profs = await sel(`profiles?select=uuid,phone,created_at&phone=like.*${last10}&order=created_at.desc&limit=10`);
  const prof = profs.find((p) => (p.phone ?? "").replace(/\D/g, "").endsWith(last10));
  const ctx: any = await getTripContext(found.trip_id);
  return {
    found: true,
    profile_uuid: prof?.uuid,
    trip_uuid: found.trip_id,
    trip_summary: ctx.speakable_summary,
    organizer: found.organizer,
    group_size: found.groupSize,
  };
}

async function lookupByJoinCode(code: string) {
  const clean = String(code).replace(/[^a-zA-Z0-9]/g, "");
  const rows = await sel(`join_codes?select=join_code,trip_uuid&join_code=ilike.${clean}&deleted=is.false&limit=1`);
  if (!rows.length) return { found: false, reason: "no trip with that join code" };
  const tripUuid = rows[0].trip_uuid;
  const ctx: any = await getTripContext(tripUuid);
  const tu = await sel(`trip_users?select=user_uuid&trip_uuid=eq.${tripUuid}&deleted=is.false`);
  const profiles = tu.length ? await sel(`profiles?select=uuid,first_name&uuid=in.(${tu.map((m) => m.user_uuid).join(",")})`) : [];
  return {
    found: true,
    trip_uuid: tripUuid,
    trip_summary: ctx.speakable_summary,
    guests: profiles.map((p) => ({ first_name: p.first_name, profile_uuid: p.uuid })),
  };
}

async function searchBookables(args: any) {
  const q = args?.query ? `&or=(name.ilike.*${args.query}*,short_description.ilike.*${args.query}*)` : "";
  const rows = await sel(`bookables?select=uuid,name,short_description,price,currency,type&deleted=is.false${q}&limit=5`);
  return { results: rows.map((b) => ({ bookable_uuid: b.uuid, name: b.name, description: b.short_description, price: b.price, currency: b.currency, type: b.type })) };
}

async function addActivity(args: any, tripUuid: string, profileUuid: string) {
  if (!WRITES_ARMED()) return WRITE_REFUSAL;
  const res = await fetch(`${base()}/rest/v1/activities`, {
    method: "POST",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      trip_uuid: tripUuid,
      name: args.name ?? "Activity",
      description: args.description ?? null,
      start_time: args.start_time ?? null,
      end_time: args.end_time ?? null,
      location: args.location ?? null,
      created_by: profileUuid ?? null,
      confirmed: args.confirmed ?? false,
    }),
  });
  if (!res.ok) return { ok: false, error: `activity insert HTTP ${res.status}` };
  const [row] = await res.json();
  return { ok: true, activity_uuid: row.uuid, name: row.name };
}

async function removeActivity(args: any) {
  if (!WRITES_ARMED()) return WRITE_REFUSAL;
  const ident = args.activity_uuid ? `uuid=eq.${args.activity_uuid}` : args.name ? `name=ilike.*${args.name}*&trip_uuid=eq.${args.trip_uuid}` : null;
  if (!ident) return { ok: false, error: "activity_uuid or name required" };
  const res = await fetch(`${base()}/rest/v1/activities?${ident}`, {
    method: "PATCH",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deleted: true, deleted_on: new Date().toISOString() }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `soft-delete HTTP ${res.status}` };
}

Deno.serve(async (req) => {
  const denied = voiceAuth(req);
  if (denied) return denied;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const tool = body.tool;
  let args: any = {};
  try {
    args = typeof body.input === "string" ? JSON.parse(body.input || "{}") : body.input ?? {};
  } catch {
    args = { raw: body.input };
  }

  try {
    let result: any;
    let live = true;
    switch (tool) {
      case "lookup_trip_by_phone":
        result = await lookupByPhone(body.phone_number ?? args.phone_number ?? "");
        break;
      case "lookup_trip_by_join_code":
        result = await lookupByJoinCode(body.join_code ?? args.join_code ?? "");
        break;
      case "get_trip_summary":
        result = await getTripContext(body.trip_uuid ?? args.trip_uuid);
        break;
      case "search_bookable_activities":
        result = await searchBookables(args);
        break;
      case "add_activity":
        result = await addActivity(args, body.trip_uuid ?? args.trip_uuid, body.profile_uuid ?? args.profile_uuid);
        live = result.ok === true;
        break;
      case "remove_activity":
        result = await removeActivity({ ...args, trip_uuid: body.trip_uuid ?? args.trip_uuid });
        live = result.ok === true;
        break;
      default:
        return json({ error: `unknown tool ${tool}` }, 400);
    }
    await ledger(`voice:${tool}`, { ...body, input: args }, result, live);
    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    await ledger(`voice:${tool}`, body, { error: msg }, false);
    return json({ error: msg }, 502);
  }
});
