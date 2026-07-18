// Pipe B — direct REST against api.cert.platform.sabre.com using the CERT session token.
// Verified live Jul 18 06:20 UTC: flightShop 200 in ~3.4s.

import type { BookResult, FlightSegment, SabrePipe, SearchResult, SpeakableOffer } from "./types.js";

const BASE = "https://api.cert.platform.sabre.com";

async function sabrePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SABRE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sabre REST ${path} HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

function speakable(seg: FlightSegment[], price: string, currency: string): string {
  const first = seg[0];
  const last = seg[seg.length - 1];
  const stops = seg.length - 1;
  const via = stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""} via ${seg.slice(1).map((s) => s.departureAirportCode).join(", ")}`;
  return `${first.marketingAirlineCode} ${first.marketingFlightNumber} departing ${first.departureAirportCode} at ${first.departureTime} on ${first.departureDate}, arriving ${last.arrivalAirportCode} at ${last.arrivalTime}, ${via}, ${currency === "USD" ? "$" : currency + " "}${price} total`;
}

export const sabreRest: SabrePipe = {
  name: "rest",

  async searchFlights(origin, dest, date, pax): Promise<SearchResult> {
    const t0 = performance.now();
    const body = {
      journeys: [{ departureLocation: { airportCode: origin }, arrivalLocation: { airportCode: dest }, departureDate: date }],
      travelers: Array.from({ length: pax }, () => ({ passengerTypeCode: "ADT" })),
    };
    const data = await sabrePost("/v1/offers/flightShop", body);
    const flightsById = new Map<string, any>((data.flights ?? []).map((f: any) => [f.id, f]));
    const journeysById = new Map<string, any>((data.journeys ?? []).map((j: any) => [j.id, j]));

    const offers: SpeakableOffer[] = (data.offers ?? [])
      .filter((o: any) => o.totalPrice?.amount)
      .sort((a: any, b: any) => Number(a.totalPrice.amount) - Number(b.totalPrice.amount))
      .map((o: any) => {
        const journey = journeysById.get(o.journeyRefs?.[0]);
        const segs: FlightSegment[] = (journey?.flightRefs ?? [])
          .map((ref: string) => flightsById.get(ref))
          .filter(Boolean)
          .map((f: any) => ({
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
          speakable: segs.length ? speakable(segs, o.totalPrice.amount, o.totalPrice.currencyCode) : `${o.totalPrice.currencyCode} ${o.totalPrice.amount} (segments unresolved)`,
        };
      });
    return { offers, totalOffers: (data.offers ?? []).length, ms: Math.round(performance.now() - t0), live: true, raw: data };
  },

  // Classic ATPCO booking via flightDetails. DO NOT CALL without Seth's explicit yes.
  async bookOrExchange(offer, traveler): Promise<BookResult> {
    const t0 = performance.now();
    const body = {
      flightDetails: {
        flights: offer.segments.map((s) => ({
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
    };
    const data = await sabrePost("/v1/trip/orders/createBooking", body);
    return {
      confirmationId: data.confirmationId,
      status: data.confirmationId ? "booked" : "no-confirmation",
      ms: Math.round(performance.now() - t0),
      live: true,
      raw: data,
    };
  },
};

export async function getBooking(confirmationId: string): Promise<any> {
  return sabrePost("/v1/trip/orders/getBooking", { confirmationId });
}

export async function cancelBooking(confirmationId: string): Promise<any> {
  return sabrePost("/v1/trip/orders/cancelBooking", { confirmationId, retrieveBooking: true, cancelAll: true });
}
