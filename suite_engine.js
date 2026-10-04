/* ═══════════════════════════════════════════════════════════════════════
   ANALYSIS SUITE — engine (pure functions, no React)
   Ten industries, 47 listed Indian companies, FY2022–FY2026.
   All money in INR million. Years run oldest → newest (index 0 = FY2022).
   ═══════════════════════════════════════════════════════════════════════ */
const SUITE_RAW = __SUITE_JSON__;
const SUITE_FIELDS = ["rev","cogs","gp","opex","ebit","da","ebitda","int","pbt","tax","ni","sga","mie","shB","dpsH","cash","ar","rec",
  "inv","ca","ppe","lti","gw","ta","ap","std","ltd","cl","debt","tl","re","eq","mi","shTot","dacf","cfo","capex","div","issue","fcfSrc"];
const SUITE = (() => {
  const years = ["FY2022","FY2023","FY2024","FY2025","FY2026"];
  const cos = SUITE_RAW.cos.map(c => {
    const o = { ...c };
    SUITE_FIELDS.forEach(f => { o[f] = Array.isArray(c[f]) ? [...c[f]].reverse() : years.map(() => null); });
    o.mcap = c.price * c.shares;
    return o;
  });
  const byId = Object.fromEntries(cos.map(c => [c.id, c]));
  const ind = SUITE_RAW.industries.map(x => ({ ...x }));
  const indOf = Object.fromEntries(ind.flatMap(x => x.cos.map(id => [id, x.id])));
  return { years, cos, byId, ind, indOf, last: years.length - 1, first: 1, asOf: SUITE_RAW.asOfPrices };
})();
const SUITE_TAX = 25.17;           // India's new-regime corporate rate incl. surcharge and cess, for NOPAT
const SX = {
  ok: v => v != null && isFinite(v),
  med(arr) { const a = arr.filter(SX.ok).sort((x, y) => x - y); if (!a.length) return null;
    const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; },
  /* inclusive percentile with linear interpolation (Excel PERCENTILE.INC) */
  pct(arr, q) { const a = arr.filter(SX.ok).sort((x, y) => x - y); if (!a.length) return null;
    const h = (a.length - 1) * q, lo = Math.floor(h); return lo + 1 < a.length ? a[lo] + (h - lo) * (a[lo + 1] - a[lo]) : a[lo]; },
  div(a, b) { return SX.ok(a) && SX.ok(b) && b !== 0 ? a / b : null; },
  avg(c, f, i) { return i > 0 && SX.ok(c[f][i]) && SX.ok(c[f][i - 1]) ? (c[f][i] + c[f][i - 1]) / 2 : null; },
  co(id) { return SUITE.byId[id] || SUITE.cos[0]; },
  ind(id) { return SUITE.ind.find(x => x.id === id) || SUITE.ind[0]; },
  cr(v, d = 0) { if (!SX.ok(v)) return "—"; const x = v / 10;   // ₹ million → ₹ crore
    return `₹${Math.abs(x).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })} Cr`.replace(/^/, x < 0 ? "−" : ""); },
  list(a) { return a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || ""; },
};
/* What drives costs in each industry, used in explanations and AI prompts. */
const IND_META = {
  pipes: { noun: "PVC pipe makers", input: "PVC resin prices", channel: "dealers and distributors" },
  paints: { noun: "paint companies", input: "crude-linked raw materials such as titanium dioxide and monomers", channel: "dealers" },
  fmcg: { noun: "FMCG companies", input: "commodity inputs such as palm oil, milk, wheat and packaging", channel: "distributors and modern trade" },
  it: { noun: "IT services companies", input: "employee costs, wage hikes and utilisation", channel: "enterprise clients" },
  pharma: { noun: "pharmaceutical companies", input: "US generic price erosion and API costs", channel: "distributors and US wholesalers" },
  cement: { noun: "cement companies", input: "power, fuel and freight costs", channel: "dealers and institutional buyers" },
  steel: { noun: "steel makers", input: "iron ore and coking coal prices", channel: "distributors and large industrial buyers" },
  cables: { noun: "cable and wire makers", input: "copper and aluminium prices", channel: "electrical dealers and project customers" },
  tyres: { noun: "tyre makers", input: "natural rubber and crude-linked materials", channel: "dealers and vehicle makers" },
  gas: { noun: "city gas distributors", input: "gas sourcing costs (domestic allocation and spot LNG)", channel: "retail, commercial and industrial users" },
};
const indMeta = id => {
  const g = SUITE.indOf[id] || id;
  if (IND_META[g]) return IND_META[g];
  const c = SUITE.byId[id], G = SUITE.ind.find(x => x.id === g), nm = (c && c.live && c.live.group) || (G && G.name) || "listed";
  return { noun: `${String(nm).replace(/—/g, " ").toLowerCase()} companies`, input: "their main input costs", channel: "their customers" };
};

/* ── Ratio definitions: key, label, group, unit, direction (hi = higher is better) ── */
const RATIO_DEFS = [
  { k:"gm",   l:"Gross margin",        g:"Profitability", u:"%", hi:true,  f:"Gross profit ÷ revenue",
    w:"What is left after raw material and direct production cost. Input prices move it most." },
  { k:"em",   l:"EBITDA margin",       g:"Profitability", u:"%", hi:true,  f:"EBITDA ÷ revenue",
    w:"Operating profit before depreciation. The cleanest read on pricing power and cost control." },
  { k:"nm",   l:"Net margin",          g:"Profitability", u:"%", hi:true,  f:"Net income ÷ revenue",
    w:"Profit left for shareholders from each rupee of sales, after interest, tax and one-offs." },
  { k:"roe",  l:"Return on equity",    g:"Returns", u:"%", hi:true,  f:"Net income ÷ average equity",
    w:"What the business earns on shareholders' money. Broken down below with DuPont." },
  { k:"roce", l:"ROCE",                g:"Returns", u:"%", hi:true,  f:"EBIT ÷ average (total assets − current liabilities)",
    w:"Operating profit on all long-term capital. Cash and investments sit in the base, so cash-rich firms look weaker." },
  { k:"roic", l:"ROIC (operating)",    g:"Returns", u:"%", hi:true,  f:`EBIT × (1 − ${SUITE_TAX}%) ÷ average (equity + debt − cash − investments)`,
    w:"Return on the capital actually tied up in operations. Strips out cash and investment books." },
  { k:"ato",  l:"Asset turnover",      g:"Efficiency", u:"x", hi:true,  f:"Revenue ÷ average total assets",
    w:"Sales generated per rupee of assets. The middle term of DuPont." },
  { k:"fato", l:"Fixed-asset turnover",g:"Efficiency", u:"x", hi:true,  f:"Revenue ÷ average net PP&E",
    w:"How hard the plants work. Falls while new capacity is still ramping up." },
  { k:"dso",  l:"Receivable days (DSO)", g:"Efficiency", u:"d", hi:false, f:"Trade receivables ÷ revenue × 365",
    w:"How long customers take to pay. Every day is cash lent to customers." },
  { k:"dio",  l:"Inventory days (DIO)",  g:"Efficiency", u:"d", hi:false, f:"Inventory ÷ cost of revenue × 365",
    w:"How long stock sits before it is sold. Near zero for service businesses." },
  { k:"dpo",  l:"Payable days (DPO)",    g:"Efficiency", u:"d", hi:true,  f:"Trade payables ÷ cost of revenue × 365",
    w:"How long the company takes to pay suppliers. Higher frees cash, but only up to what suppliers accept." },
  { k:"ccc",  l:"Cash conversion cycle", g:"Efficiency", u:"d", hi:false, f:"DSO + DIO − DPO",
    w:"Days between paying for materials and collecting from customers." },
  { k:"cur",  l:"Current ratio",       g:"Liquidity", u:"x", hi:true,  f:"Current assets ÷ current liabilities",
    w:"Short-term assets available to meet short-term obligations." },
  { k:"quick",l:"Quick ratio",         g:"Liquidity", u:"x", hi:true,  f:"(Current assets − inventory) ÷ current liabilities",
    w:"The same test without relying on selling inventory." },
  { k:"de",   l:"Debt to equity",      g:"Leverage", u:"x", hi:false, f:"Total debt incl. leases ÷ equity",
    w:"How much of the balance sheet is funded by lenders." },
  { k:"nde",  l:"Net debt ÷ EBITDA",   g:"Leverage", u:"x", hi:false, f:"(Debt − cash and short-term investments) ÷ EBITDA",
    w:"Years of EBITDA needed to repay net debt. Below zero means net cash." },
  { k:"icov", l:"Interest coverage",   g:"Leverage", u:"x", hi:true, d:1,  f:"EBIT ÷ interest expense",
    w:"How many times operating profit covers interest. Lenders watch this first." },
  { k:"cconv",l:"Cash conversion",     g:"Cash flow", u:"%", hi:true, f:"Operating cash flow ÷ EBITDA",
    w:"How much of EBITDA turned into cash. Working-capital swings move it year to year." },
  { k:"fcfm", l:"Free-cash-flow margin", g:"Cash flow", u:"%", hi:true, f:"(Operating cash flow − capex) ÷ revenue",
    w:"Cash left after reinvestment, per rupee of sales." },
];
const RATIO_GROUPS = ["Profitability","Returns","Efficiency","Liquidity","Leverage","Cash flow"];
const rdef = k => RATIO_DEFS.find(d => d.k === k);

function suiteRatios(c, i) {
  const d = SX.div, a = (f) => SX.avg(c, f, i);
  const ce = j => c.ta[j] - c.cl[j];
  const ic = j => c.eq[j] + c.mi[j] + c.debt[j] - c.cash[j] - c.lti[j];
  const avgCE = i > 0 ? (ce(i) + ce(i - 1)) / 2 : null;
  const avgIC = i > 0 ? (ic(i) + ic(i - 1)) / 2 : null;
  const r = {
    gm: d(c.gp[i], c.rev[i]) * 100, em: d(c.ebitda[i], c.rev[i]) * 100,
    ebitm: d(c.ebit[i], c.rev[i]) * 100, nm: d(c.ni[i], c.rev[i]) * 100,
    roe: i > 0 && a("eq") > 0 ? d(c.ni[i], a("eq")) * 100 : null,
    roa: i > 0 ? d(c.ni[i], a("ta")) * 100 : null,
    roce: avgCE > 0 ? c.ebit[i] / avgCE * 100 : null,
    roic: avgIC > 0 ? c.ebit[i] * (1 - SUITE_TAX / 100) / avgIC * 100 : null,
    ato: i > 0 ? d(c.rev[i], a("ta")) : null,
    fato: i > 0 ? d(c.rev[i], a("ppe")) : null,
    emult: i > 0 ? d(a("ta"), a("eq")) : null,
    dso: d(c.ar[i], c.rev[i]) * 365, dio: d(c.inv[i], c.cogs[i]) * 365, dpo: d(c.ap[i], c.cogs[i]) * 365,
    cur: d(c.ca[i], c.cl[i]), quick: d(c.ca[i] - c.inv[i], c.cl[i]), cashr: d(c.cash[i], c.cl[i]),
    de: c.eq[i] > 0 ? d(c.debt[i], c.eq[i]) : null,
    nde: c.ebitda[i] > 0 ? (c.debt[i] - c.cash[i]) / c.ebitda[i] : null,
    icov: c.int[i] > 0 ? c.ebit[i] / c.int[i] : null,
    cconv: c.ebitda[i] > 0 ? c.cfo[i] / c.ebitda[i] * 100 : null,
    fcfm: d(c.cfo[i] - c.capex[i], c.rev[i]) * 100,
    taxb: d(c.ni[i], c.pbt[i]), intb: d(c.pbt[i], c.ebit[i]),
    nwcp: d(c.ar[i] + c.inv[i] - c.ap[i], c.rev[i]) * 100,
    cfoni: c.ni[i] > 0 ? c.cfo[i] / c.ni[i] : null,
    accr: i > 0 ? d(c.ni[i] - c.cfo[i], a("ta")) * 100 : null,
    effr: i > 0 && a("debt") > 0 ? c.int[i] / a("debt") * 100 : null,
    payout: c.ni[i] > 0 ? c.div[i] / c.ni[i] * 100 : null,
    capexda: c.da[i] > 0 ? c.capex[i] / c.da[i] : null,
  };
  r.ccc = SX.ok(r.dso) && SX.ok(r.dio) && SX.ok(r.dpo) ? r.dso + r.dio - r.dpo : null;
  Object.keys(r).forEach(k => { if (!SX.ok(r[k])) r[k] = null; });
  return r;
}
/* Every company × every year, computed once. */
const SUITE_R = SUITE.cos.reduce((m, c) => { m[c.id] = SUITE.years.map((_, i) => suiteRatios(c, i)); return m; }, {});
/* Market multiples use the 25 Sep 2026 price against the latest year (FY2026). cashAdj takes off cash paid out
   after 31 March 2026 in a buyback, because the share count is already after it. */
function suiteMarket(c) {
  const i = SUITE.last, ev = c.mcap + c.debt[i] + c.mi[i] - c.cash[i] - (c.cashAdj || 0);
  return { mcap: c.mcap, ev, pe: c.ni[i] > 0 ? c.mcap / c.ni[i] : null, pb: c.eq[i] > 0 ? c.mcap / c.eq[i] : null,
    evEbitda: c.ebitda[i] > 0 ? ev / c.ebitda[i] : null, evSales: ev / c.rev[i], dy: c.dps / c.price * 100,
    roic: SUITE_R[c.id][i].roic, roe: SUITE_R[c.id][i].roe };
}
function peerIds(focus, ids) { return ids.filter(id => id !== focus); }
function peerMedian(key, focus, i, ids) { return SX.med(peerIds(focus, ids).map(id => SUITE_R[id][i][key])); }
function ratioRank(key, id, i, ids) {                 // 1 = best in the comparison
  const def = rdef(key);
  const vals = ids.map(x => ({ id: x, v: SUITE_R[x][i][key] })).filter(x => SX.ok(x.v));
  vals.sort((a, b) => def && def.hi === false ? a.v - b.v : b.v - a.v);
  const at = vals.findIndex(x => x.id === id);
  return at < 0 ? null : { rank: at + 1, of: vals.length };
}

/* DuPont: log-share attribution of the ROE gap between two companies (or a synthetic
   "median company" built from the median of each driver). Contributions sum to the gap. */
function dupontGap(fr, cr_) {
  if (!(fr.nm > 0 && fr.ato > 0 && fr.emult > 0 && cr_.nm > 0 && cr_.ato > 0 && cr_.emult > 0)) return null;
  const roeF = fr.nm * fr.ato * fr.emult, roeC = cr_.nm * cr_.ato * cr_.emult;
  const gap = roeF - roeC, L = Math.log(roeF / roeC);
  const parts = [["Net margin", Math.log(fr.nm / cr_.nm)], ["Asset turnover", Math.log(fr.ato / cr_.ato)],
    ["Equity multiplier", Math.log(fr.emult / cr_.emult)]];
  return { roeF, roeC, gap, parts: parts.map(([l, x]) => ({ l, pts: Math.abs(L) < 1e-9 ? 0 : gap * x / L, ratio: Math.exp(x) })) };
}

/* Growth: compound annual growth over n years ending at year i (needs positive endpoints). */
function cagr(a, b, n) { return SX.ok(a) && SX.ok(b) && a > 0 && b > 0 && n > 0 ? (Math.pow(b / a, 1 / n) - 1) * 100 : null; }
const GROWTH_ITEMS = [["Revenue", c => c.rev], ["EBITDA", c => c.ebitda], ["Net income", c => c.ni],
  ["EPS", c => c.ni.map((v, j) => SX.div(v, c.shB[j]))], ["Book value per share", c => c.eq.map((v, j) => SX.div(v, c.shTot[j]))]];
function growthTable(c, i) {
  return GROWTH_ITEMS.map(([l, fn]) => { const s = fn(c);
    return { l, y1: i >= 1 ? cagr(s[i - 1], s[i], 1) : null, c3: i >= 3 ? cagr(s[i - 3], s[i], 3) : null, c4: i >= 4 ? cagr(s[0], s[4], 4) : null }; });
}

/* Common-size statements: income statement as % of revenue, balance sheet as % of total assets. */
function commonSize(c, i) {
  const p = (v, b) => SX.div(v, b) * 100, R = c.rev[i], A = c.ta[i];
  const oca = c.ca[i] - c.cash[i] - c.rec[i] - c.inv[i];
  const onc = A - c.ca[i] - c.ppe[i] - c.lti[i] - c.gw[i];
  return {
    is: [["Revenue", 100, 1], ["Cost of revenue", p(c.cogs[i], R)], ["Gross profit", p(c.gp[i], R), 1], ["Operating costs excl. D&A", p(c.opex[i] - c.da[i], R)],
      ["EBITDA", p(c.ebitda[i], R), 1], ["Depreciation & amortisation", p(c.da[i], R)], ["EBIT", p(c.ebit[i], R), 1],
      ["Interest", p(c.int[i], R)], ["Profit before tax", p(c.pbt[i], R), 1], ["Tax", p(c.tax[i], R)], ["Net income", p(c.ni[i], R), 1]],
    bs: [["Cash & short-term investments", p(c.cash[i], A)], ["Receivables", p(c.rec[i], A)], ["Inventory", p(c.inv[i], A)],
      ["Other current assets", p(oca, A)], ["Net PP&E", p(c.ppe[i], A)], ["Long-term investments", p(c.lti[i], A)], ["Goodwill", p(c.gw[i], A)],
      ["Other non-current assets", p(onc, A)], ["Total assets", 100, 1], ["Trade payables", p(c.ap[i], A)], ["Other current liabilities", p(c.cl[i] - c.ap[i], A)],
      ["Non-current liabilities", p(c.tl[i] - c.cl[i], A)], ["Shareholders' equity", p(c.eq[i], A), 1], ["Minority interest", p(c.mi[i], A)],
      ["Memo: total debt incl. leases", p(c.debt[i], A)]],
  };
}

/* Items outside continuing operations: net income less (PBT − tax + minority share). */
function oneOffs(c, i) { const v = c.ni[i] - (c.pbt[i] - c.tax[i] + (c.mie[i] || 0)); return Math.abs(v) > Math.max(5, 0.02 * Math.abs(c.ni[i])) ? v : 0; }

/* ── Credit: Altman scores ── */
const EMS_BANDS = [[8.15,"AAA"],[7.60,"AA+"],[7.30,"AA"],[7.00,"AA−"],[6.85,"A+"],[6.65,"A"],[6.40,"A−"],[6.25,"BBB+"],
  [5.85,"BBB"],[5.65,"BBB−"],[5.25,"BB+"],[4.95,"BB"],[4.75,"BB−"],[4.50,"B+"],[4.15,"B"],[3.75,"B−"],[3.20,"CCC+"],
  [2.50,"CCC"],[1.75,"CCC−"],[-Infinity,"D"]];
function emsRating(v) { return SX.ok(v) ? EMS_BANDS.find(([t]) => v >= t)[1] : "—"; }
function altman(c, i, mcap, ebitOverride) {
  const ta = c.ta[i], ebit = ebitOverride != null ? ebitOverride : c.ebit[i];
  const x1 = (c.ca[i] - c.cl[i]) / ta, x2 = c.re[i] / ta, x3 = ebit / ta, x4b = (c.eq[i] + c.mi[i]) / c.tl[i];
  const zpp = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4b;
  const out = { x1, x2, x3, x4b, zpp, ems: 3.25 + zpp, rating: emsRating(3.25 + zpp),
    zone: !SX.ok(zpp) ? "n/a" : zpp > 2.6 ? "safe" : zpp >= 1.1 ? "grey" : "distress" };
  if (mcap != null) {
    const x4m = mcap / c.tl[i], x5 = c.rev[i] / ta;
    out.x4m = x4m; out.x5 = x5;
    out.z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4m + 1.0 * x5;
    out.zZone = out.z > 2.99 ? "safe" : out.z >= 1.81 ? "grey" : "distress";
    out.zNoMkt = out.z - 0.6 * x4m;           // what the score would be with the market term removed
  }
  return out;
}
/* Piotroski F-score, as in Piotroski (2000), with total debt standing in for long-term debt. Needs two prior years. */
function piotroski(c, i) {
  if (i < 2) return null;
  const need = [["ta", i], ["ta", i - 1], ["ta", i - 2], ["ni", i], ["ni", i - 1], ["rev", i], ["rev", i - 1], ["gp", i], ["gp", i - 1], ["cfo", i],
    ["debt", i], ["debt", i - 1], ["ca", i], ["ca", i - 1], ["cl", i], ["cl", i - 1]];
  if (need.some(([f, j]) => !SX.ok(c[f][j]))) return null;           // live companies with a shorter record
  const b = j => c.ta[j - 1];                 // beginning-of-year assets
  const roa = j => c.ni[j] / b(j), ato = j => c.rev[j] / b(j), gm = j => c.gp[j] / c.rev[j];
  const lev = j => c.debt[j] / ((c.ta[j] + c.ta[j - 1]) / 2), cur = j => c.ca[j] / c.cl[j];
  const s = [
    { g:"Profitability", n:"return on assets", l:"Positive return on assets", ok: roa(i) > 0, v:`${(roa(i) * 100).toFixed(1)}%` },
    { g:"Profitability", n:"operating cash flow", l:"Positive operating cash flow", ok: c.cfo[i] > 0, v: SX.cr(c.cfo[i]) },
    { g:"Profitability", n:"change in return on assets", l:"Return on assets improved", ok: roa(i) > roa(i - 1), v:`${(roa(i - 1) * 100).toFixed(1)}% → ${(roa(i) * 100).toFixed(1)}%` },
    { g:"Profitability", n:"accruals", l:"Cash flow exceeds profit (low accruals)", ok: c.cfo[i] / b(i) > roa(i), v:`CFO ${SX.cr(c.cfo[i])} vs NI ${SX.cr(c.ni[i])}` },
    { g:"Funding", n:"leverage", l:"Leverage fell", ok: lev(i) < lev(i - 1), v:`${(lev(i - 1) * 100).toFixed(1)}% → ${(lev(i) * 100).toFixed(1)}% of assets` },
    { g:"Funding", n:"current ratio", l:"Current ratio improved", ok: cur(i) > cur(i - 1), v:`${cur(i - 1).toFixed(2)}x → ${cur(i).toFixed(2)}x` },
    { g:"Funding", n:"share issuance", l:"No new shares issued", ok: !(c.issue[i] > 0), v: c.issue[i] > 0 ? `Raised ${SX.cr(c.issue[i])}` : "None" },
    { g:"Efficiency", n:"gross margin", l:"Gross margin improved", ok: gm(i) > gm(i - 1), v:`${(gm(i - 1) * 100).toFixed(1)}% → ${(gm(i) * 100).toFixed(1)}%` },
    { g:"Efficiency", n:"asset turnover", l:"Asset turnover improved", ok: ato(i) > ato(i - 1), v:`${ato(i - 1).toFixed(2)}x → ${ato(i).toFixed(2)}x` },
  ];
  return { signals: s, score: s.filter(x => x.ok).length };
}
/* Beneish M-score (8 variables, Beneish 1999). Above −1.78 flags a profile like past earnings manipulators. */
function beneish(c, i) {
  if (i < 1) return null;
  const p = i - 1, q = (a, b) => SX.div(a, b);
  const dep = j => (c.dacf[j] > 0 ? c.dacf[j] : c.da[j]);
  const sgaR = j => SX.ok(c.sga[j]) && c.sga[j] > 0 ? c.sga[j] / c.rev[j] : null;
  const v = {
    dsri: q(c.ar[i] / c.rev[i], c.ar[p] / c.rev[p]),
    gmi: q(c.gp[p] / c.rev[p], c.gp[i] / c.rev[i]),
    aqi: q(1 - (c.ca[i] + c.ppe[i]) / c.ta[i], 1 - (c.ca[p] + c.ppe[p]) / c.ta[p]),
    sgi: q(c.rev[i], c.rev[p]),
    depi: q(dep(p) / (dep(p) + c.ppe[p]), dep(i) / (dep(i) + c.ppe[i])),
    sgai: sgaR(i) != null && sgaR(p) != null ? sgaR(i) / sgaR(p) : 1,
    lvgi: q((c.cl[i] + c.ltd[i]) / c.ta[i], (c.cl[p] + c.ltd[p]) / c.ta[p]),
    tata: q(c.ni[i] - c.cfo[i], c.ta[i]),
  };
  Object.keys(v).forEach(k => { if (!SX.ok(v[k])) v[k] = k === "tata" ? 0 : 1; });
  const m = -4.84 + 0.920 * v.dsri + 0.528 * v.gmi + 0.404 * v.aqi + 0.892 * v.sgi + 0.115 * v.depi - 0.172 * v.sgai + 4.679 * v.tata - 0.327 * v.lvgi;
  return { ...v, m, zone: m > -1.78 ? "flag" : m > -2.22 ? "watch" : "clear" };
}
const BENEISH_ROWS = [["dsri","Days sales in receivables index",0.920,"Receivables growing faster than sales"],
  ["gmi","Gross margin index",0.528,"Margins deteriorating"],["aqi","Asset quality index",0.404,"More costs parked in soft assets"],
  ["sgi","Sales growth index",0.892,"Fast growth raises the pressure to report"],["depi","Depreciation index",0.115,"Slower depreciation"],
  ["sgai","SG&A index",-0.172,"Overheads rising relative to sales"],["lvgi","Leverage index",-0.327,"Higher leverage"],
  ["tata","Total accruals ÷ assets",4.679,"Profit not backed by cash"]];
/* Zmijewski (1984) probit: probability of financial distress. */
function zmijewski(c, i) {
  const x = -4.3 - 4.5 * (c.ni[i] / c.ta[i]) + 5.7 * (c.tl[i] / c.ta[i]) - 0.004 * (c.ca[i] / c.cl[i]);
  return { x, p: 1 / (1 + Math.exp(-x)) };
}
/* Synthetic rating from interest coverage (Damodaran's table for large non-financial firms). */
const SYNTH = [[8.5,"AAA"],[6.5,"AA"],[5.5,"A+"],[4.25,"A"],[3,"A−"],[2.5,"BBB"],[2.25,"BB+"],[2,"BB"],[1.75,"B+"],[1.5,"B"],[1.25,"B−"],[0.8,"CCC"],[0.65,"CC"],[0.2,"C"],[-Infinity,"D"]];
function synthRating(icov, noInterest) { if (noInterest) return "AAA"; return SX.ok(icov) ? SYNTH.find(([t]) => icov > t)[1] : "—"; }

/* ── Credit scorecard: piecewise-linear scoring between anchor points, weighted to 100 ── */
const SCORE_FACTORS = [
  { k:"icov", l:"Interest coverage", u:"x", w:25, pts:[[1,0],[1.5,15],[3,40],[6,70],[10,90],[20,100]], note:"EBIT ÷ interest" },
  { k:"nde",  l:"Net debt ÷ EBITDA", u:"x", w:20, pts:[[-0.5,100],[0,95],[1,80],[2,60],[3,40],[4,20],[5,0]], note:"Below zero = net cash" },
  { k:"de",   l:"Debt to equity",    u:"x", w:10, pts:[[0,100],[0.5,80],[1,55],[2,25],[3,0]], note:"Incl. lease liabilities" },
  { k:"cur",  l:"Current ratio",     u:"x", w:10, pts:[[0.8,0],[1,30],[1.5,70],[2,100]], note:"Current assets ÷ current liabilities" },
  { k:"cfod", l:"Operating cash flow ÷ debt", u:"x", w:15, pts:[[0,0],[0.2,40],[0.5,75],[1,100]], note:"Share of debt repayable from one year's cash flow" },
  { k:"ems",  l:"Altman EM score",   u:"",  w:20, pts:[[3.75,0],[4.5,25],[5.65,55],[6.65,75],[8.15,100]], note:"Book-value version for emerging markets" },
];
const WEIGHT_PRESETS = {
  balanced: { l: "Balanced", w: { icov: 25, nde: 20, de: 10, cur: 10, cfod: 15, ems: 20 } },
  lender: { l: "Lender: debt service", w: { icov: 35, nde: 25, de: 10, cur: 5, cfod: 20, ems: 5 } },
  supplier: { l: "Supplier: liquidity", w: { icov: 15, nde: 10, de: 10, cur: 30, cfod: 15, ems: 20 } },
};
function interp(pts, v) {
  if (!SX.ok(v)) return null;
  const asc = pts[0][0] < pts[pts.length - 1][0] ? pts : [...pts].reverse();
  if (v <= asc[0][0]) return asc[0][1];
  if (v >= asc[asc.length - 1][0]) return asc[asc.length - 1][1];
  for (let j = 1; j < asc.length; j++) {
    const [x0, y0] = asc[j - 1], [x1, y1] = asc[j];
    if (v <= x1) return y0 + (y1 - y0) * (v - x0) / (x1 - x0);
  }
  return null;
}
function creditMetrics(c, i) {
  const r = SUITE_R[c.id][i];
  return { icov: r.icov, nde: r.nde, de: r.de, cur: r.cur,
    cfod: c.debt[i] > 0 ? c.cfo[i] / c.debt[i] : null, ems: altman(c, i).ems, noDebt: !(c.debt[i] > 0), noInt: !(c.int[i] > 0) };
}
function scoreMetrics(m, weights) {
  const rows = SCORE_FACTORS.map(f => {
    let s = interp(f.pts, m[f.k]);
    if (f.k === "cfod" && m.noDebt) s = 100;                       // no debt at all
    if (f.k === "icov" && m.icov == null && m.noInt) s = 100;      // no interest cost
    if (f.k === "icov" && m.icov == null && !m.noInt) s = 0;       // interest but no operating profit
    if (f.k === "nde" && m.nde == null) s = 0;                     // EBITDA at or below zero
    return { ...f, v: m[f.k], s, w: weights ? +weights[f.k] || 0 : f.w };
  });
  const wsum = rows.reduce((t, r) => t + (r.s == null ? 0 : r.w), 0);
  const score = wsum > 0 ? rows.reduce((t, r) => t + (r.s == null ? 0 : r.s * r.w), 0) / wsum : null;
  const band = score == null ? null : score >= 80 ? ["Low risk","green"] : score >= 65 ? ["Moderate","primary"]
    : score >= 50 ? ["Elevated","amber"] : ["High risk","red"];
  return { rows, score, band };
}
function creditScore(c, i, weights) { return scoreMetrics(creditMetrics(c, i), weights); }
/* Stress test: EBITDA falls by cut% (D&A unchanged), and the rate on all debt rises by bps. */
function creditStress(c, i, cut, bps, weights) {
  const dE = c.ebitda[i] * cut / 100, ebit = c.ebit[i] - dE, ebitda = c.ebitda[i] - dE;
  const intr = c.int[i] + c.debt[i] * bps / 10000, cfo = c.cfo[i] - dE - (intr - c.int[i]);
  const m = { icov: intr > 0 ? ebit / intr : null, nde: ebitda > 0 ? (c.debt[i] - c.cash[i]) / ebitda : null,
    de: SUITE_R[c.id][i].de, cur: SUITE_R[c.id][i].cur, cfod: c.debt[i] > 0 ? cfo / c.debt[i] : null,
    ems: altman(c, i, null, ebit).ems, noDebt: !(c.debt[i] > 0), noInt: !(intr > 0) };
  return { m, ...scoreMetrics(m, weights), ebit, ebitda, intr };
}
/* Debt headroom: extra borrowing before net debt ÷ EBITDA hits ndeMax or interest cover falls to icovMin. */
function debtHeadroom(c, i, ndeMax, icovMin, ratePct) {
  const r = ratePct / 100;
  const byLev = ndeMax * c.ebitda[i] - (c.debt[i] - c.cash[i]);
  const byCov = c.ebit[i] > 0 && r > 0 ? (c.ebit[i] / icovMin - c.int[i]) / r : -Infinity;
  const cap = Math.min(byLev, byCov);
  return { byLev, byCov, cap, binding: byLev <= byCov ? "leverage" : "coverage" };
}
/* Early-warning checks, each pass/fail. */
function warningChecks(c, i) {
  const r = SUITE_R[c.id][i], p = SUITE_R[c.id][i - 1] || {};
  const dGrow = i > 0 && c.debt[i - 1] > 0 ? c.debt[i] / c.debt[i - 1] - 1 : null, eGrow = i > 0 && c.ebitda[i - 1] > 0 ? c.ebitda[i] / c.ebitda[i - 1] - 1 : null;
  return [
    { l: "Interest cover above 2.5×", ok: r.icov == null ? !(c.int[i] > 0) : r.icov >= 2.5, v: r.icov == null ? (c.int[i] > 0 ? "EBIT ≤ 0" : "no interest") : fmtX(r.icov) },
    { l: "Positive operating cash flow", ok: c.cfo[i] > 0, v: SX.cr(c.cfo[i]) },
    { l: "Net debt below 3× EBITDA", ok: r.nde == null ? false : r.nde < 3, v: r.nde == null ? "EBITDA ≤ 0" : fmtX(r.nde) },
    { l: "Current ratio at least 1.0×", ok: r.cur >= 1, v: fmtX(r.cur) },
    { l: "Receivable days not up by 10+", ok: !(SX.ok(r.dso) && SX.ok(p.dso) && r.dso - p.dso >= 10), v: SX.ok(p.dso) ? `${p.dso.toFixed(0)} → ${r.dso.toFixed(0)} d` : "—" },
    { l: "Debt not outgrowing EBITDA", ok: !(SX.ok(dGrow) && SX.ok(eGrow) && dGrow > 0.15 && dGrow > eGrow + 0.1), v: SX.ok(dGrow) ? `debt ${(dGrow * 100).toFixed(0)}% · EBITDA ${SX.ok(eGrow) ? (eGrow * 100).toFixed(0) + "%" : "—"}` : "—" },
    { l: "Profit backed by cash (CFO ≥ 70% of NI)", ok: !(c.ni[i] > 0) || c.cfo[i] >= 0.7 * c.ni[i], v: c.ni[i] > 0 ? `${(c.cfo[i] / c.ni[i] * 100).toFixed(0)}%` : "loss" },
    { l: "No large one-off items in profit", ok: Math.abs(oneOffs(c, i)) <= 0.15 * Math.abs(c.ni[i]), v: oneOffs(c, i) ? SX.cr(oneOffs(c, i)) : "none" },
  ];
}
const fmtX = v => SX.ok(v) ? `${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}x`.replace("-", "−") : "—";

/* ── Working capital ── */
function wcDays(c, i) { const r = SUITE_R[c.id][i]; return { dso: r.dso, dio: r.dio, dpo: r.dpo, ccc: r.ccc }; }
function wcRelease(c, i, t) {
  const now = wcDays(c, i), perDaySales = c.rev[i] / 365, perDayCost = c.cogs[i] / 365;
  const lev = [
    { k:"dso", l:"Collect faster (DSO)",  n:"faster collection (DSO)", from: now.dso, to: t.dso, cash: (now.dso - t.dso) * perDaySales, perDay: perDaySales },
    { k:"dio", l:"Hold less stock (DIO)", n:"leaner inventory (DIO)", from: now.dio, to: t.dio, cash: (now.dio - t.dio) * perDayCost,  perDay: perDayCost },
    { k:"dpo", l:"Pay later (DPO)",       n:"longer supplier credit (DPO)", from: now.dpo, to: t.dpo, cash: (t.dpo - now.dpo) * perDayCost,  perDay: perDayCost },
  ];
  const total = lev.reduce((s, x) => s + x.cash, 0);
  const nwc = c.ar[i] + c.inv[i] - c.ap[i];
  return { lev, total, nwc, cccNow: now.ccc, cccTarget: t.dso + t.dio - t.dpo };
}
/* Extra trade working capital needed when revenue grows g% and days stay at `d`. */
function wcGrowthNeed(c, i, g, d) {
  const rev1 = c.rev[i] * (1 + g / 100), cogs1 = c.cogs[i] * (1 + g / 100);
  const nwcAt = (rev, cogs, x) => x.dso * rev / 365 + x.dio * cogs / 365 - x.dpo * cogs / 365;
  const now = wcDays(c, i);
  return { today: nwcAt(rev1, cogs1, now) - nwcAt(c.rev[i], c.cogs[i], now), target: nwcAt(rev1, cogs1, d) - nwcAt(c.rev[i], c.cogs[i], now) };
}

/* ── FP&A on listed companies: year-on-year EBITDA bridge from reported lines ──
   ΔEBITDA = Δrevenue × last year's EBITDA margin  +  revenue × Δgross margin  −  revenue × Δcash-cost ratio. Exact. */
function yoyBridge(c, i) {
  if (i < 1) return null;
  const p = i - 1, gm = j => c.gp[j] / c.rev[j], ox = j => (c.opex[j] - c.da[j]) / c.rev[j], em = j => c.ebitda[j] / c.rev[j];
  const vol = (c.rev[i] - c.rev[p]) * em(p), mar = c.rev[i] * (gm(i) - gm(p)), cost = -c.rev[i] * (ox(i) - ox(p));
  return { from: c.ebitda[p], to: c.ebitda[i], vol, mar, cost, resid: c.ebitda[i] - c.ebitda[p] - vol - mar - cost,
    revG: (c.rev[i] / c.rev[p] - 1) * 100, gmP: gm(p) * 100, gmI: gm(i) * 100, oxP: ox(p) * 100, oxI: ox(i) * 100, emP: em(p) * 100, emI: em(i) * 100 };
}

/* ── Beta: regression on Nifty 50 (5-year monthly); bottom-up beta from the selected peers ── */
function unleverBeta(c, b, t = SUITE_TAX) { const de = c.debt[SUITE.last] / c.mcap; return b / (1 + (1 - t / 100) * de); }
function bottomUpBeta(focus, ids) {
  const us = peerIds(focus, ids).map(id => { const x = SX.co(id); return x.beta ? unleverBeta(x, x.beta.adj) : null; }).filter(SX.ok);
  const bu = SX.med(us); if (bu == null) return null;
  const f = SX.co(focus), de = f.debt[SUITE.last] / f.mcap;
  return { unlevered: bu, relevered: bu * (1 + (1 - SUITE_TAX / 100) * de), n: us.length, de };
}
