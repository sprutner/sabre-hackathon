// Sabre CERT REST pipe — Deno flavor of nightdesk/src/pipes/sabre-rest.ts (verified live in Phase 1).

const BASE = "https://api.cert.platform.sabre.com";

async function sabrePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("SABRE_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sabre REST ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function speakable(seg: any[], price: string, currency: string): string {
  const first = seg[0], last = seg[seg.length - 1];
  const stops = seg.length - 1;
  const via = stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""} via ${seg.slice(1).map((s) => s.departureAirportCode).join(", ")}`;
  return `${first.marketingAirlineCode} ${first.marketingFlightNumber} departing ${first.departureAirportCode} at ${first.departureTime} on ${first.departureDate}, arriving ${last.arrivalAirportCode} at ${last.arrivalTime}, ${via}, ${currency === "USD" ? "$" : currency + " "}${price} total`;
}

export async function searchFlights(origin: string, dest: string, date: string, pax = 1) {
  const t0 = performance.now();
  const data = await sabrePost("/v1/offers/flightShop", {
    journeys: [{ departureLocation: { airportCode: origin }, arrivalLocation: { airportCode: dest }, departureDate: date }],
    travelers: Array.from({ length: pax }, () => ({ passengerTypeCode: "ADT" })),
  });
  const flightsById = new Map((data.flights ?? []).map((f: any) => [f.id, f]));
  const journeysById = new Map((data.journeys ?? []).map((j: any) => [j.id, j]));
  const offers = (data.offers ?? [])
    .filter((o: any) => o.totalPrice?.amount)
    .sort((a: any, b: any) => Number(a.totalPrice.amount) - Number(b.totalPrice.amount))
    .map((o: any) => {
      const journey: any = journeysById.get(o.journeyRefs?.[0]);
      const segs = (journey?.flightRefs ?? []).map((r: string) => flightsById.get(r)).filter(Boolean).map((f: any) => ({
        marketingAirlineCode: f.marketingAirlineCode,
        marketingFlightNumber: f.marketingFlightNumber,
        departureAirportCode: f.departureAirportCode,
        arrivalAirportCode: f.arrivalAirportCode,
        departureDate: f.departureDate,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        bookingClassCode: o.items?.[0]?.fares?.[0]?.fareComponents?.[0]?.segmentDetails?.find((sd: any) => sd.flightRef === f.id)?.bookingClassCode,
      }));
      return {
        offerId: o.id,
        price: o.totalPrice.amount,
        currency: o.totalPrice.currencyCode,
        validUntil: o.validUntil,
        segments: segs,
        speakable: segs.length ? speakable(segs, o.totalPrice.amount, o.totalPrice.currencyCode) : `${o.totalPrice.currencyCode} ${o.totalPrice.amount}`,
      };
    });
  return { offers, totalOffers: (data.offers ?? []).length, ms: Math.round(performance.now() - t0) };
}

// Classic ATPCO booking. Guarded by SABRE_BOOKING_ARMED=yes — never call unarmed.
export async function bookOffer(offer: any, traveler: { firstName: string; lastName: string; phone: string }) {
  const t0 = performance.now();
  const data = await sabrePost("/v1/trip/orders/createBooking", {
    flightDetails: {
      flights: offer.segments.map((s: any) => ({
        flightNumber: s.marketingFlightNumber,
        airlineCode: s.marketingAirlineCode,
        fromAirportCode: s.departureAirportCode,
        toAirportCode: s.arrivalAirportCode,
        departureDate: s.departureDate,
        departureTime: s.departureTime,
        bookingClass: s.bookingClassCode ?? "Y",
        flightStatusCode: "NN",
      })),
    },
    travelers: [{ givenName: traveler.firstName, surname: traveler.lastName, passengerCode: "ADT" }],
    contactInfo: { phones: [traveler.phone] },
  });
  return { confirmationId: data.confirmationId, status: data.confirmationId ? "booked" : "no-confirmation", ms: Math.round(performance.now() - t0), raw: data };
}

export const getBooking = (confirmationId: string) => sabrePost("/v1/trip/orders/getBooking", { confirmationId });
export const cancelBooking = (confirmationId: string) => sabrePost("/v1/trip/orders/cancelBooking", { confirmationId, retrieveBooking: true, cancelAll: true });
