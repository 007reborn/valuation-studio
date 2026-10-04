/* ═══════════════ DCF: industry and company picker ═══════════════
   Loads any of the 47 verified companies, or any company loaded live, into the DCF model. The peers ticked in
   the picker become the trading comparables. Prince Pipes can also load the audited standalone SIP model. */
const DCF_RF = 6.95, DCF_ERP = 6.5, DCF_TAX = 25.2, DCF_TGR = 5.0, DCF_YEARS = 10;
let DCF_LAST = null, DCF_PEERS = null, DCF_LABEL = "";   // what the model currently holds, kept across workspace switches
/* Market inputs: the SIP model's for India; the model's own country defaults elsewhere (all editable in the model). */
function dcfMarket(c) {
  if (!c || !c.live || c.live.country === "IN") return { code: "IN", name: "India", rf: DCF_RF, erp: DCF_ERP, tax: DCF_TAX, tgr: DCF_TGR, kdLo: 7, kdHi: 13, kdDef: 8.5, gLo: 4, gHi: 18, india: true };
  const has = typeof MARKETS !== "undefined";
  let code = c.live.country;
  if (!has || !MARKETS[code]) code = has ? (Object.keys(MARKETS).find(k => MARKETS[k].cur === c.live.cur) || "US") : "US";
  const M = has ? MARKETS[code] : { name: "United States", rf: 4.3, erp: 4.3, tax: 21, gdp: 4 };
  const tgr = Math.round(Math.min(DCF_TGR, Math.max(1.5, M.gdp - 1)) * 10) / 10;
  return { code, name: M.name, rf: M.rf, erp: M.erp, tax: M.tax, tgr, kdLo: M.rf + 0.5, kdHi: M.rf + 6, kdDef: M.rf + 1.5, gLo: Math.max(1, tgr), gHi: 15, india: false };
}
/* The DCF works in the company's trading currency: rupees for Indian companies, its own currency otherwise. */
const dcfFx = c => c && c.live && c.live.cur !== "INR" ? c.live.fxTI : 1;
const dcfLatestYear = c => +(String(ylab(c, SUITE.last)).replace(/\D/g, "")) || 2026;
function dcfPeerRow(id, subj) {
  const x = SX.co(id), L = SUITE.last, k = dcfFx(subj), inr = k === 1;
  const v = n => String(inr ? Math.round(n / 10) : Math.round(n / k));      // ₹ crore for rupee models, the subject's currency (million) otherwise
  return { name: x.name, asOf: x.live ? lvWhen(x.live.fetchedAt).split(",")[0] : "25-Sep-2026", price: String(Math.round(x.price * 100) / 100), mcap: v(x.mcap), debt: v(x.debt[L]),
    inv: v(x.cash[L] + x.lti[L] + (x.cashAdj || 0)), ebitda: v(x.ebitda[L]), ni: v(x.ni[L]), include: true };
}
function dcfAssumptions(id, peers) {
  const c = SX.co(id), L = SUITE.last, J = [L - 2, L - 1, L], M = dcfMarket(c);
  const g3 = cagr(c.rev[L - 3], c.rev[L], 3);
  const g1 = Math.min(M.gHi, Math.max(M.gLo, SX.ok(g3) ? g3 : 8));
  const em = J.map(j => SX.div(c.ebitda[j], c.rev[j]) * 100), emOk = em.filter(SX.ok);
  const emAvg = emOk.length ? emOk.reduce((t, x) => t + x, 0) / emOk.length : 12;
  const cps = J.map(j => SX.div(c.capex[j], c.rev[j]) * 100).filter(SX.ok), cpAvg = cps.length ? cps.reduce((t, x) => t + x, 0) / cps.length : 5;
  /* Capex moves from its three-year average to a steady state by year 5 and follows it after that: depreciation
     × (1 + 4 × growth), so 1.24× depreciation at 6% growth, and never above the three-year average. Holding an
     expansion-phase capex rate for ever would sink the terminal value. */
  const daPct = SX.div(c.da[L], c.rev[L]) * 100 || cpAvg, cpSS = gk => Math.min(cpAvg, daPct * (1 + 4 * gk / 100)), cpT = cpSS(M.tgr + 1);
  const np = SX.div(c.ar[L] + c.inv[L] - c.ap[L], c.rev[L]) * 100 || 0;
  /* Bottom-up beta (median unlevered beta of the peers, relevered) when at least two peers are ticked: single-stock
     regression betas are noisy (R² often below 0.3). Otherwise the company's own Blume-adjusted regression beta. */
  const buAll = bottomUpBeta(id, [id, ...peers]), bu = buAll && buAll.n >= 2 ? buAll : null;
  const beta = bu ? bu.relevered : c.beta ? c.beta.adj : 1.0, betaSrc = bu ? "bottom-up" : c.beta ? "regression" : "market";
  const effR = SUITE_R[id][L].effr;
  const kd = SX.ok(effR) && c.debt[L] > 0.02 * c.mcap ? Math.min(M.kdHi, Math.max(M.kdLo, effR)) : M.kdDef;
  const we = c.mcap / (c.mcap + c.debt[L]) * 100;
  const ke = M.rf + beta * M.erp, wacc = we / 100 * ke + (1 - we / 100) * kd * (1 - M.tax / 100);
  const mults = peers.map(p => suiteMarket(SX.co(p)).evEbitda).filter(SX.ok);
  const own = suiteMarket(c).evEbitda;
  const exit = Math.min(40, Math.max(5, mults.length ? SX.med(mults) : (SX.ok(own) ? own : 12)));
  return { g3, g1, em, emAvg, emLast: SX.ok(em[2]) ? em[2] : emAvg, cpAvg, cpSS, cpT, daPct, np, beta, betaSrc, bu, kd, we, ke, wacc, exit, nPeers: mults.length, M };
}
function dcfPresetFor(id, peers) {
  const c = SX.co(id), L = SUITE.last, J = [L - 2, L - 1, L], a = dcfAssumptions(id, peers), M = a.M, k = dcfFx(c);
  const rd = v => String(Math.round((v || 0) / k)), p1 = v => String(Math.round(v * 10) / 10);
  const taxR = j => c.pbt[j] > 0 ? Math.min(40, Math.max(0, c.tax[j] / c.pbt[j] * 100)) : M.tax;
  /* Ten-year, two-stage forecast: five years at the starting growth rate, then a straight-line fade to terminal growth + 1 point by year 10. */
  const g = q => q < 5 ? a.g1 : a.g1 + (M.tgr + 1 - a.g1) * (q - 4) / 5;
  const b = c.beta || {}, Y0 = dcfLatestYear(c), cur = c.live ? c.live.cur : "INR", sym = curSym(cur);
  const src = c.live
    ? `Consolidated ${ylab(c, L - 2)}–${ylab(c, L)} figures from stockanalysis.com (S&P Global data), fetched live on ${lvWhen(c.live.fetchedAt)} and cross-checked with Yahoo Finance${c.live.stmtCur !== cur ? `; reported in ${c.live.stmtCur} and converted into ${cur} at today's rate` : ""}; ${cur} million. `
    : c.fx ? `Consolidated FY2024–FY2026 figures from stockanalysis.com (S&P Global data), published in US dollars and translated into rupees (average rate for income and cash flow, RBI year-end rate for the balance sheet), then checked against the reported rupee results; ₹ million. `
    : `Consolidated FY2024–FY2026 figures from stockanalysis.com (S&P Global data), cross-checked with Yahoo Finance; ₹ million. `;
  const idx = c.live ? (c.live.idx || "the local market index") : "the Nifty 50";
  return {
    co: { name: c.name, ticker: c.live ? c.ticker : c.ticker, market: M.code, currency: cur, basis: "Consolidated", shares: c.shares.toFixed(3), debt: rd(c.debt[L]),
      cash: rd(c.cash[L] + c.lti[L] + (c.cashAdj || 0)), mi: rd(c.mi[L]), ps: c.oeq && SX.ok(c.oeq[L]) && c.oeq[L] > 0 ? rd(c.oeq[L]) : "0", price: String(Math.round(c.price * 100) / 100), sector: SX.ind(SUITE.indOf[id]).name },
    hist: J.map(j => ({ year: ylab(c, j), rev: rd(c.rev[j]), ebitda: rd(c.ebitda[j]), da: rd(c.da[j]), ebit: rd(c.ebit[j]), capex: rd(c.capex[j]),
      nwc: rd(c.ar[j] + c.inv[j] - c.ap[j]), tr: String(Math.round(taxR(j))) })),
    proj: [...Array(DCF_YEARS).keys()].map(q => ({ year: `FY${Y0 + 1 + q}E`, rg: p1(g(q)), em: p1(q >= 2 ? a.emAvg : a.emLast + (a.emAvg - a.emLast) * q / 2),
      dg: p1(g(q)), cp: p1(q < 4 ? a.cpAvg + (a.cpSS(g(q)) - a.cpAvg) * q / 4 : a.cpSS(g(q))), np: p1(a.np), tr: String(M.tax) })),
    assum: { wacc: a.wacc.toFixed(2), tgr: M.tgr.toFixed(1), tr: String(M.tax) },
    wacc: { rf: String(M.rf), beta: a.beta.toFixed(2), erp: String(M.erp), kd: a.kd.toFixed(1), tax: String(M.tax), we: a.we.toFixed(3) },
    useBuilt: true, exitMult: a.exit.toFixed(1), wk52: { lo: String(c.wkLo), hi: String(c.wkHi) }, asOf: c.live ? lvWhen(c.live.fetchedAt).split(",")[0] : "25 September 2026",
    comps: { ni: rd(c.ni[L]), peCap: "100", evCap: "100", peers: peers.map(p => dcfPeerRow(p, c)) },
    s3: { ppe: rd(c.ppe[L]), equity: rd(c.eq[L]), rate: a.kd.toFixed(1), payout: p1(c.ni[L] > 0 ? Math.min(100, Math.max(0, c.div[L] / c.ni[L] * 100)) : 0), borrow: "0" },
    note: src + (c.note ? c.note + " " : "") + `Price ${sym}${c.price} at ${c.live ? pxAsOf(c) : "the 25 September 2026 NSE close"}. ` +
      (a.betaSrc === "bottom-up"
        ? `Beta ${a.beta.toFixed(2)} is bottom-up: the median unlevered beta of the ${a.bu.n} peers ticked (each a Blume-adjusted five-year monthly regression on ${!c.live && peers.every(p => !SX.co(p).live) ? "the Nifty 50" : "its home index"}), relevered at ${c.short}'s debt of ${(a.bu.de * 100).toFixed(1)}% of market value. ${c.short}'s own regression beta is ${SX.ok(b.adj) ? b.adj.toFixed(2) : "—"} (R² ${SX.ok(b.r2) ? b.r2.toFixed(2) : "—"}). `
        : a.betaSrc === "regression" ? `Beta ${a.beta.toFixed(2)} is the Blume-adjusted five-year monthly regression on ${idx} (raw ${SX.ok(b.raw) ? b.raw.toFixed(2) : "—"}, R² ${SX.ok(b.r2) ? b.r2.toFixed(2) : "—"}, ${b.n || "—"} months). `
        : `Beta is set to 1.0 (the market) because no regression beta was available; tick two or more peers for a bottom-up beta. `) +
      (M.india ? `Risk-free rate ${DCF_RF}% and equity risk premium ${DCF_ERP}%, as in the Prince Pipes model. ` : `Risk-free rate ${M.rf}%, equity risk premium ${M.erp}% and tax ${M.tax}% are the model's defaults for ${M.name}; terminal growth ${M.tgr}% sits a point below its long-run nominal GDP. `) +
      `Cost of debt ${a.kd.toFixed(1)}% is interest ÷ average debt, kept between ${M.kdLo.toFixed(1)}% and ${M.kdHi.toFixed(1)}%. ` +
      `Exit multiple ${a.exit.toFixed(1)}× is the median EV/EBITDA of ${a.nPeers ? `the ${a.nPeers} peers ticked` : "the company itself (no peers ticked)"}. ` +
      `Forecast, ten years in two stages: revenue grows at the three-year CAGR (${SX.ok(a.g3) ? a.g3.toFixed(1) + "%" : "n/a"}, kept between ${M.gLo}% and ${M.gHi}%) for five years, then fades to ${(M.tgr + 1).toFixed(1)}% by FY${Y0 + 10}; EBITDA margin moves to its three-year average (${a.emAvg.toFixed(1)}%); ` +
      `capex moves from its three-year average (${a.cpAvg.toFixed(1)}% of revenue) to a steady state by year five, depreciation × (1 + 4 × growth), ending at ${a.cpT.toFixed(1)}% (never above the average); trade working capital stays at ${a.np.toFixed(1)}% of revenue. These are mechanical starting points: change them to your own view before relying on the value.`,
  };
}

function DcfPicker({ loadPreset, resetAll, co, setCompsIn, setWaccIn, waccIn, flash, addLog }) {
  const T = useT();
  const sel = useSuiteSel();
  const focus = sel.focus, peers = peerIds(focus, sel.ids), c = SX.co(focus);
  const [basis, setBasisRaw] = useState(() => { try { return localStorage.getItem("vs:princeBasis") || "sip"; } catch { return "sip"; } });
  const setBasis = v => { setBasisRaw(v); try { localStorage.setItem("vs:princeBasis", v); } catch {} };
  const sip = focus === "PRINCEPIPE" && basis === "sip";
  const key = `${focus}|${sip ? "sip" : "cons"}`;
  const label = sip ? "Prince Pipes (SIP model, standalone)" : `${c.short} (consolidated)`;
  const build = () => sip ? { ...PRESETS["Prince Pipes (India)"] } : dcfPresetFor(focus, peers);
  const load = (why) => { loadPreset(label, build()); DCF_LAST = key; DCF_PEERS = peers.join(); DCF_LABEL = label; setStale(false); addLog && addLog(why || "Company loaded", label); };
  /* First visit loads the selected company. Coming back after picking another company elsewhere asks first,
     so edits to the model are never overwritten without a click. Picking a company here loads it at once. */
  const prev = useRef(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const first = prev.current === null; prev.current = key;
    if (first) { if (DCF_LAST === null) load("Company loaded"); else if (DCF_LAST !== key && DCF_LAST !== "blank") setStale(true); return; }
    load("Company loaded");
  }, [key]);
  useEffect(() => {
    if (DCF_LAST !== key || DCF_PEERS === peers.join()) return;
    DCF_PEERS = peers.join();
    setCompsIn(ci => ({ ...ci, peers: peers.map(p => dcfPeerRow(p, c)) }));
    flash && flash(peers.length ? `Comparables updated: ${SX.list(peers.map(p => SX.co(p).short))}.` : "No peers ticked, so the comparables table is empty.");
  }, [peers.join()]);
  const a = dcfAssumptions(focus, peers), bu = bottomUpBeta(focus, sel.ids), b = c.beta || {};
  const L = SUITE.last, yrs = [0, 1, 2, 3, 4].filter(j => SX.ok(c.rev[j]));
  const kx = dcfFx(c), inr = kx === 1, curD = c.live ? c.live.cur : "INR";
  const money = v => !SX.ok(v) ? "—" : inr ? (v / 10).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : (v / kx).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const pctR = (n, d) => SX.ok(n) && SX.ok(d) && d ? minus(`${(n / d * 100).toFixed(1)}%`) : "—";
  const setBeta = (v, why) => { setWaccIn(w => ({ ...w, beta: v.toFixed(2) })); flash && flash(`Beta set to ${v.toFixed(2)} (${why}).`); addLog && addLog("Beta changed", `${v.toFixed(2)} · ${why}`); };
  const rowsH = [[inr ? "Revenue (₹ Cr)" : `Revenue (${curD} million)`, j => money(c.rev[j])], ["Revenue growth", j => j && SX.ok(c.rev[j - 1]) ? pctR(c.rev[j] - c.rev[j - 1], c.rev[j - 1]) : "—"],
    ["EBITDA margin", j => pctR(c.ebitda[j], c.rev[j])], ["Capex ÷ revenue", j => pctR(c.capex[j], c.rev[j])],
    ["Trade working capital ÷ revenue", j => pctR(c.ar[j] + c.inv[j] - c.ap[j], c.rev[j])], ["ROCE", j => fmtU(SUITE_R[focus][j].roce, "%")]];
  const extra = <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
    {stale && <div style={{ background: T.amberTint, borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: T.text }}>
      <span>The model still holds {DCF_LABEL || "another company"}, with any edits you made. {c.short} is selected.</span>
      <Btn size="sm" variant="tonal" onClick={() => load("Company loaded")}>Load {c.short}</Btn></div>}
    {focus === "PRINCEPIPE" && <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 }}>Prince Pipes model</div>
      <Segment options={[["sip", "SIP model · audited standalone"], ["cons", "Consolidated · 25 Sep 2026"]]} value={sip ? "sip" : "cons"} onChange={setBasis} size="sm" />
      <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 6, lineHeight: 1.6 }}>{sip ? "Reproduces the summer-internship report: standalone FY2024–FY2026 figures, price ₹287 on 2 September 2026." : "Consolidated figures from the same dataset as the other 46 companies."}</div>
    </div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Btn size="sm" variant="tonal" onClick={() => { load("Company reset"); flash && flash(`${c.short} reset to its source figures. Your edits were cleared.`); }}>Reset company</Btn>
      <Btn size="sm" variant="ghost" onClick={() => { resetAll(); DCF_LAST = "blank"; DCF_LABEL = "a blank model"; }}>Blank model</Btn>
      <span style={{ fontSize: 11.5, color: T.textMute }}>Reset company reloads {c.short}'s figures and clears any edits to the model.</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 18, marginTop: 16 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 8 }}>{c.short}: five-year record</div>
        <Scroll min={420}><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }} />{yrs.map(j => <th key={j} style={thS(T)}>{ylab(c, j).replace("FY20", "FY")}</th>)}</tr></thead>
          <tbody>{rowsH.map(([l, f]) => <tr key={l}><td style={{ ...tdL(T), whiteSpace: "normal" }}>{l}</td>{yrs.map(j => <td key={j} style={tdS(T)}>{f(j)}</td>)}</tr>)}</tbody>
        </table></Scroll>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 8 }}>Beta and starting assumptions</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
          {[[`Regression beta (5-year monthly vs ${c.live ? c.live.idx || "home index" : "Nifty 50"})`, SX.ok(b.raw) ? `${b.raw.toFixed(2)} raw · R² ${b.r2.toFixed(2)} · ${b.n} months` : "—"],
            ["Blume-adjusted beta", SX.ok(b.adj) ? b.adj.toFixed(2) : "—"],
            ["Bottom-up beta (peers' unlevered median, relevered)", bu ? `${bu.relevered.toFixed(2)} · from ${bu.n} peer${bu.n === 1 ? "" : "s"}` : "tick at least one peer"],
            ["Starting beta", `${a.beta.toFixed(2)} · ${a.betaSrc === "bottom-up" ? "bottom-up" : a.betaSrc === "regression" ? "regression (fewer than two peers ticked)" : "market"}`],
            ["Beta now in the model", waccIn && waccIn.beta ? waccIn.beta : "—"],
            ["Cost of debt (interest ÷ average debt)", `${a.kd.toFixed(1)}%`], ["WACC at the starting inputs", `${a.wacc.toFixed(2)}%`],
            ["Exit EV/EBITDA (peer median)", `${a.exit.toFixed(1)}×`], ["Revenue growth, years 1–5 → year 10", `${a.g1.toFixed(1)}% → ${(a.M.tgr + 1).toFixed(1)}%`], ["Capex ÷ revenue, year 1 → year 10", `${a.cpAvg.toFixed(1)}% → ${a.cpT.toFixed(1)}%`]].map(([l, v]) =>
            <tr key={l}><td style={{ ...tdL(T), whiteSpace: "normal", lineHeight: 1.35 }}>{l}</td><td style={{ ...tdS(T), whiteSpace: "normal" }}>{v}</td></tr>)}
        </tbody></table>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {SX.ok(b.adj) && <Btn size="sm" variant="outline" onClick={() => setBeta(b.adj, "regression, Blume-adjusted")}>Use regression beta</Btn>}
          {bu && <Btn size="sm" variant="outline" onClick={() => setBeta(bu.relevered, "bottom-up from peers")}>Use bottom-up beta</Btn>}
        </div>
      </div>
    </div>
    {sip && <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 10, lineHeight: 1.6 }}>The SIP model keeps its own assumptions. The figures above are consolidated and are shown for reference.</div>}
  </div>;
  return <SuitePicker space="dcf" mode="dcf" extra={extra} />;
}
