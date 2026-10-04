/* End-to-end test of live search, loading, workspaces, reports and the AI analyst, with the viewer's MCP servers and
   Claude mocked from real tool outputs captured in this session (fixtures stay in this test; nothing is published). */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const SHOT = process.argv[2] || "shots/e2e";
fs.mkdirSync(SHOT, { recursive: true });
const FX = JSON.parse(fs.readFileSync("fixtures/mcp_fixtures.json", "utf8"));
const fx = (tool, pred) => (FX.find(f => f.tool === tool && pred(f.input)) || {}).text;
/* split the captured extracts into single pages */
const pagesOf = t => { const out = {}, re = /(?:^|\n)Title: ([^\n]*)\nURL: ([^\n]*)\n(?:Content: [^\n]*\n)?Raw Content: ?/g; const marks = []; let m;
  while ((m = re.exec(t))) marks.push({ title: m[1], url: m[2].trim(), start: re.lastIndex, at: m.index });
  marks.forEach((k, i) => out[k.url] = { title: k.title, raw: t.slice(k.start, i + 1 < marks.length ? marks[i + 1].at : t.length) }); return out; };
const P = { ...pagesOf(fx("tavily_extract", i => i.urls[0].includes("SUPREMEIND/financials/income-statement"))), ...pagesOf(fx("tavily_extract", i => i.urls[0].includes("SUPREMEIND/financials/balance-sheet"))) };
const sup = k => P[Object.keys(P).find(u => u.includes("SUPREMEIND/financials/" + k))];
const PAGES = { is: sup("income-statement"), bs: sup("balance-sheet"), cf: sup("cash-flow-statement") };
const pxTable = (file, scale = 1) => "| Date | Open | High | Low | Close | Volume | Dividends | Stock Splits |\n|:--|--:|--:|--:|--:|--:|--:|--:|\n" +
  fs.readFileSync(file, "utf8").trim().split("\n").slice(1).map(l => { const [d, c] = l.split(","); const v = (+c * scale).toFixed(2); return `| ${d} 00:00:00+05:30 | ${v} | ${v} | ${v} | ${v} | 1000 | 0 | 0 |`; }).join("\n");
const DATA = {
  search: { "Supreme Industries": fx("yfinance_search", i => i.query === "Supreme Industries"), "HDFC Bank": fx("yfinance_search", i => i.query === "HDFC Bank") },
  info: fx("yfinance_get_ticker_info", i => i.symbol === "SUPREMEIND.NS"), fin: fx("yfinance_get_financials", i => i.symbol === "SUPREMEIND.NS"),
  screen: fx("yfinance_screen", i => JSON.stringify(i.query).includes("Building Products")), nsei: fx("yfinance_get_price_history", i => i.symbol === "^NSEI"),
  cnyinr: fx("yfinance_get_price_history", i => i.symbol === "CNYINR=X"), supPx: pxTable("data/px/SUPREMEIND.csv"), usPx: pxTable("data/px/SUPREMEIND.csv", 0.035),
  reportSearch: fx("tavily_search", i => /annual report/.test(i.query)), pdfText: fx("tavily_extract", i => i.urls[0].includes("icicidirect")),
  secList: fx("get_recent_filings", i => i.identifier === "WMS"), pages: PAGES,
};
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "xlsx.bundle.js": "node_modules/xlsx-js-style/dist/xlsx.bundle.js", "pdf.js/3.11.174/pdf.min.js": "node_modules/pdfjs-dist/build/pdf.min.js", "pdf.js/3.11.174/pdf.worker.min.js": "node_modules/pdfjs-dist/build/pdf.worker.min.js" };
const MOCK = (D) => {
  window.__calls = []; window.__samples = []; window.__saved = []; window.__toolOut = [];
  const T = s => ({ content: [{ type: "text", text: s }], payload: (() => { try { return JSON.parse(s); } catch { return s; } })() });
  const J = o => T(JSON.stringify({ result: JSON.stringify(o) }));
  const page = (pg, url, title, flag) => `Title: ${title}\nURL: ${url}\nContent: undefined\nRaw Content: ${flag ? pg.raw.replace(/flags\/india\.svg\)\n\n# The Supreme Industries/, "flags/united_states.svg)\n\n# Drainage Test").replace(/!\[India flag\]\(\/img\/flags\/india\.svg\)\n\n\|/g, "![United States flag](/img/flags/united_states.svg)\n\n|") : pg.raw}`;
  const info = sym => { const base = JSON.parse(JSON.parse(D.info).result);
    if (sym === "DRNX") return { ...base, symbol: "DRNX", longName: "Drainage Test Corporation", shortName: "DRAINAGE TEST", currency: "USD", financialCurrency: "USD", country: "United States",
      currentPrice: 120.5, regularMarketPrice: 120.5, sharesOutstanding: 127.0e6, impliedSharesOutstanding: 127.0e6, fiftyTwoWeekLow: 90, fiftyTwoWeekHigh: 150, dividendRate: 0.72,
      priceToSalesTrailing12Months: 0.135, fullExchangeName: "NYSE", exchange: "NYQ", website: "https://www.drainage-test.example", longBusinessSummary: "A fictional drainage-pipe maker used for testing." };
    if (sym === "HDFCBANK.NS") return { symbol: sym, longName: "HDFC Bank Limited", shortName: "HDFC BANK LTD", currency: "INR", financialCurrency: "INR", country: "India", industry: "Banks—Regional",
      industryDisp: "Banks—Regional", sector: "Financial Services", currentPrice: 721.2, marketCap: 11119805595648, trailingPE: 15.75, priceToBook: 1.83, fullExchangeName: "NSE", longBusinessSummary: "A bank (test)." };
    if (sym === "CPPLUS.NS") return { ...base, symbol: sym, longName: "Aditya Infotech Limited", shortName: "ADITYA INFOTECH", currentPrice: 3799.6, priceToSalesTrailing12Months: 4.2 };
    return null; };
  const mcp = {
    listTools: async () => ({ servers: [{ server: "host:yfmcp", authStatus: "unknown", tools: [] }, { server: "host:tavily-mcp", authStatus: "unknown", tools: [] }, { server: "host:sec-edgar-mcp", authStatus: "unknown", tools: [] }] }),
    callTool: async (server, tool, input) => {
      window.__calls.push({ server, tool, input: JSON.stringify(input).slice(0, 200) });
      await new Promise(r => setTimeout(r, 20));
      if (tool === "yfinance_search") { const q = input.query; if (D.search[q]) return T(D.search[q]);
        if (/drain/i.test(q)) return J([{ symbol: "DRNX", shortname: "DRAINAGE TEST", longname: "Drainage Test Corporation", quoteType: "EQUITY", exchDisp: "NYSE", exchange: "NYQ", sector: "Industrials", industry: "Building Products & Equipment" }]);
        return J([]); }
      if (tool === "yfinance_get_ticker_info") { const o = info(input.symbol); if (!o) throw { code: "tool_error", message: "No data" }; return J(o); }
      if (tool === "yfinance_get_financials") return T(D.fin);
      if (tool === "yfinance_screen") return T(D.screen);
      if (tool === "yfinance_get_price_history") { const s = input.symbol;
        if (s === "^NSEI" || s === "^GSPC") return T(D.nsei); if (s === "CNYINR=X") return T(D.cnyinr);
        if (s === "USDINR=X") return T("| Date | Open | High | Low | Close | Volume | Dividends | Stock Splits |\n|:--|--:|--:|--:|--:|--:|--:|--:|\n| 2026-10-01 00:00:00+01:00 | 88.1 | 88.4 | 88.0 | 88.25 | 0 | 0 | 0 |");
        if (s === "DRNX") return T(D.usPx); return T(D.supPx); }
      if (tool === "tavily_extract") { const urls = input.urls;
        if (urls[0].includes("stockanalysis.com")) {
          if (urls[0].includes("/nse/CPPLUS/")) return T("Detailed Results:\n\nFailed Results:\nURL: x");
          const us = urls[0].includes("/stocks/drnx/"), nm = us ? "Drainage Test (DRNX)" : "Company";
          return T("Detailed Results:\n\n" + [["income-statement", D.pages.is], ["balance-sheet", D.pages.bs], ["cash-flow-statement", D.pages.cf]].map(([k, pg]) =>
            page(pg, urls.find(u => u.includes(k)), `${nm} ${k}`, us)).join("\n\n")); }
        return T(`Detailed Results:\n\nTitle: null\nURL: ${urls[0]}\nContent: undefined\nRaw Content: ${JSON.parse(JSON.stringify(D.pdfText)).split("Raw Content: ")[1]}`); }
      if (tool === "tavily_search") { if ((input.include_domains || []).includes("stockanalysis.com")) return T(`Detailed Results:\n\nTitle: Aditya Infotech (BOM:543937) Financials\nID: x\nURL: https://stockanalysis.com/quote/bom/543937/financials/\nContent: statements`);
        return T(D.reportSearch); }
      if (tool === "get_recent_filings") return T(D.secList);
      if (tool === "get_filing_content") { const off = input.offset || 0, total = 250000; const body = (off === 0 ? "dei:xbrl noise 0001604028 ".repeat(50) + "UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. FORM 10-K. Item 1A. Risk Factors. Our results depend on construction demand. " : "") + "Item 7. Management's Discussion and Analysis. Net sales increased 5%. ".repeat(1200);
        const content = body.slice(0, Math.min(input.max_chars, total - off));
        return T(JSON.stringify({ success: true, accession_number: input.accession_number, form_type: "10-K", content, url: "https://www.sec.gov/test", offset: off, returned_chars: content.length, total_chars: total, next_offset: off + content.length })); }
      throw { code: "tool_error", message: "unmocked " + tool };
    }, watchTool: () => () => {}, invalidate: async () => {}, server: async () => ({}), describeTool: async () => ({}) };
  const sample = async (input, opts) => {
    window.__samples.push({ kind: typeof input === "string" ? "s" : "t", head: (typeof input === "string" ? input : input.map(t => t.role + ": " + t.content).join("\n")).slice(0, 70000), tools: opts && opts.tools ? opts.tools.map(t => t.name) : null, tier: opts && opts.modelTier });
    if (opts && opts.tools) for (const nm of ["get_current_view", "get_company", "search_document", "read_part", "search_report", "get_dcf", "web_search"]) {
      const t = opts.tools.find(x => x.name === nm); if (!t) continue;
      try { const r = await t.execute(nm === "read_part" ? { n: 1 } : { query: "capex", company: "", term: "ROE" }, { signal: new AbortController().signal }); window.__toolOut.push(nm + ": " + String(typeof r === "string" ? r : JSON.stringify(r)).slice(0, 400)); } catch (e) { window.__toolOut.push(nm + " threw " + e.message); } }
    const text = "## The company in brief\nA **test** answer that cites [Part 2] and [Page 3].\n\n| Measure | Value |\n|---|---|\n| ROE | 15% |\n\n- first point\n- second point with `code`\n\n1. numbered\n\nEducational, not advice.";
    opts && opts.onText && opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: "default" };
  };
  sample.json = async () => ({ t: "x", d: "y", w: "z", c: "q" });
  sample.limits = async () => ({ maxPromptBytes: 65536, tools: { maxCount: 16 } });
  const downloads = { save: async ({ filename, data }) => { let b64 = "";
    if (typeof data === "string") b64 = btoa(unescape(encodeURIComponent(data))); else { const u8 = data instanceof Uint8Array ? data : new Uint8Array(data); let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); b64 = btoa(s); }
    window.__saved.push({ filename, b64 }); return { status: "saved" }; } };
  window.claude = { use: async n => n === "mcp" ? mcp : n === "sample" ? sample : n === "downloads" ? downloads : null };
};
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errs = [], fails = [];
  const ok = (c, m) => { if (!c) { fails.push(m); console.log("FAIL", m); } else console.log("ok  ", m); };
  const mk = async (w, h, dark) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
    await ctx.addInitScript(MOCK, DATA);
    await ctx.route("**/*", r => { const u = r.request().url(); if (u.startsWith("file://")) return r.continue();
      const hit = Object.keys(local).find(k => u.endsWith(k)); if (hit) return r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(local[hit]) }); return r.abort(); });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(`[${w}] ${e.message}`));
    p.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(`[${w}] console: ${m.text()}`); });
    return { p, ctx };
  };
  const { p, ctx } = await mk(1280, 900, false);
  const t = s => p.getByText(s, { exact: false });
  const btn = (name, nth = 0) => p.getByRole("button", { name, exact: true }).nth(nth);
  const wait = ms => p.waitForTimeout(ms);
  const overflow = async () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.goto("file://" + path.resolve("valuation_studio.html") + "#find"); await wait(1500);
  ok(await t("Find any listed company").count() > 0, "Find workspace renders");
  ok(await t("isn't reachable from this device").count() === 0 && await t("away from your home computer").count() === 0, "no notice when the home servers are listed");
  ok(await t("Browse by country and industry").count() > 0 && await t("Starter pack").count() > 0 && await t("Kept in this browser").count() > 0, "browse, starter pack and the loaded list are shown");
  /* 1. verified company via search */
  await p.getByLabel("Company name or ticker").fill("Supreme Industries"); await btn("Search").click(); await wait(600);
  ok(await t("SUPREMEIND.NS").count() > 0 && await p.getByText("Verified", { exact: true }).count() > 0, "search lists Supreme with the Verified badge");
  await btn("Open").first().click(); await wait(600);
  ok(await t("one of the 47 verified companies").count() > 0, "verified company opens without a live fetch");
  /* 2. a US company, end to end */
  await p.getByLabel("Company name or ticker").fill("Drainage"); await btn("Search").click(); await wait(500);
  await btn("Load").first().click(); await p.waitForSelector("text=Drainage Test loaded", { timeout: 15000 }).catch(() => {});
  const done = await t("Drainage Test loaded").count();
  ok(done > 0, "US company loads: " + (await p.evaluate(() => (document.body.innerText.match(/Drainage Test loaded[^\n]*/) || [""])[0])));
  const calls = await p.evaluate(() => window.__calls.map(c => c.tool + " " + c.input));
  ok(calls.some(c => c.startsWith("yfinance_get_price_history") && c.includes("USDINR=X")), "fetched the USD→INR rate");
  ok(calls.some(c => c.startsWith("tavily_extract") && c.includes("stockanalysis.com/stocks/drnx/financials/income-statement/")), "statements fetched from the US path");
  ok(calls.some(c => c.includes("^GSPC")), "beta against the S&P 500");
  const store = await p.evaluate(() => JSON.parse(localStorage.getItem("vs:live2")));
  const rec = store.cos.find(x => x.id === "L:DRNX");
  ok(rec && Math.abs(rec.rev[4] - 112177 * 88.25) < 1 && rec.live.stmtCur === "USD" && rec.live.cur === "USD" && Math.abs(rec.live.fxSI - 88.25) < 1e-9, "record in rupees at 88.25 per USD");
  ok(rec && rec.beta && rec.beta.n === 59, "regression beta on record: " + JSON.stringify(rec && rec.beta));
  await p.screenshot({ path: SHOT + "/find_loaded.png", fullPage: true });
  /* 3. it works in every workspace */
  for (const [sp, label] of [["Ratio analysis", "Ratio analysis"], ["Credit risk", "Credit risk"], ["Working capital", "Working capital"]]) {
    await p.getByRole("button", { name: new RegExp("^" + sp) }).first().click(); await wait(900);
    const nanLines = await p.evaluate(() => document.body.innerText.split("\n").filter(l => /NaN|Infinity|undefined/.test(l)).slice(0, 6));
    if (nanLines.length) console.log("   NaN lines:", JSON.stringify(nanLines));
    ok(await t("Drainage Test").count() > 0 && await t(label).count() > 0, `${label} shows the live company`);
    ok(!nanLines.length, `${label}: no NaN, Infinity or undefined on the page`);
    await p.screenshot({ path: SHOT + `/live_${sp.replace(/\W+/g, "_")}.png`, fullPage: true });
  }
  await p.getByRole("button", { name: /^DCF valuation/ }).first().click(); await wait(1200);
  let dcfTxt = await p.evaluate(() => document.body.innerText);
  await p.getByRole("button", { name: /See what it.s worth/ }).first().click(); await wait(700);
  const dcfTxt2 = await p.evaluate(() => document.body.innerText);
  ok(/Revenue \(USD million\)/.test(dcfTxt), "DCF record shown in USD");
  ok(/S&P 500/.test(dcfTxt), "beta panel names the S&P 500");
  const vline = (dcfTxt2.match(/[^\n]*values[^\n]*a share[^\n]*/) || [""])[0]; console.log("   DCF value line:", vline.slice(0, 200));
  ok(/Drainage Test Corporation/.test(dcfTxt) && /\$[\d,.]+/.test(vline), "DCF loaded in USD: " + vline);
  ok(/United States/.test(dcfTxt), "DCF market set to the United States");
  await p.screenshot({ path: SHOT + "/live_dcf.png", fullPage: true });
  /* 4. browse by industry and load two together */
  await p.getByRole("button", { name: /^Find companies/ }).first().click(); await wait(700);
  await btn("Find companies").click(); await wait(800);
  const rows = await p.evaluate(() => [...document.querySelectorAll("table")].map(tb => tb.innerText).find(x => x.includes("Market value")) || "");
  ok(/Aditya Infotech/.test(rows) && /Supreme Industries/.test(rows) && (rows.match(/SUPREMEIND/g) || []).length === 1, "browse lists companies, one row per company");
  await p.getByLabel("Pick Aditya Infotech Limited").check(); await p.getByLabel("Pick The Supreme Industries Limited").check();
  await p.getByRole("button", { name: /^Load and compare 2/ }).click(); await p.waitForSelector("text=ready to compare", { timeout: 15000 }).catch(() => {});
  ok(await t("2 companies ready to compare").count() > 0, "batch load: " + (await p.evaluate(() => (document.body.innerText.match(/\d compan[^\n]*ready to compare[^\n]*/) || [""])[0])));
  const calls2 = await p.evaluate(() => window.__calls.filter(c => c.tool === "tavily_search").map(c => c.input));
  ok(calls2.some(c => c.includes("stockanalysis.com")), "unknown path discovered through search");
  const sel = await p.evaluate(() => JSON.parse(localStorage.getItem("vs:sel2")));
  ok(sel.ind === "live:building-products-equipment" && sel.ids.includes("SUPREMEIND") && sel.ids.includes("L:CPPLUS.NS"), "comparison set to the browsed industry: " + JSON.stringify(sel));
  ok(await t("2 companies ready to compare").count() > 0, "batch outcome shown");
  await p.getByLabel("Filter the results").fill("astral"); await wait(200);
  ok(await p.evaluate(() => { const tb = [...document.querySelectorAll("table")].find(x => x.innerText.includes("Market value")); return tb ? tb.querySelectorAll("tbody tr").length : -1; }) === 1, "result filter narrows the list");
  await p.getByLabel("Filter the results").fill("");
  await btn("All passed").first().click().catch(() => {}); await wait(300);
  await p.getByRole("button", { name: /^FP&A variance/ }).first().click(); await wait(900);
  const fpaBad = await p.evaluate(() => document.body.innerText.split("\n").filter(l => /NaN|Infinity|undefined/.test(l)).slice(0, 4));
  ok(!fpaBad.length && await t("Aditya Infotech").count() > 0, "FP&A works with a live comparison " + JSON.stringify(fpaBad));
  await p.getByRole("button", { name: /^Find companies/ }).first().click(); await wait(600);
  await p.screenshot({ path: SHOT + "/find_browse.png", fullPage: true });
  /* 5. a bank loads as a profile */
  await p.getByLabel("Company name or ticker").fill("HDFC Bank"); await btn("Search").click(); await wait(500);
  const bankRow = p.locator('[data-row="HDFCBANK.NS"]');
  ok(await bankRow.getByText("Profile", { exact: true }).count() > 0 && await bankRow.getByRole("button", { name: "Open profile" }).count() > 0, "the pre-loaded bank profile is offered from the device");
  const nInfo = await p.evaluate(() => window.__calls.filter(c => c.tool === "yfinance_get_ticker_info").length);
  await bankRow.getByRole("button", { name: "Open profile" }).click(); await wait(500);
  ok(await t("is on this device as a profile").count() > 0 && await p.evaluate(() => window.__calls.filter(c => c.tool === "yfinance_get_ticker_info").length) === nInfo, "opening it makes no call");
  await bankRow.getByRole("button", { name: "Refresh" }).click(); await p.waitForSelector("text=loaded as a profile", { timeout: 15000 }).catch(() => {});
  ok(await t("loaded as a profile").count() > 0 && await p.evaluate(() => JSON.parse(localStorage.getItem("vs:live2")).profiles["HDFCBANK.NS"].price) === 721.2, "Refresh fetches the bank live and keeps it as a profile");
  /* 6. quick search inside a workspace adds to the comparison */
  await p.getByRole("button", { name: /^Ratio analysis/ }).first().click(); await wait(600);
  await p.getByLabel("Search for a company").fill("Drainage"); await p.getByLabel("Search for a company").press("Enter"); await wait(500);
  await btn("Compare here").first().click(); await wait(1500);
  const sel2 = await p.evaluate(() => JSON.parse(localStorage.getItem("vs:sel2")));
  ok(sel2.ids.includes("L:DRNX") && sel2.focus === "L:DRNX", "quick search adds to the current comparison: " + JSON.stringify(sel2.ids));
  /* 7. Reports & AI: full analysis, Word export */
  await p.getByRole("button", { name: /^Reports & AI/ }).first().click(); await wait(900);
  ok(await t("Full company analysis").count() > 0, "research workspace renders");
  await btn("Write the analysis").click(); await wait(1200);
  ok(await p.getByText("The company in brief").count() > 0, "analysis rendered");
  const s0 = await p.evaluate(() => window.__samples.slice(-1)[0]);
  ok(/COMPANY DATA/.test(s0.head) && /Drainage Test Corporation/.test(s0.head) && /Revenue:/.test(s0.head), "analysis prompt carries the data pack");
  ok(/RECENT NEWS/.test(s0.head) || console.log("   news calls:", JSON.stringify(await p.evaluate(() => window.__calls.filter(c => c.tool === "tavily_search").map(c => c.input)))), "analysis includes recent news");
  await btn("Word").click(); await wait(500);
  /* 8. reports: find, open, search, main points, ask with tools */
  await btn("Find documents").click(); await wait(900);
  ok(await t("Form 10-K").count() > 0, "SEC filings listed for a US company");
  ok(await t("Open in reader").count() > 0, "web results listed");
  await btn("Open in reader").first().click(); await wait(1200);
  ok(await t("parts · about").count() > 0, "document opened in the reader");
  await p.getByLabel("Find in document").fill("capex"); await p.getByLabel("Find in document").press("Enter"); await wait(400);
  ok(await p.evaluate(() => /\d+ of \d+/.test(document.body.innerText)) && await p.locator("mark").count() > 0, "find in document highlights matches");
  await btn("Main points").click(); await wait(800);
  const s1 = await p.evaluate(() => window.__samples.slice(-1)[0]);
  ok(/\[Part \d+\]/.test(s1.head), "main points sends cited excerpts");
  await p.getByLabel("Ask about this document").fill("What is the capex plan?"); await btn("Ask").click(); await wait(800);
  const s2 = await p.evaluate(() => window.__samples.slice(-1)[0]);
  ok(s2.tools && s2.tools.includes("search_document") && s2.tools.includes("read_part"), "document Q&A offers search and read tools");
  await btn("Read in full").first().click(); await wait(1500);
  ok(await t("Form 10-K for the period").count() > 0, "SEC filing read in full");
  /* 9. upload a PDF */
  await p.locator("input[type=file]").setInputFiles("fixtures/test_report.pdf"); await p.waitForSelector("text=4 pages", { timeout: 20000 }).catch(() => {});
  ok(await t("4 pages").count() > 0, "uploaded PDF read page by page");
  ok(await p.getByRole("button", { name: /Auditor's report/ }).count() > 0, "sections detected in the PDF");
  await p.screenshot({ path: SHOT + "/research.png", fullPage: true });
  /* 10. AI dock with tools */
  await p.getByRole("button", { name: "Ask Claude, the AI analyst" }).click(); await wait(300);
  await p.getByRole("button", { name: /Is Drainage Test financially healthy/ }).click(); await wait(1200);
  const s3 = await p.evaluate(() => window.__samples.slice(-1)[0]);
  ok(s3.kind === "t" && s3.tools && ["get_current_view", "get_company", "get_dcf", "search_companies", "load_company", "web_search", "search_report"].every(x => s3.tools.includes(x)), "chat offers page and live tools: " + (s3.tools || []).join(","));
  ok(/Plain language: explain any financial term/.test(s3.head) && /don't tell them to buy, sell or hold/.test(s3.head), "chat rules: plain language and no buy/sell calls");
  const outs = await p.evaluate(() => window.__toolOut);
  ok(outs.some(o => o.startsWith("get_company: Drainage Test Corporation")) && outs.some(o => o.startsWith("get_dcf: The DCF model holds")), "tools return page data");
  ok(await p.locator("[role=dialog]").getByText("Read the DCF model").count() > 0, "tool activity shown in the chat");
  await p.locator("[role=dialog]").getByRole("button", { name: "[Page 3]" }).first().click(); await wait(500);
  ok(await p.getByLabel("Page number").inputValue() === "3", "a citation in the chat jumps the reader to that page");
  await p.screenshot({ path: SHOT + "/dock.png" });
  const saved = await p.evaluate(() => window.__saved.map(s => ({ f: s.filename, b64: s.b64 })));
  saved.forEach(s => fs.writeFileSync(path.join(SHOT, s.f), Buffer.from(s.b64, "base64")));
  ok(saved.some(s => /\.docx$/.test(s.f)), "Word file offered: " + saved.map(s => s.f).join(", "));
  /* 11. phone and dark */
  for (const [w, h, dark, tag] of [[390, 844, false, "phone"], [1280, 900, true, "dark"]]) {
    const { p: q, ctx: c2 } = await mk(w, h, dark);
    await q.goto("file://" + path.resolve("valuation_studio.html") + "#find"); await q.waitForTimeout(1200);
    await q.evaluate(s => { localStorage.setItem("vs:live2", s); }, JSON.stringify(store)); await q.reload(); await q.waitForTimeout(1200);
    for (const sp of ["find", "research", "ratios"]) { await q.evaluate(s => { location.hash = s; }, sp); await q.reload(); await q.waitForTimeout(1000);
      const o = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(o <= 1, `${tag} ${sp}: no horizontal overflow (${o})`);
      await q.screenshot({ path: SHOT + `/${tag}_${sp}.png`, fullPage: true }); }
    await q.getByRole("button", { name: "Ask Claude, the AI analyst" }).click(); await q.waitForTimeout(300); await q.screenshot({ path: SHOT + `/${tag}_dock.png` });
    await c2.close();
  }
  /* 12. the page without live servers */
  { const c3 = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await c3.addInitScript(() => { window.claude = { use: async n => null }; });
    await c3.route("**/*", r => { const u = r.request().url(); if (u.startsWith("file://")) return r.continue(); const hit = Object.keys(local).find(k => u.endsWith(k)); if (hit) return r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(local[hit]) }); return r.abort(); });
    const q = await c3.newPage(); q.on("pageerror", e => errs.push("[no-mcp] " + e.message));
    await q.goto("file://" + path.resolve("valuation_studio.html") + "#find"); await q.waitForTimeout(1500);
    ok(await q.getByText("Live data isn't reachable from this device", { exact: false }).count() > 0, "no-live notice when no route is reachable");
    await q.getByLabel("Company name or ticker").fill("Volkswagen"); await q.getByRole("button", { name: "Search", exact: true }).click(); await q.waitForTimeout(500);
    ok(await q.getByText("Nothing on this device matches that name", { exact: false }).count() > 0 && await q.getByText("Live search of every listed company isn't reachable from here", { exact: false }).count() > 0, "a search that finds nothing on the device says why it can't look further");
    await q.getByLabel("Company name or ticker").fill("Reliance"); await q.getByRole("button", { name: "Search", exact: true }).click(); await q.waitForTimeout(400);
    await q.locator('[data-row="RELIANCE.NS"]').getByRole("button", { name: "Open", exact: true }).first().click(); await q.waitForTimeout(500);
    ok(await q.getByText("Reliance Industries opened from this device", { exact: false }).count() > 0, "a pre-loaded company opens with no route at all");
    ok(await q.getByRole("button", { name: "Ask Claude, the AI analyst" }).count() === 0, "no AI button without the sample capability");
    await c3.close(); }
  console.log("page errors:", errs.length, errs.slice(0, 8));
  console.log(fails.length ? `${fails.length} FAILED` : "all end-to-end checks passed");
  await b.close();
})();
