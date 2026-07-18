// Ugly-but-truthful dashboard. GET ?t=<shared secret> serves HTML; ?t=...&data=<resource>
// returns JSON (proxied server-side with the service role). LIVE/SIM chips from actions.live.

import { json, select } from "../_shared/db.ts";

const QUERIES: Record<string, string> = {
  tenants: "tenants?select=*",
  calls: "calls?select=*&order=started_at.desc&limit=25",
  actions: "actions?select=*&order=created_at.desc&limit=100",
  queue: "queue?select=*&order=id.desc&limit=25",
};

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Night Desk</title><style>
body{font-family:ui-monospace,monospace;background:#0d1117;color:#e6edf3;margin:0;padding:1rem}
h1{font-size:1.1rem} h2{font-size:.9rem;color:#8b949e;margin:.8rem 0 .3rem}
.chip{display:inline-block;padding:.05rem .45rem;border-radius:999px;font-size:.7rem;margin-right:.3rem}
.live{background:#1f6feb}.sim{background:#6e40c9}.row{border-bottom:1px solid #21262d;padding:.35rem 0;font-size:.8rem}
select{background:#161b22;color:#e6edf3;border:1px solid #30363d;padding:.2rem}
.err{color:#f85149}.transcript{white-space:pre-wrap;background:#161b22;padding:.5rem;border-radius:6px;font-size:.78rem}
</style></head><body>
<h1>NIGHT DESK <span id="clock"></span></h1>
<div>Tenant: <select id="tenant"></select></div>
<h2>TONIGHT'S CALLS</h2><div id="calls"></div>
<h2>LATEST TRANSCRIPT</h2><div id="transcript" class="transcript">—</div>
<h2>ACTIONS</h2><div id="actions"></div>
<h2>ESCALATION QUEUE</h2><div id="queue"></div>
<script>
const t = new URLSearchParams(location.search).get('t');
const get = (r) => fetch(location.pathname + '?t=' + t + '&data=' + r).then(x => x.json());
let tenants = [];
async function tick(){
  try{
    const [ts, calls, actions, queue] = await Promise.all([get('tenants'), get('calls'), get('actions'), get('queue')]);
    tenants = ts;
    const sel = document.getElementById('tenant');
    if (sel.options.length !== ts.length){ sel.innerHTML = ts.map(x=>'<option value="'+x.id+'">'+x.name+' ['+x.adapter+']</option>').join(''); }
    const tid = sel.value || (ts[0] && ts[0].id);
    const myCalls = calls.filter(c=>c.tenant_id===tid);
    document.getElementById('calls').innerHTML = myCalls.map(c=>'<div class="row">'+c.direction+' · '+c.status+' · '+new Date(c.started_at).toLocaleTimeString()+' · '+c.id.slice(0,8)+'</div>').join('')||'<div class="row">none</div>';
    const latest = myCalls[0];
    document.getElementById('transcript').textContent = latest && Array.isArray(latest.transcript) ? latest.transcript.map(m=>m.role.toUpperCase()+': '+m.text).join('\\n') : '—';
    const callIds = new Set(myCalls.map(c=>c.id));
    document.getElementById('actions').innerHTML = actions.filter(a=>callIds.has(a.call_id)).map(a=>'<div class="row"><span class="chip '+(a.live?'live':'sim')+'">'+(a.live?'LIVE':'SIM')+'</span>'+a.type+' '+(a.result&&a.result.error?'<span class=err>'+a.result.error+'</span>':'')+' · '+new Date(a.created_at).toLocaleTimeString()+'</div>').join('')||'<div class="row">none</div>';
    document.getElementById('queue').innerHTML = queue.filter(q=>q.tenant_id===tid).map(q=>'<div class="row">'+q.status+' · '+q.reason+' · promised by '+q.promised_by+'</div>').join('')||'<div class="row">empty</div>';
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  }catch(e){ document.getElementById('clock').textContent = 'ERR ' + e.message; }
}
tick(); setInterval(tick, 3000);
</script></body></html>`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get("TENANT_MCP_SHARED_SECRET");
  if (secret && url.searchParams.get("t") !== secret) return new Response("forbidden", { status: 403 });
  const data = url.searchParams.get("data");
  if (data) {
    const q = QUERIES[data];
    if (!q) return json({ error: "unknown resource" }, 400);
    try {
      return json(await select(q));
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
