import "dotenv/config";
import { sabreRest } from "../src/pipes/sabre-rest.js";
import { sabreMcp } from "../src/pipes/sabre-mcp.js";

const [origin, dest, date, pax] = ["SFO", "SJD", process.argv[2] ?? "2026-07-19", 1];
const which = process.argv[3] ?? "both";

for (const pipe of [sabreRest, sabreMcp]) {
  if (which !== "both" && which !== pipe.name) continue;
  console.log(`\n=== PIPE ${pipe.name.toUpperCase()} — searchFlights(${origin},${dest},${date},${pax}) ===`);
  try {
    const r = await pipe.searchFlights(origin, dest, date, pax);
    console.log(`total offers: ${r.totalOffers} | ms: ${r.ms} | live: ${r.live}`);
    for (const o of r.offers.slice(0, 2)) {
      console.log(`  [${o.offerId.slice(0, 12)}…] ${o.speakable}`);
    }
    if (pipe.name === "mcp") {
      const raw: any = r.raw;
      console.log(`  mcp tool calls: ${raw.toolCalls.map((t: any) => t.name).join(" → ") || "(none)"}`);
    }
  } catch (e: any) {
    console.error(`  PIPE ${pipe.name} FAILED: ${e.message}`);
  }
}
