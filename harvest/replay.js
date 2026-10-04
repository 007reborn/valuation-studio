/* Replays captured tool outputs through the studio's own loader and writes the records it produces. Usage: node replay.js SYM [SYM…] | --all */
const fs = require("fs"), path = require("path");
const calls = JSON.parse(fs.readFileSync(path.join(__dirname, "calls.json"), "utf8"));
const { load } = require("./engine.js");
(async () => {
  const args = process.argv.slice(2), verbose = args.includes("-v"), route = args.includes("--cloud") ? "cloud" : "home";
  const { m, misses, good, counts } = load(calls, { route, log: verbose ? (...a) => console.log("   call", ...a) : null });
  let syms = args.filter(a => !a.startsWith("-"));
  const outFile = (args.find(a => a.startsWith("--out=")) || "--out=library_raw.json").slice(6);
  if (args.includes("--all")) syms = [...new Set(good.filter(c => c.tool === "yfinance_get_ticker_info").map(c => c.input.symbol))];
  const when = sym => { const b = m.lvSplit(sym).base, hit = u => [`/${b}/`, `/${b.toLowerCase()}/`, `/${encodeURIComponent(sym)}?`].some(k => String(u).includes(k));
    return (good.filter(c => (route === "cloud") === (c.server === "Firecrawl") && (c.input.symbol === sym || (c.input.urls || []).some(hit) || (c.input.url && hit(c.input.url)))).map(c => c.ts).sort().pop()) || new Date().toISOString(); };
  const out = { recs: [], profiles: [], notes: {} };
  for (const sym of syms) {
    misses.length = 0;
    try {
      const r = await m.lvLoad(sym, {});
      const at = when(sym);
      if (r.verified) { console.log(sym.padEnd(14), "VERIFIED (already in the dataset)"); continue; }
      if (r.profile) { r.profile.fetchedAt = at; out.profiles.push(r.profile);
        console.log(sym.padEnd(14), "PROFILE", r.profile.short, "|", r.profile.profile.industry, "|", r.profile.reason.slice(0, 70)); continue; }
      const c = r.rec, L = c.live; L.fetchedAt = at;
      const bad = [...(L.checks || []).filter(x => !x.ok).map(x => "ident: " + x.v), ...(L.cross || []).filter(x => !x.ok).map(x => `${x.l} ${(x.d * 100).toFixed(1)}% (${x.y})`), ...(L.warns || []).map(w => "warn: " + w.slice(0, 90))];
      console.log(sym.padEnd(14), "OK", c.short.padEnd(20), L.group.slice(0, 30).padEnd(30), `${L.years}y ${L.stmtCur}/${L.cur} via ${L.via}`, "beta", c.beta ? c.beta.adj : "—", L.cross ? `xc ${L.cross.filter(x => x.ok).length}/${L.cross.length}` : "xc none",
        bad.length ? "\n      ! " + bad.join("\n      ! ") : "", misses.length ? "\n      missing: " + misses.join(" | ") : "");
      out.recs.push(c); out.notes[sym] = { bad, misses: [...misses] };
    } catch (e) { console.log(sym.padEnd(14), "FAILED", e && (e.code + ": " + (e.message || "")), misses.length ? "\n      missing: " + misses.join(" | ") : ""); }
  }
  if (!args.includes("--dry")) fs.writeFileSync(path.join(__dirname, outFile), JSON.stringify(out));
  console.log("calls made:", JSON.stringify(counts), "· Firecrawl credits counted:", m.FC.used);
  console.log(`\n${out.recs.length} records, ${out.profiles.length} profiles`);
})();
