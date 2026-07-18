// Dashboard feed: GET ?resource=tenants|calls|actions|queue|offers (today's rows, newest first).

import { json, requireBearer, select } from "../_shared/db.ts";

const QUERIES: Record<string, string> = {
  tenants: "tenants?select=*",
  calls: "calls?select=*&order=started_at.desc&limit=50",
  actions: "actions?select=*&order=created_at.desc&limit=200",
  queue: "queue?select=*&order=id.desc&limit=50",
  offers: "offers?select=id,call_id,kind,ref,speakable,valid_until,created_at&order=created_at.desc&limit=50",
};

Deno.serve(async (req) => {
  const denied = requireBearer(req);
  if (denied) return denied;
  const resource = new URL(req.url).searchParams.get("resource") ?? "calls";
  const q = QUERIES[resource];
  if (!q) return json({ error: `unknown resource ${resource}` }, 400);
  try {
    return json(await select(q));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
