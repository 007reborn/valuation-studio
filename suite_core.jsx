/* ═══════════════════════════════════════════════════════════════════════
   ANALYSIS SUITE — shared interface: selection store, industry picker,
   charts, Excel export. Used by all five workspaces.
   ═══════════════════════════════════════════════════════════════════════ */
const SUITE_SPACES = [
  ["find", "Find companies", LV_PUBLIC ? "Every company in this edition" : "Any listed company · by industry"],
  ["dcf", "DCF valuation", "Value any company"],
  ["ratios", "Ratio analysis", "Benchmark up to five peers"],
  ["credit", "Credit risk", "Scorecard, Altman, Beneish"],
  ["wc", "Working capital", "Cash-cycle optimiser"],
  ["fpa", "FP&A variance", "Budget vs actual · peer bridges"],
  ["research", "Reports & AI", "Annual reports · AI analysis"],
];
const SUITE_TITLES = {
  ratios: ["Ratio analysis", "Profitability, returns, efficiency, liquidity and leverage for the companies you pick, with DuPont analysis, common-size statements, growth and valuation."],
  credit: ["Credit risk", "How safe each company is as a borrower or trading counterparty: a weighted scorecard, stress test, debt headroom, Altman, Piotroski, Beneish and Zmijewski."],
  wc: ["Working capital optimiser", "Receivable, inventory and payable days against peers, the cash each day of improvement would release, and the funding growth will need."],
  fpa: ["FP&A variance", "Budget against actual for an industry sample company, and year-on-year profit bridges for the listed companies you pick."],
  dcf: ["DCF valuation", LV_PUBLIC ? "Pick an industry and a company to load its figures into the model. The other companies you tick become its trading comparables."
    : "Pick an industry and a company to load its figures into the model: one of the 47 verified companies, or any listed company you search for. The other companies you tick become its trading comparables."],
};
const minus = s => String(s).replace(/-/g, "−");
/* toFixed without a sign on values that round to zero ("−0.0" becomes "0.0") */
const fx = (v, d) => { const t = v.toFixed(d); return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t; };
function fmtU(v, u, d) {
  if (!SX.ok(v)) return "—";
  if (u === "%") return minus(`${fx(v, d ?? 1)}%`);
  if (u === "x") { const a = Math.abs(v); return minus(`${fx(v, d ?? (a >= 100 ? 0 : a >= 10 ? 1 : 2))}x`); }
  if (u === "d") return minus(fx(v, d ?? 1));
  return minus(fx(v, d ?? 2));
}
function fmtDelta(v, u) {
  if (!SX.ok(v)) return "—";
  const a = Math.abs(v), n = u === "%" || u === "d" ? 1 : a >= 10 ? 1 : 2, t = a.toFixed(n);
  const s = +t === 0 ? "±" : v > 0 ? "+" : "−";
  if (u === "%") return `${s}${t} pts`;
  if (u === "d") return `${s}${t} d`;
  return `${s}${t}x`;
}
/* Better than the median, worse, or level (within 3% of the median's size, min 0.05). */
function verdictVs(v, med, hi) {
  if (!SX.ok(v) || !SX.ok(med)) return "level";
  const tol = Math.max(Math.abs(med) * 0.03, 0.05), d = v - med;
  if (Math.abs(d) <= tol) return "level";
  return (d > 0) === hi ? "better" : "worse";
}
const seriesPal = T => T.dark ? ["#3987e5", "#d95926", "#199e70"] : ["#2a78d6", "#eb6834", "#1baf7a"];
/* Year labels follow the company in focus: live companies keep their own fiscal years (FY2025 for a December year-end). */
const ylab = (c, j) => c && c.yl ? c.yl[j] : SUITE.years[j];
const yLabel = i => { try { const c = SUITE.byId[SuiteSel.get().focus]; if (c && c.yl) return c.yl[i]; } catch {} return SUITE.years[i]; };
const isLive = c => !!(c && c.live);
const MONTH_FULL = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
const monthFull = m => MONTH_FULL[m] || m || "the year-end";
const curSym = cur => (typeof CUR !== "undefined" && CUR[cur] && CUR[cur].sym) || (cur ? cur + " " : "");
/* Share price in the company's own currency */
function pxFmt(c, d = 2) {
  if (!c || !SX.ok(c.price)) return "—";
  const cur = c.live ? c.live.cur : "INR";
  return `${curSym(cur)}${Number(c.price).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
const pxAsOf = c => c && c.live ? `${lvWhen(c.live.fetchedAt)} (Yahoo Finance)` : SUITE.asOf;
/* Exchange and ticker as people write them */
const tickerOf = c => c ? (c.live ? `${c.live.exch || "Listed"}: ${lvSplit(c.ticker).base}` : `NSE: ${c.ticker}`) : "";
const peerWord = n => n === 1 ? "the other company" : `the other ${n}`;

/* ── Shared selection: industry, companies in the comparison, focus, year ── */
const SuiteSel = (() => {
  const KEY = "vs:sel2";
  const def = indId => { const I = SX.ind(indId); return { ind: I.id, ids: I.cos.slice(0, 5), focus: I.cos[0], yi: SUITE.last }; };
  const norm = s => {
    if (!s || !SUITE.ind.some(x => x.id === s.ind)) return def("pipes");
    const I = SX.ind(s.ind);
    let ids = (Array.isArray(s.ids) ? s.ids : []).filter(id => I.cos.includes(id));
    ids = I.cos.filter(id => ids.includes(id)).slice(0, 5);
    if (!ids.length) ids = I.cos.slice(0, 5);
    const focus = ids.includes(s.focus) ? s.focus : ids[0];
    const yi = [1, 2, 3, 4].includes(+s.yi) ? +s.yi : SUITE.last;
    return { ind: I.id, ids, focus, yi };
  };
  let st = (() => { try { return norm(JSON.parse(localStorage.getItem(KEY))); } catch { return def("pipes"); } })();
  const subs = new Set();
  let msg = null;                                    // a one-line hint shown under the company chips
  const set = patch => {
    const p = typeof patch === "function" ? patch(st) : patch;
    st = norm({ ...st, ...p });
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
    subs.forEach(f => f());
  };
  /* Up to five companies in a comparison: adding a sixth swaps out the last company that isn't in focus. */
  const withId = (s, id) => {
    if (s.ids.includes(id)) return s.ids;
    if (s.ids.length < 5) return [...s.ids, id];
    const drop = [...s.ids].reverse().find(x => x !== s.focus);
    msg = `Five is the most you can compare at once, so ${SX.co(drop).short} made way for ${SX.co(id).short}.`;
    return [...s.ids.filter(x => x !== drop), id];
  };
  return {
    get: () => st, set, sub: f => { subs.add(f); return () => subs.delete(f); }, def,
    msg: () => msg, clearMsg: () => { msg = null; },
    setInd: id => { msg = null; set(def(id)); },
    toggle: id => set(s => {
      msg = null;
      const on = s.ids.includes(id);
      if (on && s.ids.length === 1) return s;
      const ids = on ? s.ids.filter(x => x !== id) : withId(s, id);
      return { ids, focus: on && s.focus === id ? ids[0] : s.focus };
    }),
    focus: id => set(s => { msg = null; return { focus: id, ids: withId(s, id) }; }),
    year: yi => set({ yi: +yi }),
    reset: () => { msg = null; set(s => def(s.ind)); },
    /* open a company inside a group (switching group if needed) and put it in focus */
    open: (id, gid) => { msg = null; set(s => {
      const g = gid || s.ind, base = g === s.ind ? s : def(g);
      return { ind: g, ids: withId({ ...base, focus: id }, id), focus: id, yi: s.yi };
    }); },
    refresh: () => set(s => s),
  };
})();
function useSuiteSel() { return React.useSyncExternalStore(SuiteSel.sub, SuiteSel.get, SuiteSel.get); }
/* Saved comparisons, kept in this browser only. */
function useSavedViews() {
  const KEY = "vs:views";
  const [v, setV] = useState(() => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch { return []; } });
  const put = a => { setV(a); try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} };
  return [v, put];
}

/* Width of a container, for charts drawn in real pixels. */
function useWidth(init = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(init);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", set); return () => window.removeEventListener("resize", set); }
    const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
  for (let v = a; v <= b + step * 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}

/* ── Line chart: one highlighted company, grey peers, an optional peer-median line ── */
function SuiteLine({ series, labels, unit, dec, zones, height = 236, yMinFloor }) {
  const T = useT();
  const [ref, W] = useWidth();
  const [hov, setHov] = useState(null);
  const padL = 46, padR = 112, padT = 14, padB = 28, H = height;
  const vals = series.flatMap(s => s.values).filter(SX.ok);
  if (!vals.length) return <div ref={ref} style={{ color: T.textMute, fontSize: 12 }}>No data for this measure.</div>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (yMinFloor != null) lo = Math.min(lo, yMinFloor);
  else if (lo > 0 && lo < (hi - lo) * 1.2) lo = 0;
  const ticks = niceTicks(lo, hi); const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const stepT = ticks.length > 1 ? ticks[1] - ticks[0] : 1, tickDec = stepT >= 1 ? 0 : stepT >= 0.1 ? 1 : 2;
  const x = i => padL + (labels.length === 1 ? 0 : i * (W - padL - padR) / (labels.length - 1));
  const y = v => padT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - padT - padB);
  const style = s => s.role === "focus" ? { stroke: T.primary, w: 2.5, o: 1 }
    : s.role === "median" ? { stroke: T.textSec, w: 2, o: 0.95 } : { stroke: T.textMute, w: 1.5, o: 0.6 };
  const order = [...series].sort((a, b) => (a.role === "focus") - (b.role === "focus") || (a.role === "median") - (b.role === "median"));
  const last = labels.length - 1, placed = [];
  const pri = s => s.role === "focus" ? 0 : s.role === "median" ? 1 : 2;
  [...series].sort((a, b) => pri(a) - pri(b)).forEach(s => {
    const v = s.values[last]; if (!SX.ok(v)) return;
    const yy = y(v);
    if (placed.some(p => Math.abs(p.y - yy) < 13)) return;
    placed.push({ y: yy, s, v });
  });
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    labels.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
    setHov(best);
  };
  const tipRows = hov == null ? [] : series.map(s => ({ s, v: s.values[hov] })).filter(r => SX.ok(r.v)).sort((a, b) => b.v - a.v);
  const trunc = s => s.length > 13 ? s.slice(0, 12) + "…" : s;
  return (<div ref={ref} style={{ position: "relative" }}>
    <svg width={W} height={H} role="img" aria-label="Trend chart" style={{ display: "block", maxWidth: "100%" }}
      onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
      {zones && zones.map((z, i) => { const a = Math.max(z.from, y0), b = Math.min(z.to, y1); if (!(b > a)) return null;
        return <g key={i}><rect x={padL} width={W - padL - padR} y={y(b)} height={y(a) - y(b)} fill={z.fill} />
          {y(a) - y(b) > 14 && <text x={padL + 6} y={y(b) + 12} fontSize="10" fill={T.textMute} fontFamily={SANS}>{z.label}</text>}</g>; })}
      {ticks.map(t => <g key={t}>
        <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={T.border} strokeWidth="1" />
        <text x={padL - 8} y={y(t) + 3.5} fontSize="10.5" textAnchor="end" fill={T.textMute} fontFamily={MONO}>{fmtU(t, unit, tickDec)}</text>
      </g>)}
      {labels.map((l, i) => <text key={l} x={x(i)} y={H - 8} fontSize="10.5" textAnchor="middle" fill={T.textMute} fontFamily={SANS}>{l}</text>)}
      {hov != null && <line x1={x(hov)} x2={x(hov)} y1={padT} y2={H - padB} stroke={T.borderStrong} strokeWidth="1" />}
      {order.map(s => { const st = style(s); const pts = s.values.map((v, i) => SX.ok(v) ? [x(i), y(v)] : null);
        const segs = []; let cur = [];
        pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
        return <g key={s.id}>
          {segs.map((sg, k) => <polyline key={k} points={sg.map(p => p.join(",")).join(" ")} fill="none" stroke={st.stroke}
            strokeWidth={st.w} strokeLinejoin="round" strokeLinecap="round" opacity={st.o} />)}
          {s.role === "focus" && pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={i === last || i === hov ? 4.5 : 3}
            fill={T.primary} stroke={T.surface} strokeWidth="2" />)}
        </g>; })}
      {placed.map(p => <g key={p.s.id}>
        <text x={W - padR + 8} y={p.y + 3.5} fontSize="11" fill={p.s.role === "peer" ? T.textMute : T.text}
          fontWeight={p.s.role === "focus" ? 600 : 500} fontFamily={SANS}>
          {trunc(p.s.label)} <tspan fontFamily={MONO} fill={T.textSec}>{fmtU(p.v, unit, dec)}</tspan></text>
      </g>)}
    </svg>
    {hov != null && <div style={{ position: "absolute", top: 8, left: Math.min(Math.max(x(hov) + 12, 0), W - 200), pointerEvents: "none",
      background: T.tipBg, color: T.tipText, borderRadius: 8, padding: "9px 11px", fontSize: 11.5, boxShadow: T.sh3, width: 184, zIndex: 5 }}>
      <div style={{ fontWeight: 600, marginBottom: 5 }}>{labels[hov]}</div>
      {tipRows.map(r => <div key={r.s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, lineHeight: 1.6,
        fontWeight: r.s.role === "focus" ? 700 : 400, opacity: r.s.role === "peer" ? 0.85 : 1 }}>
        <span>{r.s.label}</span><span style={{ fontFamily: MONO }}>{fmtU(r.v, unit, dec)}</span></div>)}
    </div>}
  </div>);
}
function LineLegend({ focusLabel, median = true }) {
  const T = useT();
  const Key = ({ c, w, l }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 18, height: w, background: c, borderRadius: 2, display: "inline-block" }} />{l}</span>;
  return <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: T.textSec, marginBottom: 10 }}>
    <Key c={T.primary} w={3} l={focusLabel} />{median && <Key c={T.textSec} w={2} l="Peer median" />}<Key c={T.textMute} w={2} l="Other companies" />
  </div>;
}

/* ── Diverging bars: contributions that can help or hurt ── */
function DivBars({ rows, fmt, height = 18 }) {
  const T = useT();
  const [ref, W] = useWidth(); const narrow = W < 520;
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 1e-9);
  return <div ref={ref}>{rows.map(r => {
    const w = Math.abs(r.v) / max * 50, pos = r.v >= 0;
    return <div key={r.l} style={{ display: "grid", gridTemplateColumns: narrow ? "1fr auto" : "minmax(96px,190px) 1fr auto",
      gridTemplateAreas: narrow ? '"l v" "b b"' : '"l b v"', columnGap: 12, rowGap: 6, alignItems: "center", padding: "7px 0" }}>
      <div style={{ gridArea: "l", fontSize: 12.5, color: T.text, lineHeight: 1.3 }}>{r.l}{r.sub && <div style={{ fontSize: 11, color: T.textMute, marginTop: 2 }}>{r.sub}</div>}</div>
      <div style={{ gridArea: "b", position: "relative", height }}>
        <div style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, background: T.borderStrong }} />
        <div title={fmt(r.v)} style={{ position: "absolute", top: 0, height, left: pos ? "50%" : `${50 - w}%`, width: `${Math.max(w, 0.4)}%`,
          background: pos ? T.green : T.red, opacity: .8, borderRadius: pos ? "0 4px 4px 0" : "4px 0 0 4px" }} />
      </div>
      <div style={{ gridArea: "v", fontSize: 11.5, fontFamily: MONO, color: T.text, whiteSpace: "nowrap", textAlign: "right", minWidth: 64, fontWeight: 500 }}>{fmt(r.v)}</div>
    </div>; })}</div>;
}

/* ── Small score meter, with the number beside it ── */
function Meter({ s }) {
  const T = useT();
  if (!SX.ok(s)) return <span style={{ color: T.textMute }}>—</span>;
  const c = s >= 80 ? T.green : s >= 65 ? T.primary : s >= 50 ? T.amber : T.red;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 46, height: 6, borderRadius: 3, background: T.surfaceSunk, display: "inline-block", overflow: "hidden" }}>
      <span style={{ display: "block", width: `${Math.max(0, Math.min(100, s))}%`, height: "100%", background: c, borderRadius: 3 }} /></span>
    <span style={{ fontFamily: MONO, fontSize: 11, color: T.textSec, minWidth: 22, textAlign: "right" }}>{s.toFixed(0)}</span></span>;
}
function Chip({ children, kind = "neutral" }) {
  const T = useT();
  const c = { green: [T.greenTint, T.green], red: [T.redTint, T.red], amber: [T.amberTint, T.amber], primary: [T.primaryTint, T.primaryDark],
    neutral: [T.surfaceSunk, T.textSec] }[kind] || [T.surfaceSunk, T.textSec];
  return <span style={{ background: c[0], color: c[1], borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}
const thS = T => ({ textAlign: "right", padding: "9px 10px", fontSize: 11, fontWeight: 600, color: T.textMute, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" });
const tdS = T => ({ textAlign: "right", padding: "8px 10px", fontSize: 12, fontFamily: MONO, color: T.text, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" });
const tdL = T => ({ ...tdS(T), textAlign: "left", fontFamily: SANS });
const fcS = (T, on) => on ? { color: T.primaryDark, background: T.primarySoft } : {};
function Scroll({ children, min = 520 }) { return <div style={{ overflowX: "auto", margin: "0 -6px" }}><div style={{ minWidth: min, padding: "0 6px" }}>{children}</div></div>; }
function Findings({ items }) { const T = useT();
  return <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>{items.filter(Boolean).map((f, i) =>
    <li key={i} style={{ fontSize: 12.5, lineHeight: 1.65, color: T.textSec }}>{f}</li>)}</ul>; }
/* Colour for a rank among n (1 = best): green → neutral → red. */
function rankTint(T, rank, n) {
  if (!rank || n < 2) return "transparent";
  const t = (rank - 1) / (n - 1);
  return t <= 0.25 ? T.greenTint : t >= 0.75 ? T.redTint : "transparent";
}

/* ── AI analyst note (uses the page's `sample` capability when present) ── */
function AiNote({ label = "Write analyst note", build, aiAvail, sampleRef, aiMessage, addLog, logLabel }) {
  const T = useT();
  const [st, setSt] = useState({ loading: false, text: null, err: null });
  const ctl = useRef(null);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  if (!aiAvail) return null;
  const run = async () => {
    const sample = sampleRef && sampleRef.current;
    if (!sample) { setSt({ loading: false, text: null, err: "AI notes aren't available in this view." }); return; }
    try { ctl.current && ctl.current.abort(); } catch {}
    const c = new AbortController(); ctl.current = c;
    setSt({ loading: true, text: null, err: null });
    try {
      const { text, truncated } = await sample(build(), { modelTier: "default", signal: c.signal, onText: ({ text }) => setSt(s => ({ ...s, text })) });
      setSt({ loading: false, text, err: truncated ? "The note was cut short. Run it again for the full version." : null });
      addLog && addLog(logLabel || "AI note written", `${text.length} characters`);
    } catch (e) {
      const msg = aiMessage ? aiMessage(e) : "Couldn't reach Claude just now. Try again.";
      setSt(s => ({ loading: false, text: e && e.text ? e.text : msg ? null : s.text, err: msg || null }));
    }
  };
  return <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
    <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
      <Btn variant="tonal" size="sm" onClick={run} disabled={st.loading}>{st.loading ? "Writing…" : st.text ? "Write it again" : label}</Btn>
      {st.loading && <Btn variant="ghost" size="sm" onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} }}>Stop</Btn>}
      <span style={{ fontSize: 11.5, color: T.textMute }}>Claude drafts a note from the figures on this page. Read it as a first draft.</span>
    </div>
    {st.err && <div style={{ marginTop: 10, fontSize: 12, color: T.red }}>{st.err}</div>}
    {st.text && <div style={{ marginTop: 14, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
      {st.text.split("\n").map((line, i) => {
        const t = line.trim(), clean = t.replace(/\*\*/g, "");
        if (!clean) return <div key={i} style={{ height: 6 }} />;
        if (t.startsWith("**") && t.endsWith("**")) return <div key={i} style={{ fontWeight: 600, fontSize: 12.5, color: T.primaryDark, marginTop: i ? 12 : 0, marginBottom: 6 }}>{clean}</div>;
        const b = /^[-•]|^\d+\./.test(clean);
        return <div key={i} style={{ fontSize: 12.5, lineHeight: 1.65, color: T.textSec, paddingLeft: b ? 12 : 0, marginBottom: 4 }}>{clean}</div>;
      })}
    </div>}
  </div>;
}

/* ── Excel export through the page's download capability. Cells: value, or { f: "formula", z: "format" } ── */
async function suiteDownload({ dlRef, flash, addLog }, filename, sheets) {
  if (typeof XLSX === "undefined") { flash && flash("Excel export isn't available in this view."); return; }
  try {
    const wb = XLSX.utils.book_new();
    sheets.forEach(sh => {
      const plain = sh.rows.map(r => r.map(c => c && typeof c === "object" ? (c.v ?? null) : (SX.ok(c) || typeof c === "string" ? c : null)));
      const ws = XLSX.utils.aoa_to_sheet(plain);
      sh.rows.forEach((r, ri) => r.forEach((c, ci) => {
        if (!c || typeof c !== "object") return;
        const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (c.f) ws[ref] = { t: "n", f: c.f, ...(c.z ? { z: c.z } : {}) };
        else if (ws[ref] && c.z) ws[ref].z = c.z;
        if (c.b && ws[ref]) ws[ref].s = { font: { bold: true } };
      }));
      ws["!cols"] = (sh.widths || []).map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
    });
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const dl = dlRef && dlRef.current;
    if (!dl) { flash && flash("File downloads aren't available in this view."); return; }
    await dl.save({ filename, data: buf });
    addLog && addLog("Exported to Excel", filename);
    flash && flash("Workbook saved.");
  } catch (err) {
    const c = err && err.code;
    if (c === "declined") return;
    flash && flash(c === "rate_limited" ? "A save prompt is already open." : "Couldn't build or offer the workbook just now.");
  }
}
/* Source-data sheet shared by every export: one block per company, five years, ₹ million. Returns the cell map. */
const SRC_ROWS = [["Revenue", "rev"], ["Cost of revenue", "cogs"], ["Gross profit", "gp"], ["Operating expenses", "opex"], ["EBITDA", "ebitda"],
  ["Depreciation & amortisation", "da"], ["EBIT", "ebit"], ["Interest expense", "int"], ["Profit before tax", "pbt"], ["Income tax", "tax"],
  ["Net income", "ni"], ["Cash & short-term investments", "cash"], ["Trade receivables", "ar"], ["Inventory", "inv"], ["Current assets", "ca"],
  ["Net PP&E", "ppe"], ["Long-term investments", "lti"], ["Total assets", "ta"], ["Trade payables", "ap"], ["Current liabilities", "cl"],
  ["Total debt incl. leases", "debt"], ["Total liabilities", "tl"], ["Retained earnings", "re"], ["Shareholders' equity", "eq"],
  ["Minority interest", "mi"], ["Operating cash flow", "cfo"], ["Capital expenditure", "capex"], ["Dividends paid", "div"]];
function sourceSheet(ids) {
  const fx = ids.filter(id => SX.co(id).fx).map(id => SX.co(id).short);
  const live = ids.map(SX.co).filter(isLive);
  const rows = [["Source figures, consolidated, ₹ million. Years to 31 March. stockanalysis.com standardised statements, cross-checked with Yahoo Finance." +
    (fx.length ? ` ${SX.list(fx)}: published in US dollars, translated into rupees at each year's average rate (income, cash flow) and the RBI year-end rate (balance sheet).` : "") +
    (live.length ? ` Live companies: ${live.map(x => `${x.short} (fiscal years to ${monthFull(x.live.ye)}, fetched ${lvWhen(x.live.fetchedAt)}${x.live.stmtCur !== "INR" ? `, ${x.live.stmtCur} at ₹${x.live.fxSI.toFixed(4)}` : ""})`).join("; ")}.` : "")], []];
  const at = {};
  const colOf = j => XLSX.utils.encode_col(1 + j);
  ids.forEach(id => {
    const c = SX.co(id);
    rows.push([{ v: `${c.name} (${tickerOf(c)})`, b: true }, ...SUITE.years.map((y, j) => ({ v: ylab(c, j), b: true }))]);
    at[id] = {};
    SRC_ROWS.forEach(([l, f]) => {
      rows.push([l, ...c[f].map(v => SX.ok(v) ? Math.round(v * 100) / 100 : null)]);
      const r = rows.length;                      // this line's row number, fixed now (rows keeps growing)
      at[id][f] = j => `Data!${colOf(j)}${r}`;
    });
    rows.push([]);
  });
  return { sheet: { name: "Data", rows, widths: [34, 12, 12, 12, 12, 12] }, at };
}

/* ── Workspace switcher shown above every workspace ── */
function SuiteNav({ space, onChange }) {
  const T = useT();
  return <nav aria-label="Workspaces" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
    {SUITE_SPACES.map(([id, l, s]) => { const on = space === id;
      return <button key={id} onClick={() => onChange(id)} aria-pressed={on} style={{ flex: "1 1 150px", textAlign: "left", cursor: "pointer",
        background: on ? T.primaryTint : T.surface, border: `1px solid ${on ? "transparent" : T.border}`, borderRadius: 12,
        padding: "10px 14px", fontFamily: SANS, boxShadow: on ? "none" : T.sh1, transition: "all .16s" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: on ? T.primaryDark : T.text }}>{l}</div>
        <div style={{ fontSize: 11, color: on ? T.primaryDark : T.textMute, marginTop: 2, opacity: on ? .85 : 1 }}>{s}</div>
      </button>; })}
  </nav>;
}

/* ── Industry and company picker, shared by every workspace ──
   mode "suite": compare + focus + year · mode "dcf": company to value + peers for comparables. */
function SuitePicker({ space, mode = "suite", extra, onExport, exportLabel = "Download Excel" }) {
  const T = useT();
  const sel = useSuiteSel();
  useLive();
  const [views, setViews] = useSavedViews();
  const I = SX.ind(sel.ind), c = SX.co(sel.focus);
  const [t, sub] = SUITE_TITLES[space] || ["", ""];
  const dcf = mode === "dcf";
  const viewName = `${I.name}: ${c.short} vs ${sel.ids.length - 1} peer${sel.ids.length === 2 ? "" : "s"}${dcf ? "" : `, ${yLabel(sel.yi)}`}`;
  const save = () => { const v = { n: viewName, ind: sel.ind, ids: sel.ids, focus: sel.focus, yi: sel.yi };
    setViews([v, ...views.filter(x => x.n !== v.n)].slice(0, 8)); };
  const lab = { fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 };
  const verifiedInd = SUITE.ind.filter(x => !x.live), liveInd = SUITE.ind.filter(x => x.live && !x.pack);
  const packInd = LV_PACK.map(g => SUITE.ind.find(x => x.id === g.id)).filter(Boolean);
  const liveIn = sel.ids.map(SX.co).filter(isLive);
  const calendars = [...new Set(sel.ids.map(id => { const x = SX.co(id); return monthFull(x.live ? x.live.ye : "Mar"); }))];
  const hint = SuiteSel.msg();
  return <Card>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -.2, color: T.text }}>{t}</div>
        <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 6, lineHeight: 1.6 }}>{sub}</div>
      </div>
      {onExport && <Btn size="sm" variant="outline" onClick={onExport}>{exportLabel}</Btn>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 12, marginTop: 16, maxWidth: dcf ? 480 : 640 }}>
      <div><div style={lab}>Industry</div>
        <Sel v={sel.ind} onChange={SuiteSel.setInd}>
          <optgroup label="Verified dataset · FY2022–FY2026">{verifiedInd.map(x => <option key={x.id} value={x.id}>{x.name} ({x.cos.length})</option>)}</optgroup>
          {packInd.length > 0 && <optgroup label={LV_PUBLIC ? `Pre-loaded · live data fetched ${lvDay(LV_LIB.at)}` : "Starter pack · live data"}>{packInd.map(x => <option key={x.id} value={x.id}>{x.name} ({x.cos.length})</option>)}</optgroup>}
          {liveInd.length > 0 && <optgroup label={LV_PUBLIC ? "Also on this device" : "Loaded live"}>{liveInd.map(x => <option key={x.id} value={x.id}>{x.name} ({x.cos.length})</option>)}</optgroup>}
        </Sel></div>
      {!dcf && <div><div style={lab}>Financial year</div>
        <Sel v={String(sel.yi)} onChange={SuiteSel.year}>{[4, 3, 2, 1].map(j => <option key={j} value={j}>{ylab(c, j)}{j === SUITE.last ? " (latest)" : ""}</option>)}</Sel></div>}
    </div>
    <LiveQuickSearch group={I} />
    <div style={{ marginTop: 14 }}>
      <div style={lab}>{dcf ? "Peers used as trading comparables" : `Companies to compare (${sel.ids.length} of ${I.cos.length}, up to five)`}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {I.cos.map(id => { const x = SX.co(id), on = sel.ids.includes(id), f = id === sel.focus, extraHere = SUITE.indOf[id] !== I.id;
          return <span key={id} style={{ display: "inline-flex", alignItems: "center" }}>
            <button onClick={() => SuiteSel.toggle(id)} aria-pressed={on} title={`${x.name} · ${tickerOf(x)}${isLive(x) ? " · live data" : ""}`} disabled={dcf && f}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: dcf && f ? "default" : "pointer", fontFamily: SANS, fontSize: 12.5,
                fontWeight: on ? 600 : 500, padding: "6px 12px", borderRadius: extraHere ? "999px 0 0 999px" : 999, border: `1px solid ${on ? T.primary : T.border}`,
                background: on ? T.primaryTint : T.surface, color: on ? T.primaryDark : T.textSec, opacity: dcf && f ? .55 : 1 }}>
              <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? T.primary : T.borderStrong}`,
                background: on ? T.primary : "transparent", color: T.surface, fontSize: 10, lineHeight: "11px", textAlign: "center" }}>{on ? "✓" : ""}</span>
              {x.short}{isLive(x) && <span title="Live data" aria-label="live data" style={{ width: 6, height: 6, borderRadius: 3, background: T.green, display: "inline-block" }} />}</button>
            {extraHere && <button aria-label={`Take ${x.short} out of ${I.name}`} title={`Take ${x.short} out of this list`} onClick={() => lvDropFromGroup(id, I.id)}
              style={{ border: `1px solid ${on ? T.primary : T.border}`, borderLeft: "none", background: on ? T.primaryTint : T.surface, color: T.textMute, cursor: "pointer",
                borderRadius: "0 999px 999px 0", padding: "6px 9px", fontSize: 12, fontFamily: SANS }}>×</button>}
          </span>; })}
      </div>
      {hint && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 8 }}>{hint}</div>}
    </div>
    <div style={{ marginTop: 14 }}>
      <div style={lab}>{dcf ? "Company to value" : "Company in focus"}</div>
      <div style={{ maxWidth: "100%", overflowX: "auto", whiteSpace: "nowrap" }}>
        <Segment options={(dcf ? I.cos : sel.ids).map(id => [id, SX.co(id).short])} value={sel.focus} onChange={SuiteSel.focus} size="sm" /></div>
    </div>
    {extra}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
      {!dcf && <Btn size="sm" variant="ghost" onClick={SuiteSel.reset}>Reset selection</Btn>}
      <Btn size="sm" variant="ghost" onClick={save}>Save this comparison</Btn>
      {views.map(v => <span key={v.n} style={{ display: "inline-flex", alignItems: "center", background: T.surfaceSunk, borderRadius: 999 }}>
        <button onClick={() => SuiteSel.set(v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: 11.5, color: T.textSec, padding: "5px 4px 5px 11px" }}>{v.n}</button>
        <button aria-label={`Remove ${v.n}`} onClick={() => setViews(views.filter(x => x.n !== v.n))} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMute, padding: "5px 10px 5px 4px", fontSize: 12 }}>×</button></span>)}
    </div>
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, fontSize: 11.5, color: T.textMute, lineHeight: 1.6 }}>
      <span>{c.name} · {tickerOf(c)}</span>
      <span>{c.live ? `Consolidated · fiscal years to ${monthFull(c.live.ye)} · ₹ crore${c.live.stmtCur !== "INR" ? ` (reported in ${c.live.stmtCur}, translated at ₹${fx(c.live.fxSI, c.live.fxSI < 1 ? 4 : 2)} per ${c.live.stmtCur})` : ""}` : "Consolidated, years to 31 March · ₹ crore"}</span>
      <span>Price {pxFmt(c)} at {pxAsOf(c)}</span>
    </div>
    {I.note && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 8, lineHeight: 1.6 }}>{I.note}</div>}
    {c.note && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 6, lineHeight: 1.6 }}><b style={{ color: T.text, fontWeight: 600 }}>{c.short}:</b> {c.note}</div>}
    {liveIn.length > 0 && <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 8, lineHeight: 1.6 }}>
      <b style={{ color: T.text, fontWeight: 600 }}>Live data:</b> {SX.list(liveIn.map(x => x.short))}: statements from stockanalysis.com (S&P Global Market Intelligence data), price and profile from Yahoo Finance, fetched {SX.list([...new Set(liveIn.map(x => lvWhen(x.live.fetchedAt).split(",")[0]))])}.
      {liveIn.some(x => x.live.stmtCur !== "INR") ? " Figures reported in other currencies are translated into rupees at the day's rate, so growth rates and ratios are unchanged." : ""}
      {calendars.length > 1 ? ` Each company keeps its own fiscal year (year-ends: ${calendars.join(", ")}), so "latest year" lines up each one's most recent annual report.` : ""}
      {c.live && c.live.warns && c.live.warns.length > 0 && <span style={{ color: T.amber }}> {c.live.warns.join(" ")}</span>}
    </div>}
  </Card>;
}
function SuiteSources() {
  const T = useT();
  const sel = useSuiteSel();
  const live = sel.ids.map(SX.co).filter(isLive);
  return <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.7, margin: "4px 2px 0" }}>
    Source: standardised consolidated statements for FY2022–FY2026 (stockanalysis.com, S&P Global Market Intelligence data), captured 26–27 September 2026,
    cross-checked against Yahoo Finance for total assets, equity, liabilities, debt, net income and operating cash flow. Gross profit, EBIT, EBITDA and
    free cash flow were re-derived from their parts, and every balance sheet balances to within rounding. Where the two sources disagree the difference is
    disclosed in the company notes. Prices are NSE closes on {SUITE.asOf}. Ratios on average balances use opening and closing figures; working-capital days use
    year-end balances.{live.length > 0 && ` Live companies (${SX.list(live.map(x => x.short))}) come from the same statements source, fetched on the dates shown, with prices and profiles from Yahoo Finance; the checks run on them are listed under Find companies.`} Educational analysis, not investment advice.
  </div>;
}

/* ═══════════════ The suite itself ═══════════════ */
function AnalysisSuite({ space, setSpace, flash, addLog, aiAvail, sampleRef, aiMessage, dlRef }) {
  const sel = useSuiteSel();
  useLive();
  const c = SX.co(sel.focus);
  const common = { sel, c, flash, addLog, aiAvail, sampleRef, aiMessage, dlRef, setSpace, io: { dlRef, flash, addLog } };
  if (space === "fpa") return <FpaModule {...common} />;
  if (space === "find") return <FindModule {...common} />;
  if (space === "research") return <ResearchModule {...common} />;
  return <>
    {space === "ratios" && <RatioModule {...common} />}
    {space === "credit" && <CreditModule {...common} />}
    {space === "wc" && <WcModule {...common} />}
    <SuiteSources />
  </>;
}

/* Who built this: a line at the foot of the public edition. */
function SuiteCredit() {
  const T = useT();
  const C = typeof VS_CREDIT !== "undefined" ? VS_CREDIT : null;
  if (!C || !C.name) return null;
  const a = { color: T.primaryDark, textDecoration: "none", fontWeight: 600 };
  return <div style={{ textAlign: "center", fontSize: 12, color: T.textMute, padding: "18px 12px 6px", lineHeight: 1.7 }}>
    Built by <span style={{ color: T.textSec, fontWeight: 600 }}>{C.name}</span>
    {C.linkedin && <> · <a href={C.linkedin} target="_blank" rel="noopener noreferrer" style={a}>LinkedIn</a></>}
    {C.github && <> · <a href={C.github} target="_blank" rel="noopener noreferrer" style={a}>Source on GitHub</a></>}
  </div>;
}
