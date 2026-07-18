// VB tool: book_flight — creates a REAL Sabre CERT booking from a search_flights option.
// Itinerary write-back to the AvoSquado dev DB is gated by AVOSQUADO_WRITES_ARMED
// (dev DB is SELECT-only by hard rule; Seth arms this explicitly or it stays reported-only).

import { bookOffer } from "../_shared/sabre.ts";
import { json, ledger, voiceAuth } from "../_shared/voice.ts";

const devBase = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const devKey = () => Deno.env.get("AVOSQUADO_DEV_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const denied = voiceAuth(req);
  if (denied) return denied;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { trip_uuid, profile_uuid, offer_id, carrier, flight_number, origin, destination, depart_time, arrive_time, booking_class, price, currency } = body;
  if (!offer_id || !carrier || !flight_number || !origin || !destination || !depart_time) {
    return json({ error: "offer_id, carrier, flight_number, origin, destination, depart_time required" }, 400);
  }
  if (Deno.env.get("SABRE_BOOKING_ARMED") !== "yes") {
    const sim = { simulated: true, record_locator: "SIM-" + String(offer_id).slice(0, 6).toUpperCase(), note: "booking not armed" };
    await ledger("book_flight", body, sim, false);
    return json(sim);
  }

  try {
    // Traveler name from the tenant profile (SELECT — allowed).
    let traveler = { firstName: "Guest", lastName: "Traveler", phone: "4155550100" };
    if (profile_uuid) {
      const res = await fetch(`${devBase()}/rest/v1/profiles?select=first_name,last_name,phone&uuid=eq.${profile_uuid}&limit=1`, {
        headers: { apikey: devKey(), Authorization: `Bearer ${devKey()}` },
      });
      const [p] = await res.json();
      if (p) traveler = { firstName: p.first_name ?? "Guest", lastName: p.last_name ?? "Traveler", phone: p.phone ?? "4155550100" };
    }

    const [dDate, dTime] = String(depart_time).split("T");
    const offer = {
      segments: [{
        marketingAirlineCode: String(carrier).toUpperCase().slice(0, 2),
        marketingFlightNumber: Number(String(flight_number).replace(/\D/g, "")),
        departureAirportCode: String(origin).toUpperCase(),
        arrivalAirportCode: String(destination).toUpperCase(),
        departureDate: dDate,
        departureTime: (dTime ?? "09:00").slice(0, 5),
        bookingClassCode: booking_class ?? "Y",
      }],
    };
    const booked = await bookOffer(offer, traveler);
    if (!booked.confirmationId) {
      await ledger("book_flight", body, { error: "no confirmationId", raw: booked.raw }, false);
      return json({ error: "booking failed — no record locator", detail: JSON.stringify(booked.raw).slice(0, 400) }, 502);
    }

    let itinerary = "not written — AvoSquado dev DB is read-only by policy (AVOSQUADO_WRITES_ARMED unset)";
    if (Deno.env.get("AVOSQUADO_WRITES_ARMED") === "yes" && trip_uuid) {
      const res = await fetch(`${devBase()}/rest/v1/activities`, {
        method: "POST",
        headers: { apikey: devKey(), Authorization: `Bearer ${devKey()}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          trip_uuid,
          name: `Flight ${flight_number} ${origin}→${destination}`,
          description: `Sabre record locator ${booked.confirmationId} — booked by Avi (${price ?? "?"} ${currency ?? "USD"})`,
          start_time: depart_time,
          end_time: arrive_time ?? null,
          confirmed: true,
          created_by: profile_uuid ?? null,
          category: "travel",
        }),
      });
      itinerary = res.ok ? "added to trip itinerary" : `itinerary write failed HTTP ${res.status}`;
    }

    const result = {
      record_locator: booked.confirmationId,
      status: "booked",
      traveler: `${traveler.firstName} ${traveler.lastName}`,
      flight: `${flight_number} ${origin}→${destination} ${depart_time}`,
      itinerary,
      book_ms: booked.ms,
    };
    await ledger("book_flight", body, result, true);
    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    await ledger("book_flight", body, { error: msg }, false);
    return json({ error: msg }, 502);
  }
});
