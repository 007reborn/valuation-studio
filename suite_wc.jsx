/* ═══════════════ WORKING CAPITAL ═══════════════ */
function WcModule({ sel, c, addLog, io }) {
  const T = useT();
  const { ids, focus, yi: I } = sel;
  const n = ids.length, np = n - 1, Y = yLabel(I), meta = indMeta(focus);
  const now = wcDays(c, I);
  const pm = k => peerMedian(k, focus, I, ids);
  const peerDays = peerIds(focus, ids).map(id => wcDays(SX.co(id), I));
  const own = SUITE.years.map((_, j) => wcDays(c, j));
  const q = (k, hi) => SX.pct(peerDays.map(p => p[k]), hi ? 0.75 : 0.25);
  const presets = {
    median: { l: "Peer median", t: np ? { dso: Math.min(now.dso, pm("dso")), dio: Math.min(now.dio, pm("dio")), dpo: Math.max(now.dpo, pm("dpo")) } : { ...now } },
    quart: { l: "Top quartile", t: np ? { dso: Math.min(now.dso, q("dso")), dio: Math.min(now.dio, q("dio")), dpo: Math.max(now.dpo, q("dpo", true)) } : { ...now } },
    best: { l: "Best peer", t: np ? { dso: Math.min(now.dso, ...peerDays.map(p => p.dso)), dio: Math.min(now.dio, ...peerDays.map(p => p.dio)), dpo: Math.max(now.dpo, ...peerDays.map(p => p.dpo)) } : { ...now } },
    own: { l: "Own best year", t: { dso: Math.min(...own.map(p => p.dso)), dio: Math.min(...own.map(p => p.dio)), dpo: Math.max(...own.map(p => p.dpo)) } },
    current: { l: "Today", t: { dso: now.dso, dio: now.dio, dpo: now.dpo } },
  };
  const r1 = v => String(Math.round(v * 10) / 10);
  const mkT = p => ({ dso: r1(presets[p].t.dso), dio: r1(presets[p].t.dio), dpo: r1(presets[p].t.dpo) });
  const start = np ? "median" : "own";
  const [preset, setPreset] = useState(start);
  const [tIn, setTIn] = useState(() => mkT(start));
  const [exact, setExact] = useState(() => ({ ...presets[start].t }));   // presets keep full precision until a field is edited
  const [rate, setRate] = useState("8.5"), [wacc, setWacc] = useState("12.0");
  const [phase, setPhase] = useState(2), [g, setG] = useState("12");
  useEffect(() => { setPreset(start); setTIn(mkT(start)); setExact({ ...presets[start].t }); }, [focus, I, ids.join()]);
  const pick = p => { setPreset(p); setTIn(mkT(p)); setExact({ ...presets[p].t }); addLog && addLog("Working-capital target", `${c.short}: ${presets[p].l}`); };
  const t = ["dso", "dio", "dpo"].reduce((o, k) => { o[k] = exact[k] != null ? exact[k] : toN(tIn[k], now[k]); return o; }, {});
  const res = wcRelease(c, I, t);
  const rt = toN(rate, 8.5), wc = toN(wacc, 12);
  const R = SUITE_R[focus][I];
  const ceAvg = ((c.ta[I] - c.cl[I]) + (c.ta[I - 1] - c.cl[I - 1])) / 2;
  const roceAfter = SX.div(c.ebit[I], ceAvg - res.total) * 100;
  const pal = seriesPal(T);
  const order = [c, ...peerIds(focus, ids).map(SX.co)];
  const bars = order.map(x => ({ x, d: wcDays(x, I) }));
  const maxR = Math.max(...bars.map(b => Math.max(0, b.d.dso) + Math.max(0, b.d.dio)), 1), maxL = Math.max(...bars.map(b => Math.max(0, b.d.dpo)), 1);
  const span = maxR + maxL, zeroPct = maxL / span * 100;
  const set = (k, v) => { setPreset("custom"); setTIn(o => ({ ...o, [k]: v })); setExact(o => ({ ...o, [k]: null })); };
  const bigLever = [...res.lev].sort((a, b) => b.cash - a.cash)[0];
  const ph = Array.from({ length: phase }, (_, k) => ({ y: `Year ${k + 1}`, rel: res.total / phase, cum: res.total * (k + 1) / phase }));
  const gn = wcGrowthNeed(c, I, toN(g, 0), t);
  const cccSeries = [...order.map(x => ({ id: x.id, label: x.short, role: x.id === focus ? "focus" : "peer", values: SUITE.years.map((_, j) => wcDays(x, j).ccc) })),
    ...(np > 1 ? [{ id: "median", label: "Peer median", role: "median", values: SUITE.years.map((_, j) => peerMedian("ccc", focus, j, ids)) }] : [])];

  const doExport = () => {
    const { sheet } = sourceSheet(ids);
    const r2 = v => SX.ok(v) ? +v.toFixed(2) : null;
    const op = [[`Working-capital optimiser · ${c.short}, ${Y} (₹ crore)`], [], ["Lever", "Days today", "Target days", "₹ crore per day", "Cash released (₹ crore)"].map(v => ({ v, b: true }))];
    res.lev.forEach((l, k) => { const rr = op.length + 1; op.push([l.l, r2(l.from), r2(l.to), r2(l.perDay / 10), { f: k === 2 ? `(C${rr}-B${rr})*D${rr}` : `(B${rr}-C${rr})*D${rr}`, z: "#,##0.0" }]); });
    op.push([{ v: "Total", b: true }, null, null, null, { f: "SUM(E4:E6)", z: "#,##0.0" }]);
    op.push([]); op.push(["Interest rate on cash (%)", rt]); op.push(["Yearly interest value (₹ crore)", { f: "E7*B9/100", z: "#,##0.0" }]);
    op.push(["Cost of capital (%)", wc]); op.push(["Yearly economic value (₹ crore)", { f: "E7*B11/100", z: "#,##0.0" }]);
    const dd = [[`Working-capital days by company, ${Y}`], [], ["Company", "DSO", "DIO", "DPO", "Cash cycle", "Trade WC % revenue", "₹ cr per DSO day", "₹ cr per DIO/DPO day"].map(v => ({ v, b: true }))];
    order.forEach(x => { const d = wcDays(x, I); dd.push([x.short, r2(d.dso), r2(d.dio), r2(d.dpo), r2(d.ccc), r2(SUITE_R[x.id][I].nwcp), r2(x.rev[I] / 3650), r2(x.cogs[I] / 3650)]); });
    suiteDownload(io, `working_capital_${c.ticker}_${Y}.xlsx`, [{ name: "Optimiser", rows: op, widths: [32, 12, 12, 16, 22] }, { name: "Days", rows: dd, widths: [18, 9, 9, 9, 11, 18, 16, 20] }, sheet]);
  };

  return (<>
    <SuitePicker space="wc" onExport={doExport} />
    <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 16 }}>
      <Stat label="Cash conversion cycle" value={`${fmtU(now.ccc, "d")} d`} sub={`${yLabel(I - 1)} ${fmtU(own[I - 1].ccc, "d")} d${np ? ` · peer median ${fmtU(pm("ccc"), "d")} d` : ""}`} />
      <Stat label="Receivable days (DSO)" value={`${fmtU(now.dso, "d")} d`} color={verdictVs(now.dso, pm("dso"), false) === "worse" ? T.red : T.text} sub={np ? `Peer median ${fmtU(pm("dso"), "d")} d` : Y} />
      <Stat label="Inventory days (DIO)" value={`${fmtU(now.dio, "d")} d`} color={verdictVs(now.dio, pm("dio"), false) === "worse" ? T.red : T.text} sub={np ? `Peer median ${fmtU(pm("dio"), "d")} d` : Y} />
      <Stat label="Payable days (DPO)" value={`${fmtU(now.dpo, "d")} d`} sub={np ? `Peer median ${fmtU(pm("dpo"), "d")} d` : Y} />
      <Stat label="Trade working capital" value={fmtU(R.nwcp, "%")} sub={`of revenue · ${SX.cr(res.nwc)}`} />
    </div>

    <Card>
      <Title sub={`Inventory and receivable days push the cycle out to the right; payable days pull it back to the left. The figure on the right is the net cash conversion cycle. ${Y}.`}>Cash conversion cycle by company</Title>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: T.textSec, marginBottom: 12 }}>
        {[["DIO · inventory", pal[1]], ["DSO · receivables", pal[0]], ["DPO · payables", pal[2]]].map(([l, col]) =>
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: col }} />{l}</span>)}
      </div>
      <Scroll min={520}>
        {bars.map(({ x, d }) => { const f = x.id === focus, pct = v => Math.max(0, v) / span * 100;
          return <div key={x.id} style={{ display: "grid", gridTemplateColumns: "104px 1fr 70px", gap: 12, alignItems: "center", padding: "7px 0" }}>
            <div style={{ fontSize: 12.5, fontWeight: f ? 600 : 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.name}>{x.short}</div>
            <div style={{ position: "relative", height: 20 }}>
              <div style={{ position: "absolute", left: `${zeroPct}%`, top: -5, bottom: -5, width: 1, background: T.borderStrong }} />
              <div title={`DPO ${d.dpo.toFixed(1)} days`} style={{ position: "absolute", top: 3, height: 14, right: `${100 - zeroPct}%`, width: `${pct(d.dpo)}%`, background: pal[2], borderRadius: "4px 0 0 4px", opacity: f ? 1 : .55 }} />
              <div title={`DIO ${d.dio.toFixed(1)} days`} style={{ position: "absolute", top: 3, height: 14, left: `${zeroPct}%`, width: `calc(${pct(d.dio)}% - 2px)`, background: pal[1], opacity: f ? 1 : .55 }} />
              <div title={`DSO ${d.dso.toFixed(1)} days`} style={{ position: "absolute", top: 3, height: 14, left: `${zeroPct + pct(d.dio)}%`, width: `${pct(d.dso)}%`, background: pal[0], borderRadius: "0 4px 4px 0", opacity: f ? 1 : .55 }} />
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", fontWeight: f ? 700 : 500, color: T.text }}>{minus(d.ccc.toFixed(0))} d</div>
          </div>; })}
      </Scroll>
      <Scroll min={560}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>{Y}</th>{bars.map(({ x }) => <th key={x.id} style={{ ...thS(T), ...fcS(T, x.id === focus) }}>{x.short}</th>)}</tr></thead>
          <tbody>{[["Inventory days", "dio"], ["Receivable days", "dso"], ["Payable days", "dpo"], ["Cash cycle (days)", "ccc"]].map(([l, k]) => <tr key={k}>
            <td style={{ ...tdL(T), fontWeight: k === "ccc" ? 600 : 400 }}>{l}</td>
            {bars.map(({ x, d }) => <td key={x.id} style={{ ...tdS(T), fontWeight: k === "ccc" || x.id === focus ? 600 : 400 }}>{minus(d[k].toFixed(1))}</td>)}</tr>)}
            <tr><td style={tdL(T)}>Trade working capital % revenue</td>{bars.map(({ x }) => <td key={x.id} style={tdS(T)}>{fmtU(SUITE_R[x.id][I].nwcp, "%")}</td>)}</tr>
            <tr><td style={tdL(T)}>Value of one receivable day</td>{bars.map(({ x }) => <td key={x.id} style={tdS(T)}>{SX.cr(x.rev[I] / 365, 1)}</td>)}</tr>
            <tr><td style={{ ...tdL(T), borderBottom: "none" }}>Value of one inventory or payable day</td>{bars.map(({ x }) => <td key={x.id} style={{ ...tdS(T), borderBottom: "none" }}>{SX.cr(x.cogs[I] / 365, 1)}</td>)}</tr>
          </tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub="Cash conversion cycle in days, FY2022–FY2026. A rising line means more cash tied up per rupee of sales.">Cash cycle trend</Title>
      <LineLegend focusLabel={c.short} median={np > 1} />
      <SuiteLine series={cccSeries} labels={SUITE.years} unit="d" dec={0} />
    </Card>

    <Card>
      <Title sub={`Set a target for each lever. Cash released = change in days × a day of revenue (receivables) or of cost of revenue (inventory and payables), on ${Y} figures for ${c.short}. Top quartile is the best quarter of the peers you picked.`}>Optimiser · {c.short}</Title>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.textSec, marginRight: 4 }}>Start from</span>
        <div style={{ maxWidth: "100%", overflowX: "auto" }}><Segment options={(np ? [["median", "Peer median"], ["quart", "Top quartile"], ["best", "Best peer"]] : []).concat([["own", "Own best year"], ["current", "Today"]])} value={preset} onChange={pick} size="sm" /></div>
        {preset === "custom" && <Chip kind="primary">Custom targets</Chip>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 18 }}>
        <Field label="Target DSO (days)" help={`Today ${now.dso.toFixed(1)}.${np ? ` Peer median ${pm("dso").toFixed(1)}.` : ""} One day is worth ${SX.cr(c.rev[I] / 365, 1)}.`}><NI v={tIn.dso} onChange={v => set("dso", v)} /></Field>
        <Field label="Target DIO (days)" help={`Today ${now.dio.toFixed(1)}.${np ? ` Peer median ${pm("dio").toFixed(1)}.` : ""} One day is worth ${SX.cr(c.cogs[I] / 365, 1)}.`}><NI v={tIn.dio} onChange={v => set("dio", v)} /></Field>
        <Field label="Target DPO (days)" help={`Today ${now.dpo.toFixed(1)}.${np ? ` Peer median ${pm("dpo").toFixed(1)}.` : ""} One day is worth ${SX.cr(c.cogs[I] / 365, 1)}.`}><NI v={tIn.dpo} onChange={v => set("dpo", v)} /></Field>
        <Field label="Interest rate on cash (%)" help="Used to value the cash released: the interest saved on borrowings or earned on deposits."><NI v={rate} onChange={setRate} /></Field>
        <Field label="Cost of capital (%)" help="For the economic value of the cash: what investors require on the capital it frees. Use the WACC from the DCF."><NI v={wacc} onChange={setWacc} /></Field>
      </div>
      <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat label="Cash released" big value={SX.cr(res.total)} color={res.total >= 0 ? T.green : T.red} sub={`${fmtU(res.cccNow, "d", 0)} → ${fmtU(res.cccTarget, "d", 0)} days of cash cycle`} />
        <Stat label="Yearly interest value" value={SX.cr(res.total * rt / 100, 1)} sub={`At ${rt}% a year`} />
        <Stat label="Yearly economic value" value={SX.cr(res.total * wc / 100, 1)} sub={`At a ${wc}% cost of capital`} />
        <Stat label={`Against ${Y} net income`} value={c.ni[I] > 0 ? `${(res.total / c.ni[I] * 100).toFixed(0)}%` : "—"} sub={`Net income ${SX.cr(c.ni[I])}`} />
        <Stat label="ROCE if the cash repays capital" value={fmtU(roceAfter, "%")} sub={`Today ${fmtU(R.roce, "%")} · same EBIT, less capital`} />
      </div>
      <DivBars rows={res.lev.map(l => ({ l: l.l, v: l.cash / 10, sub: `${fmtU(l.from, "d")} → ${fmtU(l.to, "d")} days · ${SX.cr(l.perDay, 1)} a day` }))}
        fmt={v => `${v >= 0 ? "+" : "−"}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`} />
      <div style={{ display: "grid", gap: 8, marginTop: 16, fontSize: 12, color: T.textSec, lineHeight: 1.6 }}>
        {res.total > 0 && <div>The largest lever is <b style={{ color: T.text }}>{bigLever.n}</b>, worth {SX.cr(bigLever.cash)}. The total equals {(res.total / c.mcap * 100).toFixed(1)}% of {c.short}'s market value and {c.debt[I] > 0 ? `${(res.total / c.debt[I] * 100).toFixed(0)}% of its debt` : "comes on top of a debt-free balance sheet"}.</div>}
        {t.dpo > 45 && <div style={{ background: T.amberTint, color: T.text, borderRadius: 10, padding: "10px 12px" }}>
          <b>Supplier terms.</b> The target keeps payable days at {t.dpo.toFixed(1)}. Micro and small suppliers must be paid within 45 days (MSMED Act, section 15), and late payments to them are not tax-deductible until paid (Income-tax Act, section 43B(h)). Check how much of the payables book is owed to MSMEs before relying on payable days above 45.</div>}
        {t.dio < now.dio - 15 && <div>Cutting inventory days sharply can hurt service levels and leaves less cover against swings in {meta.input}.</div>}
        {t.dso < now.dso - 15 && <div>Faster collection usually needs tighter credit to {meta.channel}, or channel financing, which can cost volume. Price the discount against the interest value above.</div>}
      </div>
    </Card>

    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 22 }}>
        <div>
          <Title sub="Spread the improvement over one to three years, in equal steps. Interest value builds as the cash comes in.">Phasing the release</Title>
          <div style={{ marginBottom: 12 }}><Segment options={[[1, "1 year"], [2, "2 years"], [3, "3 years"]]} value={phase} onChange={setPhase} size="sm" /></div>
          <Scroll min={400}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Period</th><th style={thS(T)}>Released</th><th style={thS(T)}>Cumulative</th><th style={thS(T)}>Interest that year</th></tr></thead>
            <tbody>{ph.map((p, k) => <tr key={k}><td style={tdL(T)}>{p.y}</td><td style={tdS(T)}>{SX.cr(p.rel)}</td><td style={tdS(T)}>{SX.cr(p.cum)}</td><td style={tdS(T)}>{SX.cr(p.cum * rt / 100, 1)}</td></tr>)}</tbody>
          </table></Scroll>
        </div>
        <div>
          <Title sub="Growth ties up cash too. Extra trade working capital needed if revenue and cost of revenue grow by the rate below, at today's days and at the target days.">Funding growth</Title>
          <div style={{ maxWidth: 200, marginBottom: 12 }}><Field label="Revenue growth (%)"><NI v={g} onChange={setG} /></Field></div>
          <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
            <Stat label="At today's days" value={SX.cr(gn.today)} sub="extra working capital" />
            <Stat label="At the target days" value={SX.cr(gn.target)} color={gn.target < gn.today ? T.green : T.text} sub={gn.target < 0 ? "growth funds itself" : `saves ${SX.cr(gn.today - gn.target)}`} />
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <Title sub={`${c.short}'s own working-capital days, year-end balances.`}>Five-year record · {c.short}</Title>
      <Scroll min={520}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Days</th>{SUITE.years.map(y => <th key={y} style={thS(T)}>{y}</th>)}<th style={thS(T)}>Change since FY2022</th></tr></thead>
          <tbody>{[["Receivable days (DSO)", "dso"], ["Inventory days (DIO)", "dio"], ["Payable days (DPO)", "dpo"], ["Cash conversion cycle", "ccc"]].map(([l, k]) => <tr key={k}>
            <td style={{ ...tdL(T), fontWeight: k === "ccc" ? 600 : 400 }}>{l}</td>
            {own.map((d, j) => <td key={j} style={{ ...tdS(T), fontWeight: k === "ccc" ? 600 : 400, background: j === I ? T.primarySoft : "transparent" }}>{minus(d[k].toFixed(1))}</td>)}
            <td style={{ ...tdS(T), color: T.textSec }}>{fmtDelta(own[SUITE.last][k] - own[0][k], "d")}</td></tr>)}</tbody>
        </table>
      </Scroll>
    </Card>
  </>);
}
