/* ═══════════════════════════════════════════════════════════════════════
   FP&A VARIANCE — budget against actual, with price-volume-mix and an EBITDA bridge,
   plus year-on-year EBITDA bridges for the listed companies in the comparison.
   Amounts in ₹ crore. Every sample company is fictional.
   ═══════════════════════════════════════════════════════════════════════ */
const FPA_MONTHS = ["Apr-25","May-25","Jun-25","Jul-25","Aug-25","Sep-25","Oct-25","Nov-25","Dec-25","Jan-26","Feb-26","Mar-26"];
const FPA_COLS = ["month","line","kind","budget_volume","budget_amount","actual_volume","actual_amount"];

/* Shared story patterns (actual ÷ budget). Product 1 has a weak monsoon and price cuts, product 2 gains share
   at firm prices, product 3 softens slightly; freight and conversion rates rise; a festive marketing push. */
const FPA_PAT = {
  seas: [1.05,1.08,0.95,0.85,0.85,0.92,0.98,0.95,1.02,1.08,1.10,1.17],
  aq: [[1.02,1.03,0.95,0.84,0.82,0.88,0.97,0.96,1.01,1.03,1.04,1.05],[1.04,1.06,1.05,1.02,1.00,1.03,1.08,1.07,1.10,1.12,1.11,1.12],[1.00,1.01,0.98,0.93,0.92,0.95,1.00,0.99,1.02,1.04,1.05,1.06]],
  ap: [[1.00,1.00,0.99,0.96,0.94,0.93,0.92,0.93,0.94,0.95,0.96,0.96],[1.00,1.00,1.00,1.00,1.01,1.01,1.02,1.02,1.02,1.02,1.02,1.02],[1.00,1.00,1.00,0.99,0.98,0.98,0.98,0.99,0.99,1.00,1.00,1.00]],
  ac: [[1.00,1.01,0.98,0.95,0.93,0.92,0.92,0.93,0.94,0.95,0.96,0.97],[1.00,1.00,1.01,1.02,1.02,1.03,1.03,1.02,1.02,1.01,1.01,1.01],[1.00,1.00,0.99,0.97,0.95,0.94,0.94,0.95,0.96,0.97,0.98,0.98]],
  v1: [4500,4520,4560,4650,4700,4750,4780,4800,4760,4720,4700,4700], v2: [3800,3790,3850,3950,4020,4050,3980,3940,3900,3880,3860,3850],
  emp: [3.10,3.12,3.15,3.15,3.18,3.20,3.22,3.25,3.28,3.30,3.32,3.40],
  adB: [1.0,1.0,1.1,0.9,0.9,1.1,1.6,1.4,1.0,1.0,1.0,1.2], adA: [0.95,1.02,1.08,0.85,0.88,1.25,2.10,1.85,1.05,0.98,1.02,1.30],
  oth: [1.95,2.02,2.05,2.00,2.03,2.06,2.08,2.10,2.07,2.05,2.10,2.20],
};
/* One fictional company per industry. Products: [name, monthly budget volume, budget price, budget direct cost]
   in the volume unit and price unit shown. Amount (₹ crore) = volume × price ÷ 10,000 for every unit pair used here.
   Variable costs in ₹ per volume unit; fixed costs in ₹ crore a month. */
const FPA_IND = {
  pipes: { co: "PVC pipe maker", vu: "t", pu: "₹/kg", mat: "Material cost", P: [["PVC pipes",2500,128,92],["CPVC pipes",450,255,175],["Fittings",350,290,185]],
    v: [["Freight and distribution",4500],["Conversion cost",3800]], f: [["Employee costs",3.2],["Advertising and promotion",1.0],["Other overheads",2.0]] },
  paints: { co: "decorative paints company", vu: "kl", pu: "₹/litre", mat: "Material cost", P: [["Economy emulsions",9000,160,95],["Premium emulsions",4000,330,175],["Waterproofing",1200,260,140]],
    v: [["Freight and distribution",6000],["Packing and filling",9000]], f: [["Employee costs",12],["Advertising and promotion",9],["Other overheads",8]] },
  fmcg: { co: "personal care and foods company", vu: "t", pu: "₹/kg", mat: "Material cost", P: [["Soaps and detergents",6000,140,85],["Hair oils",1500,420,210],["Packaged foods",4000,180,120]],
    v: [["Freight and distribution",5000],["Packing material",7000]], f: [["Employee costs",9],["Advertising and promotion",14],["Other overheads",6]] },
  it: { co: "mid-size IT services company", vu: "'000 hrs", pu: "₹/hour", mat: "Delivery cost", P: [["Application services",1200,2800,1900],["Cloud and data",500,3600,2300],["Testing",300,2200,1600]],
    v: [["Subcontractors",220000],["Travel and visas",90000]], f: [["Bench and training",6],["Sales and marketing",8],["Facilities and overheads",10]] },
  pharma: { co: "generic medicines company", vu: "'000 packs", pu: "₹/pack", mat: "Material cost", P: [["India branded",9000,120,45],["US generics",3000,450,220],["Emerging markets",2500,150,80]],
    v: [["Freight and distribution",4000],["Partner royalties",6000]], f: [["Employee costs",30],["Research and development",25],["Other overheads",12]] },
  cement: { co: "regional cement maker", vu: "'000 t", pu: "₹/tonne", mat: "Raw material, power and fuel", P: [["OPC",600,5600,2600],["PPC",900,5300,2300],["Composite and slag",250,5100,2100]],
    v: [["Freight and forwarding",1300000],["Packing and stores",250000]], f: [["Employee costs",20],["Advertising and promotion",4],["Other overheads",25]] },
  steel: { co: "integrated steel maker", vu: "'000 t", pu: "₹/tonne", mat: "Iron ore and coal", P: [["Hot-rolled coil",400,52000,36000],["Cold-rolled coil",150,60000,41000],["Long products",250,50000,35000]],
    v: [["Power and stores",4500000],["Freight",1800000]], f: [["Employee costs",60],["Advertising and promotion",2],["Other overheads",80]] },
  cables: { co: "cables and wires maker", vu: "t", pu: "₹/kg", mat: "Copper and aluminium", P: [["Power cables",4000,620,505],["Building wires",3000,700,575],["Communication cables",500,480,380]],
    v: [["Freight and distribution",9000],["Conversion cost",13000]], f: [["Employee costs",15],["Advertising and promotion",6],["Other overheads",8]] },
  tyres: { co: "tyre maker", vu: "'000 tyres", pu: "₹/tyre", mat: "Rubber and materials", P: [["Truck and bus radials",120,18000,11500],["Passenger car radials",450,4200,2600],["Two-wheeler tyres",900,1300,780]],
    v: [["Freight and distribution",220000],["Conversion cost",250000]], f: [["Employee costs",35],["Advertising and promotion",10],["Other overheads",25]] },
  gas: { co: "city gas distributor", vu: "'000 scm", pu: "₹/scm", mat: "Gas cost", P: [["CNG",150000,78,50],["Domestic PNG",30000,50,30],["Industrial PNG",60000,55,45]],
    v: [["Operations and maintenance",1500],["Pipeline charges",2000]], f: [["Employee costs",8],["Advertising and promotion",1],["Other overheads",12]] },
};
const fpaInd = ind => FPA_IND[ind] || FPA_IND.pipes;

function fpaSampleRows(ind = "pipes") {
  const S = fpaInd(ind), K = FPA_PAT;
  const r2 = x => Math.round(x * 100) / 100;
  const rows = [];
  FPA_MONTHS.forEach((m, j) => {
    let bT = 0, aT = 0;
    S.P.forEach(([l, q, p, c], k) => {
      const bq = Math.round(q * K.seas[j]), aq = Math.round(bq * K.aq[k][j]);
      bT += bq; aT += aq;
      rows.push([m, l, "sales", bq, r2(bq * p / 1e4), aq, r2(aq * p * K.ap[k][j] / 1e4)]);
      rows.push([m, l, "material", bq, r2(bq * c / 1e4), aq, r2(aq * c * K.ac[k][j] / 1e4)]);
    });
    rows.push([m, S.v[0][0], "var_cost", "", r2(bT * S.v[0][1] / 1e7), "", r2(aT * (S.v[0][1] * K.v1[j] / 4500) / 1e7)]);
    rows.push([m, S.v[1][0], "var_cost", "", r2(bT * S.v[1][1] / 1e7), "", r2(aT * (S.v[1][1] * K.v2[j] / 3800) / 1e7)]);
    rows.push([m, S.f[0][0], "fixed_cost", "", S.f[0][1], "", r2(S.f[0][1] * K.emp[j] / 3.2)]);
    rows.push([m, S.f[1][0], "fixed_cost", "", r2(S.f[1][1] * K.adB[j]), "", r2(S.f[1][1] * K.adA[j])]);
    rows.push([m, S.f[2][0], "fixed_cost", "", S.f[2][1], "", r2(S.f[2][1] * K.oth[j] / 2.0)]);
  });
  return rows;
}
const fpaCsv = rows => [FPA_COLS.join(","), ...rows.map(r => r.join(","))].join("\n");

function fpaParse(text) {
  const lines = String(text || "").trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Paste a header row and at least one data row.");
  const split = l => l.split(/\t|,/).map(s => s.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = {}; FPA_COLS.forEach(n => { idx[n] = head.indexOf(n); });
  const miss = FPA_COLS.filter(n => idx[n] < 0);
  if (miss.length) throw new Error(`The header is missing ${miss.join(", ")}. Copy the template to see the expected columns.`);
  const num = s => { if (s == null || String(s).trim() === "") return null; const v = parseFloat(String(s).replace(/,/g, "")); return isFinite(v) ? v : NaN; };
  const months = [], prod = {}, varc = {}, fixc = {};
  lines.slice(1).forEach((l, n) => {
    const c = split(l), g = k => c[idx[k]], row = n + 2;
    const m = g("month"), line = g("line"), kind = String(g("kind") || "").toLowerCase();
    if (!m || !line) throw new Error(`Row ${row}: month and line are required.`);
    if (!months.includes(m)) months.push(m);
    const bA = num(g("budget_amount")), aA = num(g("actual_amount"));
    if (bA == null || aA == null || isNaN(bA) || isNaN(aA)) throw new Error(`Row ${row}: budget_amount and actual_amount must both be numbers.`);
    if (kind === "sales" || kind === "material") {
      const p = prod[line] = prod[line] || { l: line, m: {} };
      const e = p.m[m] = p.m[m] || { bQ: 0, aQ: 0, bRev: 0, aRev: 0, bMat: 0, aMat: 0 };
      if (kind === "sales") {
        const bV = num(g("budget_volume")), aV = num(g("actual_volume"));
        if (bV == null || aV == null || isNaN(bV) || isNaN(aV) || bV < 0 || aV < 0) throw new Error(`Row ${row}: sales rows need budget_volume and actual_volume.`);
        e.bQ += bV; e.aQ += aV; e.bRev += bA; e.aRev += aA;
      } else { e.bMat += bA; e.aMat += aA; }
    } else if (kind === "var_cost" || kind === "fixed_cost") {
      const t = kind === "var_cost" ? varc : fixc;
      const x = t[line] = t[line] || { l: line, m: {} };
      const e = x.m[m] = x.m[m] || { b: 0, a: 0 }; e.b += bA; e.a += aA;
    } else throw new Error(`Row ${row}: kind must be sales, material, var_cost or fixed_cost.`);
  });
  if (!Object.keys(prod).length) throw new Error("Add at least one sales line.");
  const arr = (o, f) => months.map(m => (o.m[m] ? o.m[m][f] : 0));
  return { months,
    products: Object.values(prod).map(p => ({ l: p.l, bQ: arr(p, "bQ"), aQ: arr(p, "aQ"), bRev: arr(p, "bRev"), aRev: arr(p, "aRev"), bMat: arr(p, "bMat"), aMat: arr(p, "aMat") })),
    varc: Object.values(varc).map(x => ({ l: x.l, b: arr(x, "b"), a: arr(x, "a") })),
    fixc: Object.values(fixc).map(x => ({ l: x.l, b: arr(x, "b"), a: arr(x, "a") })) };
}
const fpaSample = (() => { const memo = {}; return ind => memo[ind] || (memo[ind] = fpaParse(fpaCsv(fpaSampleRows(ind)))); })();
const FPA_SAMPLE = fpaSample("pipes");

/* Analysis over a set of months. Every decomposition below adds back exactly to its total. */
function fpaAnalyse(D, S) {
  const sum = a => S.reduce((t, j) => t + (a[j] || 0), 0);
  const tBQ = D.months.map((_, j) => D.products.reduce((t, p) => t + p.bQ[j], 0));
  const tAQ = D.months.map((_, j) => D.products.reduce((t, p) => t + p.aQ[j], 0));
  const P = D.products.map(p => {
    const bQ = sum(p.bQ), aQ = sum(p.aQ), bRev = sum(p.bRev), aRev = sum(p.aRev), bMat = sum(p.bMat), aMat = sum(p.aMat);
    const aP0 = aQ > 0 ? aRev / aQ : null, bP0 = bQ > 0 ? bRev / bQ : null;
    const aC0 = aQ > 0 ? aMat / aQ : null, bC0 = bQ > 0 ? bMat / bQ : null;
    const bP = bP0 ?? aP0 ?? 0, aP = aP0 ?? bP, bC = bC0 ?? aC0 ?? 0, aC = aC0 ?? bC;
    return { l: p.l, bQ, aQ, bRev, aRev, bMat, aMat, bP, aP, bC, aC, isNew: !(bQ > 0) };
  });
  const tot = k => P.reduce((t, p) => t + p[k], 0);
  const BQ = tot("bQ"), AQ = tot("aQ"), BR = tot("bRev"), AR = tot("aRev"), BM = tot("bMat"), AM = tot("aMat");
  const BGP = BR - BM, AGP = AR - AM;
  P.forEach(p => {
    p.bMix = BQ > 0 ? p.bQ / BQ : 0; p.aMix = AQ > 0 ? p.aQ / AQ : 0;
    p.bGPU = p.bP - p.bC;
    p.price = (p.aP - p.bP) * p.aQ;
    p.mat = (p.bC - p.aC) * p.aQ;
    p.mixR = (p.aQ - AQ * p.bMix) * p.bP;
    p.volR = (AQ * p.bMix - p.bQ) * p.bP;
    p.mixGP = (p.aQ - AQ * p.bMix) * p.bGPU;
    p.volGP = (AQ * p.bMix - p.bQ) * p.bGPU;
  });
  const V = D.varc.map(x => ({ l: x.l, kind: "var", b: sum(x.b), a: sum(x.a),
    flex: S.reduce((t, j) => t + (tBQ[j] > 0 ? x.b[j] / tBQ[j] * tAQ[j] : x.b[j]), 0) }));
  const F = D.fixc.map(x => ({ l: x.l, kind: "fixed", b: sum(x.b), a: sum(x.a), flex: sum(x.b) }));
  const vs = k => V.reduce((t, x) => t + x[k], 0), fs = k => F.reduce((t, x) => t + x[k], 0);
  const BV = vs("b"), AV = vs("a"), FV = vs("flex"), BF = fs("b"), AF = fs("a");
  const BE = BGP - BV - BF, AE = AGP - AV - AF;
  const flexR = P.reduce((t, p) => t + p.bP * p.aQ, 0), flexM = P.reduce((t, p) => t + p.bC * p.aQ, 0);
  const flexGP = flexR - flexM, flexE = flexGP - FV - BF;
  const s = k => P.reduce((t, p) => t + p[k], 0);
  const price = s("price"), mat = s("mat"), mixGP = s("mixGP"), volGP = s("volGP");
  const volume = volGP + (BV - FV);
  const bridge = [
    { l: "Budget EBITDA", v: BE, total: true },
    { l: "Sales volume", v: volume, note: "Tonnes sold vs budget, at budget contribution per tonne" },
    { l: "Product mix", v: mixGP, note: "Shift between products, at budget margin per tonne" },
    { l: "Selling prices", v: price, note: "Actual less budget price, on actual tonnes" },
    { l: "Material cost", v: mat, note: "Budget less actual cost per tonne, on actual tonnes" },
    ...V.map(x => ({ l: x.l, v: x.flex - x.a, note: "Spending against the budget rate, flexed to actual tonnes" })),
    ...F.map(x => ({ l: x.l, v: x.b - x.a, note: "Fixed cost against budget" })),
    { l: "Actual EBITDA", v: AE, total: true },
  ];
  const lines = [
    { k: "rev", l: "Revenue", b: BR, f: flexR, a: AR, sign: 1, bold: true },
    { k: "mat", l: "Material cost", b: BM, f: flexM, a: AM, sign: -1 },
    { k: "gp", l: "Gross profit", b: BGP, f: flexGP, a: AGP, sign: 1, bold: true },
    ...V.map(x => ({ k: "v:" + x.l, l: x.l, b: x.b, f: x.flex, a: x.a, sign: -1, tag: "variable" })),
    ...F.map(x => ({ k: "f:" + x.l, l: x.l, b: x.b, f: x.flex, a: x.a, sign: -1, tag: "fixed" })),
    { k: "ebitda", l: "EBITDA", b: BE, f: flexE, a: AE, sign: 1, bold: true },
  ];
  lines.forEach(r => { r.var = (r.a - r.b) * r.sign; r.varFlex = (r.a - r.f) * r.sign; r.pct = r.b ? r.var / Math.abs(r.b) * 100 : null; });
  return { P, V, F, BQ, AQ, BR, AR, BM, AM, BGP, AGP, BV, AV, FV, BF, AF, BE, AE, flexR, flexM, flexGP, flexE,
    price, mat, mixGP, volGP, volume, mixR: s("mixR"), volR: s("volR"), bridge, lines,
    gmB: BR ? BGP / BR * 100 : null, gmA: AR ? AGP / AR * 100 : null, emB: BR ? BE / BR * 100 : null, emA: AR ? AE / AR * 100 : null };
}
function fpaPeriod(D, type, q, m) {
  const n = D.months.length, all = D.months.map((_, j) => j);
  if (type === "m") return [Math.min(m, n - 1)];
  if (type === "q") return all.filter(j => Math.floor(j / 3) === q);
  if (type === "ytd") return all.filter(j => j <= Math.min(m, n - 1));
  return all;
}
const crF = (v, d = 2) => SX.ok(v) ? `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })} Cr` : "—";
const varF = (v, d = 2) => SX.ok(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}` : "—";

/* ── Horizontal waterfall: totals from zero, steps float from the running total ── */
function Waterfall({ steps }) {
  const T = useT();
  const [ref, W] = useWidth(); const narrow = W < 520;
  let run = 0; const rows = steps.map(s => { if (s.total) { run = s.v; return { ...s, from: 0, to: s.v }; } const from = run; run += s.v; return { ...s, from, to: run }; });
  const levels = rows.flatMap(r => r.total ? [r.v] : [r.from, r.to]);
  const lo0 = Math.min(...levels), hi = Math.max(...levels);
  /* When the steps are small next to the totals, start the scale near the lowest running total
     (and mark the totals as cut) so every step stays readable. */
  let lo = Math.min(0, lo0);
  if (lo0 > 0 && hi - lo0 < 0.6 * hi) lo = niceTicks(Math.max(0, lo0 - (hi - lo0) * 0.25), hi)[0];
  const cut = lo > 0;
  rows.forEach(r => { if (r.total && cut) r.from = lo; });
  const top = hi + (hi - lo) * 0.02, pos = v => (v - lo) / ((top - lo) || 1) * 100;
  return <div ref={ref}>{rows.map((r, i) => {
    const a = pos(Math.min(r.from, r.to)), w = Math.max(pos(Math.max(r.from, r.to)) - a, 0.4);
    const col = r.total ? T.primary : r.v >= 0 ? T.green : T.red;
    return <div key={i} title={r.note || ""} style={{ display: "grid", gridTemplateColumns: narrow ? "1fr auto" : "minmax(110px,190px) 1fr auto",
      gridTemplateAreas: narrow ? '"l v" "b b"' : '"l b v"', columnGap: 12, rowGap: 4, alignItems: "center", padding: narrow ? "7px 0" : "6px 0",
      borderTop: r.total && i > 0 ? `1px solid ${T.border}` : "none" }}>
      <div style={{ gridArea: "l", fontSize: 12.5, color: T.text, fontWeight: r.total ? 600 : 400, lineHeight: 1.3 }}>{r.l}</div>
      <div style={{ gridArea: "b", position: "relative", height: 18 }}>
        {lo < 0 && <div style={{ position: "absolute", left: `${pos(0)}%`, top: -4, bottom: -4, width: 1, background: T.borderStrong }} />}
        <div style={{ position: "absolute", top: 1, height: 16, left: `${a}%`, width: `${w}%`, background: col, opacity: r.total ? .9 : .8, borderRadius: r.total && cut ? "0 4px 4px 0" : 4 }} />
        {r.total && cut && <div aria-hidden="true" style={{ position: "absolute", top: -1, left: `calc(${a}% + 5px)`, width: 6, height: 20, borderLeft: `2px solid ${T.surface}`, borderRight: `2px solid ${T.surface}`, transform: "skewX(-20deg)" }} />}
      </div>
      <div style={{ gridArea: "v", fontFamily: MONO, fontSize: 12, textAlign: "right", minWidth: 76, fontWeight: r.total ? 700 : 500, color: T.text }}>{r.total ? crF(r.v) : varF(r.v)}</div>
    </div>; })}
    {cut && <div style={{ fontSize: 11, color: T.textMute, marginTop: 8 }}>The scale starts at ₹{lo.toLocaleString("en-IN")} crore so the smaller steps stay visible; the two total bars are cut at the left, as marked.</div>}
  </div>;
}

/* ── Monthly columns: actual as bars, budget as a tick across each bar ── */
function MonthBars({ labels, budget, actual, unit, inPeriod }) {
  const T = useT();
  const [ref, W] = useWidth();
  const [hov, setHov] = useState(null);
  const H = 220, padL = 50, padR = 10, padT = 12, padB = 28;
  const vals = [...budget, ...actual].filter(SX.ok);
  let lo = Math.min(0, ...vals), hi = Math.max(...vals, 0);
  const ticks = niceTicks(lo, hi); const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const stepT = ticks.length > 1 ? ticks[1] - ticks[0] : 1, dec = stepT >= 1 ? 0 : 1;
  const bw = (W - padL - padR) / labels.length, barW = Math.min(24, bw * 0.55);
  const x = i => padL + bw * i + bw / 2, y = v => padT + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - padT - padB);
  const fmt = v => unit === "%" ? `${v.toFixed(1)}%` : crF(v);
  return <div ref={ref} style={{ position: "relative" }}>
    <svg width={W} height={H} style={{ display: "block", maxWidth: "100%" }} role="img" aria-label="Monthly actual against budget"
      onMouseLeave={() => setHov(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - padL) / bw); setHov(i >= 0 && i < labels.length ? i : null); }}>
      {ticks.map(t => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={T.border} strokeWidth="1" />
        <text x={padL - 8} y={y(t) + 3.5} fontSize="10.5" textAnchor="end" fill={T.textMute} fontFamily={MONO}>{unit === "%" ? `${t.toFixed(dec)}%` : t.toFixed(dec)}</text></g>)}
      {labels.map((l, i) => { const v = actual[i], b = budget[i], top = y(Math.max(v, 0)), bot = y(Math.min(v, 0)), dim = inPeriod && !inPeriod.includes(i);
        return <g key={l} opacity={dim ? 0.35 : 1}>
          {hov === i && <rect x={x(i) - bw / 2} y={padT} width={bw} height={H - padT - padB} fill={T.primarySoft} />}
          {SX.ok(v) && <path d={`M${x(i) - barW / 2},${bot} L${x(i) - barW / 2},${top + 4} Q${x(i) - barW / 2},${top} ${x(i) - barW / 2 + 4},${top} L${x(i) + barW / 2 - 4},${top} Q${x(i) + barW / 2},${top} ${x(i) + barW / 2},${top + 4} L${x(i) + barW / 2},${bot} Z`}
            fill={v >= b ? T.primary : T.primary} opacity={0.85} />}
          {SX.ok(b) && <line x1={x(i) - barW / 2 - 4} x2={x(i) + barW / 2 + 4} y1={y(b)} y2={y(b)} stroke={T.text} strokeWidth="2" strokeLinecap="round" />}
          <text x={x(i)} y={H - 9} fontSize="10" textAnchor="middle" fill={T.textMute} fontFamily={SANS}>{l.slice(0, 3)}</text>
        </g>; })}
    </svg>
    {hov != null && <div style={{ position: "absolute", top: 6, left: Math.min(Math.max(x(hov) + 14, 0), W - 180), pointerEvents: "none", background: T.tipBg, color: T.tipText,
      borderRadius: 8, padding: "8px 11px", fontSize: 11.5, width: 164, boxShadow: T.sh3, zIndex: 5 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{labels[hov]}</div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Actual</span><span style={{ fontFamily: MONO }}>{fmt(actual[hov])}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Budget</span><span style={{ fontFamily: MONO }}>{fmt(budget[hov])}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}><span>Difference</span><span style={{ fontFamily: MONO }}>{unit === "%" ? `${varF(actual[hov] - budget[hov], 1)} pts` : varF(actual[hov] - budget[hov])}</span></div>
    </div>}
  </div>;
}

/* Listed companies: year-on-year EBITDA bridges from reported lines. */
function FpaPeerView({ sel, c, aiAvail, sampleRef, aiMessage, addLog }) {
  const T = useT();
  const { ids, focus, yi: I } = sel, Y = yLabel(I), P = yLabel(I - 1), meta = indMeta(focus);
  const order = [c, ...peerIds(focus, ids).map(SX.co)];
  const B = Object.fromEntries(order.map(x => [x.id, yoyBridge(x, I)]));
  const b = B[focus], cr = v => v / 10;
  const steps = [{ l: `${P} EBITDA`, v: cr(b.from), total: true }, { l: "Revenue growth", v: cr(b.vol), note: `Revenue change at ${P}'s EBITDA margin` },
    { l: "Gross margin", v: cr(b.mar), note: "Change in gross margin on this year's revenue" }, { l: "Operating costs", v: cr(b.cost), note: "Change in cash operating costs as a share of revenue" },
    ...(Math.abs(b.resid) >= 0.5 ? [{ l: "Rounding in reported lines", v: cr(b.resid) }] : []), { l: `${Y} EBITDA`, v: cr(b.to), total: true }];
  const lead = [["vol", "revenue growth"], ["mar", "gross margin"], ["cost", "operating costs"]].map(([k, l]) => ({ l, v: b[k] })).sort((a, z) => Math.abs(z.v) - Math.abs(a.v))[0];
  const find = [
    `${c.short}'s EBITDA went from ${SX.cr(b.from)} in ${P} to ${SX.cr(b.to)} in ${Y} (${b.to >= b.from ? "+" : "−"}${Math.abs((b.to / b.from - 1) * 100).toFixed(1)}%). Revenue grew ${b.revG.toFixed(1)}%, worth ${SX.cr(b.vol)} at last year's margin.`,
    `Gross margin moved from ${b.gmP.toFixed(1)}% to ${b.gmI.toFixed(1)}%, worth ${SX.cr(b.mar)}; in this industry it follows ${meta.input}. Cash operating costs went from ${b.oxP.toFixed(1)}% to ${b.oxI.toFixed(1)}% of revenue, worth ${SX.cr(b.cost)}.`,
    `The biggest single driver was ${lead.l} (${SX.cr(lead.v)}).`,
    order.length > 1 ? `Across the ${order.length} companies, EBITDA margin changed by ${order.map(x => `${x.short} ${B[x.id].emI - B[x.id].emP >= 0 ? "+" : "−"}${Math.abs(B[x.id].emI - B[x.id].emP).toFixed(1)} pts`).join(", ")}.` : null,
  ];
  const aiPrompt = () => `You are the FP&A lead preparing a competitor review of ${ids.some(id => isLive(SX.co(id))) ? "listed" : "Indian"} ${meta.noun} for the CFO. Using ONLY these reported consolidated figures (INR crore), explain what drove EBITDA from ${P} to ${Y}.

${order.map(x => { const z = B[x.id]; return `${x.short}: EBITDA ${cr(z.from).toFixed(0)} → ${cr(z.to).toFixed(0)}; revenue growth ${z.revG.toFixed(1)}%; gross margin ${z.gmP.toFixed(1)}% → ${z.gmI.toFixed(1)}%; cash costs ${z.oxP.toFixed(1)}% → ${z.oxI.toFixed(1)}% of revenue; bridge: growth ${cr(z.vol).toFixed(0)}, margin ${cr(z.mar).toFixed(0)}, costs ${cr(z.cost).toFixed(0)}`; }).join("\n")}

Respond in plain text with bold headings on their own lines:
**HEADLINE**
[2 sentences on ${c.short} against the others]
**WHAT DROVE IT**
[3 bullets, each with a rupee figure]
**WHAT TO WATCH NEXT YEAR**
[3 numbered points]
Under 220 words.`;
  return <>
    <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 16 }}>
      <Stat label={`EBITDA ${Y}`} value={SX.cr(b.to)} sub={`${P} ${SX.cr(b.from)}`} color={b.to >= b.from ? T.green : T.red} />
      <Stat label="Revenue growth" value={`${b.revG.toFixed(1)}%`} sub={`Worth ${SX.cr(b.vol)} of EBITDA`} />
      <Stat label="Gross margin" value={`${b.gmI.toFixed(1)}%`} sub={`${P} ${b.gmP.toFixed(1)}%`} color={b.gmI >= b.gmP ? T.green : T.red} />
      <Stat label="EBITDA margin" value={`${b.emI.toFixed(1)}%`} sub={`${P} ${b.emP.toFixed(1)}%`} color={b.emI >= b.emP ? T.green : T.red} />
    </div>
    <Card>
      <Title sub={`EBITDA change = revenue change × last year's EBITDA margin + this year's revenue × change in gross margin − this year's revenue × change in cash operating costs (operating expenses less D&A). From reported consolidated figures.`}>{c.short}: EBITDA bridge, {P} to {Y} (₹ crore)</Title>
      <Waterfall steps={steps} />
    </Card>
    <Card>
      <Title sub={`The same bridge for every company you picked, so you can see who grew by selling more and who by widening margins. ₹ crore.`}>Year-on-year bridges, {P} to {Y}</Title>
      <Scroll min={760}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Company</th><th style={thS(T)}>{P} EBITDA</th><th style={thS(T)}>Revenue growth</th><th style={thS(T)}>Gross margin</th>
            <th style={thS(T)}>Operating costs</th><th style={thS(T)}>Rounding</th><th style={thS(T)}>{Y} EBITDA</th><th style={thS(T)}>Revenue growth %</th><th style={thS(T)}>Margin change</th></tr></thead>
          <tbody>{order.map(x => { const z = B[x.id], f = x.id === focus;
            return <tr key={x.id} style={{ background: f ? T.primarySoft : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: f ? 600 : 400 }}>{x.short}</td><td style={tdS(T)}>{crF(cr(z.from), 0)}</td>
              {[z.vol, z.mar, z.cost].map((v, k) => <td key={k} style={{ ...tdS(T), color: v >= 0 ? T.green : T.red }}>{varF(cr(v), 0)}</td>)}
              <td style={{ ...tdS(T), color: T.textMute }}>{varF(cr(z.resid), 1)}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{crF(cr(z.to), 0)}</td>
              <td style={tdS(T)}>{z.revG.toFixed(1)}%</td><td style={{ ...tdS(T), color: z.emI >= z.emP ? T.green : T.red }}>{varF(z.emI - z.emP, 1)} pts</td></tr>; })}</tbody>
        </table>
      </Scroll>
    </Card>
    <Card>
      <Title>What drove {c.short}'s profit</Title>
      <Findings items={find} />
      <AiNote label="Draft competitor review" build={aiPrompt} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} addLog={addLog} logLabel="Competitor review written" />
    </Card>
  </>;
}

function FpaModule({ sel, c, addLog, flash, aiAvail, sampleRef, aiMessage, io }) {
  const T = useT();
  const [mode, setMode] = useState("bva");
  const [data, setData] = useState(() => fpaSample(sel.ind));
  const [src, setSrc] = useState("sample");
  const [ptype, setPtype] = useState("fy");
  const [q, setQ] = useState(3);
  const [m, setM] = useState(5);
  const [metric, setMetric] = useState("ebitda");
  const [thr, setThr] = useState({ pct: "5", abs: "0.5" });
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [csvErr, setCsvErr] = useState(null);
  const [wiP, setWiP] = useState("0"), [wiV, setWiV] = useState("0");
  useEffect(() => { if (src === "sample") setData(fpaSample(sel.ind)); }, [sel.ind, src]);
  const S0 = fpaInd(sel.ind), U = src === "sample" ? S0 : { co: "company", vu: "units", pu: "₹ per unit ×1,000", mat: "Direct cost" };
  const n = data.months.length;
  const S = fpaPeriod(data, ptype, q, m);
  const A = useMemo(() => fpaAnalyse(data, S), [data, ptype, q, m]);
  const perLabel = ptype === "fy" ? `Full year (${data.months[0]} to ${data.months[n - 1]})` : ptype === "q" ? `Q${q + 1} (${data.months[S[0]]} to ${data.months[S[S.length - 1]]})`
    : ptype === "ytd" ? `Year to date, ${data.months[0]} to ${data.months[S[S.length - 1]]}` : data.months[S[0]];
  const monthly = useMemo(() => data.months.map((_, j) => fpaAnalyse(data, [j])), [data]);
  const series = { rev: ["Revenue", "₹", r => r.BR, r => r.AR], ebitda: ["EBITDA", "₹", r => r.BE, r => r.AE], gm: ["Gross margin", "%", r => r.gmB, r => r.gmA] }[metric];
  const flagOf = r => { const p = toN(thr.pct, 5), a = toN(thr.abs, 0.5); return r.var < 0 && Math.abs(r.var) >= a && (r.pct == null || Math.abs(r.pct) >= p); };
  const d = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;
  const outlook = ptype === "ytd" && S.length < n ? (() => {
    const rest = data.months.map((_, j) => j).filter(j => !S.includes(j));
    const R = fpaAnalyse(data, rest), FY = fpaAnalyse(data, data.months.map((_, j) => j));
    const ratioR = A.BR ? A.AR / A.BR : 1, ratioE = A.BE ? A.AE / A.BE : 1;
    const p = toN(wiP, 0) / 100, v = toN(wiV, 0) / 100;
    const wiR = R.BR * (1 + v) * (1 + p), wiE = wiR - R.BM * (1 + v) - R.BV * (1 + v) - R.BF;
    return { leR: A.AR + R.BR, leE: A.AE + R.BE, trR: A.AR + R.BR * ratioR, trE: A.AE + R.BE * ratioE, fyR: FY.BR, fyE: FY.BE, restN: rest.length, wiR: A.AR + wiR, wiE: A.AE + wiE };
  })() : null;
  /* Contribution, break-even and operating leverage on actuals for the period */
  const contrib = A.AR - A.AM - A.AV, cmr = A.AR ? contrib / A.AR : null;
  const beRev = cmr > 0 ? A.AF / cmr : null, mos = beRev != null && A.AR ? (A.AR - beRev) / A.AR * 100 : null, dol = A.AE > 0 ? contrib / A.AE : null;
  const cum = (f) => { let t = 0; return monthly.map(r => (t += f(r))); };
  const heatLines = [...A.P.map(p => ({ l: p.l, k: "p", b: j => data.products.find(z => z.l === p.l).bRev[j], a: j => data.products.find(z => z.l === p.l).aRev[j], sign: 1 })),
    ...data.varc.map(x => ({ l: x.l, b: j => x.b[j], a: j => x.a[j], sign: -1 })), ...data.fixc.map(x => ({ l: x.l, b: j => x.b[j], a: j => x.a[j], sign: -1 })),
    { l: "EBITDA", b: j => monthly[j].BE, a: j => monthly[j].AE, sign: 1, bold: true }];
  const hv = (L, j) => { const b = L.b(j), a = L.a(j); return b ? (a - b) / Math.abs(b) * 100 * L.sign : null; };
  const hbg = v => !SX.ok(v) || Math.abs(v) < 2 ? "transparent" : v > 0 ? `${T.green}${Math.abs(v) >= 8 ? "40" : "1f"}` : `${T.red}${Math.abs(v) >= 8 ? "40" : "1f"}`;

  /* Findings, written from the numbers */
  const find = [];
  {
    const dr = A.AR - A.BR;
    find.push(`Revenue of ${crF(A.AR)} was ${crF(Math.abs(dr))} (${Math.abs(d(A.AR, A.BR)).toFixed(1)}%) ${dr >= 0 ? "above" : "below"} budget: volume ${varF(A.volR)}, mix ${varF(A.mixR)}, price ${varF(A.price)} crore.`);
    const spread = A.price + A.mat;
    find.push(`Gross margin was ${A.gmA.toFixed(1)}% against ${A.gmB.toFixed(1)}% budgeted. ${A.price < 0 ? `Price cuts cost ${crF(-A.price)}` : `Higher prices added ${crF(A.price)}`} and ${A.mat >= 0 ? `lower ${U.mat.toLowerCase()} saved ${crF(A.mat)}` : `higher ${U.mat.toLowerCase()} cost ${crF(-A.mat)}`}, a net ${spread >= 0 ? "gain" : "loss"} of ${crF(Math.abs(spread))} on the price–cost spread.`);
    const steps = A.bridge.filter(b => !b.total), worst = [...steps].sort((a, b) => a.v - b.v)[0], best = [...steps].sort((a, b) => b.v - a.v)[0];
    find.push(`EBITDA came in at ${crF(A.AE)} against ${crF(A.BE)} budgeted (${varF(d(A.AE, A.BE), 1)}%). The largest drag was ${worst.l.toLowerCase()} (${varF(worst.v)} crore) and the largest help was ${best.l.toLowerCase()} (${varF(best.v)} crore).`);
    const fl = A.lines.filter(r => !r.bold && flagOf(r));
    if (fl.length) find.push(`Lines over the investigation threshold: ${fl.map(r => `${r.l.toLowerCase()} ${varF(r.var)} crore (${r.pct != null ? varF(r.pct, 1) + "%" : "new"})`).join("; ")}.`);
    find.push(`Against a budget flexed to the volume and product mix actually sold, EBITDA was ${varF(A.AE - A.flexE)} crore. The rest of the gap to the original budget, ${varF(A.flexE - A.BE)} crore, is the sales activity variance: volume ${varF(A.volume)} and mix ${varF(A.mixGP)} crore.`);
    if (dol) find.push(`Operating leverage is ${dol.toFixed(1)}×: a 1% change in revenue at today's cost structure moves EBITDA by about ${dol.toFixed(1)}%. Revenue is ${mos.toFixed(0)}% above the break-even level of ${crF(beRev)}.`);
    if (outlook) find.push(`Full-year outlook: holding the budget for the remaining ${outlook.restN} months gives revenue of ${crF(outlook.leR)} and EBITDA of ${crF(outlook.leE)}, against a full-year budget of ${crF(outlook.fyR)} and ${crF(outlook.fyE)}.`);
  }
  const aiPrompt = () => `You are the FP&A manager of ${src === "sample" ? `a ${U.co} (fictional sample data)` : "the company whose data is below"}. Write the variance commentary for the CFO pack for ${perLabel}. Amounts in INR crore. Use ONLY these figures.

Revenue: actual ${A.AR.toFixed(2)} vs budget ${A.BR.toFixed(2)} (volume ${A.volR.toFixed(2)}, mix ${A.mixR.toFixed(2)}, price ${A.price.toFixed(2)}). Volume ${A.AQ.toFixed(0)} vs ${A.BQ.toFixed(0)} ${U.vu}.
Gross margin ${A.gmA.toFixed(1)}% vs ${A.gmB.toFixed(1)}%. ${U.mat} variance ${A.mat.toFixed(2)}.
EBITDA bridge: ${A.bridge.map(b => `${b.l} ${b.v.toFixed(2)}`).join(" | ")}.
By product: ${A.P.map(p => `${p.l}: ${p.aQ.toFixed(0)} vs ${p.bQ.toFixed(0)} ${U.vu}, price ${(p.aP * 1e4).toFixed(1)} vs ${(p.bP * 1e4).toFixed(1)} ${U.pu}, margin ${((p.aP - p.aC) * 1e4).toFixed(1)} vs ${((p.bP - p.bC) * 1e4).toFixed(1)} ${U.pu}`).join("; ")}.
Cost lines (budget / flexed / actual): ${[...A.V, ...A.F].map(x => `${x.l} ${x.b.toFixed(2)} / ${x.flex.toFixed(2)} / ${x.a.toFixed(2)}`).join("; ")}.
${outlook ? `Outlook if the remaining months hit budget: revenue ${outlook.leR.toFixed(2)}, EBITDA ${outlook.leE.toFixed(2)} vs full-year budget ${outlook.fyR.toFixed(2)} and ${outlook.fyE.toFixed(2)}.` : ""}

Respond in plain text with bold headings on their own lines:
**HEADLINE**
[2 sentences: the result and the one driver that matters most]
**REVENUE**
[3 bullets: volume, mix, price, each with the rupee figure]
**MARGIN AND COSTS**
[3 bullets on the price-cost spread and the cost lines that moved most]
**ACTIONS FOR NEXT PERIOD**
[3 numbered, specific actions with an owner function]
Under 250 words. Sign convention: positive is favourable.`;

  const loadCsv = () => {
    try { const D = fpaParse(csv); setData(D); setSrc("custom"); setPtype("fy"); setCsvErr(null); setCsvOpen(false); flash && flash(`Loaded ${D.months.length} months and ${D.products.length} product lines.`); addLog && addLog("FP&A data loaded", `${D.months.length} months`); }
    catch (e) { setCsvErr(e.message || "Couldn't read that data."); }
  };
  const copyTpl = async () => { const t = fpaCsv(fpaSampleRows(sel.ind)); try { await navigator.clipboard.writeText(t); flash && flash("Template copied, with the sample data filled in."); } catch { setCsv(t); setCsvOpen(true); flash && flash("Copying isn't allowed here. The template is in the box below."); } };
  const qOpts = [0, 1, 2, 3].filter(i => i * 3 < n);

  const doExport = () => {
    if (mode === "yoy") {
      const I = sel.yi, rows = [[`Year-on-year EBITDA bridges, ${yLabel(I - 1)} to ${yLabel(I)} (₹ crore)`], [],
        ["Company", `${yLabel(I - 1)} EBITDA`, "Revenue growth", "Gross margin", "Operating costs", "Rounding", `${yLabel(I)} EBITDA`, "Check"].map(v => ({ v, b: true }))];
      sel.ids.forEach(id => { const z = yoyBridge(SX.co(id), I), r = rows.length + 1;
        rows.push([SX.co(id).short, +(z.from / 10).toFixed(2), +(z.vol / 10).toFixed(2), +(z.mar / 10).toFixed(2), +(z.cost / 10).toFixed(2), +(z.resid / 10).toFixed(2), +(z.to / 10).toFixed(2), { f: `B${r}+C${r}+D${r}+E${r}+F${r}-G${r}`, z: "0.00" }]); });
      suiteDownload(io, `fpa_yoy_bridges_${SX.ind(sel.ind).id}_${yLabel(I)}.xlsx`, [{ name: "YoY bridges", rows, widths: [18, 14, 15, 13, 15, 10, 14, 8] }, sourceSheet(sel.ids).sheet]);
      return;
    }
    const pl = [[`Profit and loss against budget · ${perLabel} (₹ crore)`], [], ["Line", "Budget", "Flexed budget", "Actual", "Variance vs budget", "Variance %", "Variance vs flexed"].map(v => ({ v, b: true }))];
    A.lines.forEach(r => { const k = pl.length + 1, sg = r.sign;
      pl.push([r.l, +r.b.toFixed(4), +r.f.toFixed(4), +r.a.toFixed(4), { f: sg > 0 ? `D${k}-B${k}` : `B${k}-D${k}`, z: "0.00" }, { f: `IF(B${k}=0,"",E${k}/ABS(B${k}))`, z: "0.0%" }, { f: sg > 0 ? `D${k}-C${k}` : `C${k}-D${k}`, z: "0.00" }]); });
    const br = [[`EBITDA bridge · ${perLabel} (₹ crore)`], [], [{ v: "Step", b: true }, { v: "₹ crore", b: true }]];
    A.bridge.forEach(b => br.push([b.l, +b.v.toFixed(4)]));
    br.push([]); br.push(["Check: budget + steps − actual", { f: `B4+SUM(B5:B${3 + A.bridge.length - 1})-B${3 + A.bridge.length}`, z: "0.0000" }]);
    const mo = [["Month by month (₹ crore)"], [], ["Month", "Budget revenue", "Actual revenue", "Budget EBITDA", "Actual EBITDA"].map(v => ({ v, b: true }))];
    monthly.forEach((r, j) => mo.push([data.months[j], +r.BR.toFixed(2), +r.AR.toFixed(2), +r.BE.toFixed(2), +r.AE.toFixed(2)]));
    const raw = [FPA_COLS.map(v => ({ v, b: true })), ...fpaCsv(src === "sample" ? fpaSampleRows(sel.ind) : []).split("\n").slice(1).filter(Boolean).map(l => l.split(",").map(x => x === "" ? null : isNaN(+x) ? x : +x))];
    suiteDownload(io, `fpa_variance_${src === "sample" ? sel.ind : "custom"}.xlsx`, [{ name: "P&L vs budget", rows: pl, widths: [30, 12, 14, 12, 18, 11, 18] },
      { name: "EBITDA bridge", rows: br, widths: [32, 12] }, { name: "Monthly", rows: mo, widths: [10, 15, 15, 15, 15] }, ...(src === "sample" ? [{ name: "Input data", rows: raw, widths: [9, 26, 11, 14, 14, 14, 14] }] : [])]);
  };

  return (<>
    <SuitePicker space="fpa" onExport={doExport} extra={<div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 }}>View</div>
      <div style={{ maxWidth: "100%", overflowX: "auto", whiteSpace: "nowrap" }}><Segment options={[["bva", `Budget vs actual · sample ${S0.co}`], ["yoy", "Listed companies · year on year"]]} value={mode} onChange={setMode} size="sm" /></div>
    </div>} />
    {mode === "yoy" ? <FpaPeerView sel={sel} c={c} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} addLog={addLog} /> : <>
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ maxWidth: 600 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Budget against actual{src === "sample" ? ` · a fictional ${S0.co}` : ""}</div>
          <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 6, lineHeight: 1.6 }}>Price, volume and mix on revenue, a flexed budget for variable costs, and an EBITDA bridge that adds up exactly. The sample changes with the industry you pick.</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {src === "sample" ? <Chip kind="amber">Sample data · fictional company</Chip> : <Chip kind="primary">Your data</Chip>}
            {src !== "sample" && <Btn size="sm" variant="ghost" onClick={() => { setData(fpaSample(sel.ind)); setSrc("sample"); setPtype("fy"); }}>Back to the sample</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setCsvOpen(o => !o)}>{csvOpen ? "Hide data entry" : "Use your own data"}</Btn>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMute }}>Period</div>
          <div style={{ maxWidth: "100%", overflowX: "auto", whiteSpace: "nowrap" }}><Segment options={[["fy", "Full year"], ["q", "Quarter"], ["ytd", "Year to date"], ["m", "Month"]]} value={ptype} onChange={setPtype} size="sm" /></div>
          {ptype === "q" && <Segment options={qOpts.map(i => [i, `Q${i + 1}`])} value={q} onChange={setQ} size="sm" />}
          {(ptype === "m" || ptype === "ytd") && <div style={{ width: 170 }}><Sel v={String(m)} onChange={v => setM(+v)}>{data.months.map((mm, j) => <option key={mm} value={j}>{ptype === "ytd" ? `Through ${mm}` : mm}</option>)}</Sel></div>}
        </div>
      </div>
      {csvOpen && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.65, marginBottom: 10, maxWidth: 760 }}>
          Paste rows from a spreadsheet, comma or tab separated, with the columns <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{FPA_COLS.join(", ")}</span>.
          <b> kind</b> is sales (volume and revenue), material (cost of those sales), var_cost (flexes with total volume) or fixed_cost. Amounts in ₹ crore; volumes in any one unit.
        </div>
        <textarea id="fpa-csv" value={csv} onChange={e => setCsv(e.target.value)} rows={7} placeholder={`${FPA_COLS.join(",")}\nApr-25,PVC pipes,sales,2625,33.60,2678,34.27`}
          style={{ width: "100%", boxSizing: "border-box", background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }} />
        {csvErr && <div style={{ color: T.red, fontSize: 12, marginTop: 8 }}>{csvErr}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Btn size="sm" variant="filled" onClick={loadCsv} disabled={!csv.trim()}>Analyse this data</Btn>
          <Btn size="sm" onClick={copyTpl}>Copy the template</Btn>
        </div>
      </div>}
    </Card>

    <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 16 }}>
      <Stat label="Revenue" value={crF(A.AR)} sub={`Budget ${crF(A.BR)} · ${varF(d(A.AR, A.BR), 1)}%`} color={A.AR >= A.BR ? T.green : T.red} />
      <Stat label="Gross margin" value={`${A.gmA.toFixed(1)}%`} sub={`Budget ${A.gmB.toFixed(1)}% · ${varF((A.gmA - A.gmB) * 100, 0)} bps`} color={A.gmA >= A.gmB ? T.green : T.red} />
      <Stat label="EBITDA" value={crF(A.AE)} sub={`Budget ${crF(A.BE)} · ${varF(d(A.AE, A.BE), 1)}%`} color={A.AE >= A.BE ? T.green : T.red} />
      <Stat label="Volume" value={`${Math.round(A.AQ).toLocaleString("en-IN")} ${U.vu}`} sub={`Budget ${Math.round(A.BQ).toLocaleString("en-IN")} · ${varF(d(A.AQ, A.BQ), 1)}%`} />
    </div>

    <Card>
      <Title sub={`${perLabel}. Each step is the change in EBITDA from one cause, favourable to the right in green and adverse to the left in red. The steps add up exactly from budget to actual.`}>EBITDA bridge, budget to actual (₹ crore)</Title>
      <Waterfall steps={A.bridge.map(b => b.l === "Material cost" ? { ...b, l: U.mat } : b)} />
    </Card>

    <Card>
      <Title sub="Price variance uses actual volumes; mix and volume use budget prices. Volume is the change in total volume at the budget average price; mix is the shift between products. The three add up to the revenue variance.">Revenue: price, volume and mix</Title>
      <Scroll min={860}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Product</th><th style={thS(T)}>Budget {U.vu}</th><th style={thS(T)}>Actual {U.vu}</th><th style={thS(T)}>Budget {U.pu}</th><th style={thS(T)}>Actual {U.pu}</th>
            <th style={thS(T)}>Budget revenue</th><th style={thS(T)}>Actual revenue</th><th style={thS(T)}>Price</th><th style={thS(T)}>Mix</th><th style={thS(T)}>Volume</th><th style={thS(T)}>Total</th></tr></thead>
          <tbody>
            {A.P.map(p => <tr key={p.l}><td style={tdL(T)}>{p.l}{p.isNew && <span style={{ color: T.textMute, fontSize: 11 }}> · new</span>}</td>
              <td style={tdS(T)}>{Math.round(p.bQ).toLocaleString("en-IN")}</td><td style={tdS(T)}>{Math.round(p.aQ).toLocaleString("en-IN")}</td>
              <td style={tdS(T)}>{(p.bP * 1e4).toFixed(1)}</td><td style={tdS(T)}>{(p.aP * 1e4).toFixed(1)}</td>
              <td style={tdS(T)}>{p.bRev.toFixed(2)}</td><td style={tdS(T)}>{p.aRev.toFixed(2)}</td>
              {[p.price, p.mixR, p.volR, p.aRev - p.bRev].map((v, k) => <td key={k} style={{ ...tdS(T), color: v >= 0 ? T.green : T.red, fontWeight: k === 3 ? 600 : 400 }}>{varF(v)}</td>)}</tr>)}
            <tr><td style={{ ...tdL(T), fontWeight: 600 }}>Total</td>
              <td style={{ ...tdS(T), fontWeight: 600 }}>{Math.round(A.BQ).toLocaleString("en-IN")}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{Math.round(A.AQ).toLocaleString("en-IN")}</td>
              <td style={tdS(T)}>{(A.BR / A.BQ * 1e4).toFixed(1)}</td><td style={tdS(T)}>{(A.AR / A.AQ * 1e4).toFixed(1)}</td>
              <td style={{ ...tdS(T), fontWeight: 600 }}>{A.BR.toFixed(2)}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{A.AR.toFixed(2)}</td>
              {[A.price, A.mixR, A.volR, A.AR - A.BR].map((v, k) => <td key={k} style={{ ...tdS(T), color: v >= 0 ? T.green : T.red, fontWeight: 600 }}>{varF(v)}</td>)}</tr>
          </tbody>
        </table>
      </Scroll>
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 10 }}>₹ crore unless stated. Positive is favourable. Prices are revenue per unit sold ({U.pu}).</div>
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub="The flexed budget restates variable lines at the volume actually sold, so it separates what volume did from what spending did. Flags mark adverse variances over both thresholds.">Profit and loss against budget</Title>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ width: 92 }}><Field label="Flag at %"><NI v={thr.pct} onChange={v => setThr(t => ({ ...t, pct: v }))} /></Field></div>
          <div style={{ width: 104 }}><Field label="and ₹ Cr"><NI v={thr.abs} onChange={v => setThr(t => ({ ...t, abs: v }))} /></Field></div>
        </div>
      </div>
      <Scroll min={780}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>₹ crore</th><th style={thS(T)}>Budget</th><th style={thS(T)}>Flexed budget</th><th style={thS(T)}>Actual</th>
            <th style={thS(T)}>vs budget</th><th style={thS(T)}>%</th><th style={thS(T)}>vs flexed</th><th style={{ ...thS(T), textAlign: "center" }}>Flag</th></tr></thead>
          <tbody>{A.lines.map(r => <React.Fragment key={r.k}>
            <tr style={{ background: r.bold ? T.surfaceAlt : "transparent" }}>
              <td style={{ ...tdL(T), fontWeight: r.bold ? 600 : 400, paddingLeft: r.bold ? 10 : 20 }}>{r.k === "mat" ? U.mat : r.l}{r.tag && <span style={{ color: T.textMute, fontSize: 11 }}> · {r.tag}</span>}</td>
              <td style={tdS(T)}>{r.b.toFixed(2)}</td><td style={{ ...tdS(T), color: T.textSec }}>{r.f.toFixed(2)}</td><td style={{ ...tdS(T), fontWeight: 600 }}>{r.a.toFixed(2)}</td>
              <td style={{ ...tdS(T), color: r.var >= 0 ? T.green : T.red }}>{varF(r.var)}</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{r.pct == null ? "—" : `${varF(r.pct, 1)}%`}</td>
              <td style={{ ...tdS(T), color: r.varFlex >= 0 ? T.green : T.red }}>{varF(r.varFlex)}</td>
              <td style={{ ...tdS(T), textAlign: "center" }}>{!r.bold && flagOf(r) ? <Chip kind="red">Investigate</Chip> : ""}</td></tr>
            {(r.k === "gp" || r.k === "ebitda") && <tr><td style={{ ...tdL(T), color: T.textSec, paddingLeft: 20 }}>{r.k === "gp" ? "Gross margin" : "EBITDA margin"}</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{(r.k === "gp" ? A.gmB : A.emB).toFixed(1)}%</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{(r.f / A.flexR * 100).toFixed(1)}%</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{(r.k === "gp" ? A.gmA : A.emA).toFixed(1)}%</td>
              <td style={{ ...tdS(T), color: T.textSec }}>{varF(((r.k === "gp" ? A.gmA - A.gmB : A.emA - A.emB)) * 100, 0)} bps</td><td style={tdS(T)} /><td style={tdS(T)} /><td style={tdS(T)} /></tr>}
          </React.Fragment>)}</tbody>
        </table>
      </Scroll>
      <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 12, lineHeight: 1.6 }}>
        Sales activity variance, from volume and mix (flexed less original budget EBITDA): <b style={{ fontFamily: MONO }}>{varF(A.flexE - A.BE)}</b>. Flexible-budget variance, from prices and spending (actual less flexed EBITDA): <b style={{ fontFamily: MONO }}>{varF(A.AE - A.flexE)}</b>.
      </div>
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Title sub="Bars are actual; the dark tick on each bar is budget. Months outside the selected period are faded.">Month by month</Title>
        <Segment options={[["rev", "Revenue"], ["ebitda", "EBITDA"], ["gm", "Gross margin"]]} value={metric} onChange={setMetric} size="sm" />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: T.textSec, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: T.primary }} />Actual</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 2, background: T.text }} />Budget</span>
      </div>
      <MonthBars labels={data.months} budget={monthly.map(series[2])} actual={monthly.map(series[3])} unit={series[1] === "%" ? "%" : "₹"} inPeriod={S} />
      <Scroll min={760}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>{series[0]}</th>{data.months.map(mm => <th key={mm} style={thS(T)}>{mm.slice(0, 3)}</th>)}</tr></thead>
          <tbody>{[["Budget", 2], ["Actual", 3]].map(([l, k]) => <tr key={l}><td style={tdL(T)}>{l}</td>
            {monthly.map((r, j) => <td key={j} style={{ ...tdS(T), fontSize: 11 }}>{series[k](r).toFixed(series[1] === "%" ? 1 : 2)}</td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub="Running totals through the year. The gap between the lines at any month is the year-to-date variance.">Cumulative EBITDA, actual against budget (₹ crore)</Title>
      <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: T.textSec, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 3, background: T.primary }} />Actual</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 2, background: T.textSec }} />Budget</span>
      </div>
      <SuiteLine series={[{ id: "a", label: "Actual", role: "focus", values: cum(r => r.AE) }, { id: "b", label: "Budget", role: "median", values: cum(r => r.BE) }]} labels={data.months.map(mm => mm.slice(0, 3))} unit="" dec={0} height={220} />
    </Card>

    <Card>
      <Title sub="Variance by line and month, as a share of budget. Green is favourable and red adverse; deeper colour means 8% or more. Revenue lines are product sales.">Variance heatmap</Title>
      <Scroll min={900}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>Line</th>{data.months.map(mm => <th key={mm} style={thS(T)}>{mm.slice(0, 3)}</th>)}</tr></thead>
          <tbody>{heatLines.map(L => <tr key={L.l}><td style={{ ...tdL(T), fontWeight: L.bold ? 600 : 400 }}>{L.l}</td>
            {data.months.map((_, j) => { const v = hv(L, j); return <td key={j} style={{ ...tdS(T), fontSize: 11, background: hbg(v), opacity: S.includes(j) ? 1 : 0.45 }}>{SX.ok(v) ? (Math.abs(v) < 0.5 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%`) : "—"}</td>; })}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>

    <Card>
      <Title sub={`On actual figures for the period. Contribution is revenue less ${U.mat.toLowerCase()} and variable costs. Operating leverage shows how sharply EBITDA reacts to a change in revenue.`}>Break-even and operating leverage</Title>
      <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
        <Stat label="Contribution margin" value={cmr != null ? `${(cmr * 100).toFixed(1)}%` : "—"} sub={`Contribution ${crF(contrib)}`} />
        <Stat label="Fixed costs" value={crF(A.AF)} sub={`${(A.AF / A.AR * 100).toFixed(1)}% of revenue`} />
        <Stat label="Break-even revenue" value={crF(beRev)} sub={mos != null ? `Margin of safety ${mos.toFixed(0)}%` : ""} />
        <Stat label="Operating leverage" value={dol ? `${dol.toFixed(2)}×` : "—"} sub="% change in EBITDA per 1% change in revenue" />
      </div>
    </Card>

    {outlook && <Card>
      <Title sub={`Three ways to see the full year from ${data.months[S[S.length - 1]]}: keep the budget for the months left, scale them by the year-to-date hit rate, or apply your own price and volume change to the remaining budget.`}>Full-year outlook</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,170px),1fr))", gap: 12, marginBottom: 14, maxWidth: 400 }}>
        <Field label="Price change, rest of year (%)"><NI v={wiP} onChange={setWiP} /></Field>
        <Field label="Volume change, rest of year (%)"><NI v={wiV} onChange={setWiV} /></Field>
      </div>
      <Scroll min={640}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thS(T), textAlign: "left" }}>₹ crore</th><th style={thS(T)}>Full-year budget</th><th style={thS(T)}>Actual so far + budget</th><th style={thS(T)}>At year-to-date run rate</th><th style={thS(T)}>With your changes</th></tr></thead>
          <tbody>{[["Revenue", outlook.fyR, outlook.leR, outlook.trR, outlook.wiR], ["EBITDA", outlook.fyE, outlook.leE, outlook.trE, outlook.wiE]].map(([l, b, le, tr, wi]) => <tr key={l}>
            <td style={{ ...tdL(T), fontWeight: 600 }}>{l}</td><td style={tdS(T)}>{b.toFixed(2)}</td>
            {[le, tr, wi].map((v, k) => <td key={k} style={tdS(T)}>{v.toFixed(2)} <span style={{ color: v >= b ? T.green : T.red }}>({varF(v - b)})</span></td>)}</tr>)}</tbody>
        </table>
      </Scroll>
    </Card>}

    <Card>
      <Title>What moved the numbers · {perLabel}</Title>
      <Findings items={find} />
      <AiNote label="Draft CFO commentary" build={aiPrompt} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} addLog={addLog} logLabel="Variance commentary written" />
    </Card>

    <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.7, margin: "4px 2px 0" }}>
      {src === "sample" ? `The sample is a fictional ${S0.co} built to show the method: its budget follows normal seasonality and its actuals include a weak monsoon quarter, price cuts on its main product, share gains in its premium line, dearer freight and a festive marketing push. It does not describe any real company.` :
        "Analysed from the data you pasted. Nothing leaves your browser."} Method: revenue variance = price + mix + volume; EBITDA variance = volume (at budget contribution) + mix + price + direct cost + cost-line spending, with variable costs flexed month by month.
    </div>
    </>}
  </>);
}
