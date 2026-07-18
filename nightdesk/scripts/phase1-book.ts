// ARMED booking cycle: search → createBooking → getBooking → cancelBooking. Prints locator + latencies.
import "dotenv/config";
import { sabreRest, getBooking, cancelBooking } from "../src/pipes/sabre-rest.js";

if (process.env.SABRE_BOOKING_ARMED !== "yes") throw new Error("not armed");

const date = process.argv[2] ?? "2026-07-20";
console.log(`SEARCH SFO→SJD ${date}…`);
const search = await sabreRest.searchFlights("SFO", "SJD", date, 1);
const offer = search.offers[0];
console.log(`  ${search.totalOffers} offers in ${search.ms}ms; booking cheapest: ${offer.speakable}`);

console.log(`CREATE BOOKING…`);
const t0 = performance.now();
const book = await sabreRest.bookOrExchange(offer, { firstName: "Dana", lastName: "Whitfield", phone: "4155550101" });
console.log(`  status=${book.status} locator=${book.confirmationId} in ${book.ms}ms`);
if (!book.confirmationId) {
  console.log("RAW:", JSON.stringify(book.raw).slice(0, 2000));
  process.exit(1);
}

console.log(`RETRIEVE ${book.confirmationId}…`);
const t1 = performance.now();
const got = await getBooking(book.confirmationId);
console.log(`  retrieved in ${Math.round(performance.now() - t1)}ms: ${got.flights?.length ?? 0} flight(s), travelers=${(got.travelers ?? []).map((t: any) => t.givenName + " " + t.surname).join(", ")}, status=${got.flights?.[0]?.flightStatusName ?? "?"}`);

console.log(`CANCEL ${book.confirmationId}…`);
const t2 = performance.now();
const cancelled = await cancelBooking(book.confirmationId);
console.log(`  cancel response in ${Math.round(performance.now() - t2)}ms: ${JSON.stringify(cancelled).slice(0, 300)}`);
console.log(`\nE2E book→retrieve→cancel: ${Math.round(performance.now() - t0)}ms`);
