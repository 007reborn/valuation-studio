/* ═══════════════════════════════════════════════════════════════════════
   CARRY-ALONG — the companies a viewer loads are also kept in their private
   part of this artifact's data store (the `db` capability, under
   data/users/<their id>/), so a company loaded on the home computer is there
   on their phone. One document per company or profile, plus one for the lists
   they built and what they removed. Nothing is asked on page load: when the
   viewer hasn't allowed the store yet, the page offers a button.
   ═══════════════════════════════════════════════════════════════════════ */
const LS = { mode: LV_PUBLIC ? "off" : "wait", col: null, busy: false, last: null, err: null, q: new Map(), meta: false, timer: 0, tries: 0, pulled: 0, starting: null };
const lsEnc = s => String(s).replace(/[^A-Za-z0-9_-]/g, ch => "~" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
const lsAt = r => String((r && ((r.live && r.live.fetchedAt) || r.fetchedAt)) || "");
const lsPlain = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === "number" && !isFinite(v) ? null : v));
const lsCap = n => { try { return window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null); } catch { return Promise.resolve(null); } };
function lsSet(mode, err) { LS.mode = mode; LS.err = err || null; lvBump(); }

/* Start, or (asked = true) start after the viewer pressed the button. */
function lsInit(asked) {
  if (LV_PUBLIC || (LS.mode === "on" && LS.col)) return Promise.resolve();
  if (LS.starting) return LS.starting;
  const run = (async () => {
    try {
      const [db, user, perms] = await Promise.all([lsCap("db"), lsCap("user"), lsCap("permissions")]);
      if (!db || !user) return lsSet("off");
      if (asked) {
        if (perms) { const r = await perms.request(["db", "user"]).catch(() => null); if (r && r.db && r.db !== "granted") return lsSet(r.db === "prompt" ? "ask" : "off"); }       // left undecided: offer again; declined or not on offer here: stay local
      } else {
        const st = perms ? await perms.state("db").catch(() => null) : null;
        if (st !== "granted") return lsSet(st === "prompt" || st === null ? "ask" : "off");      // never raise a consent dialog on load
      }
      const uid = await user.id();
      if (!uid) return lsSet("off");
      LS.col = db.collection("data/users/" + uid);
      LS.mode = "on"; LS.err = null;
      await lsPull();
    } catch (e) { LS.col = null; lsSet(asked ? "error" : "ask", asked ? "The store couldn't be reached just now. Your companies stay in this browser." : null); }
  })();
  LS.starting = run.finally(() => { LS.starting = null; });
  return LS.starting;
}
/* Read the store, bring this device and the store to the same state: the newer copy of each company wins,
   and a company removed on one device after it was last fetched goes from the others too. */
async function lsPull() {
  if (!LS.col || LS.busy) return;
  LS.busy = true; lvBump();
  try {
    const snap = await LS.col.limit(1000).get();
    const R = { co: {}, pf: {}, meta: null };
    snap.docs.forEach(d => { const x = d.data(); if (!x || typeof x !== "object") return;
      const y = lsPlain(x);                                       // snapshots are frozen: work on a copy
      if (y.k === "meta") R.meta = y; else if (y.k === "co" && y.id && y.rec && y.rec.live && y.rec.id === y.id) R.co[y.id] = y; else if (y.k === "pf" && y.symbol && y.p && y.p.symbol === y.symbol && y.p.profile) R.pf[y.symbol] = y; });
    const gone = { ...((R.meta && R.meta.gone) || {}) };
    let goneNew = false;
    Object.entries(LV_REMOVED).forEach(([k, t]) => { if (!gone[k] || String(t) > String(gone[k])) { gone[k] = t; goneNew = true; } });
    const cut = new Date(Date.now() - 90 * 86400e3).toISOString();
    Object.keys(gone).forEach(k => { if (String(gone[k]) < cut) delete gone[k]; });
    /* companies */
    Object.entries(R.co).forEach(([id, x]) => {
      const rAt = String(x.at || lsAt(x.rec));
      if (gone[id] && String(gone[id]) >= rAt) { LS.q.set("c." + id, 1); return; }
      const mine = LV_RECS[id], L = LV_LIB.byId[id];
      if ((!mine || lsAt(mine) < rAt) && !(L && lsAt(L) >= rAt)) { try { lvRegister(x.rec, false, false, true); } catch {} }
    });
    [...LV_ORDER].forEach(id => {
      const mine = LV_RECS[id]; if (!mine) return;
      if (gone[id] && String(gone[id]) >= lsAt(mine)) { lvRemove(id, true); return; }
      const x = R.co[id];
      if (!x || String(x.at || lsAt(x.rec)) < lsAt(mine)) LS.q.set("c." + id, 1);
    });
    /* profiles */
    Object.entries(R.pf).forEach(([sym, x]) => {
      const rAt = String(x.at || lsAt(x.p)), g = gone["P:" + sym];
      if ((g && String(g) >= rAt) || SUITE.byId["L:" + sym]) { LS.q.set("p." + sym, 1); return; }
      const mine = LV_PROFILES[sym];
      if (!mine || lsAt(mine) < rAt) LV_PROFILES[sym] = x.p;
    });
    Object.keys(LV_PROFILES).forEach(sym => {
      const mine = LV_PROFILES[sym], g = gone["P:" + sym];
      if (g && String(g) >= lsAt(mine)) { delete LV_PROFILES[sym]; return; }
      const x = R.pf[sym];
      if (!x || String(x.at || lsAt(x.p)) < lsAt(mine)) LS.q.set("p." + sym, 1);
    });
    /* a removal mark is spent once the company has been loaded again since */
    Object.keys(gone).forEach(k => { const cur = k.startsWith("P:") ? LV_PROFILES[k.slice(2)] : LV_RECS[k]; if (cur && lsAt(cur) > String(gone[k])) delete gone[k]; });
    /* the viewer's own lists: the device that changed them last wins */
    const rMetaAt = String((R.meta && R.meta.at) || "");
    if (R.meta && rMetaAt > LV_META_AT) {
      Object.keys(LV_GROUPS).forEach(k => delete LV_GROUPS[k]); Object.keys(LV_EXTRAS).forEach(k => delete LV_EXTRAS[k]);
      Object.entries(R.meta.groups && typeof R.meta.groups === "object" ? R.meta.groups : {}).forEach(([gid, name]) => { LV_GROUPS[gid] = String(name);
        if (!SUITE.ind.find(g => g.id === gid)) SUITE.ind.push({ id: gid, name: String(name), cos: [], note: null, live: true }); });
      Object.entries(R.meta.extras && typeof R.meta.extras === "object" ? R.meta.extras : {}).forEach(([gid, ids]) => { if (Array.isArray(ids)) LV_EXTRAS[gid] = ids.map(String); });
      SUITE.ind.forEach(G => { if (!G.live) return; G.cos = G.cos.filter(id => SUITE.indOf[id] === G.id || (LV_EXTRAS[G.id] || []).includes(id)); });
      Object.entries(LV_EXTRAS).forEach(([gid, ids]) => { const G = SUITE.ind.find(g => g.id === gid); if (G) ids.forEach(id => { if (SUITE.byId[id] && !G.cos.includes(id)) G.cos.push(id); }); });
      LV_META_AT = rMetaAt;
    } else if (LV_META_AT > rMetaAt || (!R.meta && (Object.keys(LV_GROUPS).length || Object.keys(LV_EXTRAS).length))) LS.meta = true;
    for (let k = SUITE.ind.length - 1; k >= 0; k--) if (SUITE.ind[k].live && !SUITE.ind[k].cos.length) { delete LV_GROUPS[SUITE.ind[k].id]; SUITE.ind.splice(k, 1); }
    Object.keys(LV_REMOVED).forEach(k => delete LV_REMOVED[k]); Object.assign(LV_REMOVED, gone);
    if (goneNew || JSON.stringify(gone) !== JSON.stringify((R.meta && R.meta.gone) || {})) LS.meta = true;
    lvSave();
    LS.pulled = Date.now(); LS.last = new Date().toISOString(); LS.err = null;
    try { SuiteSel.refresh(); } catch {}
  } catch (e) {
    const c = e && e.code;
    if (c === "revoked" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed") { LS.col = null; LS.mode = "off"; }
    else LS.err = "The store didn't answer just now. Your companies are safe in this browser; press Sync now to try again.";
  }
  LS.busy = false; lvBump();
  lsFlush();
}
/* Send what changed on this device, one document at a time. */
async function lsFlush() {
  if (!LS.col || LS.busy || LS.mode !== "on" || (!LS.q.size && !LS.meta)) return;
  LS.busy = true; lvBump();
  const fail = e => {
    const c = e && e.code;
    if (c === "unavailable" || c === "resource_exhausted") { if (LS.tries++ < 3) { clearTimeout(LS.timer); LS.timer = setTimeout(lsFlush, c === "unavailable" ? 4000 + Math.random() * 3000 : 9000); } else LS.err = "Some changes haven't reached the store yet. Press Sync now to try again."; return; }
    if (c === "quota_exceeded") { LS.err = "The store is full, so new companies stay in this browser only. Remove some loaded companies to make room."; return; }
    LS.col = null; LS.mode = "off"; LS.err = "This view can't write to the store, so your companies stay in this browser.";
  };
  try {
    while (LS.q.size && LS.col) {
      const key = LS.q.keys().next().value, kind = key[0], name = key.slice(2), ref = LS.col.doc(lsEnc(key));
      LS.q.delete(key);
      try {
        if (kind === "c") { const rec = LV_RECS[name]; if (rec) await ref.set(lsPlain({ k: "co", id: name, at: lsAt(rec), rec })); else await ref.delete(); }
        else { const p = LV_PROFILES[name]; if (p) await ref.set(lsPlain({ k: "pf", symbol: name, at: lsAt(p), p })); else await ref.delete(); }
      } catch (e) { LS.q.set(key, 1); throw e; }
      await new Promise(r => setTimeout(r, 120));
    }
    if (LS.meta && LS.col) {
      if (!LV_META_AT) LV_META_AT = new Date().toISOString();
      await LS.col.doc("meta").set(lsPlain({ k: "meta", at: LV_META_AT, groups: LV_GROUPS, extras: LV_EXTRAS, gone: LV_REMOVED }));
      LS.meta = false; lvSave();
    }
    LS.tries = 0; LS.last = new Date().toISOString(); LS.err = null;
  } catch (e) { fail(e); }
  LS.busy = false; lvBump();
  if ((LS.q.size || LS.meta) && LS.col && LS.mode === "on" && !LS.err && !LS.tries) { clearTimeout(LS.timer); LS.timer = setTimeout(lsFlush, 600); }
}
LV_ON_CHANGE = (kind, key) => {
  if (kind === "meta" || kind === "gone") LS.meta = true;
  if (LS.mode !== "on") return;
  if (kind === "rec") LS.q.set("c." + key, 1);
  else if (kind === "prof") LS.q.set("p." + key, 1);
  else if (kind === "gone") LS.q.set(String(key).startsWith("P:") ? "p." + String(key).slice(2) : "c." + key, 1);
  clearTimeout(LS.timer); LS.timer = setTimeout(lsFlush, 900);
};
/* Coming back to the page after a while (a phone waking up) reads the store again. */
try { document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && LS.mode === "on" && Date.now() - LS.pulled > 120000) lsPull(); }); } catch {}
function useSync() { useLive(); return { mode: LS.mode, busy: LS.busy, last: LS.last, err: LS.err, pending: LS.q.size + (LS.meta ? 1 : 0) }; }
/* First look at the store once the page has painted. Never raises a consent dialog. */
try { if (!LV_PUBLIC) setTimeout(() => { lsInit(false); }, 400); } catch {}
