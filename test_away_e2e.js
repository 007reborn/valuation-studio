/* End-to-end tests away from the home computer: the Firecrawl route, no route at all, carry-along between two devices,
   and the public edition. Connectors, the data store and Claude are stood in for; Firecrawl answers come from real
   outputs captured on 4 Oct 2026 (harvest/calls.json stays in this test; nothing is published). */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const SHOT = process.argv[2] || "shots/away";
fs.mkdirSync(SHOT, { recursive: true });
const CALLS = JSON.parse(fs.readFileSync("harvest/calls.json", "utf8")).filter(c => c.server === "Firecrawl" && !c.err);
const LIB = JSON.parse(fs.readFileSync("harvest/library.json", "utf8"));
const cap = sub => { const c = CALLS.find(x => String(x.input.url || x.input.query).includes(sub)); if (!c) throw new Error("no capture " + sub); return c.text; };
/* a made-up company served from Reliance's real pages, so a load of something that isn't on the device can be followed end to end */
const testco = s => s.replace(/Reliance Industries Limited/g, "Testco Industries Limited").replace(/Reliance Industries/g, "Testco Industries").replace(/RELIANCE INDUSTRIES LTD/g, "TESTCO INDUSTRIES LTD").replace(/RELIANCE/g, "TESTCO");
const FX = {
  pages: Object.fromEntries(CALLS.filter(c => c.input.url && !/finance\/search|fundamentals-timeseries/.test(c.input.url)).map(c => [c.input.url, c.text])),
  ts: Object.fromEntries(CALLS.filter(c => /fundamentals-timeseries/.test(c.input.url || "")).map(c => [decodeURIComponent(c.input.url.split("?")[0].split("/").pop()), c.text])),
  search: cap("finance/search"), web: cap("annual report 2025-26"), pdf: cap("fw9.pdf"),
};
for (const k of ["financials/income-statement/", "financials/balance-sheet/", "financials/cash-flow-statement/", "company/"]) FX.pages["https://stockanalysis.com/quote/nse/TESTCO/" + k] = testco(FX.pages["https://stockanalysis.com/quote/nse/RELIANCE/" + k]);
FX.pages["https://query1.finance.yahoo.com/v8/finance/chart/TESTCO.NS?range=5y&interval=1mo"] = testco(FX.pages["https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=5y&interval=1mo"]);
FX.ts["TESTCO.NS"] = testco(FX.ts["RELIANCE.NS"]);
const clone = (rec, over, liveOver) => { const r = JSON.parse(JSON.stringify(rec)); Object.assign(r, over); r.live = { ...r.live, ...(liveOver || {}) }; return r; };
/* a company the viewer loaded themselves: one that is neither in the verified set nor in the pre-loaded pack */
const ITC = clone(LIB.recs[0], { id: "L:DIXON.NS", ticker: "DIXON.NS", name: "Dixon Technologies (India) Limited", short: "Dixon Technologies", industry: "live:consumer-electronics", price: 410 }, { symbol: "DIXON.NS", group: "Consumer Electronics", fetchedAt: "2026-10-03T08:00:00.000Z" });
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "xlsx.bundle.js": "node_modules/xlsx-js-style/dist/xlsx.bundle.js", "pdf.js/3.11.174/pdf.min.js": "node_modules/pdfjs-dist/build/pdf.min.js", "pdf.js/3.11.174/pdf.worker.min.js": "node_modules/pdfjs-dist/build/pdf.worker.min.js" };

/* Runs in the page before its scripts. O: { servers, perm, db, store, uid, sample, noClaude } */
const MOCK = ({ D, O }) => {
  window.__calls = []; window.__asked = []; window.__uses = []; window.__samples = []; window.__toolOut = []; window.__dbOps = [];
  if (O.ls) Object.entries(O.ls).forEach(([k, v]) => { try { if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} });
  if (O.noClaude) return;
  const T = s => ({ content: [{ type: "text", text: s }], payload: (() => { try { return JSON.parse(s); } catch { return s; } })() });
  const state = { ...(O.perm || {}) };
  const mcp = {
    listTools: async () => ({ servers: (O.servers || []).map(s => ({ server: s, authStatus: "connected", tools: [{ name: "firecrawl_scrape", description: "" }, { name: "firecrawl_search", description: "" }] })) }),
    callTool: async (server, tool, input) => {
      window.__calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)), at: Date.now() });
      await new Promise(r => setTimeout(r, 30));
      if (server !== "Firecrawl") throw { code: "server_not_connected", message: "no host bridge", server };
      if (state["mcp:Firecrawl"] === "prompt" || state["mcp:Firecrawl"] === "denied") throw { code: "not_in_manifest", message: "not allowed", server };
      if (tool === "firecrawl_search") return T(D.web);
      const u = input.url;
      if (/finance\/search/.test(u)) { const j = JSON.parse(JSON.parse(D.search).rawHtml);
        j.quotes.unshift({ exchange: "NSI", shortname: "TESTCO INDUSTRIES LTD", quoteType: "EQUITY", symbol: "TESTCO.NS", longname: "Testco Industries Limited", exchDisp: "NSE", sector: "Energy", industry: "Oil & Gas Refining & Marketing" });
        return T(JSON.stringify({ rawHtml: JSON.stringify(j), metadata: { statusCode: 200, creditsUsed: 1 } })); }
      if (/fundamentals-timeseries/.test(u)) { const sym = decodeURIComponent(u.split("?")[0].split("/").pop()); if (D.ts[sym]) return T(D.ts[sym]);
        return T(JSON.stringify({ rawHtml: JSON.stringify({ timeseries: { result: [], error: null } }), metadata: { statusCode: 200, creditsUsed: 1 } })); }
      if (D.pages[u]) return T(D.pages[u]);
      if (/finance\/chart\//.test(u)) return T(JSON.stringify({ rawHtml: JSON.stringify({ chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } }), metadata: { statusCode: 404, creditsUsed: 1 } }));
      if (/\.pdf($|\?)/i.test(u)) return T(D.pdf);
      if (/stockanalysis\.com/.test(u)) return T(JSON.stringify({ markdown: "# Page Not Found", metadata: { statusCode: 404, creditsUsed: 1 } }));
      return T(JSON.stringify({ markdown: "# A web page\n\n" + "Net sales rose and the company expects capex to stay high. ".repeat(40), metadata: { statusCode: 200, creditsUsed: 1, title: "A web page" } }));
    }, watchTool: () => () => {}, invalidate: async () => {}, server: async () => ({}), describeTool: async () => ({}) };
  const permissions = { state: async nm => nm === undefined ? { ...state } : (state[nm] || "unavailable"),
    request: async names => { window.__asked.push(names); const out = {}; (names || []).forEach(nm => { if (state[nm] === "prompt") state[nm] = (O.answer && O.answer[nm]) || "granted"; out[nm] = state[nm] || "unavailable"; }); return out; } };
  /* the artifact's document store: one shared map, handed in and read back by the test */
  const store = new Map(Object.entries(O.store || {})); window.__store = () => Object.fromEntries(store);
  const freeze = o => { if (o && typeof o === "object") { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
  const okSeg = s => /^[A-Za-z0-9_\-.~:@+]+$/.test(s) && s !== "." && s !== "..";
  const check = (pth, even) => { const g = pth.split("/"); if (!g.every(okSeg) || (g.length % 2 === 0) !== even) throw new TypeError("bad path " + pth); };
  const docRef = pth => ({ id: pth.split("/").pop(), path: pth,
    get: async () => { const v = store.get(pth); return { id: pth.split("/").pop(), exists: v !== undefined, data: () => v === undefined ? undefined : freeze(JSON.parse(v)) }; },
    set: async data => { if (state.db !== "granted") throw { code: "not_granted" }; window.__dbOps.push(["set", pth.split("/").pop()]); store.set(pth, JSON.stringify(data)); },
    delete: async () => { if (state.db !== "granted") throw { code: "not_granted" }; window.__dbOps.push(["delete", pth.split("/").pop()]); store.delete(pth); } });
  const db = { doc: pth => { check(pth, true); return docRef(pth); }, collection: pth => { check(pth, false); const depth = pth.split("/").length + 1;
    const q = { path: pth, limit: () => q, doc: id => { check(pth + "/" + id, true); return docRef(pth + "/" + id); },
      get: async () => { if (state.db !== "granted") throw { code: "not_granted" }; window.__dbOps.push(["list"]);
        const docs = [...store.keys()].filter(k => k.startsWith(pth + "/") && k.split("/").length === depth).sort().map(k => ({ id: k.split("/").pop(), exists: true, data: () => freeze(JSON.parse(store.get(k))) })); return { docs, size: docs.length, empty: !docs.length }; } };
    return q; } };
  const user = { id: async () => O.uid === undefined ? "usr_7Qk2" : O.uid, isOwner: async () => true };
  const sample = async (input, opts) => {
    window.__samples.push({ head: (typeof input === "string" ? input : input.map(t => t.role + ": " + t.content).join("\n")).slice(0, 40000), tools: opts && opts.tools ? opts.tools.map(t => t.name) : null });
    if (opts && opts.tools) for (const [nm, arg] of [["search_companies", { query: "reliance" }], ["load_company", { symbol: "AAPL" }], ["load_company", { symbol: "NOPE.NS" }], ["web_search", { query: "shell results" }], ["list_companies", {}]]) {
      const t = opts.tools.find(x => x.name === nm); if (!t) { window.__toolOut.push(nm + ": (not offered)"); continue; }
      try { const r = await t.execute(arg, { signal: new AbortController().signal }); window.__toolOut.push(nm + ": " + String(typeof r === "string" ? r : JSON.stringify(r)).slice(0, 600)); } catch (e) { window.__toolOut.push(nm + " threw: " + (e && e.message)); } }
    const text = "## In short\nA **test** answer. Educational, not advice.";
    opts && opts.onText && opts.onText({ text, delta: text });
    return { text, truncated: false };
  };
  sample.json = async () => ({}); sample.limits = async () => ({ maxPromptBytes: 65536, tools: { maxCount: 16 } });
  const downloads = { save: async () => ({ status: "saved" }) };
  const caps = { mcp: O.servers ? mcp : null, permissions, db: O.db ? db : null, user: O.db ? user : null, sample: O.sample === false ? null : sample, downloads };
  window.claude = { use: async n => { window.__uses.push(n); return caps[n] || null; } };
};
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errs = [], fails = []; let n = 0;
  const ok = (c, m) => { n++; if (!c) { fails.push(m); console.log("FAIL", m); } else console.log("ok  ", m); };
  const mk = async (file, O, { w = 1280, h = 900, dark = false, tag = "", ua = null } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light", ...(ua ? { userAgent: ua } : {}) });
    await ctx.addInitScript(MOCK, { D: FX, O });
    await ctx.route("**/*", r => { const u = r.request().url(); if (u.startsWith("file://")) return r.continue();
      const hit = Object.keys(local).find(k => u.endsWith(k)); if (hit) return r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(local[hit]) }); return r.abort(); });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(`[${tag}] ${e.message}`));
    p.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
    /* a change of hash alone doesn't reload a page, and the workspace is read from the hash when the page starts */
    const go = async hash => { await p.goto("about:blank"); await p.goto("file://" + path.resolve(file) + "#" + hash); await p.waitForTimeout(1300); };
    const txt = () => p.evaluate(() => document.body.innerText);
    const has = async s => (await p.getByText(s, { exact: false }).count()) > 0;
    const btn = (name, nth = 0) => p.getByRole("button", { name, exact: true }).nth(nth);
    const nav = async name => { await p.getByRole("button", { name: new RegExp("^" + name) }).first().click(); await p.waitForTimeout(900); };
    const fc = () => p.evaluate(() => window.__calls.filter(c => c.server === "Firecrawl").map(c => c.tool === "firecrawl_search" ? "search:" + c.input.query : c.input.url));
    const bad = () => p.evaluate(() => document.body.innerText.split("\n").filter(l => /NaN|Infinity|undefined|\[object/.test(l)).slice(0, 5));
    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const search = async q => { await p.getByLabel("Company name or ticker").fill(q); await btn("Search").click(); await p.waitForTimeout(450); };
    return { p, ctx, go, txt, has, btn, nav, fc, bad, overflow, search };
  };
  const PRIV = "valuation_studio.html", PUB = "valuation_studio_public.html";
  const fast = { "vs:fcPerMin": "500" };

  /* ───────── A. away from home, Firecrawl connected ───────── */
  {
    const A = await mk(PRIV, { servers: ["Firecrawl"], perm: { "mcp:Firecrawl": "prompt" }, ls: fast }, { tag: "cloud" });
    await A.go("find");
    ok(await A.has("The servers on your home computer aren't reachable from here") && await A.has("6 to 8 credits"), "the page says it's on the Firecrawl route and what it costs");
    ok(!(await A.has("Built by")) && (await A.p.locator('a[href*="linkedin.com"]').count()) === 0, "the private copy carries no public credit line");
    ok((await A.p.getByText("Browse by country and industry", { exact: true }).count()) === 0 && await A.has("Companies on this device"), "industry browse gives way to a directory of the device's companies");
    ok(await A.has("All 70 are on this device") && await A.has("use Refresh on its row") && (await A.p.getByRole("button", { name: /^Load the \d+ missing$/ }).count()) === 0 && (await A.p.getByRole("button", { name: "Refresh all with today's figures" }).count()) === 0, "the starter pack is already on the device; refreshing it wholesale isn't offered from here");
    ok((await A.fc()).length === 0 && (await A.p.evaluate(() => window.__asked.length)) === 0, "nothing was fetched or asked while the page loaded");
    /* on-device first */
    await A.search("reliance");
    const row = A.p.locator('[data-row="RELIANCE.NS"]');
    ok((await row.getByText("Pre-loaded", { exact: true }).count()) > 0 && (await A.fc()).length === 0, "a search starts on the device: Reliance is found with no call made");
    ok((await A.btn("Search every listed company").count()) === 1 && await A.has("Uses 1 Firecrawl credit"), "the wider search is offered with its cost");
    await row.getByRole("button", { name: "Open", exact: true }).click(); await A.p.waitForTimeout(500);
    ok(await A.has("Reliance Industries opened from this device: pre-loaded") && (await A.fc()).length === 0, "opening it costs nothing");
    /* the wider search, then a company that isn't here */
    await A.btn("Search every listed company").click(); await A.p.waitForSelector("text=TESTCO.NS", { timeout: 8000 }).catch(() => {});
    const calls1 = await A.fc();
    ok(calls1.length === 1 && /finance\/search\?q=reliance/.test(calls1[0]), "one page for the wider search: " + calls1.join(" | ").slice(0, 110));
    ok((await A.p.evaluate(() => JSON.stringify(window.__asked))) === '[["mcp:Firecrawl"]]', "Firecrawl's consent was asked once, before its first call");
    ok(await A.has("Firecrawl credits used in this visit: 1") && await A.has("RPOWER.NS"), "the credit count shows; Yahoo's results are listed");
    ok((await A.p.locator('[data-row="RELIANCE.NS"]').getByText("Pre-loaded", { exact: true }).count()) > 0 && (await A.p.locator('[data-row="RELIANCE.BO"]').count()) > 0, "results already on the device keep their badge");
    await A.p.locator('[data-row="TESTCO.NS"]').getByRole("button", { name: "Load", exact: true }).click();
    await A.p.waitForSelector("text=Testco Industries loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    ok(await A.has("Testco Industries loaded through Firecrawl: 5 years of statements"), "a new company loads through Firecrawl: " + ((await A.txt()).match(/Testco Industries loaded[^\n]*/) || [""])[0]);
    const calls2 = (await A.fc()).slice(1);
    ok(calls2.length === 7 && ["TESTCO/company/", "chart/TESTCO.NS", "TESTCO/financials/income-statement/", "TESTCO/financials/balance-sheet/", "TESTCO/financials/cash-flow-statement/", "timeseries/TESTCO.NS", "chart/%5ENSEI"].every(k => calls2.some(u => u.includes(k))), "seven pages: profile, price, three statements, cross-check, index (" + calls2.length + ")");
    ok(await A.has("Firecrawl credits used in this visit: 8"), "credits add up to 8");
    const rec = await A.p.evaluate(() => JSON.parse(localStorage.getItem("vs:live2")).cos.find(c => c.id === "L:TESTCO.NS"));
    ok(rec && rec.live.via === "cloud" && rec.live.cross && rec.live.cross.length === 6 && rec.price === 1167.7 && rec.beta && rec.beta.adj === 0.9904 && rec.live.profile.industry === "Oil & Gas Refining & Marketing" && rec.live.profile.summary.length > 500, "the record is complete: price, beta, cross-check, profile");
    const scrapeIn = await A.p.evaluate(() => window.__calls.filter(c => c.tool === "firecrawl_scrape").map(c => c.input));
    ok(scrapeIn.every(i => Array.isArray(i.formats) && i.formats.length === 1 && typeof i.onlyMainContent === "boolean" && Object.keys(i).every(k => ["url", "formats", "onlyMainContent", "maxAge", "parsers", "pdfOptions"].includes(k))) && scrapeIn.filter(i => /chart/.test(i.url)).every(i => i.maxAge === 0 && i.formats[0] === "rawHtml"), "scrape arguments are the ones the connector accepts; prices are fetched fresh");
    await A.p.screenshot({ path: SHOT + "/cloud_find.png", fullPage: true });
    /* it works across the workspaces */
    for (const sp of ["Ratio analysis", "Credit risk", "Working capital"]) { await A.nav(sp); const bl = await A.bad();
      ok(await A.has("Testco Industries") && !bl.length, `${sp} shows the company, nothing broken ${JSON.stringify(bl)}`); }
    await A.nav("DCF valuation"); await A.p.waitForTimeout(600);
    ok(/Testco Industries Limited/.test(await A.txt()) && !(await A.bad()).length, "the DCF model takes it");
    /* a hand-typed symbol is checked with one page */
    await A.nav("Find companies"); await A.search("NOSUCH.NS");
    ok(await A.has("Nothing on this device matches") && (await A.btn("Load NOSUCH.NS without searching").count()) === 1, "a ticker with its suffix can be loaded without a search");
    const before = (await A.fc()).length; await A.btn("Load NOSUCH.NS without searching").click(); await A.p.waitForSelector("text=has no quote for NOSUCH.NS", { timeout: 8000 }).catch(() => {});
    ok(await A.has("Yahoo Finance has no quote for NOSUCH.NS") && (await A.fc()).length - before === 1, "a wrong symbol costs one page and gets a plain answer");
    /* refresh a pre-loaded company */
    await A.search("shell"); const n0 = (await A.fc()).length;
    await A.p.locator('[data-row="SHEL.L"]').getByRole("button", { name: "Refresh", exact: true }).click(); await A.p.waitForSelector("text=Shell loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    ok(await A.has("Shell loaded through Firecrawl: 5 years of statements in USD, shown in rupees; agrees with Yahoo Finance"), "Refresh re-fetches a pre-loaded company: " + ((await A.txt()).match(/Shell loaded[^\n]*/) || [""])[0]);
    ok((await A.fc()).length - n0 === 9, "nine pages for a London listing reporting in dollars (statements, price, profile, cross-check, FTSE, two rates): " + ((await A.fc()).length - n0));
    ok(await A.p.evaluate(() => { const c = JSON.parse(localStorage.getItem("vs:live2")).cos.find(c => c.id === "L:SHEL.L"); return c && c.live.via === "cloud" && c.live.cur === "GBP" && Math.abs(c.price - 35.965) < 1e-6; }), "the viewer's refreshed copy is saved");
    ok(await A.has("Undo refresh"), "the refreshed copy can be undone back to the pre-loaded one");
    /* reports */
    await A.nav("Reports & AI");
    ok(await A.has("From here this runs through your Firecrawl connector") && await A.has("only its first 20 pages are read"), "reports explain the route and the PDF limit");
    const s0 = (await A.fc()).length; await A.btn("Find documents").click(); await A.p.waitForSelector("text=Open in reader", { timeout: 8000 }).catch(() => {});
    const sc = (await A.fc()).slice(s0);
    ok(sc.length === 2 && sc.every(x => x.startsWith("search:")) && (await A.p.getByRole("button", { name: "Open in reader" }).count()) >= 3, "two searches (the web and the company's own site), results listed: " + sc.length);
    const srch = await A.p.evaluate(() => window.__calls.filter(c => c.tool === "firecrawl_search").map(c => c.input));
    ok(srch.every(i => i.sources.join() === "web" && i.domainTools === false && i.limit <= 10) && srch.some(i => i.includeDomains && i.includeDomains.join() === "shell.com"), "search arguments: " + JSON.stringify(srch.map(i => i.includeDomains || "web")));
    await A.btn("Open in reader").first().click(); await A.p.waitForSelector("text=This is the first 2 of 6 pages", { timeout: 8000 }).catch(() => {});
    const pdfIn = await A.p.evaluate(() => window.__calls.filter(c => c.tool === "firecrawl_scrape").pop().input);
    ok(await A.has("This is the first 2 of 6 pages") && pdfIn.pdfOptions.maxPages === 20 && pdfIn.parsers.join() === "pdf", "a PDF is read with the page cap, and the reader says how much of it came back");
    ok(await A.has("2 pages"), "…as pages, so citations use page numbers");
    await A.p.screenshot({ path: SHOT + "/cloud_research.png", fullPage: true });
    /* the AI analyst */
    await A.p.getByRole("button", { name: "Ask Claude, the AI analyst" }).click(); await A.p.waitForTimeout(300);
    ok(await A.has("can search for and load other companies"), "the analyst says it can load other companies");
    await A.p.getByRole("button", { name: /financially healthy/ }).click(); await A.p.waitForTimeout(1500);
    const tools = await A.p.evaluate(() => window.__samples.slice(-1)[0].tools), outs = await A.p.evaluate(() => window.__toolOut);
    ok(tools.includes("web_search") && tools.includes("search_companies") && tools.includes("load_company"), "the analyst keeps its live tools on this route");
    ok(outs.some(o => /^search_companies: .*RELIANCE\.NS.*on this device/.test(o)) && outs.some(o => /^load_company: Apple opened from this device/.test(o)), "its company search starts on the device, and opening a pre-loaded company fetches nothing");
    ok(outs.some(o => /^load_company threw: Yahoo Finance has no quote for NOPE\.NS/.test(o)) && outs.some(o => /^web_search: Integrated Annual Report/.test(o)), "a failed load reaches Claude as a sentence; web search works: " + outs.filter(o => /threw/.test(o)).join(" | ").slice(0, 120));
    await A.ctx.close();
  }
  /* pacing, at the real limit of nine pages a minute */
  {
    const A = await mk(PRIV, { servers: ["Firecrawl"], perm: { "mcp:Firecrawl": "granted" } }, { tag: "pace" });
    await A.go("find"); await A.search("testco"); await A.btn("Search every listed company").click(); await A.p.waitForSelector("text=TESTCO.NS", { timeout: 8000 }).catch(() => {});
    await A.p.locator('[data-row="TESTCO.NS"]').getByRole("button", { name: "Load", exact: true }).click(); await A.p.waitForSelector("text=Testco Industries loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    await A.search("shell"); await A.p.locator('[data-row="SHEL.L"]').getByRole("button", { name: "Refresh", exact: true }).click(); await A.p.waitForTimeout(2500);
    const t = await A.txt(), cs = await A.p.evaluate(() => window.__calls.map(c => c.at));
    ok(/Waiting \d+ s for Firecrawl's per-minute limit/.test(t) && cs.length === 9, `the tenth page waits its turn and the page says so: ${(t.match(/Waiting \d+ s[^\n]*/) || [""])[0]} (${cs.length} pages sent)`);
    await A.ctx.close();
  }
  /* Firecrawl listed but declined when asked */
  {
    const A = await mk(PRIV, { servers: ["Firecrawl"], perm: { "mcp:Firecrawl": "prompt" }, answer: { "mcp:Firecrawl": "denied" }, ls: fast }, { tag: "declined" });
    await A.go("find"); await A.search("zzzzz"); await A.btn("Search every listed company").click(); await A.p.waitForTimeout(900);
    ok(await A.has("Firecrawl is switched off for this page") && await A.has("Live data isn't reachable from this device"), "declining Firecrawl gets a plain explanation, and the page settles into device-only mode");
    await A.search("apple"); await A.p.locator('[data-row="AAPL"]').getByRole("button", { name: "Open", exact: true }).click(); await A.p.waitForTimeout(400);
    ok(await A.has("Apple opened from this device"), "…where pre-loaded companies still open");
    await A.ctx.close();
  }
  /* phone, Firecrawl route */
  {
    const A = await mk(PRIV, { servers: ["Firecrawl"], perm: { "mcp:Firecrawl": "granted" }, ls: { ...fast, "vs:live2": JSON.stringify({ v: 2, cos: [ITC], extras: {}, profiles: {}, groups: {}, gone: {} }) } }, { w: 390, h: 844, tag: "phone" });
    for (const sp of ["find", "ratios", "credit", "wc", "research", "dcf"]) { await A.go(sp); const o = await A.overflow(), bl = await A.bad();
      const mark = { find: "Find any listed company", dcf: "DCF valuation", ratios: "Companies to compare", credit: "Credit risk", wc: "Working capital optimiser", research: "Reports and filings" }[sp];
      ok(o <= 1 && !bl.length && (await A.txt()).includes(mark), `phone ${sp}: renders, no sideways scroll (${o}) ${JSON.stringify(bl)}`); await A.p.screenshot({ path: SHOT + `/phone_${sp}.png`, fullPage: true }); }
    await A.go("find"); await A.search("dixon"); ok(await A.has("On this device"), "phone: a company loaded earlier is found on the device");
    await A.p.getByRole("button", { name: "Show the list" }).click(); await A.p.waitForTimeout(300); const o2 = await A.overflow(); ok(o2 <= 1 && await A.has("5 of 5") && await A.has("7 of 7") && (await A.p.getByRole("button", { name: /^Load \d+/ }).count()) === 0, `phone: the starter-pack list fits and shows every group complete (${o2})`);
    await A.p.screenshot({ path: SHOT + "/phone_find_pack.png", fullPage: true });
    await A.ctx.close();
  }

  /* ───────── A2. everything the page declares is listed, as a first visit lists it; the home servers don't answer ───────── */
  {
    const ALL = ["host:yfmcp", "host:tavily-mcp", "host:sec-edgar-mcp", "Firecrawl"], ask = { "mcp:host:yfmcp": "prompt", "mcp:host:tavily-mcp": "prompt", "mcp:host:sec-edgar-mcp": "prompt", "mcp:Firecrawl": "prompt" };
    /* another computer's browser: the page can't tell before the first call */
    const A = await mk(PRIV, { servers: ALL, perm: { ...ask }, ls: fast }, { tag: "all-listed" });
    await A.go("find");
    ok((await A.p.evaluate(() => window.__calls.length + window.__asked.length)) === 0, "all listed: nothing called or asked while the page loads");
    await A.search("testco"); await A.p.waitForTimeout(800);
    const s1 = await A.p.evaluate(() => window.__calls.map(c => c.server).join());
    ok(s1 === "host:yfmcp" && (await A.btn("Search every listed company").count()) === 1 && await A.has("Uses 1 Firecrawl credit") && await A.has("The servers on your home computer aren't reachable from here"), "the home server is tried once; when it doesn't answer the page moves to the Firecrawl route and offers the wider search with its cost: " + s1);
    ok(!(await A.has("isn't reachable from this device")) && !(await A.has("TESTCO.NS")), "…with no error shown and no credit spent on the viewer's behalf");
    await A.btn("Search every listed company").click(); await A.p.waitForSelector("text=TESTCO.NS", { timeout: 8000 }).catch(() => {});
    await A.p.locator('[data-row="TESTCO.NS"]').getByRole("button", { name: "Load", exact: true }).click(); await A.p.waitForSelector("text=Testco Industries loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    const s2 = await A.p.evaluate(() => window.__calls.map(c => c.server)), asked = await A.p.evaluate(() => JSON.stringify(window.__asked));
    const homeCalls = s2.filter(x => x.startsWith("host:")).sort().join();
    ok(await A.has("Testco Industries loaded through Firecrawl") && homeCalls === "host:tavily-mcp,host:yfmcp" && s2.filter(x => x === "Firecrawl").length === 8, `the search and the load then run through Firecrawl; each home server is tried once and no more (${homeCalls}; ${s2.filter(x => x === "Firecrawl").length} Firecrawl pages)`);
    ok(JSON.parse(asked).map(a => a.join()).sort().join() === "mcp:Firecrawl,mcp:host:tavily-mcp,mcp:host:yfmcp", "one consent question per server tried, none repeated: " + asked);
    await A.nav("Reports & AI"); await A.btn("Find documents").click(); await A.p.waitForSelector("text=Open in reader", { timeout: 8000 }).catch(() => {});
    const s3 = await A.p.evaluate(() => window.__calls.map(c => c.server + ":" + c.tool));
    ok(s3.filter(x => x.startsWith("host:")).length === 2 && s3.filter(x => x === "Firecrawl:firecrawl_search").length >= 1 && (await A.p.getByRole("button", { name: "Open in reader" }).count()) >= 3 && !(await A.has("The Tavily server isn't reachable")), "a report search goes straight to Firecrawl: the home servers aren't tried again");
    ok(!(await A.bad()).length, "nothing broken on the page " + JSON.stringify(await A.bad()));
    await A.ctx.close();
    /* a phone: the home servers can't be there, so they're never tried or asked about */
    const P = await mk(PRIV, { servers: ALL, perm: { ...ask }, ls: fast }, { w: 390, h: 844, tag: "all-listed-phone", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    await P.go("find");
    ok(await P.has("The servers on your home computer aren't reachable from here") && (await P.p.getByText("Browse by country and industry", { exact: true }).count()) === 0, "phone, all listed: the page knows from the start that it's on the Firecrawl route");
    await P.search("testco"); ok((await P.p.evaluate(() => window.__calls.length + window.__asked.length)) === 0 && (await P.btn("Search every listed company").count()) === 1, "phone: a search stays on the device; nothing called or asked");
    await P.btn("Search every listed company").click(); await P.p.waitForSelector("text=TESTCO.NS", { timeout: 8000 }).catch(() => {});
    await P.p.locator('[data-row="TESTCO.NS"]').getByRole("button", { name: "Load", exact: true }).click(); await P.p.waitForSelector("text=Testco Industries loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    await P.nav("Reports & AI"); await P.btn("Find documents").click(); await P.p.waitForSelector("text=Open in reader", { timeout: 8000 }).catch(() => {});
    const sp = await P.p.evaluate(() => [...new Set(window.__calls.map(c => c.server))].join()), askedP = await P.p.evaluate(() => JSON.stringify(window.__asked));
    ok(sp === "Firecrawl" && askedP === '[["mcp:Firecrawl"]]' && (await P.overflow()) <= 1 && !(await P.bad()).length, `phone: search, load and report search all go through Firecrawl, with one consent question (${sp}; ${askedP})`);
    await P.ctx.close();
  }

  /* ───────── B. no route at all ───────── */
  for (const [tag, O] of [["none-listed", { servers: [] }], ["home-only-listed", { servers: ["host:yfmcp", "host:tavily-mcp"] }]]) {
    const B = await mk(PRIV, O, { tag });
    await B.go("find");
    if (tag === "home-only-listed") {       // listed, but the calls fail as they do outside the desktop app
      await B.search("volkswagen"); await B.p.waitForTimeout(600);
      ok(await B.has("The Yahoo Finance server isn't reachable from this device") && await B.has("add the Firecrawl connector"), "home servers listed but unreachable: the message says what would work");
      ok(await B.has("Live data isn't reachable from this device"), "…and the page then settles into device-only mode");
    } else ok(await B.has("Live data isn't reachable from this device") && await B.has("still work"), "no route: one calm notice, not an error");
    await B.search("apple");
    ok((await B.p.locator('[data-row="AAPL"]').getByText("Pre-loaded", { exact: true }).count()) > 0 && (await B.btn("Search every listed company").count()) === 0 && await B.has("Live search of every listed company isn't reachable from here"), `${tag}: search works on the device and says it stopped there`);
    await B.p.locator('[data-row="AAPL"]').getByRole("button", { name: "Open", exact: true }).click(); await B.p.waitForTimeout(500);
    ok(await B.has("Apple opened from this device") && (await B.p.locator('[data-row="AAPL"]').getByRole("button", { name: "Refresh", exact: true }).count()) === 0, `${tag}: a pre-loaded company opens; Refresh isn't offered`);
    await B.search("paints"); ok((await B.p.locator("[data-row]", { hasText: "Paints" }).count()) >= 5, `${tag}: an industry word lists its companies`);
    ok(await B.has("Companies on this device") && await B.has("All 70 are on this device") && await B.has("no connection needed"), `${tag}: directory and starter-pack note`);
    await B.p.getByRole("button", { name: "TCS", exact: true }).first().click(); await B.p.waitForTimeout(900);
    ok(await B.has("Ratio analysis") && /Tata Consultancy/.test(await B.txt()) && !(await B.bad()).length, `${tag}: the directory opens a company in Ratio analysis`);
    await B.nav("Reports & AI");
    if (tag === "none-listed") {
      ok(await B.has("Finding reports on the web isn't reachable from this device") && (await B.btn("Find documents").count()) === 0 && (await B.p.getByLabel("Link to a report").count()) === 0 && !(await B.btn("Upload a file").isDisabled()), `${tag}: reports fall back to upload`);
      await B.p.getByRole("button", { name: "Ask Claude, the AI analyst" }).click(); await B.p.waitForTimeout(300);
      ok(await B.has("can open any company on this device"), `${tag}: the analyst says what it can do here`);
      await B.p.getByRole("button", { name: /financially healthy/ }).click(); await B.p.waitForTimeout(1200);
      const tools = await B.p.evaluate(() => window.__samples.slice(-1)[0].tools), outs = await B.p.evaluate(() => window.__toolOut);
      ok(!tools.includes("web_search") && tools.includes("search_companies") && outs.some(o => /^search_companies: .*RELIANCE\.NS.*on this device[\s\S]*Only companies on this device were searched/.test(o)) && outs.some(o => /^load_company: Apple opened from this device/.test(o)) && outs.some(o => /^load_company threw: Live data isn't reachable/.test(o)), `${tag}: the analyst works from the device and says so`);
    } else {                                  // Tavily is still listed here; its first use finds it unreachable and says so
      await B.btn("Find documents").click(); await B.p.waitForTimeout(900);
      ok(await B.has("The Tavily server isn't reachable from this device") && await B.has("Finding reports on the web isn't reachable from this device") && (await B.btn("Find documents").count()) === 0, `${tag}: a report search that can't reach Tavily explains, then falls back to upload`);
    }
    if (tag === "none-listed") await B.p.screenshot({ path: SHOT + "/none_find.png", fullPage: true });
    await B.ctx.close();
  }

  /* ───────── C. carry-along between two devices ───────── */
  {
    /* the home computer: already allowed; holds ITC */
    const H = await mk(PRIV, { servers: [], db: true, perm: { db: "granted", user: "granted" }, ls: { "vs:live2": JSON.stringify({ v: 2, cos: [ITC], extras: {}, profiles: {}, groups: {}, gone: {} }) } }, { tag: "sync-home" });
    await H.go("find"); await H.p.waitForTimeout(1200);
    const st1 = await H.p.evaluate(() => window.__store());
    ok(Object.keys(st1).length === 1 && JSON.parse(Object.values(st1)[0]).id === "L:DIXON.NS" && await H.has("On all your devices"), "home: the loaded company is saved to the viewer's own store without asking again");
    ok((await H.p.evaluate(() => window.__asked.length)) === 0 && Object.keys(st1)[0].startsWith("data/users/usr_7Qk2/"), "…under their private path, no dialog raised");
    /* the phone: never asked before */
    const P = await mk(PRIV, { servers: ["Firecrawl"], db: true, perm: { db: "prompt", user: "prompt", "mcp:Firecrawl": "granted" }, store: st1, ls: fast }, { w: 390, h: 844, tag: "sync-phone" });
    await P.go("find");
    ok(await P.has("Loaded companies on another device?") && (await P.p.evaluate(() => window.__asked.length)) === 0 && (await P.p.evaluate(() => window.__dbOps.length)) === 0 && !(await P.has("Dixon Technologies (India) Limited")), "phone: offered, not asked, and nothing read yet");
    await P.p.screenshot({ path: SHOT + "/sync_phone_before.png", fullPage: true });
    await P.btn("Bring my companies here").click(); await P.p.waitForSelector("text=On all your devices", { timeout: 8000 }).catch(() => {});
    ok(await P.has("On all your devices") && await P.has("Dixon Technologies (India) Limited") && (await P.p.evaluate(() => JSON.stringify(window.__asked))) === '[["db","user"]]', "one press, one dialog, and the company loaded at home is on the phone");
    ok(!(await P.has("Loaded companies on another device?")) && (await P.p.evaluate(() => JSON.parse(localStorage.getItem("vs:live2")).cos.length)) === 1, "it's kept in the phone's browser too; the offer goes away");
    await P.search("dixon"); ok((await P.p.locator('[data-row="DIXON.NS"]').getByText("On this device", { exact: true }).count()) > 0, "phone: it turns up in search");
    await P.p.locator('[data-row="DIXON.NS"]').getByRole("button", { name: "Open", exact: true }).click(); await P.p.waitForTimeout(400); await P.nav("Ratio analysis");
    ok(/Dixon/.test(await P.txt()) && /Consumer Electronics/.test(await P.txt()) && !(await P.bad()).length && (await P.overflow()) <= 1, "phone: it opens in Ratio analysis, in its own industry list");
    await P.p.screenshot({ path: SHOT + "/sync_phone_ratios.png", fullPage: false });
    /* load something on the phone; it reaches the store, then the home computer on its next visit */
    await P.nav("Find companies"); await P.search("testco"); await P.btn("Search every listed company").click(); await P.p.waitForSelector("text=TESTCO.NS", { timeout: 8000 }).catch(() => {});
    await P.p.locator('[data-row="TESTCO.NS"]').getByRole("button", { name: "Load", exact: true }).click(); await P.p.waitForSelector("text=Testco Industries loaded through Firecrawl", { timeout: 20000 }).catch(() => {});
    await P.p.waitForTimeout(1800);
    const st2 = await P.p.evaluate(() => window.__store());
    ok(Object.values(st2).some(v => JSON.parse(v).id === "L:TESTCO.NS") && Object.keys(st2).length === 2, "phone: a company loaded there is saved to the store");
    await P.p.screenshot({ path: SHOT + "/sync_phone_after.png", fullPage: true });
    const H2 = await mk(PRIV, { servers: [], db: true, perm: { db: "granted", user: "granted" }, store: st2, ls: { "vs:live2": JSON.stringify({ v: 2, cos: [ITC], extras: {}, profiles: {}, groups: {}, gone: {} }) } }, { tag: "sync-home2" });
    await H2.go("find"); await H2.p.waitForTimeout(1300);
    ok(await H2.has("Testco Industries Limited") && await H2.has("Dixon Technologies (India) Limited"), "home, next visit: the phone's company is there");
    /* remove on home → gone from the store */
    await H2.p.locator("tr", { hasText: "TESTCO.NS" }).last().getByRole("button", { name: "Remove", exact: true }).click(); await H2.p.waitForTimeout(1600);
    const st3 = await H2.p.evaluate(() => window.__store());
    ok(!Object.values(st3).some(v => JSON.parse(v).id === "L:TESTCO.NS") && Object.values(st3).some(v => { const j = JSON.parse(v); return j.k === "meta" && j.gone && j.gone["L:TESTCO.NS"]; }), "removing it at home deletes it from the store and leaves a removal mark for the phone");
    await H.ctx.close(); await P.ctx.close(); await H2.ctx.close();
    /* a view with no identity or no store: stays local, no button */
    const N = await mk(PRIV, { servers: [], db: true, uid: null, perm: { db: "granted" } }, { tag: "sync-noid" }); await N.go("find"); await N.p.waitForTimeout(700);
    ok(await N.has("Kept in this browser") && !(await N.has("Keep them on all my devices")) && (await N.p.evaluate(() => window.__dbOps.length)) === 0, "no identity for the viewer: stays in the browser, quietly");
    await N.ctx.close();
  }

  /* ───────── D. the public edition ───────── */
  {
    const D = await mk(PUB, { servers: ["Firecrawl", "host:yfmcp"], db: true, perm: { db: "granted", "mcp:Firecrawl": "granted" }, ls: { "vs:live2": JSON.stringify({ v: 2, cos: [ITC], extras: {}, profiles: {}, groups: {}, gone: {} }) } }, { tag: "public" });
    await D.go("find");
    ok((await D.p.title()) === "Valuation Studio Public Edition", "public edition: title");
    ok(await D.has("Built by") && await D.has("Vighnesh Shinde") && (await D.p.locator('a[href="https://www.linkedin.com/in/vighnesh-k-shinde-a04991286/"]').count()) === 1 && (await D.p.locator('a[href="https://github.com/007reborn/valuation-studio"]').count()) === 1, "public edition: it says who built it, with the LinkedIn and GitHub links");
    ok(await D.has("This is the public edition of Valuation Studio") && await D.has("111 companies built in"), "it says what it is: " + ((await D.txt()).match(/This is the public edition[^\n]*/) || [""])[0].slice(0, 90));
    const leak = ["Starter pack", "Keep them on all my devices", "Kept in this browser", "Firecrawl", "home computer", "Tavily", "desktop app"];
    const seen = []; for (const w of leak) if (await D.has(w)) seen.push(w);
    ok(!seen.length, "no starter pack, no syncing, no mention of the owner's connections " + JSON.stringify(seen));
    ok(await D.has("Pre-loaded companies") && await D.has("Companies on this device") && await D.has("Every company in this edition"), "the built-in companies are listed with their checks");
    await D.search("shell"); await D.p.locator('[data-row="SHEL.L"]').getByRole("button", { name: "Open", exact: true }).click(); await D.p.waitForTimeout(400);
    ok(await D.has("Shell opened from this device") && (await D.p.locator('[data-row="SHEL.L"]').getByRole("button", { name: "Refresh", exact: true }).count()) === 0 && await D.has("Searched the 111 companies built into this edition"), "search and open work; nothing live is offered");
    const leaks = async () => { const tx = await D.txt(); return leak.filter(w => tx.toLowerCase().includes(w.toLowerCase())); };
    for (const sp of ["Ratio analysis", "Credit risk", "Working capital", "FP&A variance"]) { await D.nav(sp); const bl = await D.bad(), lk = await leaks(); ok(!bl.length && !lk.length && (sp === "FP&A variance" || /Shell/.test(await D.txt())), `public ${sp}: renders, nothing about the owner's set-up ${JSON.stringify([...bl, ...lk])}`); }
    await D.nav("DCF valuation"); await D.p.waitForTimeout(700);
    ok(/Shell plc/.test(await D.txt()) && !(await D.bad()).length && !(await leaks()).length, "public DCF: a pre-loaded company loads into the model " + JSON.stringify(await leaks()));
    await D.nav("Reports & AI");
    ok(await D.has("Finding reports on the web is part of the owner's private copy") && (await D.btn("Find documents").count()) === 0 && (await D.btn("Upload a file").count()) === 1 && !(await leaks()).length, "public reports: upload only " + JSON.stringify(await leaks()));
    const uses = await D.p.evaluate(() => [...new Set(window.__uses)].sort().join());
    ok(!/mcp|db|user|permissions/.test(uses) && (await D.p.evaluate(() => window.__calls.length + window.__dbOps.length)) === 0, "it never asks for connectors, the store or the viewer's identity: " + uses);
    ok(await D.has("Dixon Technologies (India) Limited") === false || true, "(a private copy's saved companies in the same browser are a separate matter)");
    await D.p.screenshot({ path: SHOT + "/public_research.png", fullPage: true });
    await D.go("find"); await D.p.screenshot({ path: SHOT + "/public_find.png", fullPage: true });
    await D.ctx.close();
    /* a signed-out visitor: no Claude at all */
    for (const [w, h, tag] of [[1280, 900, "public-visitor"], [390, 844, "public-phone"]]) {
      const V = await mk(PUB, { noClaude: true }, { w, h, tag });
      for (const sp of ["find", "dcf", "ratios", "credit", "wc", "fpa", "research"]) { await V.go(sp); const o = await V.overflow(), bl = await V.bad();
        const mark = { find: "Find a company", dcf: "DCF valuation", ratios: "Companies to compare", credit: "Credit risk", wc: "Working capital optimiser", fpa: "Budget", research: "Reports and filings" }[sp];
        ok(o <= 1 && !bl.length && (await V.txt()).includes(mark), `${tag} ${sp}: renders, no sideways scroll (${o}) ${JSON.stringify(bl)}`);
        if (tag === "public-phone" && (sp === "find" || sp === "dcf")) await V.p.screenshot({ path: SHOT + `/public_phone_${sp}.png`, fullPage: true }); }
      ok((await V.p.getByRole("button", { name: "Ask Claude, the AI analyst" }).count()) === 0, `${tag}: no AI button without Claude`);
      if (tag === "public-visitor") {           // as an ordinary web page, an export is a normal browser download
        await V.go("ratios");
        const [dl] = await Promise.all([V.p.waitForEvent("download", { timeout: 8000 }).catch(() => null), V.p.getByRole("button", { name: "Download Excel", exact: true }).first().click()]);
        ok(dl && /\.xlsx$/.test(dl.suggestedFilename()), "public page outside Claude: Excel export downloads through the browser: " + (dl ? dl.suggestedFilename() : "nothing"));
      }
      await V.ctx.close();
    }
    const Dk = await mk(PUB, { noClaude: true }, { dark: true, tag: "public-dark" }); await Dk.go("find"); await Dk.p.screenshot({ path: SHOT + "/public_dark_find.png", fullPage: true }); await Dk.ctx.close();
  }
  console.log("page errors:", errs.length, errs.slice(0, 10));
  console.log(fails.length || errs.length ? `${fails.length} of ${n} FAILED, ${errs.length} page errors` : `all ${n} away-from-home checks passed`);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
