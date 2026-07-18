// Tenant contract queries against AvoSquado DEV — SELECT only (GET-only by construction).
// Key resolution: explicit AVOSQUADO_DEV_SUPABASE_KEY wins; when this code runs ON the
// skitrip-dev project itself, the injected service role covers RLS'd tables (profiles).

const base = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const key = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const digits = (s: string) => s.replace(/\D/g, "");

async function sel(q: string): Promise<any[]> {
  const res = await fetch(`${base()}/rest/v1/${q}`, { headers: { apikey: key(), Authorization: `Bearer ${key()}` } });
  if (!res.ok) throw new Error(`avosquado-dev GET ${q} HTTP ${res.status}`);
  return res.json();
}

async function members(tripUuid: string): Promise<any[]> {
  const tu = await sel(`trip_users?select=user_uuid,is_admin&trip_uuid=eq.${tripUuid}&deleted=is.false`);
  if (!tu.length) return [];
  const profiles = await sel(`profiles?select=uuid,first_name&uuid=in.(${tu.map((m) => m.user_uuid).join(",")})`);
  const byId = new Map(profiles.map((p) => [p.uuid, p.first_name]));
  return tu.map((m) => ({ first_name_only: byId.get(m.user_uuid) ?? "Unknown", is_admin: m.is_admin, user_uuid: m.user_uuid }));
}

export async function lookupReservationByPhone(phone: string) {
  const last10 = digits(phone).slice(-10);
  const profs = await sel(`profiles?select=uuid,first_name,phone&phone=like.*${last10}&limit=5`);
  const prof = profs.find((p) => digits(p.phone ?? "").endsWith(last10));
  if (!prof) return { found: false, reason: "no profile matches that phone number" };
  const tu = await sel(`trip_users?select=trip_uuid&user_uuid=eq.${prof.uuid}&deleted=is.false`);
  if (!tu.length) return { found: false, reason: "no trips for caller" };
  const trips = await sel(
    `trips?select=uuid,trip_name,location,start_date,end_date,trip_type,created_by&uuid=in.(${tu.map((t) => t.trip_uuid).join(",")})&status=eq.active&deleted=is.false&order=start_date.asc`,
  );
  if (!trips.length) return { found: false, reason: "no active trips for caller" };
  const trip = trips[0];
  const mem = await members(trip.uuid);
  return {
    found: true,
    trip_id: trip.uuid,
    tripName: trip.trip_name,
    destination: trip.location,
    start_date: trip.start_date,
    end_date: trip.end_date,
    groupSize: mem.length,
    members: mem.map((m) => ({ first_name_only: m.first_name_only })),
    organizer: mem.find((m) => m.user_uuid === trip.created_by)?.first_name_only ?? mem.find((m) => m.is_admin)?.first_name_only ?? mem[0]?.first_name_only,
  };
}

export async function getTripContext(tripId: string) {
  const trips = await sel(`trips?select=uuid,trip_name,location,start_date,end_date,trip_type&uuid=eq.${tripId}&limit=1`);
  if (!trips.length) return { found: false, reason: "no such trip" };
  const trip = trips[0];
  const [mem, lodging] = await Promise.all([
    members(tripId),
    sel(`accommodations?select=name,physical_address,check_in,check_out,bedrooms&trip_uuid=eq.${tripId}&deleted=is.false`),
  ]);
  const names = mem.map((m) => m.first_name_only);
  return {
    found: true,
    trip_id: trip.uuid,
    speakable_summary:
      `${trip.trip_name} — a ${trip.trip_type ?? "group"} trip to ${trip.location} from ${trip.start_date?.slice(0, 10)} to ` +
      `${trip.end_date?.slice(0, 10)}, ${names.length} traveler${names.length === 1 ? "" : "s"}${names.length ? ` (${names.join(", ")})` : ""}. ` +
      `Lodging: ${lodging.length ? lodging.map((l: any) => l.name ?? "unnamed place").join("; ") : "no lodging on file"}.`,
    members: mem.map((m) => ({ first_name_only: m.first_name_only })),
    lodging,
    lodging_status: lodging.length ? "booked" : "none_on_file",
  };
}

export async function getGroupState(tripId: string) {
  const [mem, rooms] = await Promise.all([
    members(tripId),
    sel(`bedroom_users?select=bedroom_uuid,user_uuid&trip_uuid=eq.${tripId}&deleted=is.false`),
  ]);
  const assigned = new Set(rooms.map((r: any) => r.user_uuid));
  const roomConfig: Record<string, string[]> = {};
  for (const r of rooms) (roomConfig[r.bedroom_uuid] ??= []).push(mem.find((m) => m.user_uuid === r.user_uuid)?.first_name_only ?? "Unknown");
  return {
    found: true,
    trip_id: tripId,
    confirmed: mem.filter((m) => assigned.has(m.user_uuid)).map((m) => m.first_name_only),
    unconfirmed: mem.filter((m) => !assigned.has(m.user_uuid)).map((m) => m.first_name_only),
    room_config: Object.values(roomConfig).length ? Object.values(roomConfig) : null,
  };
}
