/* Writes the exact tool calls needed for each company, in batches for helper agents. */
const fs = require("fs"), path = require("path");
const G = JSON.parse(fs.readFileSync(path.join(__dirname, "groups.json"), "utf8"));
const calls = fs.existsSync(path.join(__dirname, "calls.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "calls.json"), "utf8")) : [];
const { load } = require("./engine.js");
const { m, good } = load(calls);
const have = (tool, pred) => good.some(c => c.tool === tool && pred(c.input));
const Y = "mcp__remote-devices__yfmcp__", TV = "mcp__remote-devices__tavily-mcp__";
const forCo = (sym, withSt = true) => {
  const { sfx, C } = m.lvSplit(sym), out = [];
  if (!have("yfinance_get_ticker_info", i => i.symbol === sym)) out.push([Y + "yfinance_get_ticker_info", { symbol: sym }]);
  if (withSt) { const base = m.lvSaBase(sym, C.sfx[sfx]); const urls = ["income-statement/", "balance-sheet/", "cash-flow-statement/"].map(p => base + p);
    if (!have("tavily_extract", i => JSON.stringify(i.urls) === JSON.stringify(urls))) out.push([TV + "tavily_extract", { urls, extract_depth: "basic", format: "markdown" }]); }
  if (!have("yfinance_get_price_history", i => i.symbol === sym && i.period === "5y")) out.push([Y + "yfinance_get_price_history", { symbol: sym, period: "5y", interval: "1mo" }]);
  if (!have("yfinance_get_financials", i => i.symbol === sym)) out.push([Y + "yfinance_get_financials", { symbol: sym, frequency: "annual" }]);
  return out;
};
const items = [];
G.groups.forEach(g => g.cos.forEach(s => { const c = forCo(s); if (c.length) items.push({ sym: s, calls: c }); }));
G.profiles.forEach(s => { const c = forCo(s, false); if (c.length) items.push({ sym: s, calls: c }); });
const shared = [];
G.indices.forEach(s => { if (!have("yfinance_get_price_history", i => i.symbol === s && i.period === "5y")) shared.push([Y + "yfinance_get_price_history", { symbol: s, period: "5y", interval: "1mo" }]); });
G.fx.forEach(s => { if (!have("yfinance_get_price_history", i => i.symbol === s && i.period === "5d")) shared.push([Y + "yfinance_get_price_history", { symbol: s, period: "5d", interval: "1d" }]); });
if (shared.length) items.push({ sym: "indices and exchange rates", calls: shared });
const per = +process.argv[2] || 6, roundSize = +process.argv[3] || 3, batches = [];
for (let i = 0; i < items.length; i += per) batches.push(items.slice(i, i + per));
fs.readdirSync(__dirname).filter(f => /^batch_\d+\.md$/.test(f)).forEach(f => fs.unlinkSync(path.join(__dirname, f)));
batches.forEach((b, k) => {
  let n = 0, md = `# Batch ${k + 1}\n\nMake every call below exactly as written (tool name and JSON arguments). Work in rounds: issue all the calls of one round together in a single message, wait for the results, then do the next round.\n`;
  for (let r = 0; r < b.length; r += roundSize) {
    md += `\n## Round ${r / roundSize + 1}\n`;
    b.slice(r, r + roundSize).forEach(it => { md += `\n### ${it.sym}\n`; it.calls.forEach(([t, a]) => { n++; md += `${n}. \`${t}\`\n   \`\`\`json\n   ${JSON.stringify(a)}\n   \`\`\`\n`; }); });
  }
  fs.writeFileSync(path.join(__dirname, `batch_${String(k + 1).padStart(2, "0")}.md`), md);
  console.log(`batch_${String(k + 1).padStart(2, "0")}.md`, b.map(x => x.sym).join(", "), `(${n} calls)`);
});
console.log(items.reduce((t, x) => t + x.calls.length, 0), "calls in", batches.length, "batches");
