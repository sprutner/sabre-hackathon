import "dotenv/config";
import { tenantMcp } from "../src/pipes/tenant-mcp.js";
import { tenantDirect } from "../src/pipes/tenant-direct.js";

const phone = process.argv[2] ?? "4153239619";

for (const pipe of [tenantMcp, tenantDirect]) {
  console.log(`\n=== TENANT PIPE ${pipe.name.toUpperCase()} ===`);
  const t0 = performance.now();
  try {
    const lookup = await pipe.lookupReservationByPhone(phone);
    console.log(`lookup_reservation_by_phone(${phone}) [${Math.round(performance.now() - t0)}ms]:`);
    console.log(JSON.stringify(lookup, null, 2));
    if (lookup.found) {
      const ctx = await pipe.getTripContext(lookup.trip_id);
      console.log(`get_trip_context → speakable: ${ctx.speakable_summary}`);
      const group = await pipe.getGroupState(lookup.trip_id);
      console.log(`get_group_state → ${JSON.stringify({ confirmed: group.confirmed, unconfirmed: group.unconfirmed, room_config: group.room_config })}`);
    }
  } catch (e: any) {
    console.error(`  PIPE ${pipe.name} FAILED: ${e.message}`);
  }
}
