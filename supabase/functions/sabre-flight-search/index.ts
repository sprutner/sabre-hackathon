// VB tool: search_flights {origin, destination, departure_date, passengers?}
// Returns up to 5 options, cheapest first, airport-local ISO times, fields shaped for book_flight.

import { searchFlights } from "../_shared/sabre.ts";
import { json, ledger, voiceAuth } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  const denied = voiceAuth(req);
  if (denied) return denied;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { origin, destination, departure_date, passengers } = body;
  if (!origin || !destination || !departure_date) return json({ error: "origin, destination, departure_date required" }, 400);

  try {
    const r = await searchFlights(String(origin).toUpperCase(), String(destination).toUpperCase(), departure_date, Number(passengers) || 1);
    const flights = r.offers.slice(0, 5).map((o: any) => {
      const first = o.segments[0] ?? {};
      const last = o.segments[o.segments.length - 1] ?? {};
      return {
        offer_id: o.offerId,
        carrier: first.marketingAirlineCode,
        flight_number: `${first.marketingAirlineCode}${first.marketingFlightNumber}`,
        origin: first.departureAirportCode,
        destination: last.arrivalAirportCode,
        depart_time: `${first.departureDate}T${first.departureTime}`,
        arrive_time: `${last.arrivalDate ?? first.departureDate}T${last.arrivalTime}`,
        booking_class: first.bookingClassCode ?? "Y",
        price: Number(o.price),
        currency: o.currency,
        stops: o.segments.length - 1,
        speakable: o.speakable,
      };
    });
    const result = { flights, total_found: r.totalOffers, search_ms: r.ms };
    await ledger("search_flights", body, { count: flights.length, search_ms: r.ms }, true);
    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    await ledger("search_flights", body, { error: msg }, false);
    return json({ error: msg }, 502);
  }
});
