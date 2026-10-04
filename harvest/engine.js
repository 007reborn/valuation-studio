/* Loads the studio's engine + live layer in Node, with a stand-in for the page's connector access that replays captured tool outputs. */
const fs = require("fs"), path = require("path"), babel = require(path.resolve(__dirname, "../node_modules/@babel/core"));
const VS = path.resolve(__dirname, "..");
function load(calls, { log, route = "home", lib = null, pub = false, pace = false, sync = false, caps = {}, store: seed = null, mcp: mcpOver = null, doc = null, ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36" } = {}) {
  const counts = {};
  const raw = JSON.parse(fs.readFileSync(VS + "/suite_src2.json", "utf8"));
  let code = fs.readFileSync(VS + "/suite_engine.js", "utf8").replace("__SUITE_JSON__", JSON.stringify(raw)) + "\n" + fs.readFileSync(VS + "/suite_live_engine.js", "utf8")
    + (sync ? "\n" + fs.readFileSync(VS + "/suite_sync.js", "utf8") : "\nconst LS = null, lsInit = null, lsPull = null, lsFlush = null, lsEnc = null;");
  code = babel.transformSync(code, { presets: [[path.resolve(VS, "node_modules/@babel/preset-react"), { runtime: "classic" }]], babelrc: false, configFile: false }).code;
  const store = seed || {}; const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const misses = [];
  const T = s => ({ content: [{ type: "text", text: s }] });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pagesOf = t => { const out = {}, re = /(?:^|\n)Title: ([^\n]*)\nURL: ([^\n]*)\n(?:Content: [^\n]*\n)?Raw Content: ?/g, marks = []; let m;
    while ((m = re.exec(t))) marks.push({ title: m[1], url: m[2].trim(), start: re.lastIndex, at: m.index });
    marks.forEach((k, i) => out[k.url] = { title: k.title, raw: t.slice(k.start, i + 1 < marks.length ? marks[i + 1].at : t.length).replace(/\n+Failed Results:[\s\S]*$/, "") }); return out; };
  const good = calls.filter(c => !c.err && c.text && !/^(Error|MCP error|Tool error)/i.test(c.text.trim()));
  const fcKey = u => { const s = String(u); return /fundamentals-timeseries/.test(s) ? s.split("?")[0] : /finance\/search/.test(s) ? "search:" + decodeURIComponent((s.match(/[?&]q=([^&]*)/) || [, ""])[1]).toLowerCase() : s; };
  const mcp = {
    listTools: async () => ({ servers: route === "cloud" ? [{ server: "Firecrawl", authStatus: "connected", tools: [{ name: "firecrawl_scrape" }, { name: "firecrawl_search" }] }]
      : route === "none" ? [] : [{ server: "host:yfmcp" }, { server: "host:tavily-mcp" }, { server: "host:sec-edgar-mcp" }] }),
    callTool: async (server, tool, input) => {
      log && log(server, tool, JSON.stringify(input).slice(0, 140));
      counts[server] = (counts[server] || 0) + 1;
      const pool = good.filter(c => c.tool === tool && (server === "Firecrawl") === (c.server === "Firecrawl"));
      let hit = null;
      if (tool === "firecrawl_scrape") hit = pool.find(c => fcKey(c.input.url) === fcKey(input.url));
      else if (tool === "firecrawl_search") hit = pool.find(c => c.input.query === input.query);
      else if (tool === "tavily_extract") {
        hit = pool.find(c => same(c.input.urls, input.urls));
        if (!hit) { const all = {}; pool.forEach(c => Object.assign(all, pagesOf(c.text)));
          const have = input.urls.filter(u => all[u]);
          if (have.length) return T("Detailed Results:\n\n" + have.map(u => `Title: ${all[u].title}\nURL: ${u}\nContent: undefined\nRaw Content: ${all[u].raw}`).join("\n\n")); }
      } else if (tool === "yfinance_get_price_history") hit = pool.find(c => c.input.symbol === input.symbol && c.input.period === input.period && c.input.interval === input.interval);
      else if (tool === "yfinance_get_ticker_info" || tool === "yfinance_get_financials") hit = pool.find(c => c.input.symbol === input.symbol);
      else hit = pool.find(c => same(c.input, input));
      if (!hit) { misses.push(`${tool} ${JSON.stringify(input).slice(0, 160)}`); throw { code: "tool_error", message: "not captured: " + tool, server }; }
      return T(hit.text);
    },
  };
  const window = { claude: { use: async n => n === "mcp" ? (mcpOver ? mcpOver(mcp) : mcp) : (caps[n] || null) } };
  const SuiteSel = { refresh() {}, open() {} }, document = doc || { addEventListener() {}, visibilityState: "visible" };
  const React = { useSyncExternalStore: () => 0 };
  const m = new Function("localStorage", "window", "React", "VS_PUBLIC", "VS_LIBRARY", "setTimeout", "clearTimeout", "SuiteSel", "document", "navigator", code + "\nreturn {LS,lsInit,lsPull,lsFlush,lsEnc,LV_REMOVED,LV_GROUPS,LV_EXTRAS,lvEnsureGroup,lvAddToGroup,lvDropFromGroup,lvSaveProfile,lvRemoveProfile,lvKeyFigures,lvSave,FC_TS,lvIndustryOf,LV_PACK_OF,SUITE_R,lvRestore,lvLibInit,lvLoad,lvSplit,lvSaBase,lvCountry,LV_COUNTRIES,LV_PROFILES,LV_FIN_RE,SUITE,SUITE_FIELDS,lvMajor,saParse,saParseCompany,lvParseHistory,lvUnwrap,fcParseChart,fcParseTimeseries,fcParseWeb,fcParseJson,lvStatus,lvRoutes,lvSearch,lvLocalSearch,lvMergeSearch,lvHave,lvPackStatus,lvRegister,lvRemove,lvWebSearch,lvWebExtract,lvRegress,lvAssemble,lvChecks,lvCross,lvMessage,lvFx,lvScreen,FC,LV_LIB,LV_PACK,LV_PACK_PROFILES,LV_RECS,LV_ORDER,lvProfile,lvProfiles,tvParseExtract,saEnd,lvShort,lvJson,tvParseSearch,lvKv,LV_DOWN,FC_LIMIT,fcWait,fcCall,fcScrape,lvHistory,lvCrossData,lvStatements,lvInfoCloud,LV_MOBILE};")(localStorage, window, React, pub, lib, setTimeout, clearTimeout, SuiteSel, document, { userAgent: ua });
  if (!pace) m.FC_LIMIT.perMin = 1e9;
  return { m, misses, good, store, counts };
}
module.exports = { load };
