// Read-only AvoSquado DEV client. HARD RULE: SELECT only — every call here is a PostgREST GET.
// No insert/update/delete functions exist in this module by design; keep it that way.

const URL_BASE = () => process.env.AVOSQUADO_DEV_SUPABASE_URL!;
const KEY = () => process.env.AVOSQUADO_DEV_SUPABASE_KEY!;

async function selectRows(pathAndQuery: string): Promise<any[]> {
  const res = await fetch(`${URL_BASE()}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
  });
  if (!res.ok) throw new Error(`avosquado-dev GET ${pathAndQuery} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const digits = (s: string) => s.replace(/\D/g, "");

export async function findProfileByPhone(phone: string): Promise<any | null> {
  const last10 = digits(phone).slice(-10);
  const rows = await selectRows(`profiles?select=uuid,first_name,phone,phone_country_code&phone=like.*${last10}&limit=5`);
  return rows.find((r) => digits(r.phone ?? "").endsWith(last10)) ?? null;
}

export async function activeTripsForUser(userUuid: string): Promise<any[]> {
  const memberships = await selectRows(`trip_users?select=trip_uuid&user_uuid=eq.${userUuid}&deleted=is.false`);
  if (!memberships.length) return [];
  const tripUuids = memberships.map((m) => m.trip_uuid).join(",");
  return selectRows(
    `trips?select=uuid,trip_name,location,start_date,end_date,status,trip_type,created_by&uuid=in.(${tripUuids})&status=eq.active&deleted=is.false&order=start_date.asc`,
  );
}

export async function tripByUuid(tripUuid: string): Promise<any | null> {
  const rows = await selectRows(
    `trips?select=uuid,trip_name,location,start_date,end_date,status,trip_type,created_by&uuid=eq.${tripUuid}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function membersForTrip(tripUuid: string): Promise<any[]> {
  const memberships = await selectRows(`trip_users?select=user_uuid,is_admin&trip_uuid=eq.${tripUuid}&deleted=is.false`);
  if (!memberships.length) return [];
  const userUuids = memberships.map((m) => m.user_uuid).join(",");
  const profiles = await selectRows(`profiles?select=uuid,first_name&uuid=in.(${userUuids})`);
  const byUuid = new Map(profiles.map((p) => [p.uuid, p]));
  return memberships.map((m) => ({
    first_name_only: byUuid.get(m.user_uuid)?.first_name ?? "Unknown",
    is_admin: m.is_admin,
    user_uuid: m.user_uuid, // internal use (organizer resolution); strip before speaking
  }));
}

export async function lodgingForTrip(tripUuid: string): Promise<any[]> {
  return selectRows(
    `accommodations?select=uuid,name,physical_address,check_in,check_out,bedrooms,max_capacity&trip_uuid=eq.${tripUuid}&deleted=is.false`,
  );
}

export async function bedroomAssignments(tripUuid: string): Promise<any[]> {
  return selectRows(`bedroom_users?select=bedroom_uuid,user_uuid&trip_uuid=eq.${tripUuid}&deleted=is.false`);
}
