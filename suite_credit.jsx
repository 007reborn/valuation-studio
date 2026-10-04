/* ═══════════════ CREDIT RISK ═══════════════ */
const STRESS_PRESETS = { mild: ["Mild", 10, 100], severe: ["Severe", 25, 300], crisis: ["Crisis", 40, 500] };
function CreditModule({ sel, c, aiAvail, sampleRef, aiMessage, addLog, io }) {
  const T = useT();
  const { ids, focus, yi: I } = sel;
  const n = ids.length, np = n - 1, Y = yLabel(I), latest = I === SUITE.last, meta = indMeta(focus);
  const [wp, setWp] = useState("balanced");
  const [w, setW] = useState(() => ({ ...WEIGHT_PRESETS.balanced.w }));
  const [editW, setEditW] = useState(false);
  const [sp, setSp] = useState("severe");
  const [cut, setCut] = useState("25"), [bps, setBps] = useState("300");
  const [hNd, setHNd] = useState("2.5"), [hIc, setHIc] = useState("3.0"), [hR, setHR] = useState("9.0");
  const pickW = k => { setWp(k); setW({ ...WEIGHT_PRESETS[k].w }); addLog && addLog("Scorecard weights", WEIGHT_PRESETS[k].l); };
  const pickS = k => { setSp(k); setCut(String(STRESS_PRESETS[k][1])); setBps(String(STRESS_PRESETS[k][2])); };
  const order = [c, ...peerIds(focus, ids).map(SX.co)];
  const cs = Object.fromEntries(order.map(x => [x.id, creditScore(x, I, w)]));
  const al = altman(c, I, latest ? c.mcap : null), pf = piotroski(c, I), bn = beneish(c, I), zm = zmijewski(c, I);
  const wTotal = SCORE_FACTORS.reduce((s, f) => s + (+w[f.k] || 0), 0);
  const me = cs[focus];
  const st = Object.fromEntries(order.map(x => [x.id, creditStress(x, I, toN(cut, 0), toN(bps, 0), w)]));
  const hd = Object.fromEntries(order.map(x => [x.id, debtHeadroom(x, I, toN(hNd, 2.5), toN(hIc, 3), toN(hR, 9))]));
  const emsSeries = order.map(x => ({ id: x.id, label: x.short, role: x.id === focus ? "focus" : "peer", values: SUITE.years.map((_, j) => altman(x, j).ems) }));
  const zoneFill = (a) => ({ safe: T.greenTint, grey: T.amberTint, distress: T.redTint }[a]);
  const worstF = [...me.rows].filter(r => SX.ok(r.s)).sort((a, b) => a.s - b.s)[0];
  const warn = warningChecks(c, I), fails = warn.filter(x => !x.ok);
  const R = SUITE_R[focus][I];
  const find = [
    `${c.short} scores ${me.score.toFixed(0)} out of 100 on the scorecard (${WEIGHT_PRESETS[wp] ? WEIGHT_PRESETS[wp].l.toLowerCase() : "custom"} weights), which puts it in the "${me.band[0].toLowerCase()}" band.${worstF ? ` Its weakest factor is ${worstF.l.toLowerCase()} (${fmtU(worstF.v, worstF.u)} scores ${worstF.s.toFixed(0)}).` : ""}`,
    `Under the stress case (EBITDA down ${toN(cut, 0)}%, rates up ${toN(bps, 0)} basis points) the score moves to ${SX.ok(st[focus].score) ? st[focus].score.toFixed(0) : "—"} and interest cover to ${st[focus].m.icov == null ? (st[focus].intr > 0 ? "below zero" : "not applicable") : fmtU(st[focus].m.icov, "x")}.`,
    `The Altman emerging-market score is ${minus(al.ems.toFixed(2))}, the level Altman maps to a ${al.rating} bond rating. It is a statistical equivalent, not a rating from an agency.`,
    latest && al.z != null ? `The original market-based Z-score is ${minus(al.z.toFixed(2))}, but ${((0.6 * al.x4m) / al.z * 100).toFixed(0)}% of it comes from the market value of equity. Without that term the score would be ${minus(al.zNoMkt.toFixed(2))}, which is why the book-value EM score is the better guide here.` : null,
    pf ? `The Piotroski F-score is ${pf.score} of 9 for ${Y}${pf.score >= 7 ? ", a strong reading" : pf.score <= 3 ? ", a weak reading" : ""}. ${(() => { const f = pf.signals.filter(s => !s.ok).map(s => s.n); return f.length ? `Tests failed: ${SX.list(f)}.` : "Every test passed."; })()}` : null,
    bn ? `The Beneish M-score is ${minus(bn.m.toFixed(2))}: ${bn.zone === "flag" ? "above the −1.78 cut-off Beneish linked to past manipulators, so the accounts deserve a closer read" : bn.zone === "watch" ? "between −2.22 and −1.78, a grey area worth watching" : "comfortably below the −2.22 line, no sign of the patterns the model looks for"}.` : null,
    `Zmijewski's model puts the probability of financial distress at ${(zm.p * 100).toFixed(1)}%${zm.p >= 0.5 ? ", above the 50% cut-off" : ""}.`,
    `${warn.length - fails.length} of ${warn.length} early-warning checks pass.${fails.length ? ` Failed: ${SX.list(fails.map(f => f.l.toLowerCase()))}.` : ""}`,
  ];
  const aiPrompt = () => `You are a credit analyst at ${c.live && c.live.country !== "IN" ? "a bank" : "an Indian bank"} covering ${meta.noun}. Write a short credit note on ${c.name} as a borrower or trade counterparty, using ONLY these ${Y} figures (consolidated, INR crore).

Scorecard (0-100, higher is safer): ${me.rows.map(r => `${r.l} ${fmtU(r.v, r.u)} → ${SX.ok(r.s) ? r.s.toFixed(0) : "n/a"} (weight ${r.w})`).join("; ")}. Weighted score ${me.score.toFixed(0)}, band ${me.band[0]}.
Stress (EBITDA −${toN(cut, 0)}%, rates +${toN(bps, 0)}bp): score ${SX.ok(st[focus].score) ? st[focus].score.toFixed(0) : "n/a"}.
Altman EM score ${al.ems.toFixed(2)} (≈${al.rating}). Piotroski ${pf ? pf.score + "/9" : "n/a"}. Beneish M ${bn ? bn.m.toFixed(2) : "n/a"}. Zmijewski distress probability ${(zm.p * 100).toFixed(1)}%.
Debt ${SX.cr(c.debt[I])}, cash and short-term investments ${SX.cr(c.cash[I])}, EBITDA ${SX.cr(c.ebitda[I])}, operating cash flow ${SX.cr(c.cfo[I])}, capex ${SX.cr(c.capex[I])}.
Early-warning checks failed: ${fails.map(f => f.l).join(", ") || "none"}.
Peers' weighted scores: ${peerIds(focus, ids).map(id => `${SX.co(id).short} ${cs[id].score.toFixed(0)}`).join(", ") || "none selected"}.

Respond in plain text with bold headings on their own lines:
**CREDIT VIEW**
[2-3 sentences]
**KEY STRENGTHS**
[2-3 bullets]
**KEY RISKS**
[2-3 bullets]
**COVENANTS OR TRIGGERS TO MONITOR**
[3 bullets with a numeric trigger each]
Under 220 words. This is an educational exercise: do not present it as a formal rating.`;

  const doExport = () => {
    const { sheet } = sourceSheet(ids);
    const r2 = v => SX.ok(v) ? +v.toFixed(4) : null;
    const sc = [[`Credit scorecard, ${Y} (weights: ${WEIGHT_PRESETS[wp] ? WEIGHT_PRESETS[wp].l : "custom"})`], [],
      [{ v: "Factor", b: true }, { v: "Weight", b: true }, ...order.map(x => ({ v: `${x.short} value`, b: true })), ...order.map(x => ({ v: `${x.short} score`, b: true }))]];
    SCORE_FACTORS.forEach(f => sc.push([f.l, +w[f.k] || 0, ...order.map(x => r2(cs[x.id].rows.find(z => z.k === f.k).v)), ...order.map(x => r2(cs[x.id].rows.find(z => z.k === f.k).s))]));
    sc.push(["Weighted score", null, ...order.map(() => null), ...order.map(x => r2(cs[x.id].score))]);
    const ss = [[`Stress test: EBITDA −${toN(cut, 0)}%, rates +${toN(bps, 0)} bp`], [], ["Company", "Score now", "Score stressed", "Interest cover stressed", "Net debt ÷ EBITDA stressed", "Debt headroom (₹ crore)", "Binding limit", "Synthetic rating", "Altman EM", "Beneish M", "Zmijewski P"].map(v => ({ v, b: true }))];
    order.forEach(x => { const b = beneish(x, I); ss.push([x.short, r2(cs[x.id].score), r2(st[x.id].score), r2(st[x.id].m.icov), r2(st[x.id].m.nde), r2(hd[x.id].cap / 10), hd[x.id].binding,
      synthRating(SUITE_R[x.id][I].icov, !(x.int[I] > 0)), r2(altman(x, I).ems), b ? r2(b.m) : null, r2(zmijewski(x, I).p)]); });
    const bb = [[`Beneish M-score components, ${c.short}, ${Y}`], [], ["Index", "Value", "Coefficient", "Contribution"].map(v => ({ v, b: true }))];
    if (bn) { BENEISH_ROWS.forEach(([k, l, co]) => bb.push([l, r2(bn[k]), co, r2(bn[k] * co)])); bb.push(["Constant", null, null, -4.84]); bb.push([{ v: "M-score", b: true }, null, null, r2(bn.m)]); }
    suiteDownload(io, `credit_risk_${c.ticker}_${Y}.xlsx`, [{ name: "Scorecard", rows: sc, widths: [30, 9, ...order.map(() => 13), ...order.map(() => 13)] },
      { name: "Stress & headroom", rows: ss, widths: [18, 11, 13, 13, 15, 16, 13, 13, 11, 11, 11] }, { name: "Beneish", rows: bb, widths: [34, 10, 12, 13] }, sheet]);
  };

  return (<>
    <SuitePicker space="credit" onExport={doExport} />
    <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 16 }}>
      <Stat label="Scorecard (0–100)" value={me.score.toFixed(0)} big color={tone(T, me.band[1] === "primary" ? "neutral" : me.band[1])} sub={`${me.band[0]}${np ? ` · peers ${peerIds(focus, ids).map(id => cs[id].score.toFixed(0)).join(", ")}` : ""}`} />
      <Stat label="Altman EM score" value={minus(al.ems.toFixed(2))} sub={`Rating equivalent ${al.rating} · ${al.zone}`} />
      <Stat label="Interest coverage" value={R.icov == null ? (c.int[I] > 0 ? "< 0" : "no debt cost") : fmtU(R.icov, "x")} sub={`Synthetic rating ${synthRating(R.icov, !(c.int[I] > 0))}`} />
      <Stat label="Piotroski F-score" value={pf ? `${pf.score} / 9` : "—"} sub={pf ? (pf.score >= 7 ? "Strong" : pf.score >= 4 ? "Middling" : "Weak") : "Needs FY2024 or later"} />
      <Stat label="Beneish M-score" value={bn ? minus(bn.m.toFixed(2)) : "—"} color={bn && bn.zone === "flag" ? T.red : bn && bn.zone === "watch" ? T.amber : T.text} sub={bn ? { flag: "Above −1.78: review", watch: "Grey zone", clear: "Below −2.22: clear" }[bn.zone] : ""} />
    </div>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub="Each factor is scored 0–100 along a straight line between anchor points, then weighted. Bands: 80+ low risk, 65–80 moderate, 50–65 elevated, below 50 high. Weight sets: a lender cares most about debt service, a supplier about liquidity. An internal screen, not an agency rating.">Credit scorecard · {Y}</Title>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Segment options={Object.entries(WEIGHT_PRESETS).map(([k, v]) => [k, v.l.split(":")[0]])} value={wp} onChange={pickW} size="sm" />
          <Btn size="sm" variant={editW ? "tonal" : "outline"} onClick={() => setEditW(v => !v)}>{editW ? "Done" : "Custom weights"}</Btn>
        </div>
      </div>
      <Scroll min={300 + 110 * n}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Factor</th><th style={thS(T)}>Weight</th>
            {order.map(x => <th key={x.id} style={{ ...thS(T), ...fcS(T, x.id === focus) }}>{x.short}</th>)}</tr></thead>
          <tbody>
            {SCORE_FACTORS.map(f => <tr key={f.k}>
              <td style={{ ...tdL(T), fontSize: 12.5 }}>{f.l}<Help><b>{f.note}.</b><br />Anchors: {f.pts.map(([x, s]) => `${x}${f.u} → ${s}`).join(", ")}.</Help></td>
              <td style={tdS(T)}>{editW ? <div style={{ width: 64, marginLeft: "auto" }}><NI v={w[f.k]} onChange={v => { setWp("custom"); setW(o => ({ ...o, [f.k]: v })); }} /></div> : `${((+w[f.k] || 0) / (wTotal || 1) * 100).toFixed(0)}%`}</td>
              {order.map(x => { const r = cs[x.id].rows.find(z => z.k === f.k);
                return <td key={x.id} style={{ ...tdS(T), ...(x.id === focus ? { background: T.primarySoft } : {}) }}>
                  <div>{f.k === "cfod" && !(x.debt[I] > 0) ? "no debt" : f.k === "icov" && r.v == null ? (x.int[I] > 0 ? "EBIT < 0" : "no interest") : fmtU(r.v, f.u)}</div><div style={{ marginTop: 4 }}><Meter s={r.s} /></div></td>; })}
            </tr>)}
            <tr><td style={{ ...tdL(T), fontWeight: 600 }}>Weighted score</td><td style={tdS(T)}>{wTotal ? "100%" : "—"}</td>
              {order.map(x => <td key={x.id} style={{ ...tdS(T), fontWeight: 600, ...(x.id === focus ? { background: T.primarySoft } : {}) }}>{SX.ok(cs[x.id].score) ? cs[x.id].score.toFixed(1) : "—"}</td>)}</tr>
            <tr><td style={{ ...tdL(T), fontWeight: 600, borderBottom: "none" }}>Risk band</td><td style={{ ...tdS(T), borderBottom: "none" }} />
              {order.map(x => <td key={x.id} style={{ ...tdS(T), borderBottom: "none", ...(x.id === focus ? { background: T.primarySoft } : {}) }}>
                {cs[x.id].band && <Chip kind={cs[x.id].band[1]}>{cs[x.id].band[0]}</Chip>}</td>)}</tr>
          </tbody>
        </table>
      </Scroll>
      {editW && Math.abs(wTotal - 100) > 0.01 && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 10 }}>Weights add up to {wTotal}. They are rescaled to 100% for the score.</div>}
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub="EBITDA falls by the chosen share with depreciation unchanged, and the interest rate on all debt rises by the chosen amount. Operating cash flow falls by the same rupee amounts. The scorecard is re-run on the stressed figures with the weights above.">Stress test</Title>
        <Segment options={Object.entries(STRESS_PRESETS).map(([k, v]) => [k, v[0]])} value={sp} onChange={pickS} size="sm" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 12, marginBottom: 14, maxWidth: 420 }}>
        <Field label="EBITDA fall (%)"><NI v={cut} onChange={v => { setSp("custom"); setCut(v); }} /></Field>
        <Field label="Rate rise (basis points)"><NI v={bps} onChange={v => { setSp("custom"); setBps(v); }} /></Field>
      </div>
      <Scroll min={640}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>Score now</th><th style={thS(T)}>Stressed</th><th style={thS(T)}>Band</th>
            <th style={thS(T)}>Interest cover</th><th style={thS(T)}>Net debt ÷ EBITDA</th><th style={thS(T)}>Altman EM</th></tr></thead>
          <tbody>{order.map(x => { const s = st[x.id], f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td>
              <td style={tdS(T)}><Meter s={cs[x.id].score} /></td><td style={tdS(T)}><Meter s={s.score} /></td>
              <td style={tdS(T)}>{s.band && <Chip kind={s.band[1]}>{s.band[0]}</Chip>}</td>
              <td style={tdS(T)}>{s.m.icov == null ? (s.intr > 0 ? "EBIT < 0" : "—") : fmtU(s.m.icov, "x")}</td>
              <td style={tdS(T)}>{s.m.nde == null ? "EBITDA ≤ 0" : fmtU(s.m.nde, "x")}</td><td style={tdS(T)}>{minus(s.m.ems.toFixed(2))}</td></tr>; })}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub="How much more each company could borrow before net debt reaches the leverage limit or interest cover falls to the coverage limit, at the rate on new debt. The tighter of the two binds. Synthetic ratings map interest cover to a bond rating using Damodaran's table for large firms; the effective rate is interest ÷ average debt.">Debt headroom and implied rating · {Y}</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,160px),1fr))", gap: 12, marginBottom: 14, maxWidth: 560 }}>
        <Field label="Max net debt ÷ EBITDA"><NI v={hNd} onChange={setHNd} /></Field>
        <Field label="Min interest cover (x)"><NI v={hIc} onChange={setHIc} /></Field>
        <Field label="Rate on new debt (%)"><NI v={hR} onChange={setHR} /></Field>
      </div>
      <Scroll min={640}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>Headroom</th><th style={thS(T)}>Binding limit</th><th style={thS(T)}>Debt today</th>
            <th style={thS(T)}>Effective rate</th><th style={thS(T)}>Synthetic rating</th><th style={thS(T)}>Distress probability</th></tr></thead>
          <tbody>{order.map(x => { const h = hd[x.id], r = SUITE_R[x.id][I], f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td>
              <td style={{ ...tdS(T), color: h.cap < 0 ? T.red : T.text, fontWeight: 600 }}>{h.cap < 0 ? `over by ${SX.cr(-h.cap)}` : SX.cr(h.cap)}</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{h.binding}</td><td style={tdS(T)}>{SX.cr(x.debt[I])}</td>
              <td style={tdS(T)}>{fmtU(r.effr, "%")}</td><td style={tdS(T)}>{synthRating(r.icov, !(x.int[I] > 0))}</td>
              <td style={{ ...tdS(T), color: zmijewski(x, I).p >= 0.5 ? T.red : T.text }}>{(zmijewski(x, I).p * 100).toFixed(1)}%</td></tr>; })}</tbody>
        </table>
      </Scroll>
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 8, lineHeight: 1.6 }}>Distress probability: Zmijewski (1984) probit on return on assets, liabilities ÷ assets and the current ratio. Above 50% counts as distressed.</div>
    </Card>

    <Card>
      <Title sub="Altman's emerging-market score (EMS) uses book values, so it works for companies of any valuation: 3.25 + 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4. Shaded bands mark Altman's distress, grey and safe zones.">Altman EM score, FY2022–FY2026</Title>
      <LineLegend focusLabel={c.short} median={false} />
      <SuiteLine series={emsSeries} labels={SUITE.years} unit="" yMinFloor={3.5}
        zones={[{ from: -99, to: 4.35, fill: zoneFill("distress"), label: "Distress" }, { from: 4.35, to: 5.85, fill: zoneFill("grey"), label: "Grey zone" }, { from: 5.85, to: 99, fill: zoneFill("safe"), label: "Safe" }]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 18, marginTop: 18 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: T.text }}>{c.short}: EM score build-up, {Y}</div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {[["X1 Working capital ÷ assets", al.x1, 6.56], ["X2 Retained earnings ÷ assets", al.x2, 3.26], ["X3 EBIT ÷ assets", al.x3, 6.72], ["X4 Book equity ÷ liabilities", al.x4b, 1.05]].map(([l, v, k]) =>
              <tr key={l}><td style={{ ...tdL(T), whiteSpace: "normal", lineHeight: 1.35 }}>{l}</td><td style={tdS(T)}>{minus(v.toFixed(3))}</td><td style={{ ...tdS(T), color: T.textMute }}>× {k}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{minus((v * k).toFixed(2))}</td></tr>)}
            <tr><td style={tdL(T)}>Constant</td><td style={tdS(T)} /><td style={tdS(T)} /><td style={{ ...tdS(T), fontWeight: 600 }}>3.25</td></tr>
            <tr><td style={{ ...tdL(T), fontWeight: 600, borderBottom: "none" }}>EM score</td><td style={{ ...tdS(T), borderBottom: "none" }} /><td style={{ ...tdS(T), borderBottom: "none" }} />
              <td style={{ ...tdS(T), fontWeight: 700, borderBottom: "none" }}>{minus(al.ems.toFixed(2))} <span style={{ fontFamily: SANS, fontWeight: 500, color: T.textSec }}>≈ {al.rating}</span></td></tr>
          </tbody></table></div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: T.text }}>Original Z-score with market value</div>
          {latest ? <><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {[["X1 Working capital ÷ assets", al.x1, 1.2], ["X2 Retained earnings ÷ assets", al.x2, 1.4], ["X3 EBIT ÷ assets", al.x3, 3.3], ["X4 Market value ÷ liabilities", al.x4m, 0.6], ["X5 Sales ÷ assets", al.x5, 1.0]].map(([l, v, k]) =>
              <tr key={l}><td style={{ ...tdL(T), whiteSpace: "normal", lineHeight: 1.35 }}>{l}</td><td style={tdS(T)}>{minus(v.toFixed(3))}</td><td style={{ ...tdS(T), color: T.textMute }}>× {k}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{minus((v * k).toFixed(2))}</td></tr>)}
            <tr><td style={{ ...tdL(T), fontWeight: 600, borderBottom: "none" }}>Z-score</td><td style={{ ...tdS(T), borderBottom: "none" }} /><td style={{ ...tdS(T), borderBottom: "none" }} />
              <td style={{ ...tdS(T), fontWeight: 700, borderBottom: "none" }}>{minus(al.z.toFixed(2))} <span style={{ fontFamily: SANS, fontWeight: 500, color: T.textSec }}>{al.zZone}</span></td></tr>
          </tbody></table></div>
            <div style={{ fontSize: 11, color: T.textMute, marginTop: 8, lineHeight: 1.6 }}>Zones: above 2.99 safe, 1.81–2.99 grey, below 1.81 distress. Market value at {pxAsOf(c)}.</div></>
            : <div style={{ fontSize: 12, color: T.textMute, lineHeight: 1.6 }}>Shown for FY2026 only: today's market value can't be paired with an earlier year's balance sheet.</div>}
        </div>
      </div>
    </Card>

    {bn && <Card>
      <Title sub="Eight ratios that, in Beneish's study of US companies, separated firms later caught manipulating earnings from the rest. Each index compares this year with last; 1.0 means no change. The score flags a profile to investigate, not proof of anything.">Beneish M-score · {c.short}, {Y}</Title>
      <Scroll min={600}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Index</th><th style={thS(T)}>Value</th><th style={thS(T)}>Coefficient</th><th style={thS(T)}>Contribution</th><th style={{ ...thS(T), textAlign: "left" }}>A high reading suggests</th></tr></thead>
          <tbody>{BENEISH_ROWS.map(([k, l, co, why]) => <tr key={k}><td style={tdL(T)}>{l}</td><td style={tdS(T)}>{minus(bn[k].toFixed(3))}</td><td style={{ ...tdS(T), color: T.textMute }}>{minus(co.toFixed(3))}</td>
            <td style={{ ...tdS(T), fontWeight: 600 }}>{minus((bn[k] * co).toFixed(3))}</td><td style={{ ...tdL(T), color: T.textSec, whiteSpace: "normal" }}>{why}</td></tr>)}
            <tr><td style={tdL(T)}>Constant</td><td style={tdS(T)} /><td style={tdS(T)} /><td style={{ ...tdS(T), fontWeight: 600 }}>−4.840</td><td style={tdS(T)} /></tr>
            <tr><td style={{ ...tdL(T), fontWeight: 600, borderBottom: "none" }}>M-score</td><td style={{ ...tdS(T), borderBottom: "none" }} /><td style={{ ...tdS(T), borderBottom: "none" }} />
              <td style={{ ...tdS(T), fontWeight: 700, borderBottom: "none" }}>{minus(bn.m.toFixed(2))}</td><td style={{ ...tdL(T), borderBottom: "none" }}><Chip kind={bn.zone === "flag" ? "red" : bn.zone === "watch" ? "amber" : "green"}>{{ flag: "Above −1.78", watch: "Grey zone", clear: "Below −2.22" }[bn.zone]}</Chip></td></tr></tbody>
        </table>
      </Scroll>
      {np > 0 && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        {order.map(x => { const b = beneish(x, I); return b && <div key={x.id} style={{ background: x.id === focus ? T.primarySoft : T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>{x.short}</span> <span style={{ fontFamily: MONO, color: b.zone === "flag" ? T.red : b.zone === "watch" ? T.amber : T.text }}>{minus(b.m.toFixed(2))}</span></div>; })}
      </div>}
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 10, lineHeight: 1.6 }}>SG&A uses the selling, general and administrative line where it is reported; where it is not, that index is set to 1.0. Depreciation is the cash-flow statement figure.</div>
    </Card>}

    {pf ? <Card>
      <Title sub="Nine pass-or-fail tests of profitability, funding and efficiency (Piotroski, 2000). Total debt stands in for long-term debt.">Piotroski F-score · {c.short}, {Y}</Title>
      <div style={{ display: "grid", gap: 0 }}>
        {pf.signals.map((s, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: i < 8 ? `1px solid ${T.border}` : "none" }}>
          <Chip kind={s.ok ? "green" : "red"}>{s.ok ? "✓ Pass" : "✕ Fail"}</Chip>
          <div style={{ fontSize: 12.5, color: T.text }}>{s.l}<span style={{ color: T.textMute, fontSize: 11, marginLeft: 8 }}>{s.g}</span></div>
          <div style={{ fontSize: 11.5, fontFamily: MONO, color: T.textSec, textAlign: "right" }}>{s.v}</div>
        </div>)}
      </div>
      <Scroll min={420}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>F-score</th>{[2, 3, 4].map(j => <th key={j} style={thS(T)}>{ylab(c, j)}</th>)}</tr></thead>
          <tbody>{order.map(x => <tr key={x.id} style={{ background: x.id === focus ? T.primarySoft : "transparent" }}><td style={{ ...tdL(T), fontWeight: x.id === focus ? 600 : 400 }}>{x.short}</td>
            {[2, 3, 4].map(j => { const p = piotroski(x, j); return <td key={j} style={{ ...tdS(T), fontWeight: j === I ? 700 : 400 }}>{p ? p.score : "—"}</td>; })}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card> : <Card><Title>Piotroski F-score</Title><div style={{ fontSize: 12.5, color: T.textMute }}>The F-score compares each year with the one before and needs two earlier balance sheets, so it starts in FY2024. Pick FY2024 or later.</div></Card>}

    <Card>
      <Title sub={`Simple tests a credit officer runs before reading anything else, ${Y}.`}>Early-warning checklist · {c.short}</Title>
      <div style={{ display: "grid", gap: 0 }}>
        {warn.map((s, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: i < warn.length - 1 ? `1px solid ${T.border}` : "none" }}>
          <Chip kind={s.ok ? "green" : "red"}>{s.ok ? "✓ Pass" : "✕ Flag"}</Chip>
          <div style={{ fontSize: 12.5, color: T.text }}>{s.l}</div>
          <div style={{ fontSize: 11.5, fontFamily: MONO, color: T.textSec, textAlign: "right" }}>{s.v}</div>
        </div>)}
      </div>
    </Card>

    <Card>
      <Title>Credit view on {c.short}</Title>
      <Findings items={find} />
      <AiNote label="Write credit note" build={aiPrompt} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} addLog={addLog} logLabel="Credit note written" />
    </Card>
  </>);
}
