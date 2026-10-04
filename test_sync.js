/* Tests for carry-along: two devices sharing one viewer's private store, with the page's `db`, `user` and `permissions`
   capabilities stood in for. Records are the ones captured on 4 Oct 2026. */
const fs = require("fs");
const calls = JSON.parse(fs.readFileSync("harvest/calls.json", "utf8")), lib = JSON.parse(fs.readFileSync("harvest/library_fc.json", "utf8")),      // a small pre-loaded set: these tests are about the store, not the pack
  libFull = JSON.parse(fs.readFileSync("harvest/library.json", "utf8"));
const { load } = require("./harvest/engine.js");
let fails = 0, n = 0; const ok = (c, msg) => { n++; if (!c) { fails++; console.log("FAIL", msg); } };
const freeze = o => { if (o && typeof o === "object") { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
function mockDb(store, hooks = {}) {
  const ops = [];
  const check = (path, even) => { const segs = path.split("/"); if (!segs.every(s => SEG.test(s) && s !== "." && s !== ".." && Buffer.byteLength(s) <= 200) || (segs.length % 2 === 0) !== even || segs.length > 16) throw new TypeError("bad path " + path); };
  const docRef = path => ({ id: path.split("/").pop(), path,
    get: async () => { ops.push(["get", path]); const v = store.get(path); return { id: path.split("/").pop(), exists: v !== undefined, data: () => v === undefined ? undefined : freeze(JSON.parse(v)) }; },
    set: async data => { ops.push(["set", path]); if (hooks.set) { const e = hooks.set(path); if (e) throw e; } const j = JSON.stringify(data); if (!data || typeof data !== "object" || Array.isArray(data) || j.length > 256 * 1024 || j.includes("undefined")) throw { code: "invalid_argument", message: "body" }; store.set(path, j); },
    delete: async () => { ops.push(["delete", path]); store.delete(path); } });
  const col = path => { check(path, false); const depth = path.split("/").length + 1;
    const q = { path, limit: () => q, doc: id => { const p = path + "/" + id; check(p, true); return docRef(p); },
      get: async () => { ops.push(["list", path]); if (hooks.list) { const e = hooks.list(); if (e) throw e; }
        const docs = [...store.keys()].filter(k => k.startsWith(path + "/") && k.split("/").length === depth).sort().map(k => ({ id: k.split("/").pop(), exists: true, data: () => freeze(JSON.parse(store.get(k))) }));
        return { docs, size: docs.length, empty: !docs.length }; } };
    return q; };
  return { doc: p => { check(p, true); return docRef(p); }, collection: col, ops };
}
const perms = (state, answer) => { const asked = []; return { asked, state: async nm => state.db !== undefined && nm === "db" ? state.db : "unavailable",
  request: async names => { asked.push(names); if (answer) state.db = answer; const o = {}; names.forEach(k => { o[k] = k === "db" ? state.db : "granted"; }); return o; } }; };
const device = (store, { state = { db: "granted" }, answer, uid = "usr_7Qk2", local = {}, hooks, pub = false, withLib = true, caps, libSet = null } = {}) => {
  const db = mockDb(store, hooks), P = perms(state, answer);
  const d = load(calls, { route: "none", lib: withLib ? (libSet || lib) : null, sync: true, pub, store: local, caps: caps || { db, user: { id: async () => uid }, permissions: P } });
  return { ...d, db, P, local };
};
const settle = async m => { for (let i = 0; i < 400; i++) { if (!m.LS.busy && !m.LS.q.size && !m.LS.meta && !m.LS.starting) return; await new Promise(r => setTimeout(r, 15)); } throw new Error("sync did not settle: " + JSON.stringify({ busy: m.LS.busy, q: m.LS.q.size, meta: m.LS.meta })); };
const clone = (rec, over, liveOver) => { const r = JSON.parse(JSON.stringify(rec)); Object.assign(r, over); r.live = { ...r.live, ...(liveOver || {}) }; return r; };
const itc = clone(lib.recs[0], { id: "L:ITC.NS", ticker: "ITC.NS", name: "ITC Limited", short: "ITC", industry: "live:tobacco", price: 410 }, { symbol: "ITC.NS", group: "Tobacco", fetchedAt: "2026-10-03T08:00:00.000Z" });
const mm = clone(lib.recs[0], { id: "L:M&M.NS", ticker: "M&M.NS", name: "Mahindra & Mahindra Limited", short: "Mahindra", industry: "live:auto-manufacturers", price: 3100 }, { symbol: "M&M.NS", group: "Auto Manufacturers", fetchedAt: "2026-10-03T08:05:00.000Z" });
const zed = clone(lib.recs[0], { id: "L:ZED.NS", ticker: "ZED.NS", name: "Zed Works Limited", short: "Zed Works", industry: "live:widgets", price: 55 }, { symbol: "ZED.NS", group: "Widgets", fetchedAt: "2026-10-03T08:10:00.000Z" });
const sbi = { ...JSON.parse(JSON.stringify(lib.profiles[0])), symbol: "SBIN.NS", name: "State Bank of India", short: "State Bank", fetchedAt: "2026-10-03T08:20:00.000Z" };
const seedA = () => ({ "vs:live2": JSON.stringify({ v: 2, cos: [itc, mm, zed], extras: { "live:my-list": ["L:ZED.NS", "L:ITC.NS"] }, profiles: { "SBIN.NS": sbi }, groups: { "live:my-list": "My shortlist" }, gone: {}, metaAt: "2026-10-03T08:30:00.000Z" }) });
(async () => {
  const store = new Map();
  /* A: the home computer, already holding three companies, a profile and a list of the viewer's own */
  const A = device(store, { local: seedA() });
  ok(A.m.LS.mode === "wait" && A.db.ops.length === 0, "nothing touches the store before the page has painted");
  await A.m.lsInit(false); await settle(A.m);
  const keys = [...store.keys()].sort();
  ok(A.m.LS.mode === "on" && keys.length === 5 && keys.every(k => k.startsWith("data/users/usr_7Qk2/")), "first sync writes one document per company and profile, plus one for lists: " + keys.map(k => k.split("/").pop()).join(" "));
  ok(keys.every(k => k.split("/").every(s => SEG.test(s))) && keys.some(k => /M~0026M/.test(k)), "document ids are valid path segments, including M&M's");
  const docOf = id => JSON.parse(store.get([...store.keys()].find(k => JSON.parse(store.get(k)).id === id || JSON.parse(store.get(k)).symbol === id)));
  ok(docOf("L:ITC.NS").k === "co" && docOf("L:ITC.NS").at === itc.live.fetchedAt && docOf("L:ITC.NS").rec.rev.length === 5 && docOf("SBIN.NS").k === "pf", "documents carry the whole record and its fetch time");
  const meta = JSON.parse(store.get("data/users/usr_7Qk2/meta"));
  ok(meta.k === "meta" && meta.groups["live:my-list"] === "My shortlist" && meta.extras["live:my-list"].join() === "L:ZED.NS,L:ITC.NS" && meta.at === "2026-10-03T08:30:00.000Z", "the viewer's own list travels too");
  ok(A.P.asked.length === 0, "no consent dialog was raised: it was already granted");
  const w0 = A.db.ops.filter(o => o[0] === "set").length; await A.m.lsPull(); await settle(A.m);
  ok(A.db.ops.filter(o => o[0] === "set").length === w0, "a second sync with nothing changed writes nothing");

  /* B: the phone, signed in as the same person, nothing loaded */
  const B = device(store, { local: {} });
  await B.m.lsInit(false); await settle(B.m);
  ok(B.m.LV_ORDER.sort().join() === "L:ITC.NS,L:M&M.NS,L:ZED.NS" && B.m.SUITE.byId["L:ITC.NS"].price === 410 && B.m.lvProfile("SBIN.NS").name === "State Bank of India", "the phone receives every company and profile: " + B.m.LV_ORDER.join());
  ok(B.m.SUITE.indOf["L:ITC.NS"] === "live:pack-consumer" && B.m.SUITE.indOf["L:M&M.NS"] === "live:pack-autos" && B.m.SUITE.indOf["L:ZED.NS"] === "live:widgets", "each lands in the right list");
  const myList = B.m.SUITE.ind.find(g => g.id === "live:my-list");
  ok(myList && myList.name === "My shortlist" && myList.cos.sort().join() === "L:ITC.NS,L:ZED.NS", "…including the viewer's own shortlist");
  ok(JSON.parse(B.local["vs:live2"]).cos.length === 3 && B.db.ops.every(o => o[0] === "list") && B.m.SUITE_R["L:ITC.NS"][4].roe != null, "they're saved in the phone's browser, ratios ready, and the phone wrote nothing back");
  ok(B.m.lvLocalSearch("mahindra")[0].local === "loaded" && B.m.lvHave("ZED.NS").kind === "loaded", "and they turn up in the phone's search");

  /* removal on one device reaches the other */
  A.m.lvRemove("L:ZED.NS"); await A.m.lsFlush(); await settle(A.m);
  ok(![...store.values()].some(v => JSON.parse(v).id === "L:ZED.NS") && JSON.parse(store.get("data/users/usr_7Qk2/meta")).gone["L:ZED.NS"], "removing a company deletes its document and records the removal");
  await B.m.lsPull(); await settle(B.m);
  ok(!B.m.SUITE.byId["L:ZED.NS"] && !B.m.LV_ORDER.includes("L:ZED.NS") && B.m.LV_REMOVED["L:ZED.NS"] && !B.m.SUITE.ind.find(g => g.id === "live:widgets") && ![...store.values()].some(v => JSON.parse(v).id === "L:ZED.NS"), "the phone drops it too and doesn't put it back");
  ok(B.m.SUITE.ind.find(g => g.id === "live:my-list").cos.join() === "L:ITC.NS", "its place in the shortlist goes with it");

  /* a newer copy wins, in either direction */
  B.m.lvRegister(clone(itc, { price: 432 }, { fetchedAt: "2026-10-04T09:00:00.000Z" })); await B.m.lsFlush(); await settle(B.m);
  ok(docOf("L:ITC.NS").rec.price === 432 && docOf("L:ITC.NS").at === "2026-10-04T09:00:00.000Z", "a refresh on the phone updates the store");
  await A.m.lsPull(); await settle(A.m);
  ok(A.m.SUITE.byId["L:ITC.NS"].price === 432 && JSON.parse(A.local["vs:live2"]).cos.find(c => c.id === "L:ITC.NS").price === 432, "the home computer picks up the newer copy");
  A.m.lvRegister(clone(itc, { price: 1 }, { fetchedAt: "2026-10-01T00:00:00.000Z" }), true, false, true); await A.m.lsPull(); await settle(A.m);
  ok(A.m.SUITE.byId["L:ITC.NS"].price === 432, "an older local copy is replaced by the store's newer one");

  /* loading a removed company again brings it back everywhere */
  B.m.lvRegister(clone(zed, { price: 60 }, { fetchedAt: new Date(Date.now() + 5000).toISOString() })); await B.m.lsFlush(); await settle(B.m);
  await A.m.lsPull(); await settle(A.m);
  ok(A.m.SUITE.byId["L:ZED.NS"] && A.m.SUITE.byId["L:ZED.NS"].price === 60 && !A.m.LV_REMOVED["L:ZED.NS"], "a company loaded again after its removal returns on the other device");

  /* profiles: removal, and promotion to a full company */
  A.m.lvRemoveProfile("SBIN.NS"); await A.m.lsFlush(); await settle(A.m); await B.m.lsPull(); await settle(B.m);
  ok(!B.m.LV_PROFILES["SBIN.NS"] && ![...store.values()].some(v => JSON.parse(v).symbol === "SBIN.NS"), "a removed profile goes from both");
  B.m.lvSaveProfile({ ...sbi, symbol: "ZZP.NS", name: "Zed Profile", short: "ZedP", fetchedAt: new Date().toISOString() }); await B.m.lsFlush(); await settle(B.m);
  await A.m.lsPull(); await settle(A.m); ok(A.m.lvProfile("ZZP.NS"), "a new profile travels");
  A.m.lvRegister(clone(zed, { id: "L:ZZP.NS", ticker: "ZZP.NS", name: "Zed Profile", short: "ZedP" }, { symbol: "ZZP.NS", fetchedAt: new Date(Date.now() + 9000).toISOString() })); await A.m.lsFlush(); await settle(A.m);
  await B.m.lsPull(); await settle(B.m);
  ok(B.m.SUITE.byId["L:ZZP.NS"] && !B.m.LV_PROFILES["ZZP.NS"] && ![...store.values()].some(v => JSON.parse(v).k === "pf" && JSON.parse(v).symbol === "ZZP.NS"), "a profile that later loads in full is replaced by the company everywhere");

  /* lists: the device that changed them last wins */
  await new Promise(r => setTimeout(r, 5));
  B.m.lvDropFromGroup("L:ITC.NS", "live:my-list"); await B.m.lsFlush(); await settle(B.m);
  await A.m.lsPull(); await settle(A.m);
  ok(!(A.m.LV_EXTRAS["live:my-list"] || []).includes("L:ITC.NS") && !(A.m.SUITE.ind.find(g => g.id === "live:my-list") || { cos: [] }).cos.includes("L:ITC.NS"), "taking a company out of a shortlist on the phone reaches the home computer");

  /* the pre-loaded library and the store */
  const S2 = new Map();
  const C = device(S2, { local: { "vs:live2": JSON.stringify({ v: 2, cos: [clone(lib.recs[0], { price: 1300 }, { fetchedAt: new Date(Date.now() - 60000).toISOString() })], extras: {}, profiles: {}, groups: {}, gone: {} }) } });
  await C.m.lsInit(false); await settle(C.m);
  ok(S2.size === 1 || S2.size === 2, "only the viewer's own copies are stored, never the pre-loaded library: " + S2.size + " document(s)");
  const D = device(S2, { local: {} }); await D.m.lsInit(false); await settle(D.m);
  ok(D.m.SUITE.byId["L:RELIANCE.NS"].price === 1300 && !D.m.SUITE.byId["L:RELIANCE.NS"].lib && D.m.SUITE.byId["L:AAPL"].lib, "a refreshed copy of a pre-loaded company replaces it on the other device; the rest stay pre-loaded");
  C.m.lvRemove("L:RELIANCE.NS"); await C.m.lsFlush(); await settle(C.m); await D.m.lsPull(); await settle(D.m);
  ok(D.m.SUITE.byId["L:RELIANCE.NS"].price === 1167.7 && D.m.SUITE.byId["L:RELIANCE.NS"].lib && D.m.LV_ORDER.length === 0, "undoing the refresh falls back to the pre-loaded copy on both");
  S2.set("data/users/usr_7Qk2/" + C.m.lsEnc("c.L:AAPL"), JSON.stringify({ k: "co", id: "L:AAPL", at: "2026-01-01T00:00:00.000Z", rec: clone(lib.recs.find(r => r.ticker === "AAPL"), { price: 2 }, { fetchedAt: "2026-01-01T00:00:00.000Z" }) }));
  await D.m.lsPull(); await settle(D.m);
  ok(D.m.SUITE.byId["L:AAPL"].price === 333.69 && D.m.SUITE.byId["L:AAPL"].lib, "a stored copy older than the page's own is ignored");
  S2.set("data/users/usr_7Qk2/junk", JSON.stringify({ k: "co", id: "L:X", rec: { id: "L:OTHER" } })); S2.set("data/users/usr_7Qk2/junk2", JSON.stringify({ hello: 1 }));
  await D.m.lsPull(); await settle(D.m); ok(!D.m.SUITE.byId["L:X"] && !D.m.SUITE.byId["L:OTHER"] && D.m.LS.mode === "on", "malformed documents are skipped");

  /* consent: never asked on load; asked once when the viewer presses the button */
  const S3 = new Map([...store]);
  const E = device(S3, { state: { db: "prompt" }, answer: "granted", local: {} });
  await E.m.lsInit(false);
  ok(E.m.LS.mode === "ask" && E.db.ops.length === 0 && E.P.asked.length === 0 && E.m.LV_ORDER.length === 0, "not yet allowed: the page offers a button and touches nothing");
  await E.m.lsInit(true); await settle(E.m);
  ok(E.m.LS.mode === "on" && E.P.asked.length === 1 && E.P.asked[0].join() === "db,user" && E.m.LV_ORDER.length >= 3, "pressing it asks once and brings the companies over: " + E.m.LV_ORDER.length);
  const F = device(S3, { state: { db: "prompt" }, answer: "denied", local: {} });
  await F.m.lsInit(false); await F.m.lsInit(true);
  ok(F.m.LS.mode === "off" && F.db.ops.length === 0, "declined: stays in this browser, store untouched");
  const G = device(S3, { uid: null, local: {} }); await G.m.lsInit(false); ok(G.m.LS.mode === "off" && G.db.ops.length === 0, "no identity for this viewer → off");
  const H = device(S3, { caps: {}, local: {} }); await H.m.lsInit(false); ok(H.m.LS.mode === "off", "no store in this view → off");
  let used = 0; const I = device(S3, { pub: true, caps: new Proxy({}, { get: () => { used++; return null; } }), local: {} }); await I.m.lsInit(false); await I.m.lsInit(true);
  ok(I.m.LS.mode === "off" && used === 0, "the public edition never asks for the store");
  const J = device(S3, { state: { db: "denied" }, local: {} }); await J.m.lsInit(false); ok(J.m.LS.mode === "off", "declined earlier in this visit → no button");
  const J2 = device(S3, { state: { db: "prompt" }, answer: "unavailable", local: {} }); await J2.m.lsInit(false); await J2.m.lsInit(true);
  ok(J2.m.LS.mode === "off" && J2.db.ops.length === 0, "the store turns out not to be on offer here → the button goes away instead of doing nothing");
  const J3 = device(S3, { state: { db: "prompt" }, answer: "prompt", local: {} }); await J3.m.lsInit(false); await J3.m.lsInit(true);
  ok(J3.m.LS.mode === "ask" && J3.db.ops.length === 0, "the question was left undecided → the offer stays");

  /* failures */
  let failN = 1; const K = device(new Map(), { local: seedA(), hooks: { set: () => failN-- > 0 ? { code: "unavailable" } : null } });
  await K.m.lsInit(false); for (let i = 0; i < 700 && (K.m.LS.q.size || K.m.LS.meta || K.m.LS.busy); i++) await new Promise(r => setTimeout(r, 20));
  ok(K.m.LS.mode === "on" && !K.m.LS.q.size && !K.m.LS.err && K.db.ops.filter(o => o[0] === "set").length === 6, "a store hiccup is retried and everything arrives");
  const L = device(new Map(), { local: seedA(), hooks: { set: () => ({ code: "invalid_argument" }) } }); await L.m.lsInit(false); await new Promise(r => setTimeout(r, 300));
  ok(L.m.LS.mode === "off" && /stay in this browser/.test(L.m.LS.err) && L.m.LV_ORDER.length === 3, "a view that can't write turns syncing off and keeps the browser copy");
  const M = device(new Map(), { local: seedA(), hooks: { set: () => ({ code: "quota_exceeded" }) } }); await M.m.lsInit(false); await new Promise(r => setTimeout(r, 300));
  ok(M.m.LS.mode === "on" && /store is full/.test(M.m.LS.err), "a full store is reported");
  const N = device(new Map(), { local: seedA(), hooks: { list: () => ({ code: "unavailable" }) } }); await N.m.lsInit(false); await new Promise(r => setTimeout(r, 100));
  ok(N.m.LS.mode === "on" && /didn't answer/.test(N.m.LS.err) && N.m.LV_ORDER.length === 3, "a failed read leaves the browser copy alone and says so");
  const O = device(new Map(), { local: seedA(), hooks: { list: () => ({ code: "revoked" }) } }); await O.m.lsInit(false); await new Promise(r => setTimeout(r, 100));
  ok(O.m.LS.mode === "off" && O.m.LV_ORDER.length === 3, "access withdrawn → off, companies kept");

  /* the full pre-loaded pack and the store */
  { const SF = new Map(), itcLib = libFull.recs.find(r => r.ticker === "ITC.NS");
    const F1 = device(SF, { local: {}, libSet: libFull }); await F1.m.lsInit(false); await settle(F1.m);
    ok(F1.m.LS.mode === "on" && SF.size === 0 && F1.m.LV_ORDER.length === 0 && F1.m.SUITE.cos.length === 47 + libFull.recs.length, "with the whole pack pre-loaded and nothing of the viewer's own, the store stays empty");
    /* a copy the viewer loaded before the pack was built in: older than the page's own, so the page's copy stands */
    SF.set("data/users/usr_7Qk2/" + F1.m.lsEnc("c.L:ITC.NS"), JSON.stringify({ k: "co", id: "L:ITC.NS", at: "2026-10-03T08:00:00.000Z", rec: clone(itcLib, { price: 1 }, { fetchedAt: "2026-10-03T08:00:00.000Z" }) }));
    await F1.m.lsPull(); await settle(F1.m);
    ok(F1.m.SUITE.byId["L:ITC.NS"].price === itcLib.price && F1.m.SUITE.byId["L:ITC.NS"].lib && F1.m.LV_ORDER.length === 0, "an older stored copy of a pack company doesn't displace the pre-loaded one");
    /* a refresh made later, on another device */
    const later = new Date(Date.parse(libFull.at) + 3600e3).toISOString();
    SF.set("data/users/usr_7Qk2/" + F1.m.lsEnc("c.L:ITC.NS"), JSON.stringify({ k: "co", id: "L:ITC.NS", at: later, rec: clone(itcLib, { price: 444 }, { fetchedAt: later }) }));
    await F1.m.lsPull(); await settle(F1.m);
    ok(F1.m.SUITE.byId["L:ITC.NS"].price === 444 && !F1.m.SUITE.byId["L:ITC.NS"].lib && F1.m.LV_ORDER.join() === "L:ITC.NS" && F1.m.SUITE.indOf["L:ITC.NS"] === "live:pack-consumer", "a newer refresh from another device replaces it, in the same list");
    /* a browser that held personal copies from before the pack was built in */
    const old = { "vs:live2": JSON.stringify({ v: 2, cos: [clone(itcLib, { price: 2, industry: "live:tobacco" }, { group: "Tobacco", fetchedAt: "2026-10-02T08:00:00.000Z" }), zed], extras: {}, profiles: {}, groups: {}, gone: {} }) };
    const F2 = device(new Map(), { local: old, libSet: libFull }); await F2.m.lsInit(false); await settle(F2.m);
    ok(F2.m.SUITE.byId["L:ITC.NS"].lib && F2.m.SUITE.byId["L:ITC.NS"].price === itcLib.price && F2.m.LV_ORDER.join() === "L:ZED.NS" && !F2.m.SUITE.ind.find(g => g.id === "live:tobacco"), "earlier personal copies give way to the newer pre-loaded ones; other companies stay");
  }
  console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} carry-along checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
