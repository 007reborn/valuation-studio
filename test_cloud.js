/* Tests for the away-from-home route (Firecrawl), route selection and failover, pacing, the on-device library and search,
   using tool outputs captured live on 4 Oct 2026 (harvest/calls.json; nothing here is published). */
const fs = require("fs"), path = require("path");
const calls = JSON.parse(fs.readFileSync("harvest/calls.json", "utf8"));
const lib = JSON.parse(fs.readFileSync("harvest/library.json", "utf8"));
const { load } = require("./harvest/engine.js");
let fails = 0, n = 0; const ok = (c, msg) => { n++; if (!c) { fails++; console.log("FAIL", msg); } };
const fc = sub => { const c = calls.find(x => x.server === "Firecrawl" && !x.err && String(x.input.url || x.input.query).includes(sub)); if (!c) throw new Error("no capture: " + sub); return JSON.parse(c.text); };
const home = t => calls.find(x => x.server !== "Firecrawl" && !x.err && x.tool === t);
(async () => {
  const { m } = load(calls, { route: "cloud" });

  /* 1. statement pages: Firecrawl's copy parses to the same thing as Tavily's */
  const tv = m.tvParseExtract(home("tavily_extract").text), tvOf = k => m.saParse(tv.find(d => d.url.includes(k)).raw);
  const F = { is: m.saParse(fc("RELIANCE/financials/income-statement").markdown), bs: m.saParse(fc("RELIANCE/financials/balance-sheet").markdown), cf: m.saParse(fc("RELIANCE/financials/cash-flow-statement").markdown) };
  const T = { is: tvOf("income-statement"), bs: tvOf("balance-sheet"), cf: tvOf("cash-flow-statement") };
  ok(F.is.flag === "india" && F.is.unit === "millions" && F.is.curText === "INR" && F.is.name === "Reliance Industries Limited", "Firecrawl IS header: " + JSON.stringify([F.is.flag, F.is.unit, F.is.curText, F.is.name]));
  ok(T.is.flag === "india" && T.is.unit === null && T.is.name === null, "Tavily IS header unchanged");
  ok(JSON.stringify(F.is.cols) === JSON.stringify(T.is.cols.map(c => ({ ...c, end: c.end.replace("'26 ", "'26").replace(/' ?(\d\d) /, "'$1") }))) || F.is.cols.every((c, i) => c.label === T.is.cols[i].label && m.saEnd(c.end).y === m.saEnd(T.is.cols[i].end).y && m.saEnd(c.end).m === m.saEnd(T.is.cols[i].end).m), "IS columns and period ends agree");
  for (const s of ["is", "cf"]) { const a = F[s].rows, b = T[s].rows; ok(Object.keys(b).length > 15 && JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b)), `${s}: same row labels (${Object.keys(a).length})`); ok(JSON.stringify(a) === JSON.stringify(b), `${s}: same values`); ok(JSON.stringify(F[s].cur) === JSON.stringify(T[s].cur), `${s}: same TTM column`); }
  ok(JSON.stringify(Object.keys(F.bs.rows)) === JSON.stringify(Object.keys(T.bs.rows)), "bs: same row labels");
  ok(JSON.stringify(F.bs.rows["Total Assets"]) === JSON.stringify(T.bs.rows["Total Assets"]) && F.bs.rows["Total Debt"][0] === 5025140 && T.bs.rows["Total Debt"][0] === 3980000, "bs: totals agree; debt is the page's newer figure");
  ok(F.bs.cur["Filing Date Shares Outstanding"] === 13531, "bs current shares");
  const A = m.saParse(fc("stocks/aapl/financials/income-statement").markdown);
  ok(A.flag === "united_states" && A.curText === "USD" && A.name === "Apple Inc." && A.cols[0].label === "FY2025" && m.saEnd(A.cols[0].end).mon === "Sep" && A.rows.Revenue[0] === 416161, "Apple IS: " + JSON.stringify([A.flag, A.curText, A.name, A.cols[0]]));
  const S = m.saParse(fc("lon/SHEL/financials/income-statement").markdown);
  ok(S.flag === "united_states" && S.curText === "USD" && S.name === "Shell plc" && m.saEnd(S.cols[0].end).mon === "Dec", "Shell IS reports in USD: " + JSON.stringify([S.flag, S.curText, S.name]));
  ok(m.saParse("").cols.length === 0 && m.saParse("# Page Not Found\n\nSorry").cols.length === 0, "an empty or missing page parses to nothing");
  ok(JSON.stringify(F.is.head) === '{"price":1167.7,"cur":"INR","minor":null,"exch":"NSE"}' && JSON.stringify(A.head) === '{"price":333.69,"cur":"USD","minor":null,"exch":"NASDAQ"}' && JSON.stringify(S.head) === '{"price":3596.5,"cur":"GBP","minor":"GBX","exch":"LON"}', "the quote above each statement is read: " + JSON.stringify([F.is.head, A.head, S.head]));
  ok(T.is.head.price === null && T.is.head.cur === null, "Tavily's copy carries no quote line");

  /* 2. company pages */
  const co = k => m.saParseCompany(fc(k).markdown);
  const cr = co("nse/RELIANCE/company"), ca = co("stocks/aapl/company"), cs = co("lon/SHEL/company"), ch = co("nse/HDFCBANK/company");
  ok(cr.name === "Reliance Industries Limited" && cr.country === "India" && cr.industry === "Oil & Gas Refining & Marketing" && cr.sector === "Energy" && cr.employees === 419911 && cr.website === "https://www.ril.com/" && cr.repCur === "INR", "Reliance company page: " + JSON.stringify({ ...cr, summary: "" }));
  ok(cr.summary.startsWith("Reliance Industries Limited engages in") && cr.summary.endsWith("is based in Mumbai, India.") && cr.summary.length > 800, "Reliance description, without the repeated name: …" + cr.summary.slice(-60));
  ok(ca.name === "Apple Inc." && ca.country === "United States" && ca.industry === "Consumer Electronics" && ca.sector === "Technology" && ca.repCur === "USD" && ca.employees === 166000 && /^https:\/\/www\.apple\.com/.test(ca.website), "Apple company page");
  ok(ca.summary.startsWith("Apple Inc. designs") && !/Apple Inc\.$/.test(ca.summary) && ca.summary.length > 400, "Apple description: …" + ca.summary.slice(-50));
  ok(cs.country === "United Kingdom" && cs.industry === "Oil & Gas Integrated" && cs.repCur === "USD", "Shell company page");
  ok(ch.industry === "Banks—Regional" && ch.sector === "Financial Services" && m.LV_FIN_RE.test(ch.industry), "HDFC Bank is recognised as a bank: " + ch.industry + " / " + ch.sector);

  /* 3. price feeds */
  const chart = m.fcParseChart(m.fcParseJson(fc("chart/RELIANCE.NS").rawHtml)), yh = m.lvParseHistory(m.lvUnwrap({ content: [{ type: "text", text: calls.find(x => x.tool === "yfinance_get_price_history" && x.input.symbol === "RELIANCE.NS").text }] }));
  ok(chart.points.length === 61 && chart.points[0].date === "2021-11-01" && chart.meta.currency === "INR" && chart.meta.regularMarketPrice === 1167.7, "chart: " + chart.points.length + " points from " + chart.points[0].date);
  const byM = Object.fromEntries(chart.points.map(p => [p.date.slice(0, 7), p.close]));
  const worst = Math.max(...yh.map(p => Math.abs(byM[p.date.slice(0, 7)] / p.close - 1)));
  ok(yh.length === 60 && worst < 0.0005, `chart closes equal the Yahoo Finance server's (adjusted) closes, worst gap ${(worst * 100).toFixed(4)}%`);
  const b1 = m.lvRegress(chart.points, m.fcParseChart(m.fcParseJson(fc("chart/%5ENSEI").rawHtml)).points);
  const b2 = m.lvRegress(yh, m.lvParseHistory(m.lvUnwrap({ content: [{ type: "text", text: calls.find(x => x.tool === "yfinance_get_price_history" && x.input.symbol === "^NSEI").text }] })));
  ok(b1 && b2 && Math.abs(b1.raw - b2.raw) < 0.0006 && b1.n === b2.n, `beta agrees across routes: ${b1.raw} vs ${b2.raw} (${b1.n} months)`);
  const sh = m.fcParseChart(m.fcParseJson(fc("chart/SHEL.L").rawHtml));
  ok(sh.meta.currency === "GBp" && m.lvMajor(sh.meta.currency)[1] === 100 && sh.points[0].date === "2021-11-01", "Shell quotes in pence; London dates land on the 1st: " + sh.points[0].date);
  const fx = m.fcParseChart(m.fcParseJson(fc("USDINR%3DX").rawHtml)); ok(fx.points.length >= 3 && fx.points[fx.points.length - 1].close > 60, "USD/INR rate " + fx.points[fx.points.length - 1].close);
  ok(m.fcParseChart({ chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } }).error === "No data found, symbol may be delisted", "an unknown symbol's chart reports its error");
  ok(m.fcParseJson('<html><head></head><body><pre style="x">{"a":"1 &amp; 2","b":[1,2]}</pre></body></html>').a === "1 & 2" && m.fcParseJson("nope") === null && m.fcParseJson('{"a":NaN}').a === null, "JSON feeds parse from plain text or a browser wrapper");

  /* 4. Yahoo fundamentals feed → the cross-check's shape */
  const ts = m.fcParseTimeseries(m.fcParseJson(fc("timeseries/RELIANCE.NS").rawHtml));
  ok(ts.currency === "INR" && ts.income_statement["Total Revenue"]["2026-03-31"] === 1.057219e13 && ts.balance_sheet["Total Assets"]["2023-03-31"] === 1.607431e13 && ts.cash_flow["Operating Cash Flow"]["2025-03-31"] === 1.78703e12 && Object.keys(ts.balance_sheet).length === 3, "timeseries → statements shape");
  ok(m.fcParseTimeseries({ timeseries: { result: [] } }) === null && m.fcParseTimeseries(null) === null, "empty fundamentals → nothing to compare");
  const asm = m.lvAssemble(F), cross = m.lvCross(asm.R, asm.master, ts, 1, 1);
  ok(cross.length === 6 && cross.filter(x => x.ok).length === 5 && cross.find(x => x.l === "Total debt").ok === false && cross.every(x => x.n === 4), "cross-check from the feed: " + cross.map(x => `${x.l} ${(x.d * 100).toFixed(1)}%`).join("; "));
  ok(m.lvChecks(asm.R, asm.master)[0].ok, "Firecrawl statements add up");

  /* 5. web search and PDF reading */
  const web = m.fcParseWeb(fc("annual report 2025-26"));
  ok(web.length === 6 && web[0].url.endsWith(".pdf") && web[0].title.startsWith("Integrated Annual Report") && web[1].snippet.length > 20, "web search rows: " + web[0].title);
  const { m: mw } = load(calls, { route: "cloud" });
  const doc = await mw.lvWebExtract("https://www.irs.gov/pub/irs-pdf/fw9.pdf");
  ok(doc.via === "cloud" && doc.pdf && doc.pages && doc.pages.length === 2 && doc.got === 2 && doc.total === 6 && !/<u>Page<\/u>/.test(doc.pages[1].slice(0, 40)), `PDF comes back as pages with the cap noted: ${doc.pages && doc.pages.length} pages, ${doc.got} of ${doc.total}`);
  const hits = await mw.lvWebSearch({ query: "Reliance Industries annual report 2025-26 pdf", max: 6 });
  ok(hits.length === 6 && mw.FC.used === 4, "search through the route; credits counted: " + mw.FC.used);

  /* 6. routes */
  const R = (st, down) => { Object.keys(m.LV_DOWN).forEach(k => delete m.LV_DOWN[k]); Object.assign(m.LV_DOWN, down || {}); return m.lvRoutes(st); };
  ok(JSON.stringify(R({ mcp: true, yf: true, tv: true, sec: true, fc: true })) === '{"quotes":"home","web":"home","sec":true}', "home servers win when listed");
  ok(JSON.stringify(R({ mcp: true, yf: false, tv: false, sec: false, fc: true })) === '{"quotes":"cloud","web":"cloud","sec":false}', "Firecrawl when the home servers aren't listed");
  ok(JSON.stringify(R({ mcp: true, yf: false, tv: false, sec: false, fc: false })) === '{"quotes":null,"web":null,"sec":false}', "nothing listed → no route");
  ok(JSON.stringify(R({ mcp: false })) === '{"quotes":null,"web":null,"sec":false}' && JSON.stringify(R(null)) === '{"quotes":null,"web":null,"sec":false}', "no connector access → no route");
  ok(R({ mcp: true, yf: true, tv: false, sec: true, fc: true }).web === "cloud" && R({ mcp: true, yf: true, tv: false, sec: true, fc: false }).web === null, "mixed: statements through Firecrawl when only Tavily is missing");
  ok(R({ mcp: true, yf: null, tv: null, sec: null, fc: null }).quotes === "home" && R({ mcp: true, yf: null, tv: null, sec: null, fc: null }, { "host:yfmcp": Infinity }).quotes === "cloud", "unknown listing: home is tried, then Firecrawl once home is marked down");
  ok(R({ mcp: true, yf: true, tv: true, sec: true, fc: true }, { "host:yfmcp": Date.now() - 5 }).quotes === "home", "a timed-out server is tried again after its pause");
  R({ mcp: true });

  /* 7. failover: the home server is listed (or the listing failed) but doesn't answer */
  { const seen = []; const { m: f } = load(calls, { route: "cloud", mcp: base => ({ listTools: async () => { throw { code: "upstream_error" }; },
      callTool: async (server, tool, input) => { seen.push(server); if (server.startsWith("host:")) throw { code: "server_not_connected", message: "no host bridge", server }; return base.callTool(server, tool, input); } }) });
    const r1 = await f.lvSearch("reliance");
    ok(r1.length >= 5 && r1[0].symbol === "RELIANCE.NS" && seen.join(",") === "host:yfmcp,Firecrawl", "search fails over to Firecrawl: " + seen.join(","));
    const r2 = await f.lvSearch("reliance"); ok(seen.filter(s => s === "host:yfmcp").length === 1 && r2.length === r1.length, "the unreachable home server isn't asked again");
    const out = await f.lvLoad("RELIANCE.NS", {});
    ok(out.rec && out.rec.live.via === "cloud" && seen.filter(s => s.startsWith("host:")).length === 2, "a load fails over too, trying each home server at most once: " + seen.filter(s => s.startsWith("host:")).join(","));
    let msg = null; try { await f.lvScreen({ region: "in", sector: "Energy" }); } catch (e) { msg = f.lvMessage(e); } ok(/screener/.test(msg || ""), "industry browse explains it needs the home computer");
  }
  /* 7b. a plain search doesn't spend a credit on the viewer's behalf when the home server turns out to be out of reach */
  { const seen = []; const all = base => ({ listTools: async () => ({ servers: ["host:yfmcp", "host:tavily-mcp", "host:sec-edgar-mcp", "Firecrawl"].map(server => ({ server, authStatus: "unknown", tools: [{ name: "x" }] })) }),
      callTool: async (server, tool, input) => { seen.push(server); if (server.startsWith("host:")) throw { code: "server_not_connected", message: "no host bridge", server }; return base.callTool(server, tool, input); } });
    const { m: f } = load(calls, { route: "cloud", mcp: all });
    ok(f.lvRoutes(await f.lvStatus()).quotes === "home" && !f.LV_MOBILE, "on a computer, listed home servers are tried first");
    let e1 = null; try { await f.lvSearch("reliance", null, true); } catch (e) { e1 = e; }
    ok(e1 && e1.next === "cloud" && e1.code === "server_not_connected" && seen.join(",") === "host:yfmcp" && f.lvRoutes(await f.lvStatus()).quotes === "cloud", "a plain search stops at the unreachable home server and hands the choice back: " + seen.join(","));
    const r2 = await f.lvSearch("reliance", null, false); ok(r2.length >= 5 && seen.join(",") === "host:yfmcp,Firecrawl", "the wider search, once asked for, goes through Firecrawl");
    /* on a phone the home servers are never tried, listed or not */
    const seenP = []; const { m: ph } = load(calls, { route: "cloud", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", mcp: base => { const o = all(base); return { listTools: o.listTools, callTool: async (sv, tool, input) => { seenP.push(sv); return o.callTool(sv, tool, input); } }; } });
    const stP = await ph.lvStatus(), rtP = ph.lvRoutes(stP);
    ok(ph.LV_MOBILE && stP.yf === false && stP.tv === false && stP.sec === false && stP.fc === true && rtP.quotes === "cloud" && rtP.web === "cloud" && rtP.sec === false, "on a phone the home servers are skipped even when listed");
    const out = await ph.lvLoad("RELIANCE.NS", { hint: { symbol: "RELIANCE.NS", name: "Reliance Industries Limited" } });
    ok(out.rec && out.rec.live.via === "cloud" && seenP.length > 0 && seenP.every(sv => sv === "Firecrawl"), "a load on a phone calls Firecrawl only: " + [...new Set(seenP)].join(","));
    const { m: ph2 } = load(calls, { route: "cloud", ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile Safari/537.36", mcp: () => ({ listTools: async () => { throw { code: "upstream_error" }; }, callTool: async () => { throw { code: "server_unavailable" }; } }) });
    const st2 = await ph2.lvStatus(); ok(st2.yf === false && st2.fc === null && ph2.lvRoutes(st2).quotes === "cloud", "a phone whose listing failed still goes straight to Firecrawl");
  }
  { const { m: f } = load(calls, { route: "none" }); let e1 = null; try { await f.lvSearch("reliance"); } catch (e) { e1 = e; }
    ok(e1 && e1.code === "no_live" && /isn't reachable from this device/.test(f.lvMessage(e1)) && /Firecrawl/.test(f.lvMessage(e1)), "no route: a clear message, not a server error");
    let e2 = null; try { await f.lvLoad("ITC.NS", {}); } catch (e) { e2 = e; } ok(e2 && e2.code === "no_live", "no route: loading says so");
    const v = await f.lvLoad("SUPREMEIND.NS", {}); ok(v.verified === "SUPREMEIND", "a verified company needs no route"); }
  { const { m: f } = load(calls, { route: "cloud", pub: true }); const st = await f.lvStatus(); let e1 = null; try { await f.lvSearch("x"); } catch (e) { e1 = e; }
    ok(st.mcp === false && st.pub === true && e1.code === "no_live" && /public edition/.test(f.lvMessage(e1)), "the public edition never touches connectors"); }

  /* 8. pacing: no more than the per-minute allowance in any window */
  { const starts = []; const { m: g } = load([], { route: "cloud", pace: true, mcp: () => ({ listTools: async () => ({ servers: [{ server: "Firecrawl" }] }),
      callTool: async () => { starts.push(Date.now()); await new Promise(r => setTimeout(r, 15)); return { content: [{ type: "text", text: JSON.stringify({ markdown: "x", metadata: { creditsUsed: 1, statusCode: 200 } }) }] }; } }) });
    Object.assign(g.FC_LIMIT, { perMin: 3, par: 2, windowMs: 400, tick: 40 });
    const t0 = Date.now(); let waited = 0; const iv = setInterval(() => { waited = Math.max(waited, g.fcWait()); }, 20);
    await Promise.all([...Array(8)].map((_, i) => g.fcScrape("https://example.com/" + i))); clearInterval(iv);
    let worstN = 0; starts.forEach(t => { worstN = Math.max(worstN, starts.filter(u => u >= t && u < t + 390).length); });
    ok(starts.length === 8 && worstN <= 3 && Date.now() - t0 >= 780, `8 pages at 3 per window: at most ${worstN} started in any window, ${Date.now() - t0} ms in all`);
    ok(waited >= 1 && g.FC.used === 8 && g.FC.pages === 8, "a wait is reported while calls queue; credits add up: " + g.FC.used); }
  /* 9. Firecrawl's own rate limit and running out of credits */
  { let k = 0; const { m: g } = load([], { route: "cloud", mcp: () => ({ listTools: async () => ({ servers: [{ server: "Firecrawl" }] }),
      callTool: async () => { k++; if (k === 1) throw { code: "tool_error", message: "Tool 'firecrawl_scrape' execution failed: Rate limit exceeded. Consumed (req/min): 11, Remaining (req/min): 0. Upgrade your plan at https://firecrawl.dev/pricing for increased rate limits or please retry after 0s, resets at Sun Oct 04 2026" }; return { content: [{ type: "text", text: JSON.stringify({ markdown: "ok", metadata: { creditsUsed: 1 } }) }] }; } }) });
    g.FC_LIMIT.tick = 40; const t0 = Date.now(); const r = await g.fcScrape("https://example.com/a");
    ok(r.md === "ok" && k === 2 && Date.now() - t0 >= 1900, `a rate-limited page waits for the reset and is tried once more (${Date.now() - t0} ms)`); }
  { const { m: g } = load([], { route: "cloud", mcp: () => ({ listTools: async () => ({ servers: [{ server: "Firecrawl" }] }),
      callTool: async () => { throw { code: "tool_error", message: "failed", result: { content: [{ type: "text", text: "Rate limit exceeded. retry after 0s" }] } }; } }) });
    g.FC_LIMIT.tick = 40; let e1 = null; try { await g.fcScrape("https://example.com/a"); } catch (e) { e1 = e; }
    ok(e1 && e1.code === "busy" && /per-minute limit/.test(g.lvMessage(e1)), "still limited after the retry → a plain message (read from the tool's result text)"); }
  { const { m: g } = load([], { route: "cloud", mcp: () => ({ listTools: async () => ({ servers: [{ server: "Firecrawl" }] }), callTool: async () => { throw { code: "tool_error", message: "Payment Required: Insufficient credits to perform this request." }; } }) });
    let e1 = null; try { await g.lvSearch("x"); } catch (e) { e1 = e; }
    ok(e1 && e1.code === "out_of_credits" && /out of credits/.test(g.lvMessage(e1)) && g.LV_DOWN && true, "out of credits → its own message"); }
  { const errs = { server_not_connected: /isn't connected to your Claude account/, needs_reauth: /reconnected under Connectors/, not_in_manifest: /switched off for this page/, selection_required: /Choose which Firecrawl/, blocked_by_policy: /organisation's settings/, server_unavailable: /didn't answer/, upstream_error: /didn't answer/ };
    for (const [code, re] of Object.entries(errs)) { const t = m.lvMessage({ code, server: "Firecrawl" }); ok(re.test(t) && !/undefined|null/.test(t), `Firecrawl ${code}: ${t.slice(0, 70)}`); }
    const h = m.lvMessage({ code: "server_not_connected", server: "host:yfmcp" }); ok(/The Yahoo Finance server isn't reachable from this device/.test(h) && /Firecrawl connector/.test(h) && /still work/.test(h), "home server unreachable: says what to do"); }

  /* 10. loading through Firecrawl, end to end */
  { const { m: c, counts, misses } = load(calls, { route: "cloud" }), { m: h } = load(calls, { route: "home" });
    const rc = (await c.lvLoad("RELIANCE.NS", {})).rec, rh = (await h.lvLoad("RELIANCE.NS", {})).rec;
    const same = c.SUITE_FIELDS.filter(k => JSON.stringify(rc[k]) === JSON.stringify(rh[k])), diff = c.SUITE_FIELDS.filter(k => !same.includes(k));
    ok(same.length === c.SUITE_FIELDS.length - 3 && diff.join(",") === "cash,ltd,debt", `Reliance: ${same.length} of ${c.SUITE_FIELDS.length} statement lines identical across routes; the rest are the page's newer balance sheet (${diff.join(", ")})`);
    ok(rc.price === rh.price && rc.shares === rh.shares && rc.mcap === rh.mcap && rc.wkLo === rh.wkLo && rc.wkHi === rh.wkHi && rc.dps === rh.dps && JSON.stringify(rc.beta) === JSON.stringify(rh.beta) && JSON.stringify(rc.yl) === JSON.stringify(rh.yl), "price, shares, market value, range, dividend, beta and year labels identical");
    ok(rc.live.via === "cloud" && rh.live.via === "home" && rc.live.stmtCur === "INR" && rc.live.country === "IN" && rc.live.profile.industry === rh.live.profile.industry && rc.live.profile.employees === rh.live.profile.employees && rc.live.profile.summary.slice(0, 300) === rh.live.profile.summary.slice(0, 300), "profile agrees across routes");
    ok(rc.live.cross && rc.live.cross.length === 6 && rc.live.checks[0].ok && counts.Firecrawl === 7 && c.FC.used === 7 && !misses.length, `7 pages for a first company (statements 3, price, profile, cross-check, index): ${counts.Firecrawl}`);
    const before = counts.Firecrawl; const ap = (await c.lvLoad("AAPL", {})).rec;
    ok(ap.live.stmtCur === "USD" && ap.live.cur === "USD" && ap.live.fxSI > 60 && ap.live.ye === "Sep" && ap.yl.join() === "FY2021,FY2022,FY2023,FY2024,FY2025" && Math.abs(ap.rev[4] - 416161 * ap.live.fxSI) < 1 && Math.abs(ap.mcap - ap.price * ap.shares * ap.live.fxTI) < 1 && ap.live.country === "US" && ap.live.idx === "S&P 500" && ap.beta && ap.live.checks[0].ok, "Apple: dollars translated, September year-end, S&P 500 beta " + (ap.beta && ap.beta.adj));
    ok(counts.Firecrawl - before === 8, "Apple took 8 pages (statements 3, price, profile, cross-check, S&P 500, USD/INR): " + (counts.Firecrawl - before));
    const b2 = counts.Firecrawl; const shl = (await c.lvLoad("SHEL.L", {})).rec;
    ok(shl.live.cur === "GBP" && shl.live.curRaw === "GBp" && Math.abs(shl.price - 35.965) < 1e-9 && shl.live.stmtCur === "USD" && shl.live.fxTI > shl.live.fxSI && shl.live.country === "GB" && shl.live.cross.every(x => x.ok) && shl.live.warns.length === 0, "Shell: pence → pounds, dollar statements, cross-check clean");
    ok(counts.Firecrawl - b2 === 8, "Shell: USD/INR was kept from Apple's load, so 8 pages not 9: " + (counts.Firecrawl - b2));
    const b3 = counts.Firecrawl; const again = (await c.lvLoad("AAPL", {})).rec;
    ok(counts.Firecrawl - b3 === 5 && again.rev[4] === ap.rev[4], "loading it again within ten minutes reuses the price history, the index and the rate: 5 pages, " + (counts.Firecrawl - b3));
    const b4 = counts.Firecrawl; const bank = await c.lvLoad("HDFCBANK.NS", { hint: { name: "HDFC Bank Limited", industry: "Banks—Regional", sector: "Financial Services", exch: "NSE" } });
    ok(bank.profile && bank.profile.finLike && bank.profile.via === "cloud" && /different set of accounts/.test(bank.profile.reason) && bank.profile.key.rev && bank.profile.key.rev.length === 4 && bank.profile.key.cur === "INR" && bank.profile.beta && bank.steps.st.s === "skip", "a bank picked from search loads as a profile with Yahoo's key figures");
    ok(counts.Firecrawl - b4 === 3, "…in 3 pages: no statements are fetched for a bank: " + (counts.Firecrawl - b4));
    ok(JSON.stringify(c.lvKv.get("px:^NSEI|5y|1mo", 1e9)).length > 500 && c.lvKv.get("px:USDINR=X|5d|1d", 1e9).length >= 3 && c.lvKv.get("px:RELIANCE.NS|5y|1mo", 1e9) === null, "index histories and exchange rates are kept between visits; share prices aren't"); }
  { const { m: c, counts, misses } = load(calls, { route: "cloud" }); let e1 = null; try { await c.lvLoad("NOSUCH.NS", {}); } catch (e) { e1 = e; }
    ok(e1 && counts.Firecrawl === 4 && !misses.some(x => /firecrawl_search|NSEI/.test(x)) && !/undefined/.test(c.lvMessage(e1)), `when pages can't be fetched the load ends with the connector's message; no web search or index page is spent on it (${counts.Firecrawl} pages): ${c.lvMessage(e1).slice(0, 80)}`); }
  { let pages = 0; const { m: c } = load(calls, { route: "cloud", mcp: base => ({ listTools: base.listTools, callTool: async (sv, tool, input) => ++pages && /chart\/BADSYM/.test(input.url || "")
      ? { content: [{ type: "text", text: JSON.stringify({ rawHtml: JSON.stringify({ chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } }), metadata: { statusCode: 404, creditsUsed: 1 } }) }] } : base.callTool(sv, tool, input) }) });
    let e1 = null; const seen = []; try { await c.lvLoad("BADSYM.NS", { onStep: s => seen.push(s.info.s) }); } catch (e) { e1 = e; }
    ok(e1 && e1.code === "not_found" && /has no quote for BADSYM\.NS/.test(c.lvMessage(e1)) && seen.includes("fail") && pages === 1, `a hand-typed symbol Yahoo doesn't know costs one page, not six (${pages}): ` + c.lvMessage(e1).slice(0, 60)); }
  /* Yahoo's feeds not answering at all: an Indian company still loads from the statements site alone */
  { const down = base => ({ listTools: base.listTools, callTool: async (sv, tool, input) => /finance\.yahoo\.com/.test(input.url || "")
      ? { content: [{ type: "text", text: JSON.stringify({ rawHtml: "Too Many Requests", metadata: { statusCode: 429, creditsUsed: 1 } }) }] } : base.callTool(sv, tool, input) });
    for (const hint of [{ name: "Reliance Industries Limited", industry: "Oil & Gas Refining & Marketing", exch: "NSE" }, undefined]) {
      const { m: c } = load(calls, { route: "cloud", mcp: down }); const st = []; const r = await c.lvLoad("RELIANCE.NS", { hint, onStep: s => st.push(s) });
      ok(r.rec && r.rec.price === 1167.7 && r.rec.live.cur === "INR" && r.rec.rev[4] === 10572190 && r.rec.shares === 13531 && r.rec.beta === null && r.rec.live.cross === null && r.rec.wkLo === null
        && r.rec.live.warns.some(w => /price feed didn't answer/.test(w)) && r.rec.live.profile.industry === "Oil & Gas Refining & Marketing" && r.rec.name === "Reliance Industries Limited" && r.rec.live.exch === "NSE",
        `with Yahoo's feeds down (${hint ? "picked from results" : "typed by hand"}) the company still loads, price from the statements page, and says what's missing`);
      ok(r.steps.info.s === "ok" && r.steps.st.s === "ok" && r.steps.beta.s === "warn" && r.steps.xc.s === "warn", "the steps show what was skipped: " + JSON.stringify(Object.fromEntries(Object.entries(r.steps).map(([k, v]) => [k, v.s])))); }
    const { m: c } = load(calls, { route: "cloud", mcp: down }); let e1 = null; try { await c.lvLoad("SHEL.L", {}); } catch (e) { e1 = e; }
    ok(e1 && e1.code === "fx" && /No exchange rate was found for USD to INR/.test(c.lvMessage(e1)), "a foreign company can't be translated without the rate feed, and says so: " + (e1 && c.lvMessage(e1)));
    let e2 = null; try { await c.lvSearch("reliance"); } catch (e) { e2 = e; } ok(e2 && /429/.test(c.lvMessage(e2)), "the wider search reports the feed's answer: " + (e2 && c.lvMessage(e2))); }

  /* 11. the pre-loaded library and on-device search */
  { const { m: L, store } = load(calls, { route: "none", lib });
    const rec = t => lib.recs.find(r => r.ticker === t), nRec = lib.recs.length, nProf = lib.profiles.length;
    ok(nRec === 63 && nProf === 7 && lib.recs[0].ticker === "RELIANCE.NS", `the library holds the whole starter pack: ${nRec} companies and ${nProf} profiles`);
    ok(L.SUITE.cos.length === 47 + nRec && L.LV_LIB.n === nRec + nProf && L.SUITE.byId["L:RELIANCE.NS"].lib === true && L.SUITE.indOf["L:RELIANCE.NS"] === "live:pack-oil-gas" && L.SUITE.ind.find(g => g.id === "live:pack-us-tech").pack === true, "library companies sit in their starter-pack groups");
    ok(L.SUITE_R["L:AAPL"][4].roe > 50 && L.LV_ORDER.length === 0 && !store["vs:live2"], "…with ratios worked out, and nothing written to the viewer's own list");
    ok(L.lvHave("RELIANCE.NS").kind === "lib" && L.lvHave("HDFCBANK.NS").kind === "profile" && L.lvHave("TCS.BO").kind === "verified" && L.lvHave("ITC.NS").kind === "lib" && L.lvHave("NOTHERE.NS") === null, "lvHave");
    const names = q => L.lvLocalSearch(q).map(r => r.symbol + ":" + r.local).join(",");
    ok(names("reliance") === "RELIANCE.NS:lib" && names("AAPL") === "AAPL:lib" && names("hdfc") === "HDFCBANK.NS:profile" && names("tata steel") === "TATASTEEL.NS:verified" && names("zzzz") === "" && names("a") === "", "search by name and ticker: " + names("reliance") + " " + names("hdfc"));
    ok(L.lvLocalSearch("paints").length === 5 && L.lvLocalSearch("paints").every(r => r.industry === "Paints") && L.lvLocalSearch("asian paints")[0].symbol === "ASIANPAINT.NS", "an industry word lists that industry; a name match ranks above it");
    const top = q => (L.lvLocalSearch(q)[0] || {}).symbol;
    ok(top("google") === "GOOGL" && top("zomato") === "ETERNAL.NS" && top("dmart") === "DMART.NS" && top("tsmc") === "2330.TW" && top("paytm") === "PAYTM.NS" && top("shell") === "SHEL.L" && L.lvLocalSearch("apple")[0].industry === "Consumer Electronics" && top("qqqq") === undefined, "pack companies are found by their everyday names: " + [top("google"), top("zomato"), top("tsmc")].join());
    ok(top("sbi") === "SBIN.NS" && top("lic") === "LICI.NS" && L.lvLocalSearch("bank").filter(r => r.local === "profile").length >= 4, "bank and insurer profiles are found too: " + [top("sbi"), top("lic")].join());
    ok(lib.recs.every(r => r.short && r.short.length <= 22 && !/ (and|&|of|the)$/i.test(r.short)) && new Set(lib.recs.map(r => r.short)).size === nRec, "every pre-loaded company has a distinct short label that reads as a name");
    const mg = L.lvMergeSearch(L.lvLocalSearch("reliance"), [{ symbol: "RELIANCE.NS", name: "x" }, { symbol: "RPOWER.NS", name: "Reliance Power Limited", exch: "NSE", industry: "Utilities" }, { symbol: "TCS.NS", name: "TCS" }]);
    ok(mg.length === 3 && mg[0].local === "lib" && mg[1].symbol === "RPOWER.NS" && !mg[1].local && mg[2].local === "verified", "live results join the device's without duplicates, and are marked when already here");
    const P = L.lvPackStatus(); ok(P.total === 70 && P.have === 70 && P.missing.length === 0 && P.groups.every(g => g.cos.every(x => x.have && x.id)) && P.profs.every(x => x.have === "profile"), `starter pack: ${P.have} of ${P.total} on the device`);
    ok(new Set(L.LV_PACK.flatMap(g => g.cos.map(c => c[0])).concat(L.LV_PACK_PROFILES.map(c => c[0]))).size === 70 && L.LV_PACK.every(g => /^live:pack-[a-z-]+$/.test(g.id)), "pack symbols are unique");
    /* the viewer refreshes a pre-loaded company, then removes their copy */
    const mine = JSON.parse(JSON.stringify(lib.recs[0])); mine.price = 1200; mine.live.fetchedAt = "2026-12-01T00:00:00.000Z";
    L.lvRegister(mine);
    ok(L.SUITE.byId["L:RELIANCE.NS"].price === 1200 && !L.SUITE.byId["L:RELIANCE.NS"].lib && L.LV_ORDER.join() === "L:RELIANCE.NS" && L.SUITE.indOf["L:RELIANCE.NS"] === "live:pack-oil-gas" && L.lvHave("RELIANCE.NS").kind === "loaded" && JSON.parse(store["vs:live2"]).cos.length === 1, "a refreshed copy replaces the pre-loaded one and stays in its pack group");
    L.lvRemove("L:RELIANCE.NS");
    ok(L.SUITE.byId["L:RELIANCE.NS"].price === 1167.7 && L.SUITE.byId["L:RELIANCE.NS"].lib && L.LV_ORDER.length === 0 && L.LV_REMOVED["L:RELIANCE.NS"] && L.SUITE.ind.find(g => g.id === "live:pack-oil-gas").cos.length === 5 && L.SUITE.ind.find(g => g.id === "live:pack-oil-gas").cos.includes("L:RELIANCE.NS"), "removing it falls back to the pre-loaded copy and leaves a removal mark");
    L.lvRemove("L:RELIANCE.NS"); ok(L.SUITE.byId["L:RELIANCE.NS"], "a pre-loaded company itself can't be removed");
    /* restore: an older personal copy than the page's is dropped; a newer one wins */
    const older = JSON.parse(JSON.stringify(rec("AAPL"))); older.price = 1; older.live.fetchedAt = "2026-09-01T00:00:00.000Z";
    const newer = JSON.parse(JSON.stringify(rec("SHEL.L"))); newer.price = 40; newer.live.fetchedAt = "2026-11-01T00:00:00.000Z";
    const other = JSON.parse(JSON.stringify(rec("ITC.NS"))); other.industry = "live:tobacco"; other.price = 777; other.live = { ...other.live, group: "Tobacco", fetchedAt: "2026-11-02T00:00:00.000Z" };
    const seed = { "vs:live2": JSON.stringify({ v: 2, cos: [older, newer, other], extras: {}, profiles: { "HDFCBANK.NS": { ...lib.profiles[0], price: 9 } }, groups: {}, gone: {} }) };
    const { m: L2 } = load(calls, { route: "none", lib, store: seed });
    ok(L2.SUITE.byId["L:AAPL"].price === 333.69 && L2.SUITE.byId["L:AAPL"].lib && L2.SUITE.byId["L:SHEL.L"].price === 40 && !L2.SUITE.byId["L:SHEL.L"].lib && L2.LV_ORDER.join() === "L:SHEL.L,L:ITC.NS", "on restore the newer copy of each company wins: " + L2.LV_ORDER.join());
    ok(L2.SUITE.byId["L:ITC.NS"].price === 777 && L2.SUITE.indOf["L:ITC.NS"] === "live:pack-consumer" && L2.SUITE.ind.find(g => g.id === "live:pack-consumer").name === "Consumer & retail" && !L2.SUITE.ind.find(g => g.id === "live:tobacco"), "a pack company loaded by an earlier version moves into its pack group");
    ok(L2.lvProfile("HDFCBANK.NS").price === 9 && L2.lvProfiles().length === nProf, "the viewer's own profile shadows the pre-loaded one");
    /* a plain live company (not in the pack) keeps Yahoo's industry as its group, and removal cleans up */
    const z = JSON.parse(JSON.stringify(lib.recs[0])); Object.assign(z, { id: "L:ZZZ.NS", ticker: "ZZZ.NS", name: "Zed Works Limited", short: "Zed Works", industry: "live:widgets" }); z.live = { ...z.live, group: "Widgets" };
    L2.lvRegister(z); ok(L2.SUITE.indOf["L:ZZZ.NS"] === "live:widgets" && !L2.SUITE.ind.find(g => g.id === "live:widgets").pack, "other live companies keep their own industry list");
    L2.lvRemove("L:ZZZ.NS"); ok(!L2.SUITE.byId["L:ZZZ.NS"] && !L2.SUITE.ind.find(g => g.id === "live:widgets") && L2.LV_REMOVED["L:ZZZ.NS"], "removal drops the company and its empty list"); }

  console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} cloud-route checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
