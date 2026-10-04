/* ═══════════════ RATIO ANALYSIS ═══════════════ */
const HEAT_KEYS = ["gm", "em", "nm", "roe", "roce", "roic", "ato", "ccc", "cur", "de", "nde", "icov", "cconv", "fcfm"];
const SCATTER_X = [["roic", "ROIC (operating)", "%"], ["roe", "Return on equity", "%"], ["em", "EBITDA margin", "%"], ["g3", "Revenue growth, 3-year CAGR", "%"]];
const SCATTER_Y = [["evEbitda", "EV / EBITDA", "x"], ["pe", "Price / earnings", "x"], ["pb", "Price / book", "x"], ["evSales", "EV / sales", "x"]];
const LINE_ITEMS = [["rev", "Revenue"], ["cogs", "Cost of revenue"], ["gp", "Gross profit"], ["opex", "Operating expenses"], ["ebitda", "EBITDA"], ["da", "D&A"],
  ["ebit", "EBIT"], ["int", "Interest"], ["pbt", "Profit before tax"], ["tax", "Tax"], ["ni", "Net income"], ["cash", "Cash & ST investments"], ["ar", "Trade receivables"],
  ["inv", "Inventory"], ["ca", "Current assets"], ["ppe", "Net PP&E"], ["ta", "Total assets"], ["ap", "Trade payables"], ["cl", "Current liabilities"],
  ["debt", "Total debt"], ["tl", "Total liabilities"], ["eq", "Shareholders' equity"], ["cfo", "Operating cash flow"], ["capex", "Capex"], ["div", "Dividends paid"]];

function heatBg(T, rank, n) {
  if (!rank || n < 2) return "transparent";
  const t = (rank - 1) / (n - 1);
  return t <= 0.2 ? `${T.green}40` : t <= 0.45 ? `${T.green}1c` : t >= 0.8 ? `${T.red}40` : t >= 0.55 ? `${T.red}1c` : "transparent";
}

/* Scatter: one point per company, focus highlighted. */
function Scatter({ pts, xl, yl, xu, yu }) {
  const T = useT();
  const [ref, W] = useWidth();
  const H = 300, pL = 52, pR = 24, pT = 16, pB = 42;
  const ok = pts.filter(p => SX.ok(p.x) && SX.ok(p.y));
  if (ok.length < 2) return <div ref={ref} style={{ fontSize: 12, color: T.textMute }}>Not enough companies with both figures to plot.</div>;
  const xs = niceTicks(Math.min(0, ...ok.map(p => p.x)), Math.max(...ok.map(p => p.x)));
  const ys = niceTicks(Math.min(0, ...ok.map(p => p.y)), Math.max(...ok.map(p => p.y)));
  const X = v => pL + (v - xs[0]) / (xs[xs.length - 1] - xs[0] || 1) * (W - pL - pR);
  const Y = v => pT + (1 - (v - ys[0]) / (ys[ys.length - 1] - ys[0] || 1)) * (H - pT - pB);
  const lab = []; [...ok].sort((a, b) => b.focus - a.focus).forEach(p => {
    let ly = Y(p.y) - 9; while (lab.some(q => Math.abs(q.ly - ly) < 12 && Math.abs(q.x - X(p.x)) < 90)) ly += 13;
    lab.push({ ...p, ly, x: X(p.x) }); });
  const dx = d => d >= 1 ? 0 : 1;
  return <div ref={ref}><svg width={W} height={H} role="img" aria-label={`${yl} against ${xl}`} style={{ display: "block", maxWidth: "100%" }}>
    {ys.map(t => <g key={"y" + t}><line x1={pL} x2={W - pR} y1={Y(t)} y2={Y(t)} stroke={T.border} />
      <text x={pL - 8} y={Y(t) + 3.5} fontSize="10.5" textAnchor="end" fill={T.textMute} fontFamily={MONO}>{fmtU(t, yu, dx(ys[1] - ys[0]))}</text></g>)}
    {xs.map(t => <text key={"x" + t} x={X(t)} y={H - pB + 16} fontSize="10.5" textAnchor="middle" fill={T.textMute} fontFamily={MONO}>{fmtU(t, xu, dx(xs[1] - xs[0]))}</text>)}
    <text x={(pL + W - pR) / 2} y={H - 6} fontSize="11" textAnchor="middle" fill={T.textSec} fontFamily={SANS}>{xl} →</text>
    {lab.map(p => <g key={p.id}>
      <circle cx={p.x} cy={Y(p.y)} r={p.focus ? 7 : 5.5} fill={p.focus ? T.primary : T.textMute} opacity={p.focus ? 1 : .75} stroke={T.surface} strokeWidth="2" />
      <text x={p.x + (p.x > W - 120 ? -10 : 10)} y={p.ly} fontSize="11.5" textAnchor={p.x > W - 120 ? "end" : "start"} fontFamily={SANS}
        fontWeight={p.focus ? 600 : 500} fill={p.focus ? T.text : T.textSec}>{p.label}</text></g>)}
  </svg>
    <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 2 }}>{yl} on the vertical axis.</div></div>;
}

function RatioModule({ sel, c, aiAvail, sampleRef, aiMessage, addLog, io }) {
  const T = useT();
  const { ids, focus, yi: I } = sel;
  const n = ids.length, np = n - 1, meta = indMeta(focus), Y = yLabel(I);
  const [selK, setSelK] = useState("roe");
  const [steps, setSteps] = useState(3);
  const [cmp, setCmp] = useState("median");
  const [csTab, setCsTab] = useState("is");
  const [sx, setSx] = useState("roic"), [sy, setSy] = useState("evEbitda");
  const [num, setNum] = useState("capex"), [den, setDen] = useState("da"), [pct, setPct] = useState(false);
  useEffect(() => { if (cmp !== "median" && !ids.includes(cmp)) setCmp("median"); }, [ids.join(), cmp]);
  const R = SUITE_R[focus][I];
  const peers = peerIds(focus, ids).map(SX.co);
  const order = [c, ...peers];
  const med = k => peerMedian(k, focus, I, ids);
  const def = rdef(selK);
  const tile = (k) => { const d = rdef(k), m = med(k), rk = ratioRank(k, focus, I, ids), vv = verdictVs(R[k], m, d.hi);
    return <Stat key={k} label={d.l} value={fmtU(R[k], d.u, d.d)} color={vv === "better" ? T.green : vv === "worse" ? T.red : T.text}
      sub={np ? `Peer median ${fmtU(m, d.u, d.d)} · rank ${rk ? rk.rank : "—"} of ${rk ? rk.of : n}${d.u === "d" ? " · days" : ""}` : "Add a peer to compare"} />; };

  const medCo = { nm: med("nm"), ato: med("ato"), emult: med("emult") };
  const cr_ = cmp === "median" ? medCo : SUITE_R[cmp][I];
  const gap = np ? dupontGap(R, cr_) : null;
  const gapMed = np ? dupontGap(R, medCo) : null;
  const cmpName = cmp === "median" ? "the peer-median company" : SX.co(cmp).short;
  const trendYears = SUITE.years.slice(1);
  const trendSeries = [
    ...order.map(x => ({ id: x.id, label: x.short, role: x.id === focus ? "focus" : "peer", values: trendYears.map((_, j) => SUITE_R[x.id][j + 1][selK]) })),
    ...(np > 1 ? [{ id: "median", label: "Peer median", role: "median", values: trendYears.map((_, j) => peerMedian(selK, focus, j + 1, ids)) }] : []),
  ];
  const mk = order.map(x => ({ c: x, m: { ...suiteMarket(x), g3: cagr(x.rev[SUITE.last - 3], x.rev[SUITE.last], 3) } }));
  const mkMed = k => SX.med(mk.filter(x => x.c.id !== focus).map(x => x.m[k]));
  const cs = order.map(x => ({ x, cs: commonSize(x, I) }));
  const gt = order.map(x => ({ x, g: growthTable(x, I) }));
  const custom = x => SUITE.years.map((_, j) => { const v = SX.div(x[num][j], x[den][j]); return SX.ok(v) ? v * (pct ? 100 : 1) : null; });
  const numL = LINE_ITEMS.find(z => z[0] === num)[1], denL = LINE_ITEMS.find(z => z[0] === den)[1];

  /* Findings, written from the numbers */
  const find = [];
  if (np) {
    const rk = ratioRank("roe", focus, I, ids);
    find.push(`${c.short} earned ${fmtU(R.roe, "%")} on shareholders' equity in ${Y}, rank ${rk ? rk.rank : "—"} of ${n} against a peer median of ${fmtU(med("roe"), "%")}.` +
      (gapMed ? (() => {
        const neg = gapMed.parts.filter(p => p.pts < -0.05), pos = gapMed.parts.filter(p => p.pts > 0.05);
        const sum = a => Math.abs(a.reduce((t, p) => t + p.pts, 0)).toFixed(1);
        if (!neg.length && !pos.length) return " Its DuPont drivers are in line with the peer-median company.";
        return gapMed.gap < 0
          ? ` Against the peer-median company the gap is ${Math.abs(gapMed.gap).toFixed(1)} points: ${neg.map(p => `${p.l.toLowerCase()} costs ${Math.abs(p.pts).toFixed(1)}`).join(" and ")}${pos.length ? `, while ${SX.list(pos.map(p => p.l.toLowerCase()))} add${pos.length === 1 ? "s" : ""} back ${sum(pos)}` : ""}.`
          : ` It is ${gapMed.gap.toFixed(1)} points ahead of the peer-median company: ${pos.map(p => `${p.l.toLowerCase()} adds ${p.pts.toFixed(1)}`).join(" and ")}${neg.length ? `, while ${SX.list(neg.map(p => p.l.toLowerCase()))} take${neg.length === 1 ? "s" : ""} away ${sum(neg)}` : ""}.`;
      })() : ""));
    find.push(`Gross margin was ${fmtU(R.gm, "%")} and EBITDA margin ${fmtU(R.em, "%")}, against peer medians of ${fmtU(med("gm"), "%")} and ${fmtU(med("em"), "%")}. In this industry gross margin moves most with ${meta.input}.`);
    const dd = [["dso", "customers take to pay"], ["dio", "stock sits"]].map(([k, t]) => ({ k, t, d: R[k] - med(k) })).filter(z => SX.ok(z.d)).sort((a, b) => b.d - a.d)[0];
    find.push(`The cash conversion cycle is ${fmtU(R.ccc, "d", 0)} days against a peer median of ${fmtU(med("ccc"), "d", 0)}.` +
      (dd && dd.d > 3 ? ` The biggest gap is how long ${dd.t}: ${fmtU(R[dd.k], "d", 0)} days against ${fmtU(med(dd.k), "d", 0)}. The Working capital workspace prices it.` : " No single component is far out of line with peers."));
  }
  const i2 = c.debt[I] - c.cash[I];
  find.push(`${i2 < 0 ? `Cash and short-term investments exceed debt by ${SX.cr(-i2)}` : `Net debt is ${SX.cr(i2)}, or ${fmtU(R.nde, "x")} EBITDA`}${R.icov != null ? `; operating profit covers interest ${fmtU(R.icov, "x")}` : ""}.`);
  find.push(`Operating cash flow was ${fmtU(R.cconv, "%", 0)} of EBITDA and free cash flow ${fmtU(R.fcfm, "%")} of revenue in ${Y}.`);
  const oo = oneOffs(c, I);
  if (oo) find.push(`Net income includes ${SX.cr(oo)} that is not explained by pre-tax profit less tax: usually discontinued operations or a one-off gain. Ratios built on net income (ROE, net margin, P/E) carry that item.`);
  const m0 = mk[0].m;
  if (np) find.push(`At ${pxFmt(c)} the shares trade on ${fmtU(m0.pe, "x", 1)} ${ylab(c, SUITE.last)} earnings and ${fmtU(m0.evEbitda, "x", 1)} EV/EBITDA, against peer medians of ${fmtU(mkMed("pe"), "x", 1)} and ${fmtU(mkMed("evEbitda"), "x", 1)}.`);

  const aiPrompt = () => {
    const line = x => { const r = SUITE_R[x.id][I];
      return `${x.short}: ROE ${fmtU(r.roe, "%")} | ROCE ${fmtU(r.roce, "%")} | ROIC ${fmtU(r.roic, "%")} | gross margin ${fmtU(r.gm, "%")} | EBITDA margin ${fmtU(r.em, "%")} | net margin ${fmtU(r.nm, "%")} | asset turnover ${fmtU(r.ato, "x")} | equity multiplier ${fmtU(r.emult, "x")} | DSO ${fmtU(r.dso, "d", 0)}d DIO ${fmtU(r.dio, "d", 0)}d DPO ${fmtU(r.dpo, "d", 0)}d | current ratio ${fmtU(r.cur, "x")} | net debt/EBITDA ${fmtU(r.nde, "x")} | interest cover ${fmtU(r.icov, "x")} | CFO/EBITDA ${fmtU(r.cconv, "%", 0)}`; };
    return `You are a sell-side equity analyst covering ${order.some(isLive) ? "listed" : "Indian"} ${meta.noun}. Write a concise ratio-analysis note on ${c.name} (${Y}, year to ${c.live ? monthFull(c.live.ye) : "31 March"}) using ONLY the figures below. Consolidated data, INR${order.some(x => isLive(x) && x.live.stmtCur !== "INR") ? " (companies reporting in other currencies translated at today's rate; ratios unaffected)" : ""}.

${order.map(line).join("\n")}

DuPont versus ${cmpName}: ${gap ? gap.parts.map(p => `${p.l} ${p.pts >= 0 ? "+" : ""}${p.pts.toFixed(1)} pts`).join(", ") : "n/a"}.
Findings already shown to the reader: ${find.join(" ")}

Respond in plain text with these headings in bold on their own lines:
**WHAT THE RATIOS SAY**
[3-4 sentences on the one or two things that matter most]
**STRENGTHS**
[3 bullets, each tied to a number]
**CONCERNS**
[3 bullets, each tied to a number]
**QUESTIONS FOR MANAGEMENT**
[3 numbered questions an analyst would ask on the earnings call]
Keep it under 280 words. Do not give a buy, sell or hold recommendation and do not predict the share price.`; };

  /* Excel: source data + a ratio sheet built from live formulas + the benchmark as values */
  const doExport = () => {
    const { sheet, at } = sourceSheet(ids);
    const j = I, jp = I - 1, A = (id, f, k) => at[id][f](k);
    const F = {
      gm: id => `${A(id, "gp", j)}/${A(id, "rev", j)}`, em: id => `${A(id, "ebitda", j)}/${A(id, "rev", j)}`, nm: id => `${A(id, "ni", j)}/${A(id, "rev", j)}`,
      roe: id => `${A(id, "ni", j)}/AVERAGE(${A(id, "eq", j)},${A(id, "eq", jp)})`,
      roce: id => `${A(id, "ebit", j)}/AVERAGE(${A(id, "ta", j)}-${A(id, "cl", j)},${A(id, "ta", jp)}-${A(id, "cl", jp)})`,
      ato: id => `${A(id, "rev", j)}/AVERAGE(${A(id, "ta", j)},${A(id, "ta", jp)})`,
      dso: id => `${A(id, "ar", j)}/${A(id, "rev", j)}*365`, dio: id => `${A(id, "inv", j)}/${A(id, "cogs", j)}*365`, dpo: id => `${A(id, "ap", j)}/${A(id, "cogs", j)}*365`,
      cur: id => `${A(id, "ca", j)}/${A(id, "cl", j)}`, de: id => `${A(id, "debt", j)}/${A(id, "eq", j)}`,
      nde: id => `(${A(id, "debt", j)}-${A(id, "cash", j)})/${A(id, "ebitda", j)}`, icov: id => `IF(${A(id, "int", j)}>0,${A(id, "ebit", j)}/${A(id, "int", j)},"n/a")`,
    };
    const fmtZ = { gm: "0.0%", em: "0.0%", nm: "0.0%", roe: "0.0%", roce: "0.0%", ato: "0.00", dso: "0.0", dio: "0.0", dpo: "0.0", cur: "0.00", de: "0.00", nde: "0.00", icov: "0.0" };
    const lbl = { gm: "Gross margin", em: "EBITDA margin", nm: "Net margin", roe: "Return on equity", roce: "ROCE", ato: "Asset turnover (x)", dso: "Receivable days",
      dio: "Inventory days", dpo: "Payable days", cur: "Current ratio (x)", de: "Debt to equity (x)", nde: "Net debt ÷ EBITDA (x)", icov: "Interest coverage (x)" };
    const rr = [[`Ratios for ${Y}, calculated with live formulas from the Data sheet`], [], [{ v: "Ratio", b: true }, ...ids.map(id => ({ v: SX.co(id).short, b: true }))]];
    Object.keys(F).forEach(k => rr.push([lbl[k], ...ids.map(id => ({ f: F[k](id), z: fmtZ[k] }))]));
    const bench = [[`Benchmark values, ${Y} (as shown in the tool)`], [], [{ v: "Ratio", b: true }, ...ids.map(id => ({ v: SX.co(id).short, b: true })), { v: "Peer median (ex focus)", b: true }]];
    RATIO_DEFS.forEach(d => bench.push([d.l, ...ids.map(id => { const v = SUITE_R[id][I][d.k]; return SX.ok(v) ? +v.toFixed(4) : null; }), (v => SX.ok(v) ? +v.toFixed(4) : null)(med(d.k))]));
    const csRows = [[`Common-size income statement, ${Y} (% of revenue)`], [], [{ v: "Line", b: true }, ...ids.map(id => ({ v: SX.co(id).short, b: true }))]];
    commonSize(c, I).is.forEach((r, k) => csRows.push([r[0], ...ids.map(id => +commonSize(SX.co(id), I).is[k][1].toFixed(2))]));
    suiteDownload(io, `${I ? SX.ind(sel.ind).name.replace(/[^A-Za-z]+/g, "_") : "ratios"}_ratio_analysis_${Y}.xlsx`, [
      { name: "Ratios (formulas)", rows: rr, widths: [28, ...ids.map(() => 14)] },
      { name: "Benchmark", rows: bench, widths: [28, ...ids.map(() => 14), 20] },
      { name: "Common size", rows: csRows, widths: [30, ...ids.map(() => 14)] }, sheet]);
  };

  const sp = SCATTER_X.find(z => z[0] === sx), sq = SCATTER_Y.find(z => z[0] === sy);
  return (<>
    <SuitePicker space="ratios" onExport={doExport} />
    <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 16 }}>
      {["roe", "nm", "roce", "ccc"].map(tile)}
    </div>

    <Card>
      <Title sub={`${Y} ratios for the ${n} compan${n === 1 ? "y" : "ies"} you picked. Green or red on the focus company means better or worse than the median of ${peerWord(np)}. Select a row to chart its trend.`}>Peer benchmark</Title>
      <Scroll min={420 + 90 * peers.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...thS(T), textAlign: "left" }}>Ratio</th>
            <th style={{ ...thS(T), ...fcS(T, true) }}>{c.short}</th>
            {np > 0 && <><th style={thS(T)}>vs median</th><th style={thS(T)}>Peer median</th><th style={thS(T)}>Rank</th></>}
            {peers.map(p => <th key={p.id} style={thS(T)}>{p.short}</th>)}
          </tr></thead>
          <tbody>{RATIO_GROUPS.map(g => <React.Fragment key={g}>
            <tr><td colSpan={5 + peers.length} style={{ padding: "14px 10px 6px", fontSize: 10.5, fontWeight: 600, letterSpacing: .6, textTransform: "uppercase", color: T.textMute }}>{g}</td></tr>
            {RATIO_DEFS.filter(d => d.g === g).map(d => { const m = med(d.k), v = R[d.k], vv = verdictVs(v, m, d.hi), rk = ratioRank(d.k, focus, I, ids), on = selK === d.k;
              return <tr key={d.k} onClick={() => setSelK(d.k)} style={{ cursor: "pointer", background: on ? T.primarySoft : "transparent" }}>
                <td style={{ ...tdL(T), fontSize: 12.5, fontWeight: on ? 600 : 400 }}>{d.l}<Help><b>{d.f}</b><br />{d.w}</Help></td>
                <td style={{ ...tdS(T), background: T.primarySoft }}>
                  <span style={{ padding: "2px 7px", borderRadius: 6, fontWeight: 600, background: vv === "better" ? T.greenTint : vv === "worse" ? T.redTint : "transparent",
                    color: vv === "better" ? T.green : vv === "worse" ? T.red : T.text }}>{fmtU(v, d.u, d.d)}</span></td>
                {np > 0 && <><td style={{ ...tdS(T), color: T.textSec }}>{fmtDelta(SX.ok(v) && SX.ok(m) ? v - m : null, d.u)}</td>
                  <td style={{ ...tdS(T), color: T.textSec }}>{fmtU(m, d.u, d.d)}</td>
                  <td style={{ ...tdS(T), color: T.textSec }}>{rk ? `${rk.rank} / ${rk.of}` : "—"}</td></>}
                {peers.map(p => <td key={p.id} style={tdS(T)}>{fmtU(SUITE_R[p.id][I][d.k], d.u, d.d)}</td>)}
              </tr>; })}
          </React.Fragment>)}</tbody>
        </table>
      </Scroll>
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 10 }}>Days are shown to one decimal. For DPO a higher figure frees cash, so it counts as better, within what suppliers will accept.</div>
    </Card>

    {np > 0 && <Card>
      <Title sub={`Each cell is coloured by rank among the ${n} companies: green for the best, red for the worst, whatever the direction of the ratio (lower is better for days and leverage). ${Y}.`}>Heatmap</Title>
      <Scroll min={160 + 74 * HEAT_KEYS.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th>{HEAT_KEYS.map(k => <th key={k} title={rdef(k).l} style={{ ...thS(T), whiteSpace: "normal", lineHeight: 1.3, minWidth: 64 }}>{rdef(k).l.replace(/ \(.*\)/, "")}</th>)}</tr></thead>
          <tbody>{order.map(x => <tr key={x.id}>
            <td style={{ ...tdL(T), fontWeight: x.id === focus ? 600 : 400 }}>{x.short}</td>
            {HEAT_KEYS.map(k => { const d = rdef(k), rk = ratioRank(k, x.id, I, ids);
              return <td key={k} style={{ ...tdS(T), background: heatBg(T, rk && rk.rank, rk ? rk.of : 0), fontWeight: x.id === focus ? 600 : 400 }}>{fmtU(SUITE_R[x.id][I][k], d.u, d.d)}</td>; })}
          </tr>)}</tbody>
        </table>
      </Scroll>
    </Card>}

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 6 }}>
        <Title sub={`${def.f}. FY2023 to FY2026.`}>Trend · {def.l}</Title>
        <div style={{ width: 230 }}><Sel v={selK} onChange={setSelK}>{RATIO_DEFS.map(d => <option key={d.k} value={d.k}>{d.l}</option>)}</Sel></div>
      </div>
      <LineLegend focusLabel={c.short} median={np > 1} />
      <SuiteLine series={trendSeries} labels={trendYears} unit={def.u} dec={def.d} />
      <Scroll min={460}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>{def.l}</th>{trendYears.map(y => <th key={y} style={thS(T)}>{y}</th>)}</tr></thead>
          <tbody>{trendSeries.map(s => <tr key={s.id}>
            <td style={{ ...tdL(T), fontWeight: s.role === "focus" ? 600 : 400, color: s.role === "peer" ? T.textSec : T.text }}>{s.label}</td>
            {s.values.map((v, j) => <td key={j} style={{ ...tdS(T), fontWeight: s.role === "focus" ? 600 : 400 }}>{fmtU(v, def.u, def.d)}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub={steps === 3 ? "Return on equity = net margin × asset turnover × equity multiplier. The product of the three always equals ROE." :
          "Five-step view: net margin is split into tax burden (net income ÷ PBT), a non-operating factor (PBT ÷ EBIT) and EBIT margin. A non-operating factor above 1 means income from investments or associates is lifting profit."}>
          DuPont analysis · {Y}</Title>
        <Segment options={[[3, "3-step"], [5, "5-step"]]} value={steps} onChange={setSteps} size="sm" />
      </div>
      <Scroll min={steps === 3 ? 520 : 680}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>ROE</th>
            {steps === 5 && <><th style={thS(T)}>Tax burden</th><th style={thS(T)}>Non-operating</th><th style={thS(T)}>EBIT margin</th></>}
            {steps === 3 && <th style={thS(T)}>Net margin</th>}
            <th style={thS(T)}>Asset turnover</th><th style={thS(T)}>Equity multiplier</th></tr></thead>
          <tbody>{order.map(x => { const r = SUITE_R[x.id][I], f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td>
              <td style={{ ...tdS(T), fontWeight: 600 }}>{fmtU(r.roe, "%")}</td>
              {steps === 5 && <><td style={tdS(T)}>{fmtU(r.taxb, "", 3)}</td><td style={tdS(T)}>{fmtU(r.intb, "", 3)}</td><td style={tdS(T)}>{fmtU(r.ebitm, "%")}</td></>}
              {steps === 3 && <td style={tdS(T)}>{fmtU(r.nm, "%", 2)}</td>}
              <td style={tdS(T)}>{fmtU(r.ato, "x", 3)}</td><td style={tdS(T)}>{fmtU(r.emult, "x", 3)}</td></tr>; })}</tbody>
        </table>
      </Scroll>
      {np > 0 && <>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Where {c.short}'s ROE gap comes from</div>
          <div style={{ width: 250 }}><Sel v={cmp} onChange={setCmp}>
            <option value="median">vs peer-median company</option>
            {peers.map(p => <option key={p.id} value={p.id}>vs {p.short}</option>)}</Sel></div>
        </div>
        {gap ? <>
          <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.6, margin: "8px 0 6px", maxWidth: 720 }}>
            {c.short}'s ROE of {minus(gap.roeF.toFixed(1))}% is {Math.abs(gap.gap).toFixed(1)} points {gap.gap < 0 ? "below" : "above"} {cmpName} ({minus(gap.roeC.toFixed(1))}%).
            Each bar shows how many points of that difference one driver accounts for; together they add up to the full gap.
            {cmp === "median" && ` The peer-median company takes the median of each driver across ${peerWord(np)}, so its ROE differs from the median ROE.`}
          </div>
          <DivBars rows={gap.parts.map(p => ({ l: p.l, v: p.pts, sub: `${c.short} is ${p.ratio.toFixed(2)}× ${cmp === "median" ? "the median" : SX.co(cmp).short}` }))}
            fmt={v => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} pts`} />
        </> : <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 8 }}>The gap can't be split when either company's net margin, turnover or equity is zero or negative.</div>}
      </>}
      <div style={{ marginTop: 22, fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>{c.short}'s DuPont drivers over time</div>
      <Scroll min={460}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Driver</th>{trendYears.map(y => <th key={y} style={thS(T)}>{y}</th>)}</tr></thead>
          <tbody>{[["Net margin", "nm", "%", 2], ["Asset turnover", "ato", "x", 3], ["Equity multiplier", "emult", "x", 3], ["Return on equity", "roe", "%", 1]].map(([l, k, u, d]) =>
            <tr key={k}><td style={{ ...tdL(T), fontWeight: k === "roe" ? 600 : 400 }}>{l}</td>
              {trendYears.map((_, j) => <td key={j} style={{ ...tdS(T), fontWeight: k === "roe" ? 600 : 400 }}>{fmtU(SUITE_R[focus][j + 1][k], u, d)}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub={csTab === "is" ? `Every line as a share of revenue, ${Y}. Shows where each rupee of sales goes, whatever the size of the company.` : `Every line as a share of total assets, ${Y}. Shows how each balance sheet is built and funded.`}>Common-size statements</Title>
        <Segment options={[["is", "Income statement"], ["bs", "Balance sheet"]]} value={csTab} onChange={setCsTab} size="sm" />
      </div>
      <Scroll min={300 + 90 * n}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>{csTab === "is" ? "% of revenue" : "% of total assets"}</th>
            {order.map(x => <th key={x.id} style={{ ...thS(T), ...fcS(T, x.id === focus) }}>{x.short}</th>)}</tr></thead>
          <tbody>{cs[0].cs[csTab].map((row, k) => <tr key={k}>
            <td style={{ ...tdL(T), fontWeight: row[2] ? 600 : 400, color: row[0].startsWith("Memo") ? T.textMute : T.text }}>{row[0]}</td>
            {cs.map(({ x, cs: s }) => <td key={x.id} style={{ ...tdS(T), fontWeight: row[2] ? 600 : 400, ...(x.id === focus ? { background: T.primarySoft } : {}) }}>{fmtU(s[csTab][k][1], "%")}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub={`One-year growth to ${Y} and compound annual growth over three years. Earnings per share use the basic share count; book value per share uses year-end shares. Blank where a start or end value is zero or negative.`}>Growth</Title>
      <Scroll min={300 + 150 * n}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Measure</th>
            {order.map(x => <th key={x.id} colSpan={2} style={{ ...thS(T), textAlign: "center", ...fcS(T, x.id === focus) }}>{x.short}</th>)}</tr>
            <tr><th style={thS(T)} />{order.map(x => <React.Fragment key={x.id}><th style={thS(T)}>1-year</th><th style={thS(T)}>3-yr CAGR</th></React.Fragment>)}</tr></thead>
          <tbody>{GROWTH_ITEMS.map(([l], k) => <tr key={l}><td style={tdL(T)}>{l}</td>
            {gt.map(({ x, g }) => <React.Fragment key={x.id}>
              <td style={{ ...tdS(T), color: SX.ok(g[k].y1) && g[k].y1 < 0 ? T.red : T.text }}>{fmtU(g[k].y1, "%")}</td>
              <td style={{ ...tdS(T), color: SX.ok(g[k].c3) && g[k].c3 < 0 ? T.red : T.text, fontWeight: 600 }}>{I >= 3 ? fmtU(g[k].c3, "%") : "—"}</td></React.Fragment>)}</tr>)}</tbody>
        </table>
      </Scroll>
      {I < 3 && <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 8 }}>Three-year growth needs a year three years earlier. Pick FY2025 or FY2026.</div>}
    </Card>

    {np > 0 && <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub={`Does the market pay more for better businesses? Prices at ${order.some(isLive) ? `${SUITE.asOf} for the verified companies and the load time for live ones` : SUITE.asOf}; latest-year financials. A company above the others with weaker quality looks expensive, below them with stronger quality looks cheap, on these two measures alone.`}>Valuation against quality</Title>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ width: 200 }}><Sel v={sx} onChange={setSx}>{SCATTER_X.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></div>
          <div style={{ width: 160 }}><Sel v={sy} onChange={setSy}>{SCATTER_Y.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></div>
        </div>
      </div>
      <Scatter pts={mk.map(({ c: x, m }) => ({ id: x.id, label: x.short, x: m[sx], y: m[sy], focus: x.id === focus }))} xl={sp[1]} yl={sq[1]} xu={sp[2]} yu={sq[2]} />
      <Scroll min={560}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>Market value</th><th style={thS(T)}>P/E</th><th style={thS(T)}>P/B</th>
            <th style={thS(T)}>EV/EBITDA</th><th style={thS(T)}>EV/sales</th><th style={thS(T)}>Dividend yield</th><th style={thS(T)}>{sp[1].replace(", 3-year CAGR", " CAGR")}</th></tr></thead>
          <tbody>{mk.map(({ c: x, m }) => { const f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td>
              <td style={tdS(T)}>{SX.cr(m.mcap)}</td><td style={tdS(T)}>{fmtU(m.pe, "x", 1)}</td><td style={tdS(T)}>{fmtU(m.pb, "x", 2)}</td>
              <td style={tdS(T)}>{fmtU(m.evEbitda, "x", 1)}</td><td style={tdS(T)}>{fmtU(m.evSales, "x", 2)}</td><td style={tdS(T)}>{fmtU(m.dy, "%", 2)}</td><td style={tdS(T)}>{fmtU(m[sx], "%")}</td></tr>; })}
            <tr><td style={{ ...tdL(T), color: T.textSec }}>Peer median</td><td style={{ ...tdS(T), color: T.textSec }}>—</td>
              {["pe", "pb", "evEbitda", "evSales", "dy", sx].map((k, j) => <td key={j} style={{ ...tdS(T), color: T.textSec }}>{fmtU(mkMed(k), k === "dy" || k === sx ? "%" : "x", k === "pb" || k === "evSales" || k === "dy" ? 2 : 1)}</td>)}</tr>
          </tbody>
        </table>
      </Scroll>
    </Card>}

    <Card>
      <Title sub="Build any ratio from the reported lines. Useful for checks the standard set leaves out, such as capex ÷ depreciation (reinvestment), dividends ÷ operating cash flow, or debt ÷ equity at any date.">Custom ratio builder</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 12, alignItems: "end", marginBottom: 14 }}>
        <Field label="Numerator"><Sel v={num} onChange={setNum}>{LINE_ITEMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>
        <Field label="Denominator"><Sel v={den} onChange={setDen}>{LINE_ITEMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>
        <Field label="Show as"><Segment options={[[false, "Times (x)"], [true, "Per cent"]]} value={pct} onChange={setPct} size="sm" /></Field>
      </div>
      <LineLegend focusLabel={c.short} median={false} />
      <SuiteLine series={order.map(x => ({ id: x.id, label: x.short, role: x.id === focus ? "focus" : "peer", values: custom(x) }))} labels={SUITE.years} unit={pct ? "%" : "x"} height={210} />
      <Scroll min={460}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>{numL} ÷ {denL}</th>{SUITE.years.map(y => <th key={y} style={thS(T)}>{y}</th>)}</tr></thead>
          <tbody>{order.map(x => <tr key={x.id}><td style={{ ...tdL(T), fontWeight: x.id === focus ? 600 : 400 }}>{x.short}</td>
            {custom(x).map((v, j) => <td key={j} style={{ ...tdS(T), fontWeight: x.id === focus ? 600 : 400 }}>{fmtU(v, pct ? "%" : "x")}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub={`Three checks on whether reported profit is backed by cash, ${Y}. Accruals are net income less operating cash flow, as a share of average assets; high positive accruals are a classic warning sign.`}>Earnings quality</Title>
      <Scroll min={560}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>Operating cash flow ÷ net income</th><th style={thS(T)}>Accruals ÷ assets</th><th style={thS(T)}>Items outside continuing profit</th></tr></thead>
          <tbody>{order.map(x => { const r = SUITE_R[x.id][I], o = oneOffs(x, I), f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td>
              <td style={{ ...tdS(T), color: SX.ok(r.cfoni) && r.cfoni < 0.7 ? T.red : T.text }}>{fmtU(r.cfoni, "x")}</td>
              <td style={{ ...tdS(T), color: SX.ok(r.accr) && r.accr > 5 ? T.red : T.text }}>{fmtU(r.accr, "%")}</td>
              <td style={tdS(T)}>{o ? SX.cr(o) : "none"}</td></tr>; })}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title>What the ratios say about {c.short}</Title>
      <Findings items={find} />
      <AiNote build={aiPrompt} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} addLog={addLog} logLabel="Ratio note written" />
    </Card>

    <SourceFigures c={c} />
  </>);
}

/* Five years of the source figures behind every ratio. */
function SourceFigures({ c }) {
  const T = useT();
  return <Card>
    <details>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.text }}>Source figures · {c.short}, FY2022–FY2026 (₹ crore)</summary>
      <Scroll min={560}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Line item</th>{SUITE.years.map(y => <th key={y} style={thS(T)}>{y}</th>)}</tr></thead>
          <tbody>{SRC_ROWS.map(([l, f]) => <tr key={f}><td style={tdL(T)}>{l}</td>
            {c[f].map((v, j) => <td key={j} style={tdS(T)}>{SX.ok(v) ? minus((v / 10).toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 })) : "—"}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </details>
  </Card>;
}
