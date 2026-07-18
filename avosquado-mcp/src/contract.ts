// The tenant MCP contract — three tools, exact shapes from the brief.
// Any tenant implementing these three is onboardable.

import {
  activeTripsForUser,
  bedroomAssignments,
  findProfileByPhone,
  lodgingForTrip,
  membersForTrip,
  tripByUuid,
} from "./db.js";

export async function lookupReservationByPhone(phone: string) {
  const profile = await findProfileByPhone(phone);
  if (!profile) return { found: false, reason: "no profile matches that phone number" };
  const trips = await activeTripsForUser(profile.uuid);
  if (!trips.length) return { found: false, reason: `profile ${profile.first_name} has no active trips` };
  const trip = trips[0]; // nearest upcoming active trip
  const members = await membersForTrip(trip.uuid);
  const organizer =
    members.find((m) => m.user_uuid === trip.created_by)?.first_name_only ??
    members.find((m) => m.is_admin)?.first_name_only ??
    members[0]?.first_name_only;
  return {
    found: true,
    trip_id: trip.uuid,
    tripName: trip.trip_name,
    destination: trip.location,
    start_date: trip.start_date,
    end_date: trip.end_date,
    groupSize: members.length,
    members: members.map((m) => ({ first_name_only: m.first_name_only })),
    organizer,
  };
}

export async function getTripContext(tripId: string) {
  const trip = await tripByUuid(tripId);
  if (!trip) return { found: false, reason: "no such trip" };
  const [members, lodging] = await Promise.all([membersForTrip(tripId), lodgingForTrip(tripId)]);
  const names = members.map((m) => m.first_name_only);
  const lodgingStatus = lodging.length
    ? lodging
        .map((l) => `${l.name ?? "unnamed place"}${l.check_in ? `, check-in ${l.check_in.slice(0, 10)}` : ""}${l.check_out ? ` to ${l.check_out.slice(0, 10)}` : ""}`)
        .join("; ")
    : "no lodging on file";
  return {
    found: true,
    trip_id: trip.uuid,
    speakable_summary:
      `${trip.trip_name} — a ${trip.trip_type ?? "group"} trip to ${trip.location} from ` +
      `${trip.start_date?.slice(0, 10)} to ${trip.end_date?.slice(0, 10)}, ${names.length} traveler${names.length === 1 ? "" : "s"}` +
      `${names.length ? ` (${names.join(", ")})` : ""}. Lodging: ${lodgingStatus}.`,
    tripName: trip.trip_name,
    destination: trip.location,
    start_date: trip.start_date,
    end_date: trip.end_date,
    members: members.map((m) => ({ first_name_only: m.first_name_only })),
    lodging: lodging.map((l) => ({ name: l.name, check_in: l.check_in, check_out: l.check_out, bedrooms: l.bedrooms })),
    lodging_status: lodging.length ? "booked" : "none_on_file",
  };
}

export async function getGroupState(tripId: string) {
  const trip = await tripByUuid(tripId);
  if (!trip) return { found: false, reason: "no such trip" };
  const [members, rooms] = await Promise.all([membersForTrip(tripId), bedroomAssignments(tripId)]);
  const assigned = new Set(rooms.map((r) => r.user_uuid));
  const roomConfig: Record<string, string[]> = {};
  for (const r of rooms) {
    const name = members.find((m) => m.user_uuid === r.user_uuid)?.first_name_only ?? "Unknown";
    (roomConfig[r.bedroom_uuid] ??= []).push(name);
  }
  return {
    found: true,
    trip_id: trip.uuid,
    // dev schema has no per-member RSVP flag; room assignment is the closest confirmed-signal
    confirmed: members.filter((m) => assigned.has(m.user_uuid)).map((m) => m.first_name_only),
    unconfirmed: members.filter((m) => !assigned.has(m.user_uuid)).map((m) => m.first_name_only),
    room_config: Object.values(roomConfig).length ? Object.values(roomConfig) : null,
  };
}

export const TOOL_DEFS = [
  {
    name: "lookup_reservation_by_phone",
    description: "Find the caller's active reservation by their phone number. Returns trip id, name, destination, dates, group size, member first names, organizer.",
    inputSchema: { type: "object", properties: { phone: { type: "string", description: "caller phone number, any format" } }, required: ["phone"] },
    handler: (a: any) => lookupReservationByPhone(a.phone),
  },
  {
    name: "get_trip_context",
    description: "Full speakable summary of a trip including lodging status.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"] },
    handler: (a: any) => getTripContext(a.trip_id),
  },
  {
    name: "get_group_state",
    description: "Confirmed/unconfirmed members and room configuration if derivable.",
    inputSchema: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"] },
    handler: (a: any) => getGroupState(a.trip_id),
  },
];
