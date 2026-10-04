/* Parser and calculation tests for the live layer, using real tool outputs captured in this session (local fixtures only). */
const fs = require("fs"), babel = require("@babel/core");
const raw = JSON.parse(fs.readFileSync("suite_src2.json", "utf8"));
let code = fs.readFileSync("suite_engine.js", "utf8").replace("__SUITE_JSON__", JSON.stringify(raw)) + "\n" + fs.readFileSync("suite_live_engine.js", "utf8");
code = babel.transformSync(code, { presets: [["@babel/preset-react", { runtime: "classic" }]], babelrc: false, configFile: false }).code;
const store = {}; const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const m = new Function("localStorage", "window", "React", code + "\nreturn {saParse,tvParseExtract,tvParseSearch,lvAssemble,lvChecks,lvCross,lvParseHistory,lvRegress,lvSplit,lvSaBase,lvUnwrap,lvJson,lvShort,SUITE,SUITE_FIELDS,saEnd};")(localStorage, {}, {});
const FX = JSON.parse(fs.readFileSync("fixtures/mcp_fixtures.json", "utf8"));
const fx = (tool, pred) => FX.find(f => f.tool === tool && pred(f.input));
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL", msg); } };
/* statements */
const pages = [...m.tvParseExtract(fx("tavily_extract", i => i.urls[0].includes("SUPREMEIND/financials/income-statement")).text),
  ...m.tvParseExtract(fx("tavily_extract", i => i.urls[0].includes("SUPREMEIND/financials/balance-sheet")).text)];
const get = k => pages.find(p => p.url.includes(k));
ok(pages.length === 4, "four pages parsed from two extracts: " + pages.length);
const st = { is: m.saParse(get("SUPREMEIND/financials/income-statement").raw), bs: m.saParse(get("SUPREMEIND/financials/balance-sheet").raw), cf: m.saParse(get("SUPREMEIND/financials/cash-flow-statement").raw) };
ok(st.is.flag === "india" && st.bs.flag === "india", "flags " + st.is.flag + " " + st.bs.flag);
ok(st.is.cols.length === 5 && st.is.cols[0].label === "FY2026" && st.is.cols[0].end === "Mar '26 Mar 31, 2026", "IS columns " + JSON.stringify(st.is.cols[0]));
ok(st.cf.cols.length === 5, "CF columns (no TTM) " + st.cf.cols.length);
ok(st.bs.cur["Filing Date Shares Outstanding"] === 127.02, "current shares " + st.bs.cur["Filing Date Shares Outstanding"]);
const A = m.lvAssemble(st);
const V = raw.cos.find(c => c.id === "SUPREMEIND");
let worst = 0, n = 0;
for (const f of m.SUITE_FIELDS) {
  if (!Array.isArray(V[f]) || !A.R[f]) { if (Array.isArray(V[f]) && V[f].some(x => x != null && x !== 0)) console.log("missing field", f); continue; }
  V[f].forEach((v, j) => { const a = A.R[f][j]; if (v == null && a == null) return; n++;
    const d = Math.abs((a ?? NaN) - (v ?? NaN)); if (!(d <= 0.011 * Math.max(1, Math.abs(v)) / 100 + 0.051)) { worst++; console.log("  diff", f, j, "live", a, "verified", v); } });
}
console.log(`fields compared with the verified record: ${n} values, ${worst} differences`);
ok(worst === 0, "live parse equals verified Supreme record");
const ch = m.lvChecks(A.R, A.master); ok(ch[0].ok, "identities pass: " + ch[0].v);
const yfin = (m.lvUnwrap({ content: [{ type: "text", text: fx("yfinance_get_financials", i => i.symbol === "SUPREMEIND.NS").text }] }));
ok(yfin && yfin.income_statement, "yahoo financials parse with NaN");
const cross = m.lvCross(A.R, A.master, yfin, 1, 1);
console.log("cross-check:", cross.map(x => `${x.l} ${(x.d * 100).toFixed(2)}% ${x.ok ? "ok" : "FLAG"} (${x.n}y)`).join("; "));
ok(cross.every(x => x.ok), "cross-check all within tolerance");
/* other markets' pages: flags and columns */
const many = m.tvParseExtract(fx("tavily_extract", i => i.urls.length === 5).text);
const by = k => m.saParse(many.find(p => p.url.includes(k)).raw);
ok(by("tyo/7203").flag === "japan", "Toyota flag"); ok(by("hkg/0700").flag === "china", "Tencent reports in CNY (china flag)");
ok(by("hkg/0700").cols[0].label === "FY2025" && m.saEnd(by("hkg/0700").cols[0].end).mon === "Dec", "Tencent Dec year");
const shell = m.saParse(m.tvParseExtract(fx("tavily_extract", i => i.urls[0].includes("SHEL")).text)[0].raw);
ok(shell.flag === "united_states" && shell.rows["Total Debt"][0] === 75688, "Shell USD, total debt from additional metrics");
/* search + screen + history */
const s1 = m.lvUnwrap({ content: [{ type: "text", text: fx("yfinance_search", i => i.query === "Supreme Industries").text }] });
ok(Array.isArray(s1) && s1[0].symbol === "SUPREMEIND.NS", "search unwrap");
const hist = m.lvParseHistory(m.lvUnwrap({ content: [{ type: "text", text: fx("yfinance_get_price_history", i => i.symbol === "^NSEI").text }] }));
ok(hist.length === 60 && hist[0].date === "2021-10-01" && hist[59].close === 23063.1, "history parse " + hist.length);
const px = f => fs.readFileSync(f, "utf8").trim().split("\n").slice(1).map(l => { const [d, c] = l.split(","); return { date: d, close: +c }; });
const b = m.lvRegress(px("data/px/SUPREMEIND.csv"), px("data/px/NIFTY50.csv"));
console.log("beta:", JSON.stringify(b), "verified:", JSON.stringify(V.beta));
ok(b && b.raw === V.beta.raw && b.adj === V.beta.adj && b.n === V.beta.n && b.r2 === V.beta.r2, "beta equals verified regression");
const sr = m.tvParseSearch(fx("tavily_search", i => /annual report/.test(i.query)).text);
ok(sr.length === 5 && sr[4].url.includes("supreme.co.in"), "tavily search parse " + sr.length);
/* symbols */
ok(m.lvSplit("SUPREMEIND.NS").C.c === "IN" && m.lvSplit("6488.TWO").sfx === ".TWO" && m.lvSplit("BRK-B").C.c === "US" && m.lvSplit("0700.HK").base === "0700", "symbol split");
ok(m.lvSaBase("BRK-B", "stocks") === "https://stockanalysis.com/stocks/brk.b/financials/" && m.lvSaBase("M&M.NS", "nse") === "https://stockanalysis.com/quote/nse/M%26M/financials/", "stockanalysis paths");
ok(["The Supreme Industries Limited", "Advanced Drainage Systems, Inc.", "Toyota Motor Corporation", "Shell plc", "Tencent Holdings Limited"].map(x => m.lvShort(x)).join("|") === "Supreme Industries|Advanced Drainage|Toyota Motor|Shell|Tencent", "short names " + ["The Supreme Industries Limited", "Advanced Drainage Systems, Inc.", "Toyota Motor Corporation", "Shell plc", "Tencent Holdings Limited"].map(x => m.lvShort(x)).join("|"));
console.log(fails ? `${fails} FAILED` : "all live-layer checks passed");
