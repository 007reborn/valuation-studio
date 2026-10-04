/* ═══════════════════════════════════════════════════════════════════════
   FIND COMPANIES — search any listed company, browse by country, sector and
   industry, load live data into every workspace, manage what's loaded.
   Works from the home computer's servers, from the Firecrawl connector when
   away from it, and from the companies already on the device with neither.
   ═══════════════════════════════════════════════════════════════════════ */

/* Which live routes this view has. Re-renders when a route goes down or the Firecrawl queue moves. */
function useRoutes() {
  useLive();
  const [st, setSt] = useState(null);
  useEffect(() => { let alive = true; lvStatus().then(v => { if (alive) setSt(v); }); return () => { alive = false; }; }, []);
  return st ? { ready: true, pub: LV_PUBLIC, st, ...lvRoutes(st) } : { ready: false, pub: LV_PUBLIC, st: null, quotes: null, web: null, sec: false };
}
/* Credits spent in this visit, and any wait for Firecrawl's per-minute limit. */
function CloudMeter() {
  const T = useT();
  useLive();
  const w = fcWait();
  if (!FC.pages && !w) return null;
  return <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 6 }}>
    {FC.pages > 0 && <>Firecrawl credits used in this visit: <b style={{ color: T.text, fontWeight: 600 }}>{FC.used}</b></>}
    {w > 0 && <span style={{ color: T.amber }}>{FC.pages > 0 ? " · " : ""}Waiting {w} s for Firecrawl's per-minute limit</span>}
  </div>;
}
function LiveNotice({ routes, compact }) {
  const T = useT();
  if (!routes || !routes.ready) return null;
  const box = (bg, children) => <div role="status" style={{ background: bg, borderRadius: compact ? 10 : 12, padding: compact ? "9px 12px" : "12px 14px", fontSize: compact ? 12 : 12.5, color: T.text, lineHeight: 1.6, marginBottom: compact ? 0 : 16 }}>{children}</div>;
  if (routes.pub) return box(T.surfaceSunk, <>This is the public edition of Valuation Studio. It works with the {SUITE.cos.length} companies built in, in every workspace. Searching and loading any listed company live is part of the owner's private copy.</>);
  if (routes.quotes === "home" && routes.web === "home") return null;
  if (routes.quotes === "cloud") return box(T.primaryTint, <>
    The servers on your home computer aren't reachable from here, so live data comes through your Firecrawl connector: 6 to 8 credits to load a company, 1 to search every listed company. Companies already on this device open at once and cost nothing.
    <CloudMeter /></>);
  if (routes.quotes === "home" && routes.web === "cloud") return box(T.primaryTint, <>The Tavily server isn't reachable, so statements and web pages come through your Firecrawl connector (about 3 credits for a company's statements).<CloudMeter /></>);
  if (routes.quotes === "home") return box(T.amberTint, <>The Tavily server isn't reachable, so statements can't be fetched and companies load as profiles only. Switch it on in the Claude desktop app's settings and reload the page.</>);
  return box(T.amberTint, <>{lvMessage({ code: "no_live" })}</>);
}

/* ── shared helpers ── */
function fmtCap(v, cur) {
  if (!SX.ok(v) || v <= 0) return "—";
  const [m] = lvMajor(cur || "INR"), s = curSym(m);
  if (m === "INR") return `${s}${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  return v >= 1e12 ? `${s}${(v / 1e12).toFixed(2)} tn` : v >= 1e9 ? `${s}${(v / 1e9).toFixed(2)} bn` : `${s}${(v / 1e6).toFixed(0)} mn`;
}
const fmtPx = (v, cur) => SX.ok(v) ? `${LV_MINOR[cur] ? "" : curSym(cur)}${(+v).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${LV_MINOR[cur] ? " " + cur : ""}` : "—";
const LV_STEPS = [["info", "Profile and price"], ["st", "Statements, five years"], ["fx", "Exchange rates"], ["beta", "Beta, five-year monthly"], ["xc", "Cross-check with Yahoo"]];
function LoadSteps({ steps }) {
  const T = useT();
  if (!steps) return null;
  const icon = s => s === "ok" ? ["✓", T.green] : s === "warn" ? ["!", T.amber] : s === "fail" ? ["×", T.red] : s === "run" ? ["…", T.primary] : s === "skip" ? ["–", T.textMute] : ["·", T.textMute];
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: T.textSec, marginTop: 8 }}>
    {LV_STEPS.map(([k, l]) => { const s = steps[k] || { s: "wait" }, [ic, col] = icon(s.s);
      return <span key={k} title={s.note || ""} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 8, background: T.surfaceSunk, color: col, fontWeight: 700, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{ic}</span>
        {l}{s.s === "fail" || s.s === "warn" ? <span style={{ color: s.s === "fail" ? T.red : T.amber }}>{s.note ? ` · ${s.note.slice(0, 90)}` : ""}</span> : null}</span>; })}
  </div>;
}
/* Research subject: the focus company, or a company held as a profile only (banks, insurers, missing statements). */
const ResearchSel = (() => {
  let s = null; const subs = new Set();
  return { get: () => s, set: v => { s = v; subs.forEach(f => f()); }, sub: f => { subs.add(f); return () => subs.delete(f); } };
})();
function useResearchSel() { return React.useSyncExternalStore(ResearchSel.sub, ResearchSel.get, ResearchSel.get); }

/* Open a company that is already on the device (verified, pre-loaded, loaded earlier, or a profile): no fetch. */
function lvOpenLocal(h, { gid, focus = true } = {}) {
  if (h.kind === "profile") { const p = lvProfile(h.symbol); if (focus) ResearchSel.set({ profile: h.symbol }); return { profile: p, name: p.short, local: "profile" }; }
  const id = h.id;
  if (gid && gid !== SUITE.indOf[id]) lvAddToGroup(id, gid);
  if (focus) { SuiteSel.open(id, gid || SUITE.indOf[id]); ResearchSel.set(null); }
  return { id, name: SX.co(id).short, local: h.kind, verified: h.kind === "verified", rec: SX.co(id) };
}
/* Load one symbol and put it where the viewer asked: into a group (gid) or its own industry. Returns a short outcome.
   A company already on the device is opened from there unless `fresh` asks for today's figures. */
async function lvLoadInto(symbol, { gid, onStep, signal, focus = true, hint, fresh = false } = {}) {
  const h = lvHave(symbol);
  if (h && (!fresh || h.kind === "verified")) return lvOpenLocal(h, { gid, focus });
  const r = await lvLoad(symbol, { onStep, signal, hint });
  if (r.verified) return lvOpenLocal({ kind: "verified", id: r.verified }, { gid, focus });
  if (r.profile) { if (focus) ResearchSel.set({ profile: r.profile.symbol }); return { profile: r.profile, name: r.profile.short }; }
  const o = lvRegister(r.rec);
  if (gid && gid !== o.industry) lvAddToGroup(o.id, gid);
  if (focus) { SuiteSel.open(o.id, gid || o.industry); ResearchSel.set(null); }
  return { id: o.id, name: o.short, rec: o };
}
function lvOutcome(r) {
  if (r.verified) return `${r.name} is one of the 47 verified companies, so its checked figures are used.`;
  if (r.local === "profile") return `${r.name} is on this device as a profile: ${r.profile.reason} Its reports and the AI analyst are under Reports & AI.`;
  if (r.profile) return `${r.name} is loaded as a profile: ${r.profile.reason} Its reports and the AI analyst are under Reports & AI.`;
  const c = r.rec, x = c.live.cross, bad = (x || []).filter(y => !y.ok);
  if (r.local) return `${r.name} opened from this device: ${r.local === "lib" ? "pre-loaded" : "loaded"} ${lvDay(c.live.fetchedAt)}, ${c.live.years} years of statements${c.live.stmtCur !== "INR" ? ` in ${c.live.stmtCur}, shown in rupees` : ""}.`;
  return `${r.name} loaded${c.live.via === "cloud" ? " through Firecrawl" : ""}: ${c.live.years} years of statements${c.live.stmtCur !== "INR" ? ` in ${c.live.stmtCur}, shown in rupees` : ""}${x ? bad.length ? `; Yahoo Finance differs on ${SX.list(bad.map(y => y.l.toLowerCase()))}` : "; agrees with Yahoo Finance" : ""}${c.beta ? "" : "; no regression beta"}.`;
}
const lvLooksLikeSymbol = q => /^[A-Za-z0-9&-]{1,12}\.[A-Za-z]{1,3}$/.test(String(q || "").trim());

/* One search box, three sources: the device first (no network), then every listed company — at once on the home
   route, where it's free, and on request on the cloud route, where it costs a credit. */
function useCompanySearch(addLog) {
  const routes = useRoutes();
  const [st, setSt] = useState({ busy: false, res: null, err: null, term: "", wide: false });
  const ctl = useRef(null);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const run = async (q, wide) => {
    const term = String(q || "").trim(); if (!term) return;
    try { ctl.current && ctl.current.abort(); } catch {}
    const c = new AbortController(); ctl.current = c;
    const local = lvLocalSearch(term);
    if (!(routes.quotes === "home" || (wide && routes.quotes))) { setSt({ busy: false, res: local, err: null, term, wide: false }); return; }
    setSt({ busy: true, res: local, err: null, term, wide: false });
    /* a plain search never moves to the paid route by itself: when the home server turns out to be out of reach,
       the device's matches stay and the wider search is offered with its cost */
    try { const live = await lvSearch(term, c.signal, !wide); if (c.signal.aborted) return; setSt({ busy: false, res: lvMergeSearch(local, live), err: null, term, wide: true }); addLog && addLog("Company search", term); }
    catch (e) { if (c.signal.aborted || (e && e.code === "cancelled")) return; setSt({ busy: false, res: local, err: e && e.next ? null : lvMessage(e), term, wide: false }); }
  };
  const clear = () => { try { ctl.current && ctl.current.abort(); } catch {} setSt({ busy: false, res: null, err: null, term: "", wide: false }); };
  return { st, run, clear, routes };
}
const LocalChip = ({ k }) => k === "verified" ? <Chip kind="green">Verified</Chip> : k === "lib" ? <Chip kind="primary">Pre-loaded</Chip> : k === "loaded" ? <Chip>On this device</Chip> : k === "profile" ? <Chip>Profile</Chip> : null;
/* What follows the results: the wider search on the cloud route, a ticker loaded without searching, or why there's no more. */
function SearchMore({ S, onWide, onSymbol, loading }) {
  const T = useT();
  const { st, routes } = S, sym = lvLooksLikeSymbol(st.term) ? st.term.toUpperCase() : null, known = sym && lvHave(sym);
  if (st.res == null || !routes.ready) return null;
  const line = { fontSize: 11.5, color: T.textMute, lineHeight: 1.55 };
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
    {routes.quotes === "cloud" && !st.wide && <><Btn size="sm" variant="tonal" disabled={st.busy || !!loading} onClick={onWide}>{st.busy ? "Searching…" : "Search every listed company"}</Btn><span style={line}>Uses 1 Firecrawl credit.</span></>}
    {routes.quotes && sym && !known && <Btn size="sm" variant="outline" disabled={!!loading} onClick={() => onSymbol(sym)}>{loading === sym ? "Loading…" : `Load ${sym} without searching`}</Btn>}
    {!routes.quotes && <span style={line}>{routes.pub ? `Searched the ${SUITE.cos.length} companies built into this edition.` : `Searched the ${SUITE.cos.length + lvProfiles().length} companies on this device. Live search of every listed company isn't reachable from here.`}</span>}
  </div>;
}

/* ── Compact search inside every workspace's picker ── */
function LiveQuickSearch({ group }) {
  const T = useT();
  const [q, setQ] = useState("");
  const S = useCompanySearch();
  const [ld, setLd] = useState({ loading: null, steps: null, err: null, done: null });
  const ctl = useRef(null);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const load = async (r, here, fresh) => {
    const c = new AbortController(); ctl.current = c;
    setLd({ loading: r.symbol, steps: null, err: null, done: null });
    try {
      const out = await lvLoadInto(r.symbol, { gid: here ? group.id : null, signal: c.signal, hint: r, fresh, onStep: steps => setLd(s => ({ ...s, steps })) });
      setLd({ loading: null, steps: null, err: null, done: lvOutcome(out) }); S.clear(); setQ("");
    } catch (e) { setLd(s => ({ ...s, loading: null, err: lvMessage(e) })); }
  };
  const { st, routes } = S;
  return <div style={{ marginTop: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 }}>{routes.pub ? "Find a company in this edition" : "Add any listed company"}</div>
    <form onSubmit={e => { e.preventDefault(); S.run(q, false); }} style={{ display: "flex", gap: 8, maxWidth: 640 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={routes.pub ? "Name or ticker: Reliance, Asian Paints, TCS" : "Name or ticker, any exchange: Astral, Toyota, SHEL.L, AAPL"} aria-label="Search for a company"
        style={{ flex: 1, minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, fontFamily: SANS, outline: "none" }} />
      <Btn size="sm" variant="tonal" onClick={() => S.run(q, false)} disabled={st.busy || !q.trim()}>{st.busy ? "Searching…" : "Search"}</Btn>
    </form>
    {(st.err || ld.err) && <div style={{ fontSize: 12, color: T.red, marginTop: 8, lineHeight: 1.5 }}>{ld.err || st.err}</div>}
    {ld.done && <div style={{ fontSize: 12, color: T.green, marginTop: 8, lineHeight: 1.5 }}>{ld.done}</div>}
    {ld.loading && <LoadSteps steps={ld.steps} />}
    {st.res && <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", maxWidth: 760 }}>
      {!st.res.length && <div style={{ padding: "10px 12px", fontSize: 12.5, color: T.textSec }}>{routes.quotes === "home" || st.wide ? "No listed company matched. Try the full name or the ticker with its exchange suffix (for example SUPREMEIND.NS)."
        : routes.quotes === "cloud" ? "Nothing on this device matches. Search every listed company below, or type the ticker with its exchange suffix (for example TATAPOWER.NS) to load it directly."
        : "Nothing on this device matches."}</div>}
      {st.res.slice(0, 8).map(r => <div key={r.symbol} data-row={r.symbol} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{r.name}{r.local && <span style={{ marginLeft: 6 }}><LocalChip k={r.local} /></span>}</div>
          <div style={{ fontSize: 11, color: T.textMute }}>{r.symbol} · {r.exch}{r.industry ? ` · ${r.industry}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {r.local === "profile" ? <Btn size="sm" variant="outline" disabled={!!ld.loading} onClick={() => load(r, false)}>Open profile</Btn>
            : r.local ? <><Btn size="sm" variant="outline" disabled={!!ld.loading} onClick={() => load(r, true)}>Compare here</Btn>
              <Btn size="sm" variant="ghost" disabled={!!ld.loading} onClick={() => load(r, false)}>Open</Btn></>
            : <><Btn size="sm" variant="outline" disabled={!!ld.loading || !routes.quotes} onClick={() => load(r, true)}>{ld.loading === r.symbol ? "Loading…" : "Compare here"}</Btn>
              <Btn size="sm" variant="ghost" disabled={!!ld.loading || !routes.quotes} onClick={() => load(r, false)}>With its industry</Btn></>}
        </div>
      </div>)}
      <div style={{ padding: "6px 12px 8px", borderTop: `1px solid ${T.border}`, background: T.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: T.textMute }}>"Compare here" adds it to {group.name}.{st.wide ? " Results from Yahoo Finance." : ""}</span>
          <button onClick={S.clear} style={{ border: "none", background: "transparent", color: T.textSec, cursor: "pointer", fontSize: 12, fontFamily: SANS }}>Close</button>
        </div>
        <SearchMore S={S} loading={ld.loading} onWide={() => S.run(st.term, true)} onSymbol={sym => load({ symbol: sym }, true)} />
      </div>
    </div>}
  </div>;
}

/* ── Starter pack: ready-made peer groups of well-known companies ── */
function PackCard({ routes, flash, addLog }) {
  const T = useT();
  useLive();
  const [run, setRun] = useState(null);           // {n, done, cur, steps}
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const ctl = useRef(null);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const P = lvPackStatus(), home = routes.quotes === "home", cloud = routes.quotes === "cloud";
  const loadMany = async (syms, fresh) => {
    if (!syms.length || run) return;
    const c = new AbortController(); ctl.current = c;
    const fails = []; let ok = 0, k = 0;
    setRun({ n: syms.length, done: 0, cur: syms[0], steps: null }); setRes(null);
    const worker = async () => {
      while (k < syms.length && !c.signal.aborted) {
        const sym = syms[k++];
        setRun(r => r && ({ ...r, cur: sym }));
        try { await lvLoadInto(sym, { focus: false, fresh, signal: c.signal, onStep: steps => setRun(r => r && ({ ...r, steps })) }); ok++; }
        catch (e) { if (e && e.code === "cancelled") break; fails.push(`${sym}: ${lvMessage(e)}`); if (e && LV_HARD.includes(e.code)) k = syms.length; }
        setRun(r => r && ({ ...r, done: r.done + 1 }));
      }
    };
    await Promise.all(home ? [worker(), worker()] : [worker()]);
    setRun(null);
    const msg = `${ok} of ${syms.length} loaded${fails.length ? `; ${fails.length} couldn't be loaded` : ""}.`;
    setRes({ msg, err: fails.length ? fails.slice(0, 6).join(" · ") : null });
    flash && flash(msg); addLog && addLog("Starter pack", msg);
    try { SuiteSel.refresh(); } catch {}
  };
  const missingOf = list => list.filter(x => !x.have).map(x => x.symbol);
  const chip = x => <span key={x.symbol} title={`${x.symbol}${x.have ? "" : " · not on this device yet"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "3px 9px", borderRadius: 999,
    background: x.have ? T.greenTint : T.surfaceSunk, color: x.have ? T.green : T.textMute, fontWeight: x.have ? 600 : 500, cursor: x.have && x.id ? "pointer" : "default" }}
    onClick={() => { if (x.have && x.id) SuiteSel.open(x.id, SUITE.indOf[x.id]); }}>{x.have ? "✓" : "○"} {x.name}</span>;
  return <Card>
    <Title sub={`${P.total} well-known companies in ready-made peer groups: Indian large caps, US technology and consumer names, and global leaders. ${P.have} ${P.have === 1 ? "is" : "are"} on this device now.`}>Starter pack</Title>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {home && P.missing.length > 0 && <Btn variant="filled" size="sm" disabled={!!run} onClick={() => loadMany(P.missing, false)}>{run ? `Loading ${Math.min(run.done + 1, run.n)} of ${run.n}…` : `Load the ${P.missing.length} missing`}</Btn>}
      {home && P.have > 0 && <Btn variant={P.missing.length ? "outline" : "tonal"} size="sm" disabled={!!run} onClick={() => loadMany([...P.groups.flatMap(g => g.cos), ...P.profs].map(x => x.symbol), true)}>Refresh all with today's figures</Btn>}
      {run && <Btn variant="ghost" size="sm" onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} }}>Stop</Btn>}
      <Btn variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? "Hide the list" : "Show the list"}</Btn>
    </div>
    <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 8, lineHeight: 1.6, maxWidth: 760 }}>
      {!P.missing.length ? `All ${P.total} are on this device${LV_LIB.at ? `, pre-loaded with figures fetched on ${lvDay(LV_LIB.at)}` : ""}. ${home ? `Refreshing them all through your home computer's servers takes about ten minutes and uses roughly ${Math.round(P.total * 0.6)} Tavily credits.` : cloud ? "To bring one up to date from here, use Refresh on its row below: about 6 Firecrawl credits each." : "They open in every workspace with no connection needed."}`
        : home ? `Loading the whole pack takes about ten minutes through your home computer's servers and uses roughly ${Math.max(1, Math.round(P.missing.length * 0.6))} Tavily credits for what's missing. Load it once and the companies are ready on every device you sign in on.`
        : cloud ? "Load the pack on your home computer: its servers fetch it for nothing, and the companies then appear here. From here each company costs about 6 Firecrawl credits, so load a group only if you need it now."
        : "The pack loads on your home computer, in the Claude desktop app. Once loaded there, the companies appear here."}
    </div>
    {run && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 8 }}>Now: {run.cur}<LoadSteps steps={run.steps} /></div>}
    {res && <div style={{ marginTop: 12, background: res.err ? T.amberTint : T.greenTint, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>{res.msg}</div>
      {res.err && <div style={{ fontSize: 12, color: T.textSec, marginTop: 4, lineHeight: 1.5 }}>{res.err}</div>}</div>}
    {open && <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
      {P.groups.map(g => { const miss = missingOf(g.cos);
        return <div key={g.id}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{g.name}</span>
            <span style={{ fontSize: 11.5, color: T.textMute }}>{g.cos.length - miss.length} of {g.cos.length}</span>
            {miss.length > 0 && routes.quotes && <Btn size="sm" variant="ghost" disabled={!!run} onClick={() => loadMany(miss, false)}>{home ? `Load ${miss.length}` : `Load ${miss.length} · about ${miss.length * 6} credits`}</Btn>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{g.cos.map(chip)}</div>
        </div>; })}
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>Banks and financial companies (profiles)</span>
          <span style={{ fontSize: 11.5, color: T.textMute }}>{P.profs.filter(x => x.have).length} of {P.profs.length}</span>
          {missingOf(P.profs).length > 0 && routes.quotes && <Btn size="sm" variant="ghost" disabled={!!run} onClick={() => loadMany(missingOf(P.profs), false)}>{home ? `Load ${missingOf(P.profs).length}` : `Load ${missingOf(P.profs).length} · about ${missingOf(P.profs).length * 4} credits`}</Btn>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{P.profs.map(chip)}</div>
      </div>
    </div>}
  </Card>;
}

/* ── Everything on the device, by list: the way in when there's no live search ── */
function DeviceDirectory({ setSpace }) {
  const T = useT();
  useLive();
  const groups = SUITE.ind.filter(g => g.cos.length);
  return <Card>
    <Title sub="Every company on this device, by industry list. Pick one to open it in Ratio analysis; the other workspaces follow the same selection.">Companies on this device</Title>
    <div style={{ display: "grid", gap: 12 }}>
      {groups.map(g => <div key={g.id}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>{g.name}{g.live ? <span style={{ fontWeight: 500, color: T.textMute }}> · {LV_PUBLIC ? "pre-loaded" : g.pack ? "starter pack" : "loaded live"}</span> : null}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{g.cos.map(id => { const c = SX.co(id);
          return <button key={id} onClick={() => { SuiteSel.open(id, g.id); setSpace && setSpace("ratios"); }} title={`${c.name} · ${tickerOf(c)}`}
            style={{ border: `1px solid ${T.border}`, background: T.surface, color: T.text, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontFamily: SANS, cursor: "pointer" }}>{c.short}</button>; })}</div>
      </div>)}
    </div>
  </Card>;
}

/* ── The Find workspace ── */
const LV_SORTS = [["mcap", "Largest first"], ["pe", "Lowest P/E"], ["dy", "Highest dividend yield"], ["chg52", "Best one-year return"], ["chg1d", "Biggest move today"]];
function FindModule({ flash, addLog, setSpace }) {
  const T = useT();
  useLive();
  const sel = useSuiteSel();
  /* search */
  const [q, setQ] = useState("");
  const S = useCompanySearch(addLog);
  const { st: sr, routes } = S;
  const [load, setLoad] = useState({ sym: null, steps: null, err: null, done: null, id: null });
  const ctl = useRef(null);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const loadOne = async (r, fresh) => {
    const sym = r.symbol, c = new AbortController(); ctl.current = c;
    setLoad({ sym, steps: null, err: null, done: null, id: null });
    try {
      const out = await lvLoadInto(sym, { signal: c.signal, hint: r, fresh, onStep: steps => setLoad(l => ({ ...l, steps })) });
      setLoad({ sym: null, steps: null, err: null, done: lvOutcome(out), id: out.id || null, profile: out.profile ? out.profile.symbol : null });
      addLog && addLog(out.local ? "Company opened" : "Company loaded", sym);
    } catch (e) { setLoad(l => ({ ...l, sym: null, err: lvMessage(e) })); }
  };
  /* browse */
  const [region, setRegion] = useState("in");
  const [sector, setSector] = useState("Industrials");
  const [industry, setIndustry] = useState("Building Products & Equipment");
  const [sortK, setSortK] = useState("mcap");
  const [br, setBr] = useState({ busy: false, rows: null, err: null, total: null, offset: 0 });
  const [pick, setPick] = useState([]);
  const [batch, setBatch] = useState(null);
  const [bdone, setBdone] = useState(null);
  const [flt, setFlt] = useState(""), [profit, setProfit] = useState(false);
  const browse = async (more) => {
    const c = new AbortController(); ctl.current = c;
    const offset = more ? br.offset + 60 : 0;
    setBr(b => ({ ...b, busy: true, err: null }));
    if (!more) setPick([]);
    try {
      const r = await lvScreen({ region, sector, industry: industry || null, sort: sortK === "chg1d" ? "percentchange" : "intradaymarketcap", asc: false, offset, size: 60 }, c.signal);
      const rows = more ? [...(br.rows || []), ...r.rows.filter(x => !(br.rows || []).some(y => y.symbol === x.symbol))] : r.rows;
      setBr({ busy: false, rows, err: null, total: r.total, offset });
      addLog && addLog("Industry browse", `${region.toUpperCase()} · ${industry || sector}`);
    } catch (e) { setBr(b => ({ ...b, busy: false, err: lvMessage(e) })); }
  };
  const sorted = useMemo(() => {
    const f = flt.trim().toLowerCase();
    const a = (br.rows || []).filter(r => (!f || r.name.toLowerCase().includes(f) || r.symbol.toLowerCase().includes(f)) && (!profit || r.pe > 0)), k = sortK;
    if (k === "pe") a.sort((x, y) => (x.pe > 0 ? x.pe : 1e9) - (y.pe > 0 ? y.pe : 1e9));
    else if (k === "dy") a.sort((x, y) => (y.dy || 0) - (x.dy || 0));
    else if (k === "chg52") a.sort((x, y) => (y.chg52 ?? -1e9) - (x.chg52 ?? -1e9));
    else if (k === "chg1d") a.sort((x, y) => Math.abs(y.chg1d || 0) - Math.abs(x.chg1d || 0));
    return a;
  }, [br.rows, sortK, flt, profit]);
  const togglePick = s => setPick(p => p.includes(s) ? p.filter(x => x !== s) : p.length >= 5 ? p : [...p, s]);
  const loadBatch = async () => {
    if (!pick.length) return;
    const c = new AbortController(); ctl.current = c;
    const gName = industry || `${sector} (mixed industries)`, gid = industry ? "live:" + lvSlug(industry) : "live:sector-" + lvSlug(sector);
    const out = [], fails = [];
    setBatch({ n: pick.length, done: 0, cur: pick[0], steps: null }); setBdone(null);
    let k = 0;
    const worker = async () => {
      while (k < pick.length) {
        const sym = pick[k++];
        setBatch(b => b && ({ ...b, cur: sym }));
        try {
          const r = await lvLoadInto(sym, { focus: false, signal: c.signal, onStep: steps => setBatch(b => b && ({ ...b, steps })) });
          out.push(r);
        } catch (e) { fails.push(`${sym}: ${lvMessage(e)}`); if (e && LV_HARD.includes(e.code)) { k = pick.length; } }
        setBatch(b => b && ({ ...b, done: b.done + 1 }));
      }
    };
    await Promise.all([worker(), worker()]);
    const ids = out.filter(r => r.id).map(r => r.id);
    if (ids.length) {
      lvEnsureGroup(gid, gName);
      ids.forEach(id => lvAddToGroup(id, gid));
      SuiteSel.set({ ind: gid, ids: ids.slice(0, 5), focus: ids[0] });
    }
    setBatch(null); setPick([]);
    const profs = out.filter(r => r.profile).map(r => r.name);
    const msg = `${ids.length} compan${ids.length === 1 ? "y" : "ies"} ready to compare${profs.length ? `; ${SX.list(profs)} loaded as profile${profs.length > 1 ? "s" : ""} only` : ""}${fails.length ? `; ${fails.length} couldn't be loaded` : ""}.`;
    setBdone({ msg, err: fails.length ? fails.join(" · ") : null, id: ids[0] || null });
    flash && flash(msg);
  };
  const C = LV_COUNTRIES.find(x => x.r === region) || LV_COUNTRIES[0];
  const lab = { fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 };
  const goto = (sp, id) => { if (id) SuiteSel.open(id, SUITE.indOf[id]); setSpace && setSpace(sp); };
  const Goto = ({ id, profile }) => profile
    ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}><Btn size="sm" variant="tonal" onClick={() => { ResearchSel.set({ profile }); setSpace && setSpace("research"); }}>Open in Reports & AI</Btn></div>
    : id ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {[["dcf", "Value it (DCF)"], ["ratios", "Ratios"], ["credit", "Credit risk"], ["wc", "Working capital"], ["research", "Reports & AI"]].map(([sp, l]) =>
        <Btn key={sp} size="sm" variant={sp === "dcf" ? "tonal" : "outline"} onClick={() => goto(sp, id)}>{l}</Btn>)}</div> : null;
  const th = { ...thS(T), textAlign: "right" }, tl = { ...thS(T), textAlign: "left" };
  const live = !!routes.quotes;
  return <>
    {routes.quotes !== "cloud" && <LiveNotice routes={routes} />}
    <SyncBanner />
    <Card>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -.2, color: T.text }}>{routes.pub ? "Find a company" : "Find any listed company"}</div>
      <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 6, lineHeight: 1.6, maxWidth: 720 }}>{routes.pub || (routes.ready && !live)
        ? `Search the ${SUITE.cos.length} companies on this device by name or ticker. Each one opens in every workspace: valuation, ratios, credit risk and working capital.`
        : "Search by name or ticker on any exchange Yahoo Finance covers. Loading a company fetches five years of standardised statements, today's price, a five-year beta and a cross-check against Yahoo's own figures, then makes it available in every workspace next to the 47 verified companies."}</div>
      <form onSubmit={e => { e.preventDefault(); S.run(q, false); }} style={{ display: "flex", gap: 8, marginTop: 14, maxWidth: 680 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={live ? "Company name or ticker, for example Tata Motors, Nestlé, 7203.T" : "Company name or ticker, for example Reliance, Asian Paints, TCS"} aria-label="Company name or ticker"
          style={{ flex: 1, minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, padding: "11px 13px", fontSize: 14, fontFamily: SANS, outline: "none" }} />
        <Btn variant="filled" onClick={() => S.run(q, false)} disabled={sr.busy || !q.trim()}>{sr.busy ? "Searching…" : "Search"}</Btn>
      </form>
      {sr.err && <div style={{ fontSize: 12.5, color: T.red, marginTop: 10, lineHeight: 1.6 }}>{sr.err}</div>}
      {sr.res && <div style={{ marginTop: 12 }}>
        {!sr.res.length ? <div style={{ fontSize: 12.5, color: T.textSec }}>{routes.quotes === "home" || sr.wide ? "Nothing matched. Try the full company name, or the ticker with its exchange suffix (.NS for NSE, .L for London, .T for Tokyo)."
            : routes.quotes === "cloud" ? "Nothing on this device matches. Search every listed company below, or type the ticker with its exchange suffix (.NS for NSE) to load it directly."
            : "Nothing on this device matches that name."}</div>
          : <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            {sr.res.slice(0, 15).map((r, i) => <div key={r.symbol} data-row={r.symbol} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderTop: i ? `1px solid ${T.border}` : "none", background: T.surface }}>
              <div style={{ flex: "1 1 230px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{r.name}{r.local && <span style={{ marginLeft: 6 }}><LocalChip k={r.local} /></span>}</div>
                <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>{r.symbol} · {r.exch}{r.industry ? ` · ${r.industry}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {r.local ? <Btn size="sm" variant="tonal" disabled={!!load.sym} onClick={() => loadOne(r, false)}>{r.local === "profile" ? "Open profile" : "Open"}</Btn>
                  : <Btn size="sm" variant="tonal" disabled={!!load.sym || !live} onClick={() => loadOne(r, false)}>{load.sym === r.symbol ? "Loading…" : "Load"}</Btn>}
                {(r.local === "lib" || r.local === "loaded" || r.local === "profile") && live && <Btn size="sm" variant="ghost" disabled={!!load.sym} onClick={() => loadOne(r, true)} title="Fetch today's statements and price again">{load.sym === r.symbol ? "Loading…" : "Refresh"}</Btn>}
              </div>
            </div>)}
          </div>}
        <SearchMore S={S} loading={load.sym} onWide={() => S.run(sr.term, true)} onSymbol={sym => loadOne({ symbol: sym }, false)} />
      </div>}
      {load.sym && <LoadSteps steps={load.steps} />}
      {load.err && <div style={{ fontSize: 12.5, color: T.red, marginTop: 10, lineHeight: 1.6 }}>{load.err}</div>}
      {load.done && <div style={{ marginTop: 12, background: T.greenTint, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>{load.done}</div>
        <Goto id={load.id} profile={load.profile} /></div>}
      {routes.quotes === "cloud" && <div style={{ marginTop: 14 }}><LiveNotice routes={routes} compact /></div>}
    </Card>

    {routes.quotes === "home" ? <Card>
      <Title sub="Pick a country, then a sector or an industry, to list its listed companies from Yahoo Finance. Tick up to five and load them together to compare in every workspace.">Browse by country and industry</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,170px),1fr))", gap: 12, maxWidth: 900 }}>
        <div><div style={lab}>Country</div><Sel v={region} onChange={setRegion}>{LV_COUNTRIES.map(x => <option key={x.r} value={x.r}>{x.n}</option>)}</Sel></div>
        <div><div style={lab}>Sector</div><Sel v={sector} onChange={v => { setSector(v); setIndustry(""); }}>{Object.keys(LV_SECTORS).map(s => <option key={s} value={s}>{s}</option>)}</Sel></div>
        <div><div style={lab}>Industry</div><Sel v={industry} onChange={setIndustry}><option value="">All industries in {sector}</option>{LV_SECTORS[sector].map(s => <option key={s} value={s}>{s}</option>)}</Sel></div>
        <div><div style={lab}>Order</div><Sel v={sortK} onChange={setSortK}>{LV_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <Btn variant="filled" size="sm" onClick={() => browse(false)} disabled={br.busy}>{br.busy ? "Finding…" : "Find companies"}</Btn>
        {pick.length > 0 && <Btn variant="tonal" size="sm" onClick={loadBatch} disabled={!!batch}>{batch ? `Loading ${batch.done + 1} of ${batch.n}…` : `Load and compare ${pick.length}`}</Btn>}
        {pick.length > 0 && !batch && <Btn variant="ghost" size="sm" onClick={() => setPick([])}>Clear ticks</Btn>}
        {br.rows && <span style={{ fontSize: 11.5, color: T.textMute }}>{br.rows.length} shown{br.total ? ` of about ${br.total} listings` : ""} in {C.n}. Market values in local currency.</span>}
      </div>
      {batch && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 8 }}>Now: {batch.cur}<LoadSteps steps={batch.steps} /></div>}
      {bdone && <div style={{ marginTop: 12, background: bdone.id ? T.greenTint : T.amberTint, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>{bdone.msg}</div>
        {bdone.err && <div style={{ fontSize: 12, color: T.red, marginTop: 4, lineHeight: 1.5 }}>{bdone.err}</div>}
        <Goto id={bdone.id} /></div>}
      {br.rows && br.rows.length > 0 && <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <input value={flt} onChange={e => setFlt(e.target.value)} placeholder="Filter these results" aria-label="Filter the results"
          style={{ flex: "0 1 260px", minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "7px 10px", fontSize: 12.5, fontFamily: SANS, outline: "none" }} />
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: T.textSec, cursor: "pointer" }}><input type="checkbox" checked={profit} onChange={e => setProfit(e.target.checked)} /> Profitable only (P/E above zero)</label>
      </div>}
      {br.err && <div style={{ fontSize: 12.5, color: T.red, marginTop: 10, lineHeight: 1.6 }}>{br.err}</div>}
      {br.rows && (br.rows.length ? <div style={{ marginTop: 12 }}><Scroll min={720}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={{ ...tl, width: 34 }} aria-label="Pick" /><th style={tl}>Company</th><th style={th}>Market value</th><th style={th}>Price</th><th style={th}>P/E</th><th style={th}>P/B</th><th style={th}>Dividend yield</th><th style={th}>One year</th><th style={th}>Today</th></tr></thead>
        <tbody>{sorted.map(r => { const on = pick.includes(r.symbol), full = pick.length >= 5 && !on, h = lvHave(r.symbol);
          return <tr key={r.symbol} style={{ background: on ? T.primarySoft : "transparent" }}>
            <td style={tdL(T)}><input type="checkbox" checked={on} disabled={full} onChange={() => togglePick(r.symbol)} aria-label={`Pick ${r.name}`} title={full ? "Five at a time" : ""} /></td>
            <td style={{ ...tdL(T), whiteSpace: "normal" }}><div style={{ fontWeight: 600 }}>{r.name}{h && <span style={{ marginLeft: 6 }}><LocalChip k={h.kind} /></span>}</div><div style={{ fontSize: 11, color: T.textMute }}>{r.symbol} · {r.exch}</div></td>
            <td style={tdS(T)}>{fmtCap(r.mcap, r.cur)}</td><td style={tdS(T)}>{fmtPx(r.price, r.cur)}</td>
            <td style={tdS(T)}>{r.pe > 0 ? fmtU(r.pe, "x", 1) : "—"}</td><td style={tdS(T)}>{r.pb > 0 ? fmtU(r.pb, "x", 1) : "—"}</td>
            <td style={tdS(T)}>{SX.ok(r.dy) ? `${r.dy.toFixed(2)}%` : "—"}</td>
            <td style={{ ...tdS(T), color: !SX.ok(r.chg52) ? T.textMute : r.chg52 >= 0 ? T.green : T.red }}>{SX.ok(r.chg52) ? minus(`${r.chg52 >= 0 ? "+" : ""}${r.chg52.toFixed(1)}%`) : "—"}</td>
            <td style={{ ...tdS(T), color: !SX.ok(r.chg1d) ? T.textMute : r.chg1d >= 0 ? T.green : T.red }}>{SX.ok(r.chg1d) ? minus(`${r.chg1d >= 0 ? "+" : ""}${r.chg1d.toFixed(2)}%`) : "—"}</td>
          </tr>; })}</tbody></table></Scroll>
        {br.total > br.offset + 60 && <div style={{ marginTop: 10 }}><Btn size="sm" variant="ghost" onClick={() => browse(true)} disabled={br.busy}>Show more</Btn></div>}
      </div> : <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 12 }}>Yahoo Finance lists no companies for that combination. Try the whole sector, or another country.</div>)}
    </Card> : <DeviceDirectory setSpace={setSpace} />}

    {!routes.pub && <PackCard routes={routes} flash={flash} addLog={addLog} />}
    <LoadedCompanies setSpace={setSpace} flash={flash} routes={routes} />
  </>;
}

/* ── Carry-along: the viewer's loaded companies on all their devices ── */
function SyncLine() {
  const T = useT();
  const s = useSync();
  if (LV_PUBLIC || s.mode === "wait") return null;
  const line = { fontSize: 11.5, color: T.textMute, lineHeight: 1.6 };
  if (s.mode === "on") return <div style={{ ...line, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <span><b style={{ color: T.green, fontWeight: 600 }}>On all your devices.</b> Saved privately to your Claude account{s.busy ? "; syncing now…" : s.pending ? `; ${s.pending} change${s.pending === 1 ? "" : "s"} waiting` : s.last ? `; in step as of ${lvWhen(s.last).split(", ").pop()}` : ""}.</span>
    <button onClick={() => lsPull()} disabled={s.busy} style={{ border: "none", background: "transparent", color: T.primaryDark, cursor: s.busy ? "default" : "pointer", fontFamily: SANS, fontSize: 11.5, padding: 0 }}>Sync now</button>
    {s.err && <span style={{ color: T.amber }}>{s.err}</span>}
  </div>;
  if (s.mode === "ask") return <div style={{ ...line, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <span>Kept in this browser only.</span>
    <Btn size="sm" variant="tonal" onClick={() => lsInit(true)}>Keep them on all my devices</Btn>
    <span>Saves them privately to your Claude account, so what you load at home is on your phone too.</span>
  </div>;
  return <div style={line}>Kept in this browser.{s.err ? <span style={{ color: T.amber }}> {s.err}</span> : null}</div>;
}
/* Shown at the top of Find on a device that hasn't been asked yet: the quickest way to get companies loaded elsewhere. */
function SyncBanner() {
  const T = useT();
  const s = useSync();
  if (LV_PUBLIC || s.mode !== "ask") return null;
  return <div role="status" style={{ background: T.surfaceSunk, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: T.text, lineHeight: 1.6, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <span style={{ flex: "1 1 320px" }}>Loaded companies on another device? Bring them here, and keep everything you load in step across your devices. They're saved privately to your Claude account.</span>
    <Btn size="sm" variant="filled" onClick={() => lsInit(true)}>Bring my companies here</Btn>
  </div>;
}

/* ── Everything loaded live, with its data checks ── */
function LoadedCompanies({ setSpace, flash, routes }) {
  const T = useT();
  useLive();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const mine = LV_ORDER.filter(id => SUITE.byId[id]);
  const ids = [...mine, ...Object.keys(LV_LIB.byId).filter(id => SUITE.byId[id] && !mine.includes(id))];
  const profs = lvProfiles(), live = !!(routes && routes.quotes), pub = LV_PUBLIC;
  const title = pub ? "Pre-loaded companies" : "Loaded companies";
  if (!ids.length && !profs.length) return <Card><Title sub="Companies you load appear here, with the checks run on their data.">{title}</Title>
    <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 8 }}>Nothing loaded yet.</div><SyncLine /></Card>;
  const refresh = async id => {
    const c = SX.co(id); setBusy(id); setErr(null);
    try { const r = await lvLoad(c.ticker, {}); if (r.rec) { lvRegister(r.rec); flash && flash(`${c.short} refreshed.`); } }
    catch (e) { setErr(`${c.short}: ${lvMessage(e)}`); }
    setBusy(null);
  };
  const th = thS(T), tl = { ...thS(T), textAlign: "left" };
  const hasMine = mine.length > 0 || Object.keys(LV_PROFILES).length > 0;
  return <Card>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <Title sub={pub ? "Companies beyond the 47 verified ones that ship with this edition. Each was checked when it was fetched: the statements must add up, and revenue, profit, assets, equity, cash flow and debt were compared with Yahoo Finance's own figures."
        : "Every company is checked when it loads: the statements must add up, and revenue, profit, assets, equity, cash flow and debt are compared with Yahoo Finance's own figures. Refresh pulls today's statements and price again."}>{title}</Title>
      {hasMine && <Btn size="sm" variant="ghost" onClick={() => { mine.forEach(id => lvRemove(id)); Object.keys(LV_PROFILES).forEach(s => lvRemoveProfile(s)); flash && flash("Your loaded companies were removed."); }}>Remove all</Btn>}
    </div>
    <div style={{ marginBottom: 10 }}><SyncLine /></div>
    {err && <div style={{ fontSize: 12.5, color: T.red, marginBottom: 10 }}>{err}</div>}
    <Scroll min={700}><table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={tl}>Company</th><th style={tl}>Industry list</th><th style={th}>Currency</th><th style={th}>Fetched</th><th style={th}>Checks</th><th style={th} /></tr></thead>
      <tbody>
        {ids.map(id => { const c = SX.co(id), L = c.live, bad = [...(L.checks || []).filter(x => !x.ok), ...(L.cross || []).filter(x => !x.ok)], warn = bad.length || (L.warns || []).length, own = !!LV_RECS[id];
          return <React.Fragment key={id}><tr>
            <td style={{ ...tdL(T), whiteSpace: "normal" }}><div style={{ fontWeight: 600 }}>{c.short}{c.lib && <span style={{ marginLeft: 6 }}><Chip kind="primary">Pre-loaded</Chip></span>}</div><div style={{ fontSize: 11, color: T.textMute }}>{c.name} · {c.ticker}</div></td>
            <td style={{ ...tdL(T), whiteSpace: "normal" }}>{SX.ind(SUITE.indOf[id]).name}</td>
            <td style={tdS(T)}>{L.stmtCur}{L.cur !== L.stmtCur ? ` · price ${L.cur}` : ""}</td>
            <td style={tdS(T)}>{lvWhen(L.fetchedAt)}</td>
            <td style={tdS(T)}><button onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: 12, color: warn ? T.amber : T.green, fontWeight: 600 }}>{warn ? `${bad.length + (L.warns || []).length} to note` : "All passed"} {open === id ? "▴" : "▾"}</button></td>
            <td style={tdS(T)}><div style={{ display: "inline-flex", gap: 6 }}>
              <Btn size="sm" variant="outline" onClick={() => { SuiteSel.open(id, SUITE.indOf[id]); setSpace && setSpace("ratios"); }}>Open</Btn>
              {live && <Btn size="sm" variant="ghost" disabled={busy === id} onClick={() => refresh(id)}>{busy === id ? "Refreshing…" : "Refresh"}</Btn>}
              {own && <Btn size="sm" variant="ghost" onClick={() => lvRemove(id)}>{LV_LIB.byId[id] ? "Undo refresh" : "Remove"}</Btn>}</div></td>
          </tr>
          {open === id && <tr><td colSpan={6} style={{ ...tdL(T), whiteSpace: "normal", background: T.surfaceAlt, fontFamily: SANS }}>
            <div style={{ display: "grid", gap: 6, fontSize: 12, lineHeight: 1.55, color: T.textSec, padding: "4px 2px" }}>
              {(L.checks || []).map(x => <div key={x.k}><b style={{ color: x.ok ? T.green : T.amber }}>{x.ok ? "✓" : "!"}</b> {x.l}: {x.v}</div>)}
              {L.cross ? L.cross.map(x => <div key={x.l}><b style={{ color: x.ok ? T.green : T.amber }}>{x.ok ? "✓" : "!"}</b> {x.l} vs Yahoo Finance: {x.small && x.small >= x.n ? "the two differ, but by less than 0.5% of total assets in every year" : `largest gap ${(x.d * 100).toFixed(x.d < 0.01 ? 2 : 1)}% (${x.y})`}, {x.n} year{x.n === 1 ? "" : "s"} compared{x.small && x.small < x.n ? `; ${x.small} other year${x.small === 1 ? " differs" : "s differ"} by less than 0.5% of total assets` : ""}{!x.ok && x.l === "Total debt" ? ". Debt often differs because of how leases and current borrowings are counted." : ""}</div>)
                : <div><b style={{ color: T.amber }}>!</b> No Yahoo Finance statements to compare with.</div>}
              {(L.warns || []).map((w, k) => <div key={k}><b style={{ color: T.amber }}>!</b> {w}</div>)}
              {(L.notes || []).map((w, k) => <div key={"n" + k}><b style={{ color: T.textMute }}>·</b> {w}</div>)}
              <div>Beta: {c.beta ? `${c.beta.adj.toFixed(2)} (Blume-adjusted, raw ${c.beta.raw.toFixed(2)}, R² ${c.beta.r2.toFixed(2)}, ${c.beta.n} months against the ${L.idx})` : `no regression beta${SX.ok(c.betaYahoo) ? `; Yahoo shows ${c.betaYahoo.toFixed(2)}` : ""}`}.{LV_PUBLIC ? "" : ` Fetched ${L.via === "cloud" ? "through the Firecrawl connector" : L.via === "mixed" ? "through the home computer and Firecrawl" : "through the home computer's servers"}.`} Statements: <span style={{ wordBreak: "break-all" }}>{L.url}</span></div>
            </div></td></tr>}
          </React.Fragment>; })}
        {profs.map(p => <tr key={p.symbol}>
          <td style={{ ...tdL(T), whiteSpace: "normal" }}><div style={{ fontWeight: 600 }}>{p.short} <Chip>Profile only</Chip></div><div style={{ fontSize: 11, color: T.textMute }}>{p.name} · {p.symbol}</div></td>
          <td style={{ ...tdL(T), whiteSpace: "normal" }}>{p.profile.industry}</td><td style={tdS(T)}>{p.cur}</td><td style={tdS(T)}>{lvWhen(p.fetchedAt)}</td>
          <td style={{ ...tdS(T), whiteSpace: "normal", maxWidth: 260, fontFamily: SANS, fontSize: 11.5, color: T.textSec }}>{p.reason}</td>
          <td style={tdS(T)}><div style={{ display: "inline-flex", gap: 6 }}>
            <Btn size="sm" variant="outline" onClick={() => { ResearchSel.set({ profile: p.symbol }); setSpace && setSpace("research"); }}>Research</Btn>
            {LV_PROFILES[p.symbol] && <Btn size="sm" variant="ghost" onClick={() => lvRemoveProfile(p.symbol)}>Remove</Btn>}</div></td>
        </tr>)}
      </tbody></table></Scroll>
  </Card>;
}
