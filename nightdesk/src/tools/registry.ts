// 7 tools + dispatch. EVERY dispatch writes an actions row; `live` is honest:
// true only when a real external system or real DB state changed / was read.

import { db } from "../db/nightdesk-db.js";
import { sabreRest } from "../pipes/sabre-rest.js";
import { pickTenantPipe } from "../pipes/tenant-direct.js";

// Booking gate: real Sabre createBooking only when Seth has said yes (env flip).
const BOOKING_ARMED = () => process.env.SABRE_BOOKING_ARMED === "yes";

export const TOOLS = [
  {
    name: "lookup_reservation",
    description: "Find the caller's reservation/trip context by phone number. Use FIRST on every call.",
    input_schema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
  },
  {
    name: "search_flights",
    description: "Search live flights. origin/dest are IATA codes, date is YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: { origin: { type: "string" }, dest: { type: "string" }, date: { type: "string" }, pax: { type: "number" } },
      required: ["origin", "dest", "date"],
    },
  },
  {
    name: "rebook_flight",
    description: "Book/exchange to a previously offered flight. ONLY after reading the offer back to the caller and hearing an explicit yes. offer_ref is the offerId from search_flights.",
    input_schema: {
      type: "object",
      properties: { offer_ref: { type: "string" }, traveler_first_name: { type: "string" }, traveler_last_name: { type: "string" }, phone: { type: "string" } },
      required: ["offer_ref"],
    },
  },
  {
    name: "search_hotels",
    description: "Search hotel availability near an airport/city for given dates. Quote only — never book; offer a hold instead.",
    input_schema: {
      type: "object",
      properties: { location: { type: "string" }, check_in: { type: "string" }, check_out: { type: "string" } },
      required: ["location", "check_in"],
    },
  },
  {
    name: "place_hold",
    description: "Place a hold (hotel option, callback promise, seat) with an expiry.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string" }, details: { type: "object" }, expires_in_hours: { type: "number" } },
      required: ["kind"],
    },
  },
  {
    name: "escalate",
    description: "Escalate to the human agent queue with a callback promise. ALWAYS use for refunds, payment issues, or anything outside policy.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" }, context: { type: "object" }, promised_by: { type: "string", description: "e.g. '9am tomorrow'" } },
      required: ["reason"],
    },
  },
  {
    name: "send_sms",
    description: "Send the caller a confirmation SMS (stub tonight).",
    input_schema: { type: "object", properties: { to: { type: "string" }, message: { type: "string" } }, required: ["to", "message"] },
  },
];

// Offers from the last search, keyed by offerId — read-back needs the exact object.
const offerCache = new Map<string, any>();

export interface DispatchContext {
  callId: string;
  tenant: { id: string; adapter: string; policy?: any };
}

export async function dispatch(ctx: DispatchContext, name: string, input: any): Promise<{ result: any; live: boolean }> {
  let result: any;
  let live = false;

  try {
    switch (name) {
      case "lookup_reservation": {
        if (ctx.tenant.adapter === "avosquado") {
          const pipe = await pickTenantPipe();
          result = await pipe.lookupReservationByPhone(input.phone);
          live = true;
        } else {
          const rows = await db().$queryRaw<any[]>`
            select r.*, c.name as client_name from reservations r join clients c on c.id = r.client_id
            where c.phone like ${"%" + String(input.phone).replace(/\D/g, "").slice(-10)} and r.tenant_id = ${ctx.tenant.id}::uuid limit 1`;
          result = rows[0] ? { found: true, ...rows[0] } : { found: false, reason: "no reservation for that phone" };
          live = true;
        }
        break;
      }
      case "search_flights": {
        const r = await sabreRest.searchFlights(input.origin, input.dest, input.date, input.pax ?? 1);
        const top = r.offers.slice(0, 3);
        for (const o of top) offerCache.set(o.offerId, o);
        await db().offers.createMany({
          data: top.map((o) => ({ call_id: ctx.callId, kind: "flight", ref: o.offerId, speakable: o.speakable, payload: o as any, valid_until: o.validUntil ? new Date(o.validUntil) : null })),
        });
        result = { offers: top.map((o) => ({ offer_ref: o.offerId, speakable: o.speakable })), search_ms: r.ms };
        live = true;
        break;
      }
      case "rebook_flight": {
        const offer = offerCache.get(input.offer_ref) ?? (await db().offers.findFirst({ where: { ref: input.offer_ref } }))?.payload;
        if (!offer) {
          result = { error: "unknown offer_ref — search first" };
        } else if (BOOKING_ARMED()) {
          result = await sabreRest.bookOrExchange(offer, {
            firstName: input.traveler_first_name ?? "Test",
            lastName: input.traveler_last_name ?? "Traveler",
            phone: input.phone ?? "4155550100",
          });
          live = true;
        } else {
          result = { simulated: true, confirmationId: "SIM-" + input.offer_ref.slice(0, 6).toUpperCase(), status: "simulated — booking not armed (SABRE_BOOKING_ARMED!=yes)", offer_speakable: offer.speakable };
          live = false;
        }
        break;
      }
      case "search_hotels": {
        // Stubbed tonight: Sabre hotelSearch payload shape not yet探索ed under timebox.
        result = {
          simulated: true,
          options: [
            { name: "Marriott near " + input.location, nightly: "$189", speakable: `The Marriott near ${input.location} has rooms at one eighty-nine a night.` },
            { name: "Holiday Inn Express " + input.location, nightly: "$139", speakable: `Holiday Inn Express ${input.location} at one thirty-nine a night.` },
          ],
        };
        live = false;
        break;
      }
      case "place_hold": {
        const hold = await db().holds.create({
          data: { kind: input.kind, details: input.details ?? {}, expires_at: new Date(Date.now() + (input.expires_in_hours ?? 24) * 3600_000) },
        });
        result = { hold_id: hold.id, expires_at: hold.expires_at };
        live = true;
        break;
      }
      case "escalate": {
        const q = await db().queue.create({
          data: { tenant_id: ctx.tenant.id, call_id: ctx.callId, reason: input.reason, context: input.context ?? {}, promised_by: input.promised_by ?? "first thing tomorrow morning" },
        });
        result = { queued: true, queue_id: q.id, promised_by: q.promised_by };
        live = true;
        break;
      }
      case "send_sms": {
        result = { simulated: true, to: input.to, message: input.message };
        live = false;
        break;
      }
      default:
        result = { error: `unknown tool ${name}` };
    }
  } catch (e: any) {
    result = { error: e.message };
  }

  await db().actions.create({ data: { call_id: ctx.callId, type: name, payload: input, result, live } });
  return { result, live };
}
