/* ═══════════════════════════════════════════════════════════════════════
   LIVE COMPANIES — data layer.
   Any listed company, fetched on demand through the page's `mcp` capability.
   Two routes reach the same sources:
   · home  — MCP servers on the owner's own computer (host servers, Claude
     desktop app only): Yahoo Finance (yfmcp) for search, screening, profile,
     price, history and a cross-check; Tavily for the standardised statements
     on stockanalysis.com (S&P Global Market Intelligence data) and for
     documents; SEC EDGAR for US filings.
   · cloud — the Firecrawl connector on the viewer's Claude account, which
     works in any browser or on a phone: the same stockanalysis.com pages and
     Yahoo Finance's public price, search and fundamentals feeds.
   The home route is used when it answers; otherwise the cloud route; with
   neither, the page works from the companies it already holds.
   Live companies join the comparison workspaces in ₹ million (translated at
   the day's rate, so growth and ratios are unchanged); the DCF keeps each
   company's own trading currency. Records are kept in this browser and, when
   the viewer allows it, in their private part of the artifact's data store.
   ═══════════════════════════════════════════════════════════════════════ */
const LV_PUBLIC = typeof VS_PUBLIC !== "undefined" && VS_PUBLIC === true;      // the public edition never touches connectors
const LV_LIB_RAW = typeof VS_LIBRARY !== "undefined" && VS_LIBRARY ? VS_LIBRARY : null;
const LV = { yf: "host:yfmcp", tv: "host:tavily-mcp", sec: "host:sec-edgar-mcp", fc: "Firecrawl" };
const LV_SERVER_NAMES = { [LV.yf]: "Yahoo Finance", [LV.tv]: "Tavily", [LV.sec]: "SEC EDGAR", [LV.fc]: "Firecrawl" };
const lvIsHost = s => String(s || "").startsWith("host:");

/* Exchanges: Yahoo suffix → stockanalysis.com path, benchmark index for beta, Yahoo screener region. */
const LV_COUNTRIES = [
  { c: "IN", n: "India", r: "in", sfx: { ".NS": "nse", ".BO": "bom" }, pref: ".NS", idx: "^NSEI", ix: "Nifty 50", ex: ["NSI"] },
  { c: "US", n: "United States", r: "us", sfx: { "": "stocks" }, pref: "", idx: "^GSPC", ix: "S&P 500", ex: ["NMS", "NYQ", "NGM", "NCM", "ASE"] },
  { c: "GB", n: "United Kingdom", r: "gb", sfx: { ".L": "lon" }, pref: ".L", idx: "^FTSE", ix: "FTSE 100" },
  { c: "DE", n: "Germany", r: "de", sfx: { ".DE": "etr", ".F": "fra" }, pref: ".DE", idx: "^GDAXI", ix: "DAX" },
  { c: "FR", n: "France", r: "fr", sfx: { ".PA": "epa" }, pref: ".PA", idx: "^FCHI", ix: "CAC 40" },
  { c: "NL", n: "Netherlands", r: "nl", sfx: { ".AS": "ams" }, pref: ".AS", idx: "^AEX", ix: "AEX" },
  { c: "IT", n: "Italy", r: "it", sfx: { ".MI": "bit" }, pref: ".MI", idx: "FTSEMIB.MI", ix: "FTSE MIB" },
  { c: "ES", n: "Spain", r: "es", sfx: { ".MC": "bme" }, pref: ".MC", idx: "^IBEX", ix: "IBEX 35" },
  { c: "CH", n: "Switzerland", r: "ch", sfx: { ".SW": "swx" }, pref: ".SW", idx: "^SSMI", ix: "SMI" },
  { c: "SE", n: "Sweden", r: "se", sfx: { ".ST": "sto" }, pref: ".ST", idx: "^OMX", ix: "OMX Stockholm 30" },
  { c: "NO", n: "Norway", r: "no", sfx: { ".OL": "osl" }, pref: ".OL", idx: "OSEBX.OL", ix: "Oslo Børs benchmark" },
  { c: "DK", n: "Denmark", r: "dk", sfx: { ".CO": "cph" }, pref: ".CO", idx: "^OMXC25", ix: "OMX Copenhagen 25" },
  { c: "FI", n: "Finland", r: "fi", sfx: { ".HE": "hel" }, pref: ".HE", idx: "^OMXH25", ix: "OMX Helsinki 25" },
  { c: "BE", n: "Belgium", r: "be", sfx: { ".BR": "ebr" }, pref: ".BR", idx: "^BFX", ix: "BEL 20" },
  { c: "AT", n: "Austria", r: "at", sfx: { ".VI": "vie" }, pref: ".VI", idx: "^ATX", ix: "ATX" },
  { c: "IE", n: "Ireland", r: "ie", sfx: { ".IR": "ise" }, pref: ".IR", idx: "^ISEQ", ix: "ISEQ" },
  { c: "PT", n: "Portugal", r: "pt", sfx: { ".LS": "ela" }, pref: ".LS", idx: "PSI20.LS", ix: "PSI" },
  { c: "PL", n: "Poland", r: "pl", sfx: { ".WA": "wse" }, pref: ".WA", idx: "WIG20.WA", ix: "WIG20" },
  { c: "TR", n: "Turkey", r: "tr", sfx: { ".IS": "ist" }, pref: ".IS", idx: "XU100.IS", ix: "BIST 100" },
  { c: "JP", n: "Japan", r: "jp", sfx: { ".T": "tyo" }, pref: ".T", idx: "^N225", ix: "Nikkei 225" },
  { c: "CN", n: "China (mainland)", r: "cn", sfx: { ".SS": "sha", ".SZ": "she" }, pref: ".SS", idx: "000001.SS", ix: "SSE Composite" },
  { c: "HK", n: "Hong Kong", r: "hk", sfx: { ".HK": "hkg" }, pref: ".HK", idx: "^HSI", ix: "Hang Seng" },
  { c: "KR", n: "South Korea", r: "kr", sfx: { ".KS": "krx", ".KQ": "kosdaq" }, pref: ".KS", idx: "^KS11", ix: "KOSPI" },
  { c: "TW", n: "Taiwan", r: "tw", sfx: { ".TW": "tpe", ".TWO": "tpex" }, pref: ".TW", idx: "^TWII", ix: "TAIEX" },
  { c: "SG", n: "Singapore", r: "sg", sfx: { ".SI": "sgx" }, pref: ".SI", idx: "^STI", ix: "Straits Times" },
  { c: "MY", n: "Malaysia", r: "my", sfx: { ".KL": "klse" }, pref: ".KL", idx: "^KLSE", ix: "FBM KLCI" },
  { c: "TH", n: "Thailand", r: "th", sfx: { ".BK": "bkk" }, pref: ".BK", idx: "^SET.BK", ix: "SET" },
  { c: "ID", n: "Indonesia", r: "id", sfx: { ".JK": "idx" }, pref: ".JK", idx: "^JKSE", ix: "Jakarta Composite" },
  { c: "PH", n: "Philippines", r: "ph", sfx: { ".PS": "pse" }, pref: ".PS", idx: "PSEI.PS", ix: "PSEi" },
  { c: "AU", n: "Australia", r: "au", sfx: { ".AX": "asx" }, pref: ".AX", idx: "^AXJO", ix: "S&P/ASX 200" },
  { c: "NZ", n: "New Zealand", r: "nz", sfx: { ".NZ": "nzx" }, pref: ".NZ", idx: "^NZ50", ix: "NZX 50" },
  { c: "CA", n: "Canada", r: "ca", sfx: { ".TO": "tsx", ".V": "tsxv" }, pref: ".TO", idx: "^GSPTSE", ix: "S&P/TSX Composite" },
  { c: "BR", n: "Brazil", r: "br", sfx: { ".SA": "bvmf" }, pref: ".SA", idx: "^BVSP", ix: "Bovespa" },
  { c: "MX", n: "Mexico", r: "mx", sfx: { ".MX": "bmv" }, pref: ".MX", idx: "^MXX", ix: "IPC" },
  { c: "ZA", n: "South Africa", r: "za", sfx: { ".JO": "jse" }, pref: ".JO", idx: null },
  { c: "SA", n: "Saudi Arabia", r: "sa", sfx: { ".SR": "tadawul" }, pref: ".SR", idx: "^TASI.SR", ix: "TASI" },
  { c: "AE", n: "United Arab Emirates", r: "ae", sfx: { ".AE": "dfm" }, pref: ".AE", idx: null },
  { c: "IL", n: "Israel", r: "il", sfx: { ".TA": "tlv" }, pref: ".TA", idx: "^TA125.TA", ix: "TA-125" },
];
const LV_SFX = LV_COUNTRIES.flatMap(C => Object.keys(C.sfx).filter(Boolean).map(s => [s, C])).sort((a, b) => b[0].length - a[0].length);
function lvSplit(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  for (const [sfx, C] of LV_SFX) if (s.endsWith(sfx) && s.length > sfx.length) return { base: s.slice(0, -sfx.length), sfx, C };
  if (/\.[A-Z]{1,3}$/.test(s)) return { base: s.replace(/\.[A-Z]{1,3}$/, ""), sfx: s.match(/\.[A-Z]{1,3}$/)[0], C: null };
  return { base: s, sfx: "", C: LV_COUNTRIES[1] };
}
const lvCountry = code => LV_COUNTRIES.find(C => C.c === code) || null;
const lvCountryByName = name => LV_COUNTRIES.find(C => C.n.toLowerCase() === String(name || "").toLowerCase()) ||
  (/united states|usa/i.test(name || "") ? lvCountry("US") : /china/i.test(name || "") ? lvCountry("CN") : /korea/i.test(name || "") ? lvCountry("KR") : null);

/* Yahoo's sectors and industries (screener names, exactly as Yahoo spells them). */
const LV_SECTORS = {
  "Basic Materials": ["Agricultural Inputs", "Aluminum", "Building Materials", "Chemicals", "Coking Coal", "Copper", "Gold", "Lumber & Wood Production", "Other Industrial Metals & Mining", "Other Precious Metals & Mining", "Paper & Paper Products", "Silver", "Specialty Chemicals", "Steel"],
  "Communication Services": ["Advertising Agencies", "Broadcasting", "Electronic Gaming & Multimedia", "Entertainment", "Internet Content & Information", "Publishing", "Telecom Services"],
  "Consumer Cyclical": ["Apparel Manufacturing", "Apparel Retail", "Auto & Truck Dealerships", "Auto Manufacturers", "Auto Parts", "Department Stores", "Footwear & Accessories", "Furnishings, Fixtures & Appliances", "Gambling", "Home Improvement Retail", "Internet Retail", "Leisure", "Lodging", "Luxury Goods", "Packaging & Containers", "Personal Services", "Recreational Vehicles", "Residential Construction", "Resorts & Casinos", "Restaurants", "Specialty Retail", "Textile Manufacturing", "Travel Services"],
  "Consumer Defensive": ["Beverages—Brewers", "Beverages—Non-Alcoholic", "Beverages—Wineries & Distilleries", "Confectioners", "Discount Stores", "Education & Training Services", "Farm Products", "Food Distribution", "Grocery Stores", "Household & Personal Products", "Packaged Foods", "Tobacco"],
  "Energy": ["Oil & Gas Drilling", "Oil & Gas E&P", "Oil & Gas Equipment & Services", "Oil & Gas Integrated", "Oil & Gas Midstream", "Oil & Gas Refining & Marketing", "Thermal Coal", "Uranium"],
  "Financial Services": ["Asset Management", "Banks—Diversified", "Banks—Regional", "Capital Markets", "Credit Services", "Financial Conglomerates", "Financial Data & Stock Exchanges", "Insurance Brokers", "Insurance—Diversified", "Insurance—Life", "Insurance—Property & Casualty", "Insurance—Reinsurance", "Insurance—Specialty", "Mortgage Finance", "Shell Companies"],
  "Healthcare": ["Biotechnology", "Diagnostics & Research", "Drug Manufacturers—General", "Drug Manufacturers—Specialty & Generic", "Health Information Services", "Healthcare Plans", "Medical Care Facilities", "Medical Devices", "Medical Distribution", "Medical Instruments & Supplies", "Pharmaceutical Retailers"],
  "Industrials": ["Aerospace & Defense", "Airlines", "Airports & Air Services", "Building Products & Equipment", "Business Equipment & Supplies", "Conglomerates", "Consulting Services", "Electrical Equipment & Parts", "Engineering & Construction", "Farm & Heavy Construction Machinery", "Industrial Distribution", "Infrastructure Operations", "Integrated Freight & Logistics", "Marine Shipping", "Metal Fabrication", "Pollution & Treatment Controls", "Railroads", "Rental & Leasing Services", "Security & Protection Services", "Specialty Business Services", "Specialty Industrial Machinery", "Staffing & Employment Services", "Tools & Accessories", "Trucking", "Waste Management"],
  "Real Estate": ["Real Estate—Development", "Real Estate—Diversified", "Real Estate Services", "REIT—Diversified", "REIT—Healthcare Facilities", "REIT—Hotel & Motel", "REIT—Industrial", "REIT—Mortgage", "REIT—Office", "REIT—Residential", "REIT—Retail", "REIT—Specialty"],
  "Technology": ["Communication Equipment", "Computer Hardware", "Consumer Electronics", "Electronic Components", "Electronics & Computer Distribution", "Information Technology Services", "Scientific & Technical Instruments", "Semiconductor Equipment & Materials", "Semiconductors", "Software—Application", "Software—Infrastructure", "Solar"],
  "Utilities": ["Utilities—Diversified", "Utilities—Independent Power Producers", "Utilities—Regulated Electric", "Utilities—Regulated Gas", "Utilities—Regulated Water", "Utilities—Renewable"],
};
/* Industries whose accounts don't fit the industrial-company toolkit (no current assets, no cost of sales). */
const LV_FIN_RE = /^(Banks|Insurance|Mortgage Finance|Credit Services|Capital Markets|Asset Management|Financial Conglomerates|Shell Companies|REIT)/;

/* Reporting currency from the flag stockanalysis.com puts above each statement table. */
const LV_FLAG_CUR = { united_states: "USD", india: "INR", japan: "JPY", china: "CNY", hong_kong: "HKD", europe: "EUR", euro: "EUR", eurozone: "EUR",
  germany: "EUR", france: "EUR", netherlands: "EUR", italy: "EUR", spain: "EUR", ireland: "EUR", belgium: "EUR", austria: "EUR", finland: "EUR",
  portugal: "EUR", greece: "EUR", luxembourg: "EUR", united_kingdom: "GBP", uk: "GBP", great_britain: "GBP", england: "GBP", switzerland: "CHF",
  sweden: "SEK", norway: "NOK", denmark: "DKK", poland: "PLN", turkey: "TRY", south_korea: "KRW", korea: "KRW", taiwan: "TWD", singapore: "SGD",
  malaysia: "MYR", thailand: "THB", indonesia: "IDR", philippines: "PHP", vietnam: "VND", australia: "AUD", new_zealand: "NZD", canada: "CAD",
  brazil: "BRL", mexico: "MXN", chile: "CLP", colombia: "COP", peru: "PEN", argentina: "ARS", south_africa: "ZAR", saudi_arabia: "SAR",
  united_arab_emirates: "AED", uae: "AED", qatar: "QAR", kuwait: "KWD", israel: "ILS", egypt: "EGP", nigeria: "NGN", kenya: "KES",
  pakistan: "PKR", bangladesh: "BDT", sri_lanka: "LKR", czech_republic: "CZK", hungary: "HUF", iceland: "ISK" };
/* Quote currencies in minor units (pence, cents, agorot). */
const LV_MINOR = { GBp: ["GBP", 100], GBX: ["GBP", 100], ZAc: ["ZAR", 100], ZAC: ["ZAR", 100], ILA: ["ILS", 100] };
const lvMajor = cur => LV_MINOR[cur] ? LV_MINOR[cur] : [String(cur || "").toUpperCase(), 1];

/* Eurozone markets the DCF has no defaults for: neighbour-based starting values, editable in the model. */
try {
  if (typeof MARKETS !== "undefined") {
    const eu = (name, exch, rf, erp, tax, gdp) => ({ name, cur: "EUR", exch, rf, erp, tax, std: "IFRS", fy: "1 Jan – 31 Dec", gdp, unit: "Mn", region: "Europe", filing: "Company IR and the national regulator", note: "" });
    if (!MARKETS.FI) MARKETS.FI = eu("Finland", "Nasdaq Helsinki", 2.8, 4.7, 20, 2.6);
    if (!MARKETS.BE) MARKETS.BE = eu("Belgium", "Euronext Brussels", 3.0, 5.0, 25, 2.8);
    if (!MARKETS.AT) MARKETS.AT = eu("Austria", "Wiener Börse", 2.9, 4.9, 23, 2.7);
    if (!MARKETS.IE) MARKETS.IE = eu("Ireland", "Euronext Dublin", 2.9, 4.9, 12.5, 3.5);
    if (!MARKETS.PT) MARKETS.PT = eu("Portugal", "Euronext Lisbon", 3.1, 5.5, 21, 3.0);
  }
} catch {}

/* ── MCP access ── */
let LV_MCP = null;
function lvMcp() {
  if (LV_PUBLIC) return Promise.resolve(null);
  if (!LV_MCP) LV_MCP = (async () => { try { return window.claude && window.claude.use ? await window.claude.use("mcp") : null; } catch { return null; } })();
  return LV_MCP;
}
const lvErr = (code, message, extra) => Object.assign({ lv: true, code, message }, extra || {});
/* Failures that end a batch at once: asking again can't succeed without the viewer doing something. */
const LV_HARD = ["no_mcp", "no_live", "server_not_connected", "server_not_found", "not_granted", "not_in_manifest", "cancelled", "capability_disabled", "capability_removed", "needs_reauth", "blocked_by_policy", "approval_required", "selection_required", "out_of_credits"];
/* Failures that mean "this server can't be used from here": the other route is tried instead. */
const LV_GONE = ["server_not_connected", "server_not_found", "not_in_manifest", "blocked_by_policy", "approval_required", "selection_required", "needs_reauth"];
const LV_ONDEVICE = "Companies already on this device still work.";
function lvMessage(e) {
  const c = e && e.code, srv = e && e.server, nm = LV_SERVER_NAMES[srv], host = lvIsHost(srv);
  const who = nm ? (host ? `the ${nm} server` : nm) : "the data source", Who = who[0].toUpperCase() + who.slice(1);
  if (c === "no_live") return LV_PUBLIC ? "Live search isn't part of this public edition. The companies built in work in every workspace."
    : `Live data isn't reachable from this device. ${LV_ONDEVICE} To search every listed company from here, add the Firecrawl connector under Connectors in Claude's settings, or open Valuation Studio in the Claude desktop app on your home computer.`;
  if (c === "no_mcp" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed")
    return `Live data isn't available in this view. ${LV_ONDEVICE}`;
  if (c === "server_not_connected" || c === "server_not_found") return host
    ? `${Who} isn't reachable from this device. It runs on your home computer and answers only in the Claude desktop app there, with that server switched on. To fetch live data anywhere, add the Firecrawl connector under Connectors in Claude's settings. ${LV_ONDEVICE}`
    : `${nm || "The connector"} isn't connected to your Claude account. Add it under Connectors in Claude's settings, then reload this page. ${LV_ONDEVICE}`;
  if (c === "not_in_manifest") return host ? `This page isn't allowed to use ${who} in this view.` : `${nm || "The connector"} is switched off for this page. Reload the page and choose Allow when Claude asks. ${LV_ONDEVICE}`;
  if (c === "cancelled") return "The request was cancelled.";
  if (c === "needs_reauth") return host ? `${Who} needs to be reconnected.` : `${nm || "The connector"} needs to be reconnected under Connectors in Claude's settings.`;
  if (c === "blocked_by_policy" || c === "approval_required") return `Your organisation's settings block ${who} here.`;
  if (c === "selection_required") return `Choose which ${nm || "data"} connection to use, then try again.`;
  if (c === "out_of_credits") return `Your Firecrawl account is out of credits, so live data can't be fetched from here. ${LV_ONDEVICE}`;
  if (c === "busy") return "Firecrawl's per-minute limit was reached. Wait a minute and try again.";
  if (c === "server_unavailable" || c === "upstream_error" || c === "rate_limited") return `${Who} didn't answer. Try again in a moment.`;
  if (c === "tool_error") return `${Who} reported a problem${e.message ? `: ${String(e.message).slice(0, 160)}` : "."}`;
  return e && e.message ? String(e.message).slice(0, 240) : "Something went wrong fetching live data.";
}
const lvSleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(lvErr("cancelled", "cancelled")); }, { once: true }); });

/* Which servers this view can reach. Listing never prompts the viewer. A server a call found unreachable is marked
   down for the rest of the visit (or briefly, for a timeout), so later calls go straight to the other route. */
let LV_STATUS = null;
const LV_DOWN = {};
/* The home servers answer only inside the Claude desktop app on the computer they run on. A phone or tablet can never be
   that, so there the page doesn't try them (no consent prompt for a server that can't answer, no failed first call). */
const LV_MOBILE = (() => { try { const n = navigator; return !!((n.userAgentData && n.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(n.userAgent || "")); } catch { return false; } })();
const lvUp = s => !(LV_DOWN[s] > Date.now());
function lvStatus() {
  if (!LV_STATUS) LV_STATUS = (async () => {
    const mcp = await lvMcp();
    if (!mcp) return { mcp: false, yf: false, tv: false, sec: false, fc: false, pub: LV_PUBLIC };
    try {
      const r = await mcp.listTools(), names = ((r && r.servers) || []).filter(s => s && s.kind !== "artifact").map(s => String(s.server));
      const has = re => names.some(n => re.test(n));
      const home = re => !LV_MOBILE && has(re);
      return { mcp: true, yf: home(/^host:yfmcp$/i), tv: home(/^host:tavily/i), sec: home(/^host:sec-edgar/i), fc: has(/^firecrawl$/i), listed: true };
    } catch { const h = LV_MOBILE ? false : null; return { mcp: true, yf: h, tv: h, sec: h, fc: null }; }
  })();
  return LV_STATUS;
}
/* The route each kind of data would take right now: "home", "cloud" or null. */
function lvRoutes(st) {
  const pick = srv => !st || !st.mcp ? null : st[srv === LV.yf ? "yf" : "tv"] !== false && lvUp(srv) ? "home" : st.fc !== false && lvUp(LV.fc) ? "cloud" : null;
  return { quotes: pick(LV.yf), web: pick(LV.tv), sec: !!(st && st.mcp && st.sec !== false && lvUp(LV.sec)) };
}
function lvMarkDown(err, server) {
  if (LV_GONE.includes(err.code)) { LV_DOWN[server] = Infinity; try { lvBump(); } catch {} return true; }
  if (err.code === "server_unavailable") { LV_DOWN[server] = Date.now() + 90000; return true; }
  return false;
}
/* Run `home`; when its server can't be used from here, run `cloud` instead. With `stay`, the paid route isn't taken
   on the caller's behalf: the error comes back marked `next: "cloud"` and the page offers that route as a choice. */
async function lvRouted(kind, home, cloud, stay) {
  const st = await lvStatus(), k = kind === "yf" ? "quotes" : "web", r = lvRoutes(st)[k];
  if (r === "home") {
    try { return await home(); }
    catch (e) { if (!(e && e.gone) || !cloud || lvRoutes(st)[k] !== "cloud") throw e; if (stay) { e.next = "cloud"; throw e; } return cloud(); }
  }
  if (r === "cloud" && cloud) return cloud();
  throw lvErr("no_live", "no live route", { kind });
}
/* The first use of a connector asks the viewer once. Calls that start together wait for that one answer
   instead of each raising (or tripping over) its own prompt. Never decides anything: the call's own result does. */
const LV_ASKED = {};
function lvConsent(server) {
  if (!LV_ASKED[server]) LV_ASKED[server] = (async () => {
    try {
      const P = window.claude && window.claude.use ? await window.claude.use("permissions") : null;
      if (!P) return;
      const s = await P.state("mcp:" + server).catch(() => null);
      if (s === "prompt") await P.request(["mcp:" + server]).catch(() => null);
    } catch {}
  })();
  return LV_ASKED[server];
}
async function lvCall(server, tool, input, opt = {}) {
  const mcp = await lvMcp();
  if (!mcp) throw lvErr("no_mcp", "mcp unavailable", { server });
  await lvConsent(server);
  if (opt.signal && opt.signal.aborted) throw lvErr("cancelled", "cancelled", { server });
  const o = {};
  if (opt.signal) o.signal = opt.signal;
  if (opt.cache) o.cache = { staleTime: 300000, gcTime: opt.cache };
  for (let attempt = 0; ; attempt++) {
    try { return lvUnwrap(await mcp.callTool(server, tool, input, o)); }
    catch (e) {
      const err = { lv: true, code: (e && e.code) || "upstream_error", message: (e && e.message) || "", server,
        detail: lvText(e && e.result).slice(0, 600), retryable: !!(e && e.retryable), retryAfterMs: e && e.retryAfterMs };
      if (attempt === 0 && err.retryable && !opt.noRetry) { await lvSleep(Math.min(8000, err.retryAfterMs || 700 + Math.random() * 900), opt.signal); continue; }
      if (lvMarkDown(err, server)) err.gone = true;
      throw err;
    }
  }
}
function lvText(r) {
  if (r && Array.isArray(r.content)) return r.content.filter(b => b && b.type === "text").map(b => b.text).join("\n");
  return typeof r === "string" ? r : "";
}
function lvJson(s) {
  if (typeof s !== "string") return s;
  const t = s.trim();
  if (!(t[0] === "{" || t[0] === "[")) return null;
  try { return JSON.parse(t); } catch {}
  try { return JSON.parse(t.replace(/([:\[,]\s*)-?(?:NaN|Infinity)\b/g, "$1null")); } catch { return null; }
}
function lvUnwrap(r) {
  let p = r && r.payload !== undefined && r.payload !== null ? r.payload : lvText(r);
  for (let k = 0; k < 4; k++) {                      // yfmcp wraps its JSON as {"result": "<json text>"}
    if (typeof p === "string") { const j = lvJson(p); if (j === null) return p; p = j; continue; }
    if (p && typeof p === "object" && !Array.isArray(p) && typeof p.result === "string" && Object.keys(p).length <= 2) { p = p.result; continue; }
    break;
  }
  return p;
}

/* ── Small values worth keeping between visits on the cloud route, where every page costs a credit:
      index histories for beta and exchange rates. ── */
const LV_KV_KEY = "vs:liveCache";
const lvKv = {
  all() { try { return JSON.parse(localStorage.getItem(LV_KV_KEY)) || {}; } catch { return {}; } },
  get(k, ttl) { const e = this.all()[k]; return e && Date.now() - e.at < ttl ? e.v : null; },
  set(k, v) { try { const m = this.all(); m[k] = { at: Date.now(), v };
    Object.keys(m).forEach(x => { if (Date.now() - m[x].at > 7 * 86400e3) delete m[x]; });
    localStorage.setItem(LV_KV_KEY, JSON.stringify(m)); } catch {} },
};

/* ── The cloud route: Firecrawl ──
   Calls are paced to stay inside the account's per-minute page limit (10 a minute on the free plan), and each
   page's credit cost is added up so the viewer can see what a visit has used. */
const FC = { stamps: [], running: 0, q: [], hold: 0, timer: null, used: 0, pages: 0 };
const FC_LIMIT = { perMin: 9, par: 4, windowMs: 61000, tick: 1000 };
try { const v = +localStorage.getItem("vs:fcPerMin"); if (v >= 1) FC_LIMIT.perMin = Math.min(Math.floor(v), 1000); } catch {}   // a paid Firecrawl plan allows more pages a minute
function fcPump() {
  const now = Date.now();
  FC.stamps = FC.stamps.filter(t => now - t < FC_LIMIT.windowMs);
  while (FC.q.length && FC.running < FC_LIMIT.par && FC.stamps.length < FC_LIMIT.perMin && now >= FC.hold) {
    const job = FC.q.shift(); FC.running++; FC.stamps.push(now); job.go();
  }
  if (FC.timer) { clearTimeout(FC.timer); FC.timer = null; }
  if (FC.q.length && FC.running < FC_LIMIT.par) FC.timer = setTimeout(() => { FC.timer = null; fcPump(); try { lvBump(); } catch {} }, FC_LIMIT.tick);
}
/* Seconds until a queued call can start because of the per-minute limit (0 when nothing is waiting on it). */
function fcWait() {
  if (!FC.q.length) return 0;
  const now = Date.now(), byLimit = FC.stamps.length >= FC_LIMIT.perMin ? FC_LIMIT.windowMs - (now - FC.stamps[0]) : 0;
  return Math.max(0, Math.ceil(Math.max(byLimit, FC.hold - now) / 1000));
}
function fcAcquire(signal) {
  return new Promise((res, rej) => {
    const job = { go: res };
    FC.q.push(job);
    if (signal) signal.addEventListener("abort", () => { const k = FC.q.indexOf(job); if (k >= 0) { FC.q.splice(k, 1); rej(lvErr("cancelled", "cancelled", { server: LV.fc })); } }, { once: true });
    fcPump();
    if (FC.q.includes(job)) { try { lvBump(); } catch {} }
  });
}
async function fcCall(tool, input, opt = {}) {
  for (let attempt = 0; ; attempt++) {
    await fcAcquire(opt.signal);
    let r, err = null;
    try { r = await lvCall(LV.fc, tool, input, opt); } catch (e) { err = e; }
    FC.running--; fcPump();
    if (!err) {
      const used = r && typeof r === "object" ? +((r.metadata && r.metadata.creditsUsed) ?? r.creditsUsed ?? (r.data && r.data.metadata && r.data.metadata.creditsUsed)) : NaN;
      FC.used += isFinite(used) ? used : tool === "firecrawl_search" ? 2 : 1; FC.pages++;
      try { lvBump(); } catch {}
      return r;
    }
    const text = `${err.message || ""} ${err.detail || ""}`;
    if (err.code === "tool_error" && /rate limit/i.test(text)) {
      const m = text.match(/retry after\s+(\d+)\s*s/i);
      FC.hold = Date.now() + ((m ? +m[1] : 30) + 2) * 1000;
      if (attempt === 0) { try { lvBump(); } catch {} continue; }
      throw lvErr("busy", text.slice(0, 200), { server: LV.fc });
    }
    if (err.code === "tool_error" && /insufficient credits|out of credits|payment required|\b402\b|credit limit/i.test(text)) throw lvErr("out_of_credits", text.slice(0, 200), { server: LV.fc });
    throw err;
  }
}
/* What a scrape returned, whichever envelope the connector used. */
function fcBody(r) {
  let o = typeof r === "string" ? (lvJson(r) || { markdown: r }) : r;
  if (o && typeof o === "object" && o.data && typeof o.data === "object" && o.markdown === undefined && o.rawHtml === undefined) o = o.data;
  return o && typeof o === "object" ? o : {};
}
/* A JSON feed fetched as a page: plain JSON text, or the same text inside a browser's wrapper. */
function fcParseJson(raw) {
  let t = String(raw == null ? "" : raw).trim();
  if (t[0] !== "{" && t[0] !== "[") {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    t = t.slice(a, b + 1);
    if (/&quot;|&amp;|&lt;|&gt;|&#\d+;/.test(t)) t = t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
  }
  return lvJson(t);
}
async function fcScrape(url, { json = false, fresh = false, signal, cache, extra } = {}) {
  const input = { url, formats: [json ? "rawHtml" : "markdown"], onlyMainContent: !json, ...(fresh ? { maxAge: 0 } : {}), ...(extra || {}) };
  const o = fcBody(await fcCall("firecrawl_scrape", input, { signal, cache }));
  const meta = o.metadata && typeof o.metadata === "object" ? o.metadata : {}, status = +meta.statusCode || 0;
  if (json) {
    const j = fcParseJson(o.rawHtml != null ? o.rawHtml : o.html != null ? o.html : o.markdown);
    if (j == null) throw lvErr(status === 404 ? "not_found" : "bad_data", status >= 400 ? `The data feed answered ${status}.` : "The data feed sent something unreadable.", { server: LV.fc, status, url });
    return j;
  }
  if (status >= 400) throw lvErr("not_found", `That page answered ${status}.`, { server: LV.fc, status, url });
  const md = typeof o.markdown === "string" ? o.markdown : "";
  if (!md.trim()) throw lvErr("no_text", "The page came back empty.", { server: LV.fc, url });
  return { md, meta };
}

/* ── Parsers ── */
function saNum(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t || t === "-" || t === "—" || /^n\/?a$/i.test(t) || /%$/.test(t)) return null;
  t = t.replace(/,/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  const v = parseFloat(t);
  return isFinite(v) ? (neg ? -v : v) : null;
}
/* One stockanalysis.com statement page (markdown from Tavily or Firecrawl) → fiscal-year columns, rows by label, the
   TTM/current column. Firecrawl's copy also carries the page's own line on units and currency ("Financials in
   millions INR") and, above the heading, the company's full name. */
function saParse(md) {
  const lines = String(md || "").split("\n");
  let title = "", flag = null, seenH1 = false, fyIdx = null, curIdx = -1, cols = null, unit = null, curText = null, name = null;
  const rows = {}, cur = {}, head = { price: null, cur: null, minor: null, exch: null };   // the quote shown above the heading (Firecrawl's copy only)
  for (const raw of lines) {
    const L = raw.trim();
    if (L.startsWith("# ")) { title = L.slice(2).trim(); seenH1 = true; continue; }
    if (!seenH1) {
      const cm = L.match(/Currency is ([A-Z]{3})\b/), pm = L.match(/Price in ([A-Za-z]{3})\b/), um = L.match(/^([A-Z]{2,10}):\s*[A-Z0-9.&-]+\s*·.*·\s*([A-Z]{3})$/);
      if (cm) head.cur = cm[1]; if (pm) head.minor = pm[1];
      if (um) { head.exch = um[1]; head.cur = head.cur || um[2]; }
      if (head.price == null && head.cur && /^\d[\d,]*(\.\d+)?$/.test(L)) { const v = saNum(L); if (v > 0) head.price = v; }
    }
    const fm = L.match(/^!\[[^\]]*\]\((?:https?:\/\/[^)\s]*?)?\/img\/flags\/([a-z_]+)\.svg\)/i);
    if (fm) { if (seenH1 && !flag) flag = fm[1].toLowerCase(); continue; }
    if (!seenH1 && !name) { const nm = L.match(/^(.{2,90}?)\s+\((?:([A-Z]{2,12}):\s?)?[A-Z0-9][A-Z0-9.&-]{0,14}\)$/); if (nm) { name = nm[1].trim(); if (nm[2]) head.exch = nm[2]; continue; } }
    if (seenH1 && !unit) { const um = L.match(/^Financials in (thousands|millions|billions)\s+([A-Z]{3})\b/i); if (um) { unit = um[1].toLowerCase(); curText = um[2].toUpperCase(); continue; } }
    if (!L.startsWith("|")) continue;
    const cells = L.split("|").slice(1, -1).map(s => s.trim());
    if (!cells.length || /^:?-{2,}:?$/.test(cells[0])) continue;
    const lab = cells[0].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
    if (/^Fiscal (Year|Quarter)$/i.test(lab)) {
      const hdr = cells.slice(1); fyIdx = []; curIdx = -1;
      hdr.forEach((h, j) => { if (/^FY\s?\d{4}$/i.test(h)) fyIdx.push(j); else if (curIdx < 0 && /^(TTM|Current|LTM)$/i.test(h)) curIdx = j; });
      const labels = fyIdx.map(j => hdr[j].replace(/\s+/g, "").toUpperCase());
      if (!cols || labels.length > cols.length) cols = labels.map(l => ({ label: l, end: null }));
      continue;
    }
    if (!fyIdx) continue;
    if (lab === "Period Ending") { fyIdx.forEach((j, n) => { const c = cols && cols[n]; if (c && !c.end) c.end = cells[1 + j] || null; }); continue; }
    if (rows[lab]) continue;
    rows[lab] = fyIdx.map(j => saNum(cells[1 + j]));
    if (curIdx >= 0) cur[lab] = saNum(cells[1 + curIdx]);
  }
  return { title, flag, cols: cols || [], rows, cur, unit, curText, name, head };
}
/* The company page on stockanalysis.com (Firecrawl markdown) → what Yahoo's profile gives on the home route. */
const SA_SECTORS = { financials: "Financial Services", "consumer discretionary": "Consumer Cyclical", "consumer staples": "Consumer Defensive", materials: "Basic Materials",
  "health care": "Healthcare", "information technology": "Technology", "communications": "Communication Services" };
function saParseCompany(md) {
  const lines = String(md || "").split("\n").map(l => l.trim());
  const out = { name: null, country: null, industry: null, sector: null, employees: null, website: null, repCur: null, exchange: null, summary: "" };
  const plain = s => String(s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  let h1 = -1;
  lines.forEach((L, i) => {
    if (h1 < 0 && L.startsWith("# ")) { h1 = i; return; }
    if (h1 < 0 && !out.name) { const nm = L.match(/^(.{2,90}?)\s+\((?:[A-Z]{2,12}:\s?)?[A-Z0-9][A-Z0-9.&-]{0,14}\)$/); if (nm) out.name = nm[1].trim(); return; }
    if (!L.startsWith("|")) return;
    const cells = L.split("|").slice(1, -1).map(s => s.trim());
    if (cells.length !== 2) return;
    const k = cells[0].toLowerCase(), v = plain(cells[1]);
    if (!v || /^-+$/.test(v)) return;
    if (k === "country") out.country = v;
    else if (k === "industry") out.industry = v.replace(/\s+-\s+/g, "—");
    else if (k === "sector") out.sector = SA_SECTORS[v.toLowerCase()] || v;
    else if (k === "employees") { const n = parseInt(v.replace(/[^\d]/g, ""), 10); out.employees = n > 0 ? n : null; }
    else if (k === "website") { const u = cells[1].match(/\((https?:\/\/[^)\s]+)\)/); out.website = u ? u[1] : /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v) ? "https://" + v : null; }
    else if (k === "reporting currency") out.repCur = /^[A-Z]{3}$/.test(v) ? v : null;
    else if (k === "exchange") out.exchange = v;
  });
  if (h1 >= 0) {
    const paras = [];
    for (let i = h1 + 1; i < lines.length; i++) {
      const L = lines[i];
      if (!L) continue;
      if (L.startsWith("|") || L.startsWith("#") || L.startsWith("![")) break;
      paras.push(L);
    }
    const tail = () => paras[paras.length - 1];                    // the company's name is repeated above its logo
    while (paras.length > 1 && tail().length < 80 && (tail() === out.name || tail().split(/\s+/).length <= 6)) paras.pop();
    out.summary = paras.join(" ").replace(/\s+/g, " ").trim();
  }
  return out;
}
/* Yahoo's chart feed → price points (dividend-adjusted, as yfinance gives them) and the quote that comes with them. */
function fcParseChart(j) {
  const c = j && j.chart, r = c && Array.isArray(c.result) ? c.result[0] : null;
  if (!r) return { error: (c && c.error && (c.error.description || c.error.code)) || "no data", points: [], meta: null };
  const meta = r.meta || {}, ts = Array.isArray(r.timestamp) ? r.timestamp : [], ind = r.indicators || {};
  const adj = ind.adjclose && ind.adjclose[0] && ind.adjclose[0].adjclose, raw = ind.quote && ind.quote[0] && ind.quote[0].close;
  const off = +meta.gmtoffset || 0, points = [];
  ts.forEach((t, i) => { const v = adj && adj[i] != null ? adj[i] : raw ? raw[i] : null; if (v > 0) points.push({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: +v }); });
  return { points, meta };
}
/* Yahoo's fundamentals feed → the same shape as the Yahoo Finance server's annual statements, for the cross-check. */
const FC_TS = { annualTotalRevenue: ["income_statement", "Total Revenue"], annualNetIncome: ["income_statement", "Net Income"], annualTotalAssets: ["balance_sheet", "Total Assets"],
  annualStockholdersEquity: ["balance_sheet", "Stockholders Equity"], annualTotalDebt: ["balance_sheet", "Total Debt"], annualOperatingCashFlow: ["cash_flow", "Operating Cash Flow"] };
function fcParseTimeseries(j) {
  const res = j && j.timeseries && Array.isArray(j.timeseries.result) ? j.timeseries.result : null;
  if (!res) return null;
  const out = { income_statement: {}, balance_sheet: {}, cash_flow: {}, currency: null }; let n = 0;
  res.forEach(r => {
    const type = r && r.meta && Array.isArray(r.meta.type) ? r.meta.type[0] : null, m = FC_TS[type];
    if (!m || !Array.isArray(r[type])) return;
    const o = out[m[0]][m[1]] = out[m[0]][m[1]] || {};
    r[type].forEach(x => { if (!x || !x.asOfDate || !x.reportedValue || (x.periodType && x.periodType !== "12M")) return;
      const v = +x.reportedValue.raw; if (!isFinite(v)) return; o[String(x.asOfDate)] = v; n++; if (!out.currency && x.currencyCode) out.currency = String(x.currencyCode); });
  });
  return n ? out : null;
}
/* Firecrawl web search → [{title, url, snippet}], the shape the Tavily parser gives. */
function fcParseWeb(r) {
  const o = typeof r === "string" ? lvJson(r) : r, d = o && o.data ? o.data : o;
  const a = Array.isArray(d) ? d : d && Array.isArray(d.web) ? d.web : [];
  return a.filter(x => x && x.url).map(x => ({ title: String(x.title || "").replace(/^\[PDF\]\s*/i, ""), url: String(x.url), snippet: String(x.description || x.snippet || x.markdown || "").slice(0, 1200) }));
}
/* "Mar '26 Mar 31, 2026" → { y: 2026, m: 3, mon: "Mar" } */
function saEnd(s) {
  const m = String(s || "").match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\s*$/);
  if (!m) return null;
  const mi = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(m[1]);
  return mi < 0 ? null : { y: +m[3], m: mi + 1, mon: m[1] };
}
/* Tavily extract text → [{title, url, raw}] */
function tvParseExtract(r) {
  if (r && typeof r === "object" && Array.isArray(r.results)) return r.results.map(x => ({ title: x.title || "", url: String(x.url || ""), raw: String(x.raw_content || x.rawContent || "") }));
  const t = String(r || ""), marks = [], re = /(?:^|\n)Title: ([^\n]*)\nURL: ([^\n]*)\n(?:Content: [^\n]*\n)?Raw Content: ?/g;
  let m;
  while ((m = re.exec(t))) marks.push({ title: m[1], url: m[2].trim(), start: re.lastIndex, at: m.index });
  return marks.map((k, i) => ({ title: k.title === "null" || k.title === "undefined" ? "" : k.title, url: k.url,
    raw: t.slice(k.start, i + 1 < marks.length ? marks[i + 1].at : t.length).replace(/\n+Failed Results:[\s\S]*$/, "").trim() }));
}
/* Tavily search text → [{title, url, snippet}] */
function tvParseSearch(r) {
  if (r && typeof r === "object" && Array.isArray(r.results)) return r.results.map(x => ({ title: x.title || "", url: String(x.url || ""), snippet: String(x.content || "") }));
  const t = String(r || ""), marks = [], re = /(?:^|\n)Title: ([^\n]*)\n(?:ID: [^\n]*\n)?URL: ([^\n]*)\nContent: ?/g;
  let m;
  while ((m = re.exec(t))) marks.push({ title: m[1], url: m[2].trim(), start: re.lastIndex, at: m.index });
  return marks.map((k, i) => ({ title: k.title === "null" ? "" : k.title, url: k.url,
    snippet: t.slice(k.start, i + 1 < marks.length ? marks[i + 1].at : t.length).trim() }));
}
/* Yahoo price history (markdown table or JSON rows) → [{date, close}] oldest first */
function lvParseHistory(t) {
  if (Array.isArray(t)) return t.map(r => ({ date: String(r.Date || r.date || "").slice(0, 10), close: +(r.Close != null ? r.Close : r.close) }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.close > 0);
  const lines = String(t || "").split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 3) return [];
  const hdr = lines[0].split("|").slice(1, -1).map(s => s.trim().toLowerCase());
  const di = Math.max(0, hdr.indexOf("date")), ci = hdr.indexOf("close");
  if (ci < 0) return [];
  return lines.slice(1).map(l => l.split("|").slice(1, -1).map(s => s.trim())).filter(c => !/^:?-+:?$/.test(c[0] || ""))
    .map(c => ({ date: (c[di] || "").slice(0, 10), close: parseFloat(c[ci]) })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.close > 0);
}
/* Five-year monthly regression on the market index, Blume-adjusted (the same method as the verified dataset). */
function lvRegress(sp, ip) {
  const now = new Date(), curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const S = {}, M = {};
  sp.forEach(p => { const k = p.date.slice(0, 7); if (k !== curM) S[k] = p.close; });
  ip.forEach(p => { const k = p.date.slice(0, 7); if (k !== curM) M[k] = p.close; });
  const ds = Object.keys(S).filter(k => k in M).sort();
  const rs = [], rm = [], dt = [];
  for (let k = 1; k < ds.length; k++) { rs.push(S[ds[k]] / S[ds[k - 1]] - 1); rm.push(M[ds[k]] / M[ds[k - 1]] - 1); dt.push(ds[k]); }
  const n = rs.length;
  if (n < 24) return null;
  const mean = a => a.reduce((t, x) => t + x, 0) / a.length;
  const ms = mean(rs), mm = mean(rm);
  let cov = 0, vm = 0, vs = 0;
  for (let k = 0; k < n; k++) { cov += (rs[k] - ms) * (rm[k] - mm); vm += (rm[k] - mm) ** 2; vs += (rs[k] - ms) ** 2; }
  const b = cov / vm, a = ms - b * mm;
  let sse = 0; for (let k = 0; k < n; k++) sse += (rs[k] - (a + b * rm[k])) ** 2;
  const r4 = x => Math.round(x * 1e4) / 1e4;
  return { raw: r4(b), adj: r4(0.67 * b + 0.33), r2: r4(1 - sse / vs), se: r4(Math.sqrt(sse / (n - 2) / vm)), n,
    from: ds[0] + "-01", to: ds[ds.length - 1] + "-01", big: dt.map((d, k) => [d, Math.round(rs[k] * 1000) / 10]).filter(x => Math.abs(x[1]) > 40) };
}

/* ── Fetchers: each takes the home route when it answers and the cloud route otherwise ── */
const lvQuoteRows = a => (Array.isArray(a) ? a : []).filter(x => x && x.symbol && (!x.quoteType || x.quoteType === "EQUITY")).map(x => ({
  symbol: String(x.symbol), name: String(x.longname || x.shortname || x.symbol), exch: String(x.exchDisp || x.exchange || ""),
  sector: String(x.sectorDisp || x.sector || ""), industry: String(x.industryDisp || x.industry || "") }));
async function lvSearch(q, signal, stay) {
  const query = String(q).trim().slice(0, 80);
  return lvRouted("yf",
    async () => { const r = await lvCall(LV.yf, "yfinance_search", { query, search_type: "quotes" }, { signal, cache: 3600000 }); return lvQuoteRows(Array.isArray(r) ? r : r && r.quotes); },
    async () => { const j = await fcScrape(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`, { json: true, signal, cache: 3600000 });
      return lvQuoteRows(j && j.quotes); }, stay);
}
const lvNorm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\b(the|limited|ltd|inc|incorporated|plc|ag|se|sa|s\.a|nv|n\.v|corp|corporation|co|company|holdings?|group|berhad|bhd|tbk|pcl|asa|ab|oyj|spa|s\.p\.a)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
/* Yahoo's screener has no public feed, so browsing by industry runs only through the home computer's server. */
async function lvScreen({ region, sector, industry, sort = "intradaymarketcap", asc = false, offset = 0, size = 60 }, signal) {
  if (lvRoutes(await lvStatus()).quotes !== "home") throw lvErr("no_screen", "Browsing by country and industry uses Yahoo Finance's screener, which answers only through the Yahoo Finance server on your home computer. Search by name works from here.");
  const C = LV_COUNTRIES.find(x => x.r === region);
  const ops = [{ operator: "eq", operands: ["region", region] }, { operator: "gt", operands: ["intradaymarketcap", 0] }];
  if (industry) ops.push({ operator: "eq", operands: ["industry", industry] });
  else if (sector) ops.push({ operator: "eq", operands: ["sector", sector] });
  if (C && C.ex) ops.push(C.ex.length === 1 ? { operator: "eq", operands: ["exchange", C.ex[0]] } : { operator: "or", operands: C.ex.map(e => ({ operator: "eq", operands: ["exchange", e] })) });
  const r = await lvCall(LV.yf, "yfinance_screen", { query: { operator: "and", operands: ops }, query_type: "equity", size, offset, sort_field: sort, sort_asc: asc }, { signal, cache: 900000 });
  const quotes = r && Array.isArray(r.quotes) ? r.quotes : [];
  const seen = new Map(), rows = [];
  quotes.forEach(q => {
    if (!q || !q.symbol) return;
    const row = { symbol: String(q.symbol), name: String(q.longName || q.shortName || q.symbol), exch: String(q.fullExchangeName || q.exchange || ""),
      cur: String(q.currency || ""), price: +q.regularMarketPrice || null, mcap: +q.marketCap || null, pe: +q.trailingPE || null, fpe: +q.forwardPE || null,
      pb: +q.priceToBook || null, dy: q.dividendYield != null ? +q.dividendYield : null, chg1d: q.regularMarketChangePercent != null ? +q.regularMarketChangePercent : null,
      chg52: q.fiftyTwoWeekChangePercent != null ? +q.fiftyTwoWeekChangePercent : null, rating: q.averageAnalystRating || "" };
    const k = lvNorm(row.name) || row.symbol, prev = seen.get(k);
    if (prev === undefined) { seen.set(k, rows.length); rows.push(row); return; }
    if (C && C.pref && row.symbol.endsWith(C.pref) && !rows[prev].symbol.endsWith(C.pref)) rows[prev] = row;
  });
  return { total: r && r.total != null ? +r.total : null, count: quotes.length, rows };
}
/* Price history → { points: [{date, close}], meta }. `meta` (the quote Yahoo sends with its chart) comes only on the
   cloud route. Calls for the same series share one fetch; `keep` (ms) also keeps a cloud result between visits. */
const LV_HIST = {};
function lvHistory(symbol, period, interval, signal, keep) {
  const key = `${symbol}|${period}|${interval}`, hit = LV_HIST[key];
  if (hit && Date.now() - hit.at < 600000) return hit.p;
  const p = lvRouted("yf",
    async () => ({ points: lvParseHistory(await lvCall(LV.yf, "yfinance_get_price_history", { symbol, period, interval }, { signal, cache: period === "5d" ? 3600000 : 6 * 3600e3 })), meta: null }),
    async () => {
      if (keep) { const c = lvKv.get("px:" + key, keep); if (Array.isArray(c) && c.length) return { points: c, meta: null, kept: true }; }
      const h = fcParseChart(await fcScrape(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${period}&interval=${interval}`, { json: true, fresh: true, signal, cache: 600000 }));
      if (h.error) throw lvErr("not_found", `Yahoo Finance has no prices for ${symbol}.`, { server: LV.fc });
      if (keep && h.points.length) lvKv.set("px:" + key, h.points.map(x => ({ date: x.date, close: Math.round(x.close * 1e4) / 1e4 })));
      return h;
    });
  LV_HIST[key] = { at: Date.now(), p };
  p.catch(() => { if (LV_HIST[key] && LV_HIST[key].p === p) delete LV_HIST[key]; });
  return p;
}
const LV_FX = {};
async function lvFx(from, to, signal) {
  if (!from || !to || from === to) return 1;
  const k = from + to, hit = LV_FX[k];
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.rate;
  const one = async pair => { const px = (await lvHistory(pair + "=X", "5d", "1d", signal, 6 * 3600e3)).points; return px.length ? px[px.length - 1].close : null; };
  let rate = null;
  try { rate = await one(k); } catch (e) { if (e && LV_HARD.includes(e.code)) throw e; }
  if (!(rate > 0)) {
    const a = from === "USD" ? 1 : await one("USD" + from).catch(() => null), b = to === "USD" ? 1 : await one("USD" + to).catch(() => null);
    if (a > 0 && b > 0) rate = b / a;
  }
  if (!(rate > 0)) throw lvErr("fx", `No exchange rate was found for ${from} to ${to}.`);
  LV_FX[k] = { rate, at: Date.now() };
  return rate;
}
/* `pSym`: the share's own history when the caller already has it in hand (the cloud route, where the index is only
   fetched once the share's prices have arrived, so a failed quote doesn't cost a second page). */
async function lvBeta(symbol, idx, signal, pSym) {
  const index = () => lvHistory(idx, "5y", "1mo", signal, 12 * 3600e3);
  if (pSym) { const a = await pSym; return lvRegress(a.points, (await index()).points); }
  const [a, b] = await Promise.all([lvHistory(symbol, "5y", "1mo", signal), index()]);
  return lvRegress(a.points, b.points);
}
/* Web search and page reading, for statements discovery, reports and the AI analyst. */
async function lvWebSearch({ query, domains, max = 6, recent = false }, signal, cache = 3600000) {
  const doms = domains && domains.length ? domains.map(d => String(d).toLowerCase()) : null;
  return lvRouted("tv",
    async () => tvParseSearch(await lvCall(LV.tv, "tavily_search", { query, max_results: max, search_depth: "basic", ...(doms ? { include_domains: doms } : {}), ...(recent ? { time_range: "month" } : {}) }, { signal, cache })),
    async () => fcParseWeb(await fcCall("firecrawl_search", { query, limit: Math.min(max, 10), sources: ["web"], domainTools: false, ...(doms ? { includeDomains: doms } : {}), ...(recent ? { tbs: "qdr:m" } : {}) }, { signal, cache })));
}
/* Away from home a PDF costs a Firecrawl credit a page, so only the first pages are read; an upload reads all of it for nothing. */
const LV_PDF_PAGES = 20;
async function lvWebExtract(url, signal) {
  return lvRouted("tv",
    async () => {
      let d = tvParseExtract(await lvCall(LV.tv, "tavily_extract", { urls: [url], extract_depth: "basic", format: "markdown" }, { signal, cache: 6 * 3600e3 }))[0];
      if (!d || d.raw.length < 1500) {
        const adv = tvParseExtract(await lvCall(LV.tv, "tavily_extract", { urls: [url], extract_depth: "advanced", format: "markdown" }, { signal, cache: 6 * 3600e3 }))[0];
        if (adv && (!d || adv.raw.length > d.raw.length)) d = adv;
      }
      return d ? { title: d.title, raw: d.raw, via: "home" } : null;
    },
    async () => {
      const r = await fcScrape(url, { signal, cache: 6 * 3600e3, extra: { parsers: ["pdf"], pdfOptions: { maxPages: LV_PDF_PAGES } } });
      const m = r.meta, pdf = /pdf/i.test(String(m.contentType || ""));
      const pages = pdf ? r.md.split(/\n+-{3,}\n+<u>Page<\/u>\s*<u>(?:<strong>)?\d+(?:<\/strong>)?<\/u>\n+/) : null;
      return { title: String(m.title || m.ogTitle || ""), raw: r.md, via: "cloud", pdf, pages: pages && pages.length > 1 ? pages : null, got: +m.numPages || null, total: +m.totalPages || null };
    });
}
/* stockanalysis.com page for a Yahoo symbol; working paths are remembered in this browser. */
function lvSaBase(symbol, slug) {
  const { base } = lvSplit(symbol);
  const code = encodeURIComponent(base.replace(/-/g, ".")).replace(/%2E/gi, ".");
  return slug === "stocks" ? `https://stockanalysis.com/stocks/${code.toLowerCase()}/financials/` : `https://stockanalysis.com/quote/${slug}/${code}/financials/`;
}
const LV_SLUG_KEY = "vs:saPaths";
const lvSlugs = () => { try { return JSON.parse(localStorage.getItem(LV_SLUG_KEY)) || {}; } catch { return {}; } };
const lvSlugSave = (sym, base) => { try { const m = lvSlugs(); m[sym] = base; localStorage.setItem(LV_SLUG_KEY, JSON.stringify(m)); } catch {} };
/* Where the statements for a symbol are most likely to be. */
function lvSaGuess(symbol) {
  const { sfx, C } = lvSplit(symbol);
  return lvSlugs()[symbol] || (C && C.sfx[sfx] !== undefined ? lvSaBase(symbol, C.sfx[sfx]) : null);
}
/* The three statements at one address. On the cloud route each page costs a credit, so the income statement is read
   first: a wrong address stops there, and so does a bank or insurer (`finP`), whose accounts the tools can't use. */
async function lvStatementsAt(base, signal, finP) {
  const urls = ["income-statement/", "balance-sheet/", "cash-flow-statement/"].map(p => base + p);
  const none = () => lvErr("no_statements", "No statements were found at " + base);
  const done = out => {
    if (out.is.unit && out.is.unit !== "millions") throw lvErr("no_statements", `The statements at ${base} are in ${out.is.unit}, not millions, so they can't be read safely.`);
    if (!out.is.rows.Revenue && !out.bs.rows["Total Assets"]) throw none();
    return out;
  };
  return lvRouted("tv",
    async () => {
      const docs = tvParseExtract(await lvCall(LV.tv, "tavily_extract", { urls, extract_depth: "basic", format: "markdown" }, { signal, cache: 6 * 3600e3 }));
      const find = k => docs.find(d => d.url.includes(k));
      const is = find("income-statement"), bs = find("balance-sheet"), cf = find("cash-flow-statement");
      if (!is || !bs || !cf) throw lvErr("no_statements", "The statements page couldn't be read.");
      return done({ is: saParse(is.raw), bs: saParse(bs.raw), cf: saParse(cf.raw), base, title: is.title || "", via: "home" });
    },
    async () => {
      const page = u => fcScrape(u, { signal, cache: 6 * 3600e3 }).then(r => saParse(r.md), e => { throw e && (e.code === "not_found" || e.code === "no_text") ? none() : e; });
      const is = await page(urls[0]);
      if (!is.cols.length) throw none();
      if (finP && await finP.catch(() => false)) return { is, bs: saParse(""), cf: saParse(""), base, title: is.title || "", via: "cloud", partial: true };
      const [bs, cf] = await Promise.all([page(urls[1]), page(urls[2])]);
      return done({ is, bs, cf, base, title: is.title || "", via: "cloud" });
    });
}
async function lvStatements(symbol, signal, pName, finP) {
  const { sfx, C } = lvSplit(symbol), tries = [], known = lvSlugs()[symbol];
  if (known) tries.push(known);
  if (C && C.sfx[sfx] !== undefined) tries.push(lvSaBase(symbol, C.sfx[sfx]));
  if (sfx === ".BO") tries.push(lvSaBase(symbol, "nse"));
  let last = null;
  for (const base of [...new Set(tries)]) {
    try { const st = await lvStatementsAt(base, signal, finP); lvSlugSave(symbol, base); return st; }
    catch (e) { last = e; if (e && LV_HARD.includes(e.code)) throw e; }
  }
  if (last && last.code !== "no_statements") throw last;            // the page didn't answer: looking elsewhere wouldn't help
  const name = (await Promise.resolve(pName).catch(() => null)) || symbol;
  const hits = await lvWebSearch({ query: `${name} ${lvSplit(symbol).base} income statement`, domains: ["stockanalysis.com"], max: 5 }, signal, 86400000);
  for (const h of hits) {
    const m = h.url.match(/stockanalysis\.com\/(stocks\/[^/?#]+|quote\/[a-z]+\/[^/?#]+)/i);
    if (!m) continue;
    const base = `https://stockanalysis.com/${m[1]}/financials/`;
    if (tries.includes(base)) continue;
    try { const st = await lvStatementsAt(base, signal, finP); lvSlugSave(symbol, base); return st; } catch (e) { last = e; if (e && LV_HARD.includes(e.code)) throw e; }
    break;
  }
  throw last && last.code !== "no_statements" ? last : lvErr("no_statements", `stockanalysis.com has no statements for ${symbol}.`);
}
/* The company page on stockanalysis.com: country, industry, description, website (what Yahoo's profile gives at home). */
function lvCompanyPage(symbol, signal) {
  const guess = lvSaGuess(symbol);
  if (!guess) return Promise.resolve(null);
  return fcScrape(guess.replace(/financials\/$/, "company/"), { signal, cache: 86400000 }).then(r => saParseCompany(r.md),
    e => { if (e && (e.code === "cancelled" || LV_HARD.includes(e.code))) throw e; return null; });
}
/* What the home route's Yahoo profile gives, put together on the cloud route from Yahoo's chart feed (price, currency,
   names, 52-week range) and the company page. When Yahoo's feed doesn't answer, the quote printed above the statements
   on stockanalysis.com stands in, so a company still loads (without a beta or a 52-week range). */
async function lvInfoCloud(symbol, hint, { pChart, pCo, pSt }) {
  const noQuote = () => lvErr("not_found", `Yahoo Finance has no quote for ${symbol}. Check the symbol, including its exchange suffix (for example .NS for NSE).`, { server: LV.fc });
  let h = null, hErr = null;
  try { h = await pChart; } catch (e) { if (e && (e.code === "cancelled" || LV_HARD.includes(e.code))) throw e; hErr = e; }
  const co = await pCo;
  const base = { viaCloud: true, symbol, country: (co && co.country) || "", industry: (co && co.industry) || (hint && hint.industry) || "", sector: (co && co.sector) || (hint && hint.sector) || "",
    website: (co && co.website) || "", fullTimeEmployees: co && co.employees, longBusinessSummary: (co && co.summary) || "", financialCurrency: (co && co.repCur) || null };
  const m = (h && h.meta) || {};
  if (h && (+m.regularMarketPrice > 0 || h.points.length)) {
    const px = +m.regularMarketPrice || h.points[h.points.length - 1].close;
    return { ...base, currency: m.currency || null, currentPrice: px, regularMarketPrice: px,
      longName: m.longName || (co && co.name) || (hint && hint.name) || "", shortName: m.shortName || "",
      fullExchangeName: m.fullExchangeName || (hint && hint.exch) || "", exchange: m.exchangeName || "",
      fiftyTwoWeekLow: m.fiftyTwoWeekLow, fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
      regularMarketTime: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : "" };
  }
  if (!hErr || hErr.code === "not_found") throw noQuote();
  const st = await Promise.resolve(pSt).catch(() => null), hd = st && st.is.head;
  if (!hd || !(hd.price > 0) || !hd.cur) throw hErr;
  return { ...base, noYahoo: true, currency: hd.minor || hd.cur, currentPrice: hd.price, regularMarketPrice: hd.price,
    longName: st.is.name || (co && co.name) || (hint && hint.name) || "", shortName: "", fullExchangeName: (hint && hint.exch) || hd.exch || "", exchange: hd.exch || "", regularMarketTime: "" };
}
/* Yahoo's own annual figures for the cross-check. */
async function lvCrossData(symbol, signal) {
  return lvRouted("yf",
    () => lvCall(LV.yf, "yfinance_get_financials", { symbol, frequency: "annual" }, { signal, cache: 3600000 }),
    async () => fcParseTimeseries(await fcScrape(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${Object.keys(FC_TS).join(",")}&period1=1546300800&period2=2051222400`, { json: true, signal, cache: 3600000 })));
}

/* ── Assemble a live record in the suite's shape ── */
const lvOk = v => v != null && isFinite(v);
function lvShort(name, sym) {
  let s = String(name || sym || "").replace(/^The\s+/i, "").replace(/[,.]?\s+(Limited|Ltd\.?|Inc\.?|Incorporated|Corporation|Corp\.?|plc|PLC|AG|SE|S\.A\.?|SA|N\.V\.|NV|Co\.?,? Ltd\.?|Company|Berhad|Bhd|Tbk|PCL|ASA|AB|Oyj|S\.p\.A\.?|SpA)\.?$/i, "").trim();
  s = s.replace(/[,.]?\s+(Limited|Ltd\.?|Inc\.?|Corporation|Corp\.?|plc|Holdings?)$/i, "").trim() || s;
  if (s.length > 18) s = s.split(/\s+/).slice(0, 2).join(" ");
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}
const lvSlug = s => String(s || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
function lvAssemble(st) {
  const master = (st.is.cols.length ? st.is.cols : st.bs.cols).slice(0, 5);
  const n = master.length;
  const pick = (P, ...labels) => {
    for (const l of labels) { const v = P.rows[l]; if (v) return master.map(c => { const j = P.cols.findIndex(x => x.label === c.label); return j >= 0 && j < v.length ? v[j] : null; }); }
    return null;
  };
  const f = (a, b, fn) => a && b ? a.map((x, j) => lvOk(x) && lvOk(b[j]) ? fn(x, b[j]) : null) : null;
  const I = st.is, B = st.bs, C = st.cf, R = {};
  R.rev = pick(I, "Revenue", "Total Revenue", "Operating Revenue");
  R.cogs = pick(I, "Cost of Revenue", "Fuel & Purchased Power", "Cost of Goods Sold");
  R.gp = pick(I, "Gross Profit") || f(R.rev, R.cogs, (r, k) => r - k);
  if (!R.cogs && R.gp) R.cogs = f(R.rev, R.gp, (r, g) => r - g);
  R.ebit = pick(I, "Operating Income", "EBIT");
  R.opex = pick(I, "Operating Expenses") || f(pick(I, "Total Operating Expenses"), R.cogs, (t, k) => t - k) || f(R.gp, R.ebit, (g, e) => g - e);
  /* A group with a lending arm (or similar): the source takes a cost off before gross profit without listing it, so
     revenue − cost of revenue overshoots gross profit. Gross profit is the figure that ties to operating profit, so the
     cost of revenue follows it. */
  const oxRow = pick(I, "Operating Expenses"), gpRow = pick(I, "Gross Profit"), cgRow = pick(I, "Cost of Revenue", "Fuel & Purchased Power", "Cost of Goods Sold");
  if (R.rev && cgRow && gpRow && oxRow && R.ebit) {          // only when the page states all of these itself
    const tol = j => Math.max(2, 0.0005 * Math.abs(R.rev[j]));
    const x = master.map((_, j) => { if (![R.rev[j], cgRow[j], gpRow[j], oxRow[j], R.ebit[j]].every(lvOk)) return 0;
      const gap = R.rev[j] - cgRow[j] - gpRow[j]; return gap > tol(j) && Math.abs(gpRow[j] - oxRow[j] - R.ebit[j]) <= tol(j) ? gap : 0; });
    if (x.some(v => v > 0)) { R.cogsX = x; R.cogs = R.cogs.map((k, j) => x[j] > 0 ? R.rev[j] - R.gp[j] : k); }
  }
  R.ebitda = pick(I, "EBITDA");
  R.da = pick(I, "D&A For EBITDA") || f(R.ebitda, R.ebit, (e, b) => e - b) || pick(C, "Depreciation & Amortization");
  if (!R.ebitda) R.ebitda = f(R.ebit, R.da, (b, d) => b + d);
  const ie = pick(I, "Interest Expense");
  R.int = ie ? ie.map(x => lvOk(x) ? Math.abs(x) : null) : null;
  R.pbt = pick(I, "Pretax Income", "EBT Including Unusual Items"); R.tax = pick(I, "Income Tax Expense");
  R.ni = pick(I, "Net Income", "Net Income to Common"); R.sga = pick(I, "Selling, General & Admin"); R.mie = pick(I, "Minority Interest in Earnings");
  R.shB = pick(I, "Shares Outstanding (Basic)"); R.dpsH = pick(I, "Dividend Per Share");
  R.cash = pick(B, "Cash & Short-Term Investments");
  if (!R.cash) { const parts = ["Cash & Equivalents", "Short-Term Investments", "Trading Asset Securities"].map(l => pick(B, l)).filter(Boolean);
    if (parts.length) R.cash = master.map((_, j) => parts.some(p => lvOk(p[j])) ? parts.reduce((t, p) => t + (lvOk(p[j]) ? p[j] : 0), 0) : null); }
  R.ar = pick(B, "Accounts Receivable"); R.rec = pick(B, "Receivables");
  if (!R.rec && R.ar) { const o = pick(B, "Other Receivables"); R.rec = R.ar.map((a, j) => lvOk(a) ? a + (o && lvOk(o[j]) ? o[j] : 0) : null); }
  if (!R.ar) R.ar = R.rec;
  R.inv = pick(B, "Inventory"); R.ca = pick(B, "Total Current Assets"); R.ppe = pick(B, "Property, Plant & Equipment", "Net Property, Plant & Equipment");
  R.lti = pick(B, "Long-Term Investments"); R.gw = pick(B, "Goodwill"); R.ta = pick(B, "Total Assets"); R.ap = pick(B, "Accounts Payable");
  R.std = pick(B, "Short-Term Debt"); R.ltd = pick(B, "Long-Term Debt"); R.cl = pick(B, "Total Current Liabilities"); R.debt = pick(B, "Total Debt");
  R.tl = pick(B, "Total Liabilities"); R.re = pick(B, "Retained Earnings"); R.mi = pick(B, "Minority Interest"); R.shTot = pick(B, "Total Common Shares Outstanding");
  R.eq = pick(B, "Total Common Equity");
  const se = pick(B, "Shareholders' Equity", "Total Shareholders' Equity");
  if (!R.eq) {
    R.eq = se ? se.map((s, j) => lvOk(s) ? s - (R.mi && lvOk(R.mi[j]) ? R.mi[j] : 0) : null)
      : R.ta && R.tl ? R.ta.map((a, j) => lvOk(a) && lvOk(R.tl[j]) ? a - R.tl[j] - (R.mi && lvOk(R.mi[j]) ? R.mi[j] : 0) : null) : null; }
  /* Equity the source counts in its total without listing it as a line: preference shares and perpetual securities.
     It ranks ahead of ordinary shareholders, so it is kept apart from their equity and the DCF takes it off as preferred stock. */
  else if (se) { const o = master.map((_, j) => { if (!lvOk(se[j]) || !lvOk(R.eq[j])) return null;
      const d = se[j] - R.eq[j] - (R.mi && lvOk(R.mi[j]) ? R.mi[j] : 0); return d > Math.max(2, 0.001 * Math.abs(se[j])) ? d : 0; });
    if (o.some(v => v > 0)) R.oeq = o; }
  R.dacf = pick(C, "Depreciation & Amortization"); R.cfo = pick(C, "Operating Cash Flow");
  const cx = pick(C, "Capital Expenditures"); R.capex = cx ? cx.map(x => lvOk(x) ? Math.abs(x) : null) : null;
  const dv = pick(C, "Common Dividends Paid", "Dividends Paid"); R.div = dv ? dv.map(x => lvOk(x) ? Math.abs(x) : null) : null;
  R.issue = pick(C, "Issuance of Common Stock"); R.fcfSrc = pick(C, "Free Cash Flow");
  /* zero where a statement exists for the year but the line doesn't (as in the verified dataset) */
  const has = { is: master.map((_, j) => lvOk(R.rev && R.rev[j])), bs: master.map((_, j) => lvOk(R.ta && R.ta[j])), cf: master.map((_, j) => lvOk(R.cfo && R.cfo[j])) };
  const Z = { is: ["da", "int", "tax", "mie", "dpsH"], bs: ["cash", "ar", "rec", "inv", "lti", "gw", "ap", "std", "ltd", "debt", "mi"], cf: ["dacf", "capex", "div", "issue"] };
  Object.entries(Z).forEach(([s, fs]) => fs.forEach(k => { R[k] = master.map((_, j) => R[k] && lvOk(R[k][j]) ? R[k][j] : has[s][j] ? 0 : null); }));
  /* retained earnings gaps by clean surplus from the neighbouring (older) year */
  if (R.re) for (let j = n - 2; j >= 0; j--) if (!lvOk(R.re[j]) && lvOk(R.re[j + 1]) && lvOk(R.ni && R.ni[j])) R.re[j] = R.re[j + 1] + R.ni[j] - (R.div[j] || 0);
  return { R, master, n };
}
function lvChecks(R, master) {
  const out = [], bad = [];
  master.forEach((c, j) => {
    const g = k => R[k] ? R[k][j] : null, tol = v => Math.max(2, 0.0005 * Math.abs(v || 0)), y = c.label.replace("FY", "FY");
    const t = (name, a, b, tl) => { if (lvOk(a) && lvOk(b) && Math.abs(a - b) > tl) bad.push(`${y} ${name}: ${a.toLocaleString("en-IN")} vs ${b.toLocaleString("en-IN")}`); };
    t("gross profit = revenue − cost of revenue", g("gp"), lvOk(g("rev")) && lvOk(g("cogs")) ? g("rev") - g("cogs") : null, tol(g("rev")));
    t("EBITDA = EBIT + D&A", g("ebitda"), lvOk(g("ebit")) && lvOk(g("da")) ? g("ebit") + g("da") : null, tol(g("ebitda")));
    t("assets = liabilities + equity + minority interest", g("ta"), lvOk(g("tl")) && lvOk(g("eq")) ? g("tl") + g("eq") + (g("mi") || 0) + (g("oeq") || 0) : null, Math.max(2, 0.005 * Math.abs(g("ta") || 0)));
    if (lvOk(g("fcfSrc"))) t("free cash flow = operating cash flow − capex", g("fcfSrc"), lvOk(g("cfo")) ? g("cfo") - (g("capex") || 0) : null, tol(g("cfo")));
  });
  out.push({ k: "ident", ok: !bad.length, l: "Statements add up (gross profit, EBITDA, balance sheet, free cash flow)", v: bad.length ? bad.slice(0, 4).join("; ") : `all ${master.length} years` });
  return out;
}
/* Compare with Yahoo Finance's own annual statements, after putting both in rupees. */
function lvCross(R, master, yfin, fxSI, fxYI) {
  if (!yfin || typeof yfin !== "object") return null;
  const map = [["Revenue", "income_statement", "Total Revenue", "rev", 0.02], ["Net income", "income_statement", "Net Income", "ni", 0.02],
    ["Total assets", "balance_sheet", "Total Assets", "ta", 0.01], ["Equity", "balance_sheet", "Stockholders Equity", "eq", 0.02],
    ["Operating cash flow", "cash_flow", "Operating Cash Flow", "cfo", 0.03], ["Total debt", "balance_sheet", "Total Debt", "debt", 0.1]];
  const rows = [];
  map.forEach(([l, sec, key, f, tol]) => {
    const m = (yfin[sec] || {})[key]; if (!m || typeof m !== "object") return;
    let worst = null, nYrs = 0, small = 0;
    master.forEach((c, j) => {
      const e = saEnd(c.end); if (!e || !R[f]) return;
      const k = Object.keys(m).find(d => d.slice(0, 7) === `${e.y}-${String(e.m).padStart(2, "0")}`);
      const yv = k != null ? m[k] : null, ov = R[f][j];
      if (!lvOk(yv) || !lvOk(ov)) return;
      const a = ov * fxSI, b = yv / 1e6 * fxYI;
      const d = Math.abs(b) > 0 ? Math.abs(a - b) / Math.abs(b) : (Math.abs(a) < 1 ? 0 : 1);
      nYrs++;
      /* a debt figure that is tiny next to the balance sheet can differ by a large percentage and still not matter */
      if (f === "debt" && d > tol && R.ta && lvOk(R.ta[j]) && Math.abs(a - b) <= 0.005 * Math.abs(R.ta[j] * fxSI)) { small++; return; }
      if (worst == null || d > worst.d) worst = { d, y: c.label };
    });
    if (nYrs) rows.push(worst ? { l, n: nYrs, d: worst.d, y: worst.y, ok: worst.d <= tol, ...(small ? { small } : {}) } : { l, n: nYrs, d: 0, y: master[0].label, ok: true, small });
  });
  return rows.length ? rows : null;
}

/* Fetch everything for one symbol. onStep gets {info, st, fx, beta, xc} states: run | ok | warn | fail | skip.
   `hint` is the search row the viewer picked (name, exchange, industry), used where a source leaves a gap. */
async function lvLoad(symbol, { onStep, signal, hint } = {}) {
  symbol = String(symbol || "").trim().toUpperCase();
  if (!symbol) throw lvErr("bad_symbol", "Enter a ticker symbol.");
  const { base, sfx } = lvSplit(symbol);
  if ((sfx === ".NS" || sfx === ".BO") && SUITE.byId[base] && !SUITE.byId[base].live) return { verified: base };
  const st = await lvStatus(), route = lvRoutes(st).quotes;
  if (!route) throw lvErr("no_live", "no live route");
  try { return await lvLoadVia(route, symbol, { onStep, signal, hint }); }
  catch (e) {
    if (route === "home" && e && e.gone && lvRoutes(st).quotes === "cloud") return lvLoadVia("cloud", symbol, { onStep, signal, hint });
    throw e;
  }
}
const lvIndustryOf = info => String((info && (info.industryDisp || info.industry || info.sectorDisp || info.sector)) || "Other");
async function lvLoadVia(route, symbol, { onStep, signal, hint }) {
  const cloud = route === "cloud", { C } = lvSplit(symbol);
  const steps = {};
  const step = (k, s, note) => { steps[k] = { s, note: note || null }; try { onStep && onStep({ ...steps }); } catch {} };
  ["info", "st", "xc"].forEach(k => step(k, "run")); step("beta", C && C.idx ? "run" : "skip"); step("fx", "wait");
  /* A bank or insurer picked from search results is known as one already: its statements aren't fetched at all. */
  const finHint = !!(hint && hint.industry && LV_FIN_RE.test(String(hint.industry)));
  const noSt = () => Promise.reject(lvErr("no_statements", "not fetched"));
  let pInfo, pFin, pSt, pChart = null;
  if (cloud) {
    pChart = lvHistory(symbol, "5y", "1mo", signal); pChart.catch(() => {});
    /* Every page costs a credit here, so a symbol that didn't come from a search is checked with one price request
       before anything else is fetched. (The same history then serves the quote and the beta.) If Yahoo's feed is
       simply not answering, the statements page decides instead. */
    if (!(hint && hint.name)) {
      try { await pChart; }
      catch (e) { if (e && (e.code === "not_found" || e.code === "cancelled" || LV_HARD.includes(e.code))) { step("info", "fail", lvMessage(e)); ["st", "xc", "beta"].forEach(k => step(k, "skip"));
        throw e.code === "not_found" ? lvErr("not_found", `Yahoo Finance has no quote for ${symbol}. Check the symbol, including its exchange suffix (for example .NS for NSE).`) : e; } }
    }
    const pCo = lvCompanyPage(symbol, signal); pCo.catch(() => {});
    pFin = pCo.then(co => finHint || LV_FIN_RE.test(String((co && co.industry) || "")), () => finHint);
    const pName = pChart.then(h => (h.meta && (h.meta.longName || h.meta.shortName)) || (hint && hint.name) || null, () => (hint && hint.name) || null);
    pSt = finHint ? noSt() : lvStatements(symbol, signal, pName, pFin);
    pSt.catch(() => {});
    pInfo = lvInfoCloud(symbol, hint, { pChart, pCo, pSt });
  } else {
    pInfo = lvCall(LV.yf, "yfinance_get_ticker_info", { symbol }, { signal, cache: 600000 });
    pFin = pInfo.then(i => finHint || LV_FIN_RE.test(lvIndustryOf(i)), () => finHint);
    pSt = finHint ? noSt() : lvStatements(symbol, signal, pInfo.then(i => (i && (i.longName || i.shortName)) || (hint && hint.name) || null, () => (hint && hint.name) || null), pFin);
  }
  const pBeta = C && C.idx ? lvBeta(symbol, C.idx, signal, pChart).catch(e => { if (e && e.code === "cancelled") throw e; return { err: e }; }) : Promise.resolve(null);
  const pYf = lvCrossData(symbol, signal).catch(e => ({ err: e }));
  pSt.catch(() => {}); pBeta.catch(() => {}); pFin.catch(() => {});
  let info;
  try { info = await pInfo; } catch (e) { step("info", "fail", lvMessage(e)); throw e; }
  if (!info || typeof info !== "object" || !(info.longName || info.shortName || info.regularMarketPrice || info.currentPrice)) {
    step("info", "fail", "Not found"); throw lvErr("not_found", `Yahoo Finance has no quote for ${symbol}. Check the symbol, including its exchange suffix (for example .NS for NSE).`);
  }
  step("info", "ok");
  const [curM, minor] = lvMajor(info.currency || "INR");
  const price = (+info.currentPrice || +info.regularMarketPrice || +info.previousClose || 0) / minor;
  const Cn = lvCountryByName(info.country) || C || lvCountry("US");
  const industryName = lvIndustryOf(info) === "Other" && hint && hint.industry ? String(hint.industry) : lvIndustryOf(info);
  const finLike = finHint || LV_FIN_RE.test(industryName);
  const profile = { sector: String(info.sectorDisp || info.sector || ""), industry: industryName, country: String(info.country || Cn.n),
    website: String(info.website || ""), employees: +info.fullTimeEmployees || null, summary: String(info.longBusinessSummary || "").slice(0, 1600),
    analyst: { rating: String(info.averageAnalystRating || ""), target: +info.targetMeanPrice / minor || null, n: +info.numberOfAnalystOpinions || null },
    pe: +info.trailingPE || null, pb: +info.priceToBook || null, ps: +info.priceToSalesTrailing12Months || null, mcapY: +info.marketCap || null,
    roe: info.returnOnEquity != null ? +info.returnOnEquity : null, margin: info.profitMargins != null ? +info.profitMargins : null };
  let st = null, stErr = null;
  try { st = await pSt; step("st", st.partial ? "skip" : "ok"); }
  catch (e) { if (finHint) step("st", "skip"); else { stErr = e; step("st", "fail", lvMessage(e)); if (e && e.code === "cancelled") throw e; } }
  const yfinRaw = await pYf, yfin = yfinRaw && !yfinRaw.err ? yfinRaw : null;
  const now = new Date().toISOString();
  const name = String(info.longName || info.shortName || (st && st.is.name) || symbol);
  const exch = String(info.fullExchangeName || info.exchange || "");
  const A = st ? lvAssemble(st) : null;
  const via = cloud || (st && st.via === "cloud") ? (cloud && (!st || st.via === "cloud") ? "cloud" : "mixed") : "home";
  const full = !!(A && A.n >= 2 && !finLike && !st.partial && ["rev", "ebit", "ni", "ta", "tl", "eq", "cfo", "ca", "cl"].every(k => A.R[k] && lvOk(A.R[k][0])));
  if (!full) {
    step("fx", "skip"); step("xc", yfin ? "ok" : "skip");
    const beta = await pBeta.catch(() => null); step("beta", beta && !beta.err ? "ok" : "skip");
    const why = finLike ? "Banks, insurers and other financial companies use a different set of accounts (loans, deposits, premiums), so the ratio, credit and working-capital tools don't apply."
      : !st ? (stErr ? lvMessage(stErr) : "No standardised statements were found.")
      : "The statements are missing lines the analysis needs (current assets and liabilities, operating income or cash flow).";
    const prof = { symbol, name, short: LV_PACK_SHORT[symbol] || lvShort(name, symbol), exch, cur: curM, price, fetchedAt: now, reason: why, finLike, profile, via,
      wkLo: +info.fiftyTwoWeekLow / minor || null, wkHi: +info.fiftyTwoWeekHigh / minor || null, beta: beta && !beta.err ? beta : null,
      key: lvKeyFigures(yfin, A, st), url: st ? st.base : null };
    lvSaveProfile(prof);
    return { profile: prof, steps };
  }
  const { R, master, n } = A;
  const flagCur = st.is.flag && LV_FLAG_CUR[st.is.flag];
  const stmtCur = st.is.curText || flagCur || lvMajor(info.financialCurrency || curM)[0];
  const yCur = lvMajor((yfin && yfin.currency) || info.financialCurrency || stmtCur)[0];
  step("fx", stmtCur === "INR" && curM === "INR" && yCur === "INR" ? "skip" : "run");
  let fxSI, fxTI, fxYI;
  try {
    [fxSI, fxTI, fxYI] = await Promise.all([lvFx(stmtCur, "INR", signal), lvFx(curM, "INR", signal), lvFx(yCur, "INR", signal)]);
    if (steps.fx.s === "run") step("fx", "ok");
  } catch (e) { step("fx", "fail", lvMessage(e)); throw e; }
  /* shares: the statements' latest count, else Yahoo's */
  const shSA = st.bs.cur["Filing Date Shares Outstanding"] || (st.bs.rows["Filing Date Shares Outstanding"] || [])[0] || (R.shTot || [])[0]
    || st.is.cur["Shares Outstanding (Basic)"] || (R.shB || [])[0];
  const shY = (+info.impliedSharesOutstanding || +info.sharesOutstanding || 0) / 1e6;
  const shares = lvOk(shSA) && shSA > 0 ? shSA : shY;
  const warns = [];
  if (lvOk(shSA) && shY > 0 && Math.abs(shSA / shY - 1) > 0.25) warns.push(`Yahoo Finance counts ${shY.toFixed(1)} million shares and the statements ${(+shSA).toFixed(1)} million. That usually means more than one share class or depositary receipts; the statements' count is used.`);
  /* sanity: market value ÷ sales here against Yahoo's figure (catches a wrong currency or unit) */
  const ttmRev = st.is.cur.Revenue || R.rev[0];
  const psOurs = lvOk(ttmRev) && ttmRev > 0 ? price * shares * fxTI / (ttmRev * fxSI) : null;
  if (lvOk(psOurs) && profile.ps > 0 && (psOurs / profile.ps > 1.45 || psOurs / profile.ps < 0.69))
    warns.push(`Market value ÷ sales works out at ${psOurs.toFixed(2)}x here against ${profile.ps.toFixed(2)}x on Yahoo Finance. Check the currency (${stmtCur} statements, ${info.currency} price) before relying on market multiples.`);
  if (!(shares > 0)) warns.push("No share count was found, so market value and per-share figures are missing.");
  /* a collapse in revenue with the balance sheet intact is a break in the series, not trading */
  { const rv = (R.rev || []).slice(0, n), tv = (R.ta || []).slice(0, n);         // newest first
    for (let j = 0; j + 1 < n; j++) if (lvOk(rv[j]) && lvOk(rv[j + 1]) && rv[j + 1] > 0 && rv[j] / rv[j + 1] < 0.6 && lvOk(tv[j]) && lvOk(tv[j + 1]) && tv[j + 1] > 0 && tv[j] / tv[j + 1] > 0.8) {
      warns.push(`Revenue falls ${Math.round((1 - rv[j] / rv[j + 1]) * 100)}% in ${master[j].label.replace(/\s+/g, "")} while total assets barely move. That pattern usually means businesses were demerged or reclassified as discontinued and the earlier years were not restated, so compare across that year with care.`); break; } }
  /* net income far above operating profit: a gain from outside operations is carrying the year */
  { const hit = [];
    for (let j = 0; j < n; j++) { const ni = R.ni && R.ni[j], eb = R.ebit && R.ebit[j], rv = R.rev && R.rev[j];
      if (lvOk(ni) && lvOk(eb) && rv > 0 && ni > 0 && ni - Math.max(eb, 0) > 0.08 * rv && ni > 1.5 * Math.max(eb, 0)) hit.push(j); }
    if (hit.length) { const j = hit[0], yr = k => master[k].label.replace(/\s+/g, ""), cr = v => `${v < 0 ? "−" : ""}₹${Math.round(Math.abs(v) * fxSI / 10).toLocaleString("en-IN")} crore`;
      const ys = hit.map(yr), when = ys.length > 1 ? ys.slice(0, -1).join(", ") + " and " + ys[ys.length - 1] : ys[0];
      warns.push(`${hit.length > 1 ? `In ${when} net income is far above operating profit (${yr(j)}: ${cr(R.ni[j])} against ${cr(R.ebit[j])})` : `In ${when} net income (${cr(R.ni[j])}) is far above operating profit (${cr(R.ebit[j])})`}. The difference comes from outside day-to-day operations, such as a demerger or disposal gain, a write-back or investment gains, so return on equity and net margin for ${hit.length > 1 ? "those years" : "that year"} overstate the underlying business.`); } }
  if (info.noYahoo) warns.push("Yahoo Finance's price feed didn't answer, so the price is the one shown on stockanalysis.com, and there is no 52-week range or beta. Refresh later for the full record.");
  const yr = saEnd(master[0].end) || { y: +String(master[0].label).replace(/\D/g, "") || new Date().getFullYear(), mon: "" };
  const yl = [0, 1, 2, 3, 4].map(i => `FY${yr.y - (4 - i)}`);
  const pad = a => { const o = (a || []).slice(0, n).reverse(); while (o.length < 5) o.unshift(null); return o; };
  const money = ["rev", "cogs", "gp", "opex", "ebit", "da", "ebitda", "int", "pbt", "tax", "ni", "sga", "mie", "cash", "ar", "rec", "inv", "ca", "ppe", "lti", "gw", "ta", "ap", "std", "ltd", "cl", "debt", "tl", "re", "eq", "mi", "dacf", "cfo", "capex", "div", "issue", "fcfSrc"];
  const rec = { id: "L:" + symbol, ticker: symbol, name, short: LV_PACK_SHORT[symbol] || lvShort(name, symbol) };
  SUITE_FIELDS.forEach(k => { const a = pad(R[k]); rec[k] = money.includes(k) ? a.map(v => lvOk(v) ? v * fxSI : v) : a; });
  const notes = [];
  if (R.cogsX && R.cogsX[0] > 0) notes.push(`Cost of revenue includes ₹${Math.round(R.cogsX[0] * fxSI / 10).toLocaleString("en-IN")} crore that the source deducts before gross profit without listing it (for a group with a lending arm, usually that arm's interest cost). Gross profit and operating profit are as reported.`);
  if (R.oeq) { rec.oeq = pad(R.oeq).map(v => lvOk(v) ? v * fxSI : v);
    if (rec.oeq[4] > 0) notes.push(`Total equity includes ₹${Math.round(rec.oeq[4] / 10).toLocaleString("en-IN")} crore of other equity instruments (typically preference shares or perpetual securities) that the source counts without listing them. They rank ahead of ordinary shareholders, so they are kept out of common equity and the DCF deducts them as preferred stock.`); }
  rec.price = price; rec.shares = shares; rec.mcap = price * shares * fxTI;
  rec.wkLo = +info.fiftyTwoWeekLow / minor || null; rec.wkHi = +info.fiftyTwoWeekHigh / minor || null;
  rec.betaYahoo = info.beta != null ? +info.beta : null;
  rec.dps = info.dividendRate != null ? +info.dividendRate / minor : (R.dpsH && lvOk(R.dpsH[0]) ? R.dpsH[0] * fxSI / fxTI : 0);
  rec.industry = "live:" + lvSlug(industryName);
  const bt = await pBeta.catch(() => null);
  rec.beta = bt && !bt.err ? bt : null;
  step("beta", rec.beta ? "ok" : steps.beta.s === "skip" ? "skip" : "warn", rec.beta ? null : (bt && bt.err ? lvMessage(bt.err) : "not enough monthly prices"));
  rec.yl = yl;
  const checks = lvChecks(R, master);
  const cross = lvCross(R, master, yfin, fxSI, fxYI);
  step("xc", cross ? (cross.every(x => x.ok) ? "ok" : "warn") : "warn", cross ? null : (yfinRaw && yfinRaw.err ? lvMessage(yfinRaw.err) : "Yahoo Finance has no annual statements to compare"));
  rec.live = { v: 2, symbol, exch, country: Cn.c, cur: curM, curRaw: String(info.currency || curM), stmtCur, fxSI, fxTI, ye: yr.mon || "", fetchedAt: now,
    priceTime: String(info.regularMarketTime || ""), group: industryName, url: st.base, checks, cross, warns, profile, idx: C && C.idx ? (C.ix || C.idx) : null,
    beta: rec.beta ? "regression" : null, years: n, via, ...(notes.length ? { notes } : {}) };
  return { rec, steps };
}
function lvKeyFigures(yfin, A, st) {
  const out = {};
  if (A && A.master.length) { const g = k => A.R[k] ? A.R[k] : null; out.years = A.master.map(c => c.label); ["rev", "ni", "ta", "eq", "cfo", "debt"].forEach(k => { if (g(k) && g(k).some(lvOk)) out[k] = g(k); }); }
  if (yfin && yfin.income_statement) {
    /* Yahoo's figures fill what the statements didn't give (all of it, when there were no statements) */
    const yrs = A && A.master.length ? A.master.map(c => { const e = saEnd(c.end); return e ? `${e.y}-${String(e.m).padStart(2, "0")}` : null; }) : null;
    const pickY = (sec, key) => { const m = (yfin[sec] || {})[key]; if (!m) return null; const ks = Object.keys(m).sort().reverse();
      if (yrs) return yrs.map(p => { const k = p && ks.find(d => d.slice(0, 7) === p); return k && lvOk(m[k]) ? m[k] / 1e6 : null; });
      out.years = out.years || ks.map(k => k.slice(0, 7)); return ks.map(k => lvOk(m[k]) ? m[k] / 1e6 : null); };
    [["rev", "income_statement", "Total Revenue"], ["ni", "income_statement", "Net Income"], ["ta", "balance_sheet", "Total Assets"], ["eq", "balance_sheet", "Stockholders Equity"], ["cfo", "cash_flow", "Operating Cash Flow"]]
      .forEach(([k, sec, key]) => { if (!out[k]) { const v = pickY(sec, key); if (v && v.some(lvOk)) out[k] = v; } });
  }
  out.cur = st && (st.is.curText || (st.is.flag && LV_FLAG_CUR[st.is.flag])) || (yfin && yfin.currency) || null;
  return out;
}

/* ── Starter pack: well-known companies in ready-made peer groups. A pack company always sits in its pack group,
      whichever route loaded it; the ones the page ships with are the "pre-loaded" library. ── */
const LV_PACK = [
  { id: "live:pack-oil-gas", name: "Oil & gas", cos: [["RELIANCE.NS", "Reliance Industries"], ["ONGC.NS", "Oil and Natural Gas Corporation (ONGC)"], ["IOC.NS", "Indian Oil Corporation"], ["BPCL.NS", "Bharat Petroleum"], ["HINDPETRO.NS", "Hindustan Petroleum"]] },
  { id: "live:pack-autos", name: "Automobiles", cos: [["MARUTI.NS", "Maruti Suzuki"], ["M&M.NS", "Mahindra & Mahindra"], ["TMPV.NS", "Tata Motors Passenger Vehicles"], ["HEROMOTOCO.NS", "Hero MotoCorp"], ["EICHERMOT.NS", "Eicher Motors"], ["TVSMOTOR.NS", "TVS Motor"]] },
  { id: "live:pack-power", name: "Power utilities", cos: [["NTPC.NS", "NTPC"], ["POWERGRID.NS", "Power Grid Corporation"], ["TATAPOWER.NS", "Tata Power"], ["JSWENERGY.NS", "JSW Energy"]] },
  { id: "live:pack-adani", name: "Adani group", cos: [["ADANIENT.NS", "Adani Enterprises"], ["ADANIPORTS.NS", "Adani Ports"], ["ADANIPOWER.NS", "Adani Power"], ["ADANIGREEN.NS", "Adani Green Energy"]] },
  { id: "live:pack-engineering", name: "Engineering & defence", cos: [["LT.NS", "Larsen & Toubro"], ["SIEMENS.NS", "Siemens India"], ["ABB.NS", "ABB India"], ["BEL.NS", "Bharat Electronics"], ["HAL.NS", "Hindustan Aeronautics"]] },
  { id: "live:pack-consumer", name: "Consumer & retail", cos: [["ITC.NS", "ITC"], ["NESTLEIND.NS", "Nestlé India"], ["TITAN.NS", "Titan"], ["DMART.NS", "Avenue Supermarts (DMart)"], ["TRENT.NS", "Trent"]] },
  { id: "live:pack-metals", name: "Metals & mining", cos: [["HINDALCO.NS", "Hindalco"], ["VEDL.NS", "Vedanta"], ["COALINDIA.NS", "Coal India"], ["NMDC.NS", "NMDC"]] },
  { id: "live:pack-telecom", name: "Telecom", cos: [["BHARTIARTL.NS", "Bharti Airtel"], ["INDUSTOWER.NS", "Indus Towers"], ["IDEA.NS", "Vodafone Idea"]] },
  { id: "live:pack-internet", name: "Internet platforms", cos: [["ETERNAL.NS", "Eternal (Zomato)"], ["SWIGGY.NS", "Swiggy"], ["NAUKRI.NS", "Info Edge (Naukri)"], ["NYKAA.NS", "Nykaa (FSN E-Commerce)"], ["PAYTM.NS", "Paytm (One97 Communications)"]] },
  { id: "live:pack-hospitals", name: "Hospitals", cos: [["APOLLOHOSP.NS", "Apollo Hospitals"], ["MAXHEALTH.NS", "Max Healthcare"], ["FORTIS.NS", "Fortis Healthcare"]] },
  { id: "live:pack-us-tech", name: "US big tech", cos: [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet (Google)"], ["AMZN", "Amazon"], ["NVDA", "Nvidia"], ["META", "Meta Platforms"], ["TSLA", "Tesla"]] },
  { id: "live:pack-us-consumer", name: "US consumer", cos: [["WMT", "Walmart"], ["KO", "Coca-Cola"], ["PG", "Procter & Gamble"], ["MCD", "McDonald's"], ["NKE", "Nike"]] },
  { id: "live:pack-global", name: "Global leaders", cos: [["7203.T", "Toyota"], ["005930.KS", "Samsung Electronics"], ["2330.TW", "TSMC"], ["NESN.SW", "Nestlé"], ["SHEL.L", "Shell"], ["MC.PA", "LVMH"], ["SAP.DE", "SAP"]] },
];
/* Banks and insurers come as profiles: their accounts don't fit the industrial-company tools. */
const LV_PACK_PROFILES = [["HDFCBANK.NS", "HDFC Bank"], ["ICICIBANK.NS", "ICICI Bank"], ["SBIN.NS", "State Bank of India"], ["KOTAKBANK.NS", "Kotak Mahindra Bank"], ["AXISBANK.NS", "Axis Bank"], ["BAJFINANCE.NS", "Bajaj Finance"], ["LICI.NS", "Life Insurance Corporation"]];
const LV_PACK_OF = {};
LV_PACK.forEach(g => g.cos.forEach(([s]) => { LV_PACK_OF[s] = g; }));
/* Labels for charts and tables where the first words of the registered name don't say which company it is. */
const LV_PACK_SHORT = { "ONGC.NS": "ONGC", "M&M.NS": "M&M", "TATAPOWER.NS": "Tata Power", "TVSMOTOR.NS": "TVS Motor", "HAL.NS": "HAL", "SIEMENS.NS": "Siemens India", "DMART.NS": "DMart",
  "ETERNAL.NS": "Eternal (Zomato)", "NAUKRI.NS": "Info Edge", "NYKAA.NS": "Nykaa", "PAYTM.NS": "Paytm", "AMZN": "Amazon", "2330.TW": "TSMC", "005930.KS": "Samsung", "MC.PA": "LVMH",
  "SBIN.NS": "SBI", "LICI.NS": "LIC", "KOTAKBANK.NS": "Kotak Bank" };
const LV_PACK_N = LV_PACK.reduce((t, g) => t + g.cos.length, 0) + LV_PACK_PROFILES.length;

/* ── Registry: live companies become ordinary suite companies ── */
const LV_KEY = "vs:live2";
const LV_RECS = {}, LV_ORDER = [], LV_EXTRAS = {}, LV_PROFILES = {}, LV_GROUPS = {};
const LV_REMOVED = {};                                 // id or "P:symbol" → when it was removed, so the viewer's other devices drop it too
const LV_LIB = { at: null, byId: {}, prof: {}, n: 0 }; // companies the page ships with
let LV_META_AT = "";                                   // when the viewer last changed their own lists (or removed something) on this device
let LV_VER = 0;
const LV_SUBS = new Set();
const lvBump = () => { LV_VER++; LV_SUBS.forEach(f => { try { f(); } catch {} }); };
function useLive() { return React.useSyncExternalStore(f => { LV_SUBS.add(f); return () => LV_SUBS.delete(f); }, () => LV_VER, () => LV_VER); }
/* The sync layer listens here: kind is "rec", "prof", "gone" or "meta". */
let LV_ON_CHANGE = null;
const lvTouch = (kind, key) => { if (kind === "meta" || kind === "gone") { LV_META_AT = new Date().toISOString(); lvSave(); } try { LV_ON_CHANGE && LV_ON_CHANGE(kind, key); } catch {} };
function lvSave() {
  try { localStorage.setItem(LV_KEY, JSON.stringify({ v: 2, cos: LV_ORDER.map(id => LV_RECS[id]).filter(Boolean), extras: LV_EXTRAS, profiles: LV_PROFILES, groups: LV_GROUPS, gone: LV_REMOVED, metaAt: LV_META_AT })); } catch {}
}
const lvProfile = sym => LV_PROFILES[sym] || LV_LIB.prof[sym] || null;
const lvProfiles = () => [...Object.values(LV_PROFILES), ...Object.values(LV_LIB.prof).filter(p => !LV_PROFILES[p.symbol])];
function lvSaveProfile(p, quiet) { LV_PROFILES[p.symbol] = p; delete LV_REMOVED["P:" + p.symbol]; lvSave(); if (!quiet) lvTouch("prof", p.symbol); lvBump(); }
function lvRemoveProfile(sym, quiet) {
  if (!LV_PROFILES[sym]) return;
  delete LV_PROFILES[sym];
  if (!quiet) LV_REMOVED["P:" + sym] = new Date().toISOString();
  lvSave(); if (!quiet) lvTouch("gone", "P:" + sym); lvBump();
}
/* quiet: the record came from the viewer's other device or the page itself, so it isn't sent back to the store.
   lib: one of the companies the page ships with. */
function lvRegister(rec, save = true, lib = false, quiet = false) {
  const o = { ...rec };
  if (lib) o.lib = true;
  const pg = LV_PACK_OF[o.ticker];
  if (pg) { o.industry = pg.id; o.live = { ...o.live, group: pg.name }; }
  SUITE_FIELDS.forEach(f => { if (!Array.isArray(o[f]) || o[f].length !== 5) o[f] = [null, null, null, null, null]; });
  if (o.oeq !== undefined && (!Array.isArray(o.oeq) || o.oeq.length !== 5)) delete o.oeq;
  const shortClash = SUITE.cos.some(x => x.id !== o.id && x.short === o.short);
  if (shortClash) o.short = `${o.short} (${lvSplit(o.ticker).base})`;
  const prev = SUITE.byId[o.id];
  if (prev) { const k = SUITE.cos.indexOf(prev); if (k >= 0) SUITE.cos[k] = o; else SUITE.cos.push(o); } else SUITE.cos.push(o);
  SUITE.byId[o.id] = o;
  SUITE_R[o.id] = SUITE.years.map((_, i) => { try { return suiteRatios(o, i); } catch { return {}; } });
  const was = SUITE.indOf[o.id];
  if (was && was !== o.industry && !(LV_EXTRAS[was] || []).includes(o.id)) { const G = SUITE.ind.find(x => x.id === was); if (G) G.cos = G.cos.filter(x => x !== o.id); }
  let g = SUITE.ind.find(x => x.id === o.industry);
  if (!g) { g = { id: o.industry, name: o.live.group, cos: [], note: null, live: true, pack: !!pg }; SUITE.ind.push(g); }
  if (!g.cos.includes(o.id)) g.cos.push(o.id);
  SUITE.indOf[o.id] = g.id;
  Object.entries(LV_EXTRAS).forEach(([gid, ids]) => { const G = SUITE.ind.find(x => x.id === gid); if (G && ids.includes(o.id) && !G.cos.includes(o.id)) G.cos.push(o.id); });
  if (!lib) {
    LV_RECS[o.id] = rec;
    if (!LV_ORDER.includes(o.id)) LV_ORDER.push(o.id);
    delete LV_REMOVED[o.id];
    if (LV_PROFILES[rec.ticker]) { delete LV_PROFILES[rec.ticker]; if (!quiet) { LV_REMOVED["P:" + rec.ticker] = new Date().toISOString(); lvTouch("gone", "P:" + rec.ticker); } }
  }
  if (save) lvSave();
  if (!lib && !quiet) lvTouch("rec", o.id);
  lvBump();
  return o;
}
/* A list of companies the viewer put together (a sector browse, say), kept between visits. */
function lvEnsureGroup(gid, name) {
  let G = SUITE.ind.find(x => x.id === gid);
  if (!G) { G = { id: gid, name, cos: [], note: null, live: true }; SUITE.ind.push(G); }
  if (!LV_GROUPS[gid] && gid.startsWith("live:")) { LV_GROUPS[gid] = name; lvSave(); lvTouch("meta"); }
  return G;
}
function lvAddToGroup(id, gid) {
  const G = SUITE.ind.find(x => x.id === gid);
  if (!G || !SUITE.byId[id]) return false;
  if (!G.cos.includes(id)) G.cos.push(id);
  if (SUITE.indOf[id] !== gid) { LV_EXTRAS[gid] = LV_EXTRAS[gid] || []; if (!LV_EXTRAS[gid].includes(id)) LV_EXTRAS[gid].push(id); }
  lvSave(); lvTouch("meta"); lvBump();
  return true;
}
function lvDropFromGroup(id, gid) {
  const G = SUITE.ind.find(x => x.id === gid);
  if (!G || SUITE.indOf[id] === gid) return false;
  G.cos = G.cos.filter(x => x !== id);
  if (LV_EXTRAS[gid]) { LV_EXTRAS[gid] = LV_EXTRAS[gid].filter(x => x !== id); if (!LV_EXTRAS[gid].length) delete LV_EXTRAS[gid]; }
  lvSave(); lvTouch("meta"); lvBump();
  try { SuiteSel.refresh(); } catch {}
  return true;
}
/* Remove the viewer's copy of a live company. A pre-loaded company falls back to the copy the page ships with. */
function lvRemove(id, quiet) {
  const o = SUITE.byId[id];
  if (!o || !o.live || (o.lib && !LV_RECS[id])) return;
  const k = SUITE.cos.indexOf(o); if (k >= 0) SUITE.cos.splice(k, 1);
  delete SUITE.byId[id]; delete SUITE_R[id]; delete SUITE.indOf[id];
  SUITE.ind.forEach(g => { g.cos = g.cos.filter(x => x !== id); });
  delete LV_RECS[id];
  const j = LV_ORDER.indexOf(id); if (j >= 0) LV_ORDER.splice(j, 1);
  if (!quiet) LV_REMOVED[id] = new Date().toISOString();
  if (LV_LIB.byId[id]) lvRegister(LV_LIB.byId[id], false, true);
  else Object.keys(LV_EXTRAS).forEach(g => { LV_EXTRAS[g] = LV_EXTRAS[g].filter(x => x !== id); if (!LV_EXTRAS[g].length) delete LV_EXTRAS[g]; });
  for (let n = SUITE.ind.length - 1; n >= 0; n--) if (SUITE.ind[n].live && !SUITE.ind[n].cos.length) { delete LV_GROUPS[SUITE.ind[n].id]; SUITE.ind.splice(n, 1); }
  lvSave(); if (!quiet) lvTouch("gone", id); lvBump();
  try { SuiteSel.refresh(); } catch {}
}
function lvLibInit() {
  const L = LV_LIB_RAW;
  if (!L || typeof L !== "object") return;
  LV_LIB.at = L.at || null;
  (Array.isArray(L.recs) ? L.recs : []).forEach(r => { try { if (r && r.id && r.live) { LV_LIB.byId[r.id] = r; lvRegister(r, false, true); LV_LIB.n++; } } catch {} });
  (Array.isArray(L.profiles) ? L.profiles : []).forEach(p => { if (p && p.symbol) { LV_LIB.prof[p.symbol] = p; LV_LIB.n++; } });
}
function lvRestore() {
  let j = null;
  try { j = JSON.parse(localStorage.getItem(LV_KEY)); } catch {}
  if (!j || j.v !== 2) return;
  Object.assign(LV_EXTRAS, j.extras && typeof j.extras === "object" ? j.extras : {});
  if (j.gone && typeof j.gone === "object") Object.assign(LV_REMOVED, j.gone);
  if (typeof j.metaAt === "string") LV_META_AT = j.metaAt;
  Object.entries(j.groups && typeof j.groups === "object" ? j.groups : {}).forEach(([gid, name]) => {
    LV_GROUPS[gid] = name; if (!SUITE.ind.find(x => x.id === gid)) SUITE.ind.push({ id: gid, name, cos: [], note: null, live: true }); });
  (Array.isArray(j.cos) ? j.cos : []).forEach(r => { try {
    if (!r || !r.id || !r.live) return;
    const L = LV_LIB.byId[r.id];
    if (L && String(L.live.fetchedAt) >= String(r.live.fetchedAt)) return;       // the page's own copy is newer
    lvRegister(r, false, false, true);
  } catch {} });
  Object.entries(LV_EXTRAS).forEach(([gid, ids]) => { const G = SUITE.ind.find(x => x.id === gid); if (!G) return; ids.forEach(id => { if (SUITE.byId[id] && !G.cos.includes(id)) G.cos.push(id); }); });
  if (j.profiles && typeof j.profiles === "object") Object.entries(j.profiles).forEach(([s, p]) => { if (p && p.symbol && !SUITE.byId["L:" + s]) LV_PROFILES[s] = p; });
  for (let k = SUITE.ind.length - 1; k >= 0; k--) if (SUITE.ind[k].live && !SUITE.ind[k].cos.length) { delete LV_GROUPS[SUITE.ind[k].id]; SUITE.ind.splice(k, 1); }
}
lvLibInit();
lvRestore();
const lvWhen = iso => { try { const d = new Date(iso); return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return String(iso || ""); } };
const lvDay = iso => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return String(iso || ""); } };

/* ── What's on this device: verified, pre-loaded, loaded by the viewer, and profiles ── */
function lvHave(symbol) {
  const s = String(symbol || "").toUpperCase(), { base, sfx } = lvSplit(s);
  if ((sfx === ".NS" || sfx === ".BO") && SUITE.byId[base] && !SUITE.byId[base].live) return { kind: "verified", id: base };
  const c = SUITE.byId["L:" + s];
  if (c) return { kind: c.lib ? "lib" : "loaded", id: c.id };
  if (lvProfile(s)) return { kind: "profile", symbol: s };
  return null;
}
function lvLocalSearch(q) {
  const raw = String(q || "").trim().toLowerCase(), n = lvNorm(q);
  if (raw.length < 2) return [];
  const score = (...hay) => { let best = 0;
    hay.filter(Boolean).map(h => String(h).toLowerCase()).forEach(h => { const s = h === raw ? 4 : h.startsWith(raw) ? 3 : new RegExp("(^|[^a-z0-9])" + raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(h) ? 2 : h.includes(raw) ? 1 : 0; if (s > best) best = s; });
    if (!best && n.length > 2 && hay.some(h => lvNorm(h).includes(n))) best = 1;
    return best; };
  const rows = [];
  SUITE.cos.forEach(c => {
    const sym = c.live ? c.ticker : c.ticker + ".NS", s = score(c.name, c.short, c.ticker, sym, lvSplit(sym).base, (LV_PACK_OF[sym] || { cos: [] }).cos.filter(x => x[0] === sym).map(x => x[1])[0]);
    const industry = c.live ? (c.live.profile && c.live.profile.industry) || c.live.group : SX.ind(SUITE.indOf[c.id]).name;
    /* a word from the industry ("paints", "cement") lists that industry's companies, below any match on a name */
    const byInd = !s && raw.length > 2 && [industry, SX.ind(SUITE.indOf[c.id]).name].some(x => String(x || "").toLowerCase().includes(raw)) ? 0.5 : 0;
    if (s || byInd) rows.push({ symbol: sym, name: c.name, exch: c.live ? c.live.exch : "NSE", sector: "", score: s || byInd, id: c.id, industry, local: c.live ? (c.lib ? "lib" : "loaded") : "verified" });
  });
  lvProfiles().forEach(p => { const s = score(p.name, p.short, p.symbol, lvSplit(p.symbol).base);
    if (s) rows.push({ symbol: p.symbol, name: p.name, exch: p.exch, sector: p.profile.sector, industry: p.profile.industry, score: s, local: "profile" }); });
  return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
/* Local matches first, then live ones that aren't already on the device. */
function lvMergeSearch(local, live) {
  const seen = new Set(local.map(r => r.symbol)), out = [...local];
  (live || []).forEach(r => { if (seen.has(r.symbol)) return; seen.add(r.symbol); const h = lvHave(r.symbol); out.push(h ? { ...r, local: h.kind, id: h.id } : r); });
  return out;
}
function lvPackStatus() {
  const groups = LV_PACK.map(g => ({ id: g.id, name: g.name, cos: g.cos.map(([symbol, name]) => { const h = lvHave(symbol); return { symbol, name, have: h ? h.kind : null, id: h && h.id }; }) }));
  const profs = LV_PACK_PROFILES.map(([symbol, name]) => ({ symbol, name, have: lvProfile(symbol) ? "profile" : null }));
  const all = [...groups.flatMap(g => g.cos), ...profs];
  return { groups, profs, total: all.length, have: all.filter(x => x.have).length, missing: all.filter(x => !x.have).map(x => x.symbol) };
}
