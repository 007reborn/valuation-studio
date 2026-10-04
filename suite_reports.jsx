/* ═══════════════════════════════════════════════════════════════════════
   REPORTS — find a company's annual report, results, presentations, call
   transcripts, rating rationales or SEC filings; load the whole document
   (live through the home computer's Tavily and SEC EDGAR servers or the
   Firecrawl connector, or a PDF/text file the viewer picks);
   read it in parts, search it, and ask Claude about it with citations.
   Documents are kept in this browser (IndexedDB) for the next visit.
   ═══════════════════════════════════════════════════════════════════════ */
const RP_KINDS = [
  ["ar", "Annual report", "annual report pdf"],
  ["results", "Quarterly results", "quarterly results press release"],
  ["ppt", "Investor presentation", "investor presentation pdf"],
  ["call", "Earnings call transcript", "earnings call transcript"],
  ["rating", "Credit rating rationale", "credit rating rationale"],
  ["any", "Any document", ""],
];
const RP = { docs: [], cur: null, ver: 0, subs: new Set(), loaded: false };
const rpBump = () => { RP.ver++; RP.subs.forEach(f => { try { f(); } catch {} }); };
function useDocs() { return React.useSyncExternalStore(f => { RP.subs.add(f); return () => RP.subs.delete(f); }, () => RP.ver, () => RP.ver); }
const rpCur = () => RP.docs.find(d => d.key === RP.cur) || null;
/* a citation elsewhere on the page ([Part 12]) asks the reader to show that part */
function rpJump(n) { if (!rpCur()) return; RP.jumpTo = { n, at: Date.now() }; rpBump(); }
function rpAdd(doc) { RP.docs = [doc, ...RP.docs.filter(d => d.key !== doc.key)].slice(0, 8); RP.cur = doc.key; rpBump(); idbPut(doc); }
function rpOpen(key) { RP.cur = key; rpBump(); }
function rpClose(key) { RP.docs = RP.docs.filter(d => d.key !== key); if (RP.cur === key) RP.cur = null; rpBump(); idbDel(key); }

/* ── IndexedDB: documents survive a reload in this browser ── */
let IDB_P = null;
function idbOpen() {
  if (!IDB_P) IDB_P = new Promise(res => {
    try { const r = indexedDB.open("vs-docs", 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore("docs", { keyPath: "key" }); } catch {} };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); }
    catch { res(null); }
  });
  return IDB_P;
}
async function idbPut(doc) { try { const db = await idbOpen(); if (!db) return; db.transaction("docs", "readwrite").objectStore("docs").put(doc); } catch {} }
async function idbDel(key) { try { const db = await idbOpen(); if (!db) return; db.transaction("docs", "readwrite").objectStore("docs").delete(key); } catch {} }
async function idbAll() {
  try { const db = await idbOpen(); if (!db) return [];
    return await new Promise(res => { const out = []; const q = db.transaction("docs").objectStore("docs").openCursor();
      q.onsuccess = e => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else res(out); }; q.onerror = () => res([]); }); }
  catch { return []; }
}
function rpRestore() {
  if (RP.loaded) return; RP.loaded = true;
  idbAll().then(all => { if (!all.length) return; const keep = all.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    RP.docs = [...RP.docs, ...keep.filter(d => !RP.docs.some(x => x.key === d.key))]; rpBump();
    all.slice(8).forEach(d => idbDel(d.key)); });
}

/* ── Text handling ── */
function rpSplit(text) {
  const T = String(text || "").replace(/\r/g, "").replace(/\u0000/g, ""), parts = [], MAX = 3600;
  let i = 0;
  while (i < T.length) {
    let end = Math.min(T.length, i + MAX);
    if (end < T.length) {
      const seg = T.slice(i, end);
      let cut = seg.lastIndexOf("\n\n");
      if (cut < MAX * 0.5) cut = seg.lastIndexOf("\n");
      if (cut < MAX * 0.5) cut = Math.max(seg.lastIndexOf(". "), seg.lastIndexOf("? "), seg.lastIndexOf("! "), seg.lastIndexOf(".\n")) + 1;
      if (cut < MAX * 0.4) cut = seg.lastIndexOf(" ");
      if (cut > 0) end = i + cut;
    }
    const t = T.slice(i, end).trim();
    if (t) parts.push({ n: parts.length + 1, label: `Part ${parts.length + 1}`, text: t });
    i = end;
  }
  return parts;
}
/* PDFs whose fonts carry no text map come out as symbols; flag them rather than pretend. */
function rpGarbled(text) {
  const s = String(text || "").slice(0, 60000), letters = s.match(/\p{L}/gu) || [];
  if (letters.length < 200) return false;
  const odd = letters.filter(ch => /[Ā-˿Ͱ-Ͽ]/.test(ch)).length;
  return odd / letters.length > 0.15;
}
const RP_SECTIONS = [["Chairman's or CEO's letter", /chairman'?s?\s+(message|letter|statement|speech)|letter to (the )?(share|stake)holders|message from the (chairman|ceo|managing director)/i],
  ["Management discussion & analysis", /management'?s? discussion (and|&) analysis/i], ["Directors' report", /\b(directors'?|board'?s?) report\b/i],
  ["Risk factors / risk management", /\brisk factors\b|\brisk management\b|\bprincipal risks\b/i], ["Outlook and guidance", /\boutlook\b|\bguidance\b/i],
  ["Segment results", /\bsegment(al)? (information|reporting|results|performance)\b/i], ["Corporate governance", /report on corporate governance|corporate governance report/i],
  ["Auditor's report", /independent auditor'?s'? report|report of independent registered public accounting firm/i], ["Key / critical audit matters", /\b(key|critical) audit matters?\b/i],
  ["Balance sheet", /balance sheets? as (at|of)|consolidated balance sheets?/i], ["Profit and loss", /statements? of profit and loss|consolidated statements? of (income|operations|comprehensive income)/i],
  ["Cash flow statement", /statements? of cash flows?|cash flow statement/i], ["Related-party transactions", /related[- ]party (transactions|disclosures)/i],
  ["Contingent liabilities", /contingent liabilit/i], ["Borrowings and debt", /\bborrowings\b|\bdebt maturit/i]];
function rpSections(parts) {
  const skip = Math.max(2, Math.floor(parts.length * 0.03));
  return RP_SECTIONS.map(([name, re]) => {
    const hits = parts.filter(p => re.test(p.text)).map(p => p.n);
    const n = hits.find(x => x > skip) || hits[0];
    return n ? { name, part: n } : null;
  }).filter(Boolean);
}
function rpMake({ title, src, url, company, kind, text, pages }) {
  const parts = pages ? pages.map((t, i) => ({ n: i + 1, label: `Page ${i + 1}`, text: String(t || "").trim() })) : rpSplit(text);
  const chars = parts.reduce((t, p) => t + p.text.length, 0);
  const full = parts.map(p => p.text).join("\n");
  return { key: `${src}:${url || title}`, title: title || url || "Document", src, url: url || "", company: company || "", kind: kind || "any", parts,
    unit: pages ? "page" : "part", chars, at: new Date().toISOString(), garbled: rpGarbled(full), sections: rpSections(parts) };
}
/* Find every occurrence of a phrase */
function rpFind(doc, q, limit = 400) {
  const needle = String(q || "").trim().toLowerCase();
  if (!doc || needle.length < 2) return [];
  const hits = [];
  for (const p of doc.parts) {
    const low = p.text.toLowerCase();
    let k = low.indexOf(needle);
    while (k >= 0 && hits.length < limit) { hits.push({ part: p.n, at: k, snip: p.text.slice(Math.max(0, k - 80), k + needle.length + 100) }); k = low.indexOf(needle, k + needle.length); }
    if (hits.length >= limit) break;
  }
  return hits;
}
/* Rank parts for a question: term frequency × rarity, with a bonus for the exact phrase. */
const RP_STOP = new Set("the a an and or of to in on for by with at from as is are was were be been it its this that these those what which who how why when where does do did has have had their there than then into about over under per not no can will would should could may might our your we you they them he she his her i me my all any each more most other some such only own same so too very just also if but".split(" "));
const rpTerms = q => [...new Set(String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s&-]/gu, " ").split(/\s+/).filter(w => w.length > 2 && !RP_STOP.has(w)))];
function rpRank(doc, query, k = 6, win = 1800) {
  if (!doc) return [];
  const terms = rpTerms(query), phrase = String(query || "").trim().toLowerCase(), N = doc.parts.length;
  if (!terms.length) return [];
  const lows = doc.parts.map(p => p.text.toLowerCase());
  const df = terms.map(t => lows.filter(l => l.includes(t)).length);
  const scored = doc.parts.map((p, i) => {
    let s = 0;
    terms.forEach((t, j) => { if (!df[j]) return; const cnt = lows[i].split(t).length - 1; if (cnt) s += (1 + Math.log(cnt)) * Math.log(1 + N / df[j]); });
    if (phrase.length > 5 && lows[i].includes(phrase)) s += 3;
    return { p, s, i };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k);
  return scored.map(({ p, i }) => {
    const low = lows[i], at = Math.max(0, ...terms.map(t => low.indexOf(t)).filter(x => x >= 0).slice(0, 1));
    const from = Math.max(0, Math.min(at - win / 3, p.text.length - win));
    return { part: p.n, label: p.label, text: (from > 0 ? "…" : "") + p.text.slice(from, from + win) + (from + win < p.text.length ? "…" : "") };
  });
}
const RP_THEMES = ["revenue growth profit margin performance highlights", "outlook guidance strategy expansion capacity capex plans", "risk risks challenges headwinds uncertainty",
  "debt borrowings liquidity cash flow working capital", "dividend buyback shareholders capital allocation", "segment segments business division volume",
  "auditor opinion key audit matters qualification emphasis", "related party contingent liabilities litigation pledge"];
function rpDigest(doc, budget = 42000) {
  const picked = new Map();
  doc.parts.slice(0, 2).forEach(p => picked.set(p.n, p.text.slice(0, 2500)));
  for (const th of RP_THEMES) for (const r of rpRank(doc, th, 3, 2600)) if (!picked.has(r.part)) picked.set(r.part, r.text);
  const out = []; let used = 0;
  [...picked.entries()].sort((a, b) => a[0] - b[0]).forEach(([n, t]) => { if (used + t.length > budget) return; out.push(`[${doc.unit === "page" ? "Page" : "Part"} ${n}]\n${t}`); used += t.length; });
  return out.join("\n\n");
}
const rpRef = doc => doc.unit === "page" ? "Page" : "Part";

/* ── Loading documents ── */
const rpHost = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
async function rpFetchUrl(url, meta, signal) {
  const d = await lvWebExtract(url, signal);
  if (!d || d.raw.length < 200) throw lvErr("no_text", "No readable text came back from that link. If it's a PDF, download it and use Upload a file.");
  const base = { ...meta, title: meta.title || d.title || rpHost(url), url };
  const doc = d.pages ? rpMake({ ...base, src: "pdf", pages: d.pages }) : rpMake({ ...base, src: "web", text: d.raw });
  /* away from home a PDF is read a page a credit, so only its first pages come back */
  if (d.pdf && d.got && d.total && d.total > d.got) doc.note = `This is the first ${d.got} of ${d.total} pages. Away from the home computer each PDF page uses a Firecrawl credit, so the rest wasn't read. To read all of it, download the PDF and use Upload a file, which reads it on this device for nothing.`;
  return doc;
}
async function rpFetchSec(ticker, f, meta, onProgress, signal) {
  const chunks = []; let offset = 0, total = null;
  for (let k = 0; k < 10; k++) {
    const r = await lvCall(LV.sec, "get_filing_content", { identifier: ticker, accession_number: f.accession_number, offset, max_chars: 100000 }, { signal, cache: 86400000 });
    if (!r || r.success === false || typeof r.content !== "string") throw lvErr("tool_error", (r && r.error) || "The filing couldn't be read.", { server: LV.sec });
    chunks.push(r.content); total = +r.total_chars || null;
    onProgress && onProgress(total ? Math.min(1, (offset + r.content.length) / total) : null);
    if (r.next_offset == null || !total || r.next_offset >= total || !r.content.length) break;
    offset = +r.next_offset;
  }
  let text = chunks.join("");
  const start = text.search(/UNITED STATES\s+SECURITIES AND EXCHANGE COMMISSION/i);
  if (start > 0 && start < text.length * 0.4) text = text.slice(start);
  return rpMake({ ...meta, title: `${f.company_name || ticker} · Form ${f.form_type} for the period to ${String(f.period_of_report || "").slice(0, 10)}`, src: "sec", url: f.url || `SEC ${f.accession_number}`, text });
}
/* pdf.js from cdnjs, loaded only when a PDF is opened; the worker script runs on the page's own thread. */
let PDFJS_P = null;
function loadPdfJs() {
  if (!PDFJS_P) PDFJS_P = new Promise((res, rej) => {
    const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    const add = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = () => no(new Error("load")); document.head.appendChild(s); });
    add(base + "pdf.min.js").then(() => add(base + "pdf.worker.min.js")).then(() => {
      const L = window.pdfjsLib; if (!L) throw new Error("pdf.js missing");
      try { L.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; } catch {}
      res(L);
    }).catch(e => { PDFJS_P = null; rej(e); });
  });
  return PDFJS_P;
}
async function rpReadFile(file, meta, onProgress, signal) {
  const name = file.name || "document";
  if (/\.(txt|md|csv|html?)$/i.test(name) || /^text\//.test(file.type)) {
    let text = await file.text();
    if (/\.html?$/i.test(name)) { const d = new DOMParser().parseFromString(text, "text/html"); text = d.body ? d.body.innerText || d.body.textContent || "" : text; }
    return rpMake({ ...meta, title: meta.title || name, src: "file", url: name, text });
  }
  const L = await loadPdfJs();
  const pdf = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    if (signal && signal.aborted) throw lvErr("cancelled", "cancelled");
    const tc = await (await pdf.getPage(i)).getTextContent();
    let s = "";
    tc.items.forEach(it => { s += (it.str || ""); s += it.hasEOL ? "\n" : " "; });
    pages.push(s.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim());
    if (i % 5 === 0 || i === pdf.numPages) { onProgress && onProgress(i / pdf.numPages, `Reading page ${i} of ${pdf.numPages}`); await new Promise(r => setTimeout(r, 0)); }
  }
  try { pdf.destroy(); } catch {}
  return rpMake({ ...meta, title: meta.title || name.replace(/\.pdf$/i, ""), src: "pdf", url: name, pages });
}

/* ── Finding documents ── */
async function rpSearch(subject, kind, year, extra, signal) {
  const K = RP_KINDS.find(k => k[0] === kind) || RP_KINDS[0];
  const q = [subject.name, K[2], year, extra].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const dom = rpHost(subject.website);
  const cloud = lvRoutes(await lvStatus()).web === "cloud";         // each search costs credits there: the exchange search is left out
  const jobs = [lvWebSearch({ query: q, max: 10 }, signal)];
  if (dom) jobs.push(lvWebSearch({ query: [K[2] || "report", year, extra].filter(Boolean).join(" "), domains: [dom], max: 8 }, signal));
  if (!cloud && subject.india && (kind === "ar" || kind === "results")) jobs.push(lvWebSearch({ query: q, domains: ["bseindia.com", "nseindia.com"], max: 6 }, signal));
  const settled = await Promise.allSettled(jobs);
  if (settled.every(s => s.status === "rejected")) throw settled[0].reason;
  const seen = new Set(), rows = [];
  settled.forEach((s, j) => { if (s.status !== "fulfilled") return; s.value.forEach(r => {
    const u = r.url.split("#")[0]; if (!u || seen.has(u)) return; seen.add(u);
    const host = rpHost(u);
    rows.push({ ...r, url: u, host, pdf: /\.pdf($|\?)/i.test(u), own: !!dom && host.endsWith(dom), exch: /bseindia|nseindia/.test(host), pass: j }); }); });
  const words = rpTerms(subject.short || subject.name);
  const score = r => (r.own ? 4 : 0) + (r.exch ? 2 : 0) + (r.pdf ? 2 : 0) + (words.some(w => (r.title + " " + r.snippet).toLowerCase().includes(w)) ? 2 : -3);
  return rows.sort((a, b) => score(b) - score(a)).slice(0, 14);
}
async function rpSecList(ticker, signal) {
  const get = (form, days, limit) => lvCall(LV.sec, "get_recent_filings", { identifier: ticker, form_type: form, days, limit }, { signal, cache: 3600000 })
    .then(r => (r && Array.isArray(r.filings) ? r.filings : []).map(f => ({ ...f, url: f.url || "" })));
  const [k, q] = await Promise.all([get("10-K", 800, 2), get("10-Q", 200, 2).catch(() => [])]);
  const seen = new Set();
  return [...k, ...q].filter(f => f.accession_number && !seen.has(f.accession_number) && seen.add(f.accession_number));
}

/* ── UI ── */
function rsSubject(sel) {
  const r = ResearchSel.get();
  if (r && r.profile && lvProfile(r.profile)) {
    const p = lvProfile(r.profile);
    return { kind: "profile", p, key: "P:" + p.symbol, name: p.name, short: p.short, ticker: p.symbol, website: p.profile.website, country: p.profile.country,
      india: /\.(NS|BO)$/.test(p.symbol), us: lvSplit(p.symbol).sfx === "" };
  }
  const c = SX.co(sel.focus);
  return { kind: "co", c, key: c.id, name: c.name, short: c.short, ticker: c.live ? c.ticker : c.ticker + ".NS", website: c.live ? c.live.profile.website : "",
    country: c.live ? c.live.profile.country : "India", india: !c.live || c.live.country === "IN", us: !!(c.live && c.live.country === "US" && lvSplit(c.ticker).sfx === "") };
}
const rpYearGuess = s => { const y = new Date().getFullYear(), m = new Date().getMonth() + 1; return s.india ? (m >= 7 ? `${y - 1}-${String(y).slice(2)}` : `${y - 2}-${String(y - 1).slice(2)}`) : String(m >= 4 ? y - 1 : y - 2); };

function ReportsCard({ subject, flash, addLog }) {
  const T = useT();
  const routes = useRoutes();
  useDocs();
  useEffect(() => { rpRestore(); }, []);
  const [kind, setKind] = useState("ar");
  const [year, setYear] = useState(() => rpYearGuess(subject));
  const [extra, setExtra] = useState("");
  const [res, setRes] = useState({ busy: false, rows: null, sec: null, err: null });
  const [op, setOp] = useState({ busy: null, prog: null, msg: null, err: null });
  const [link, setLink] = useState("");
  const ctl = useRef(null), fileRef = useRef(null);
  useEffect(() => { setYear(rpYearGuess(subject)); setRes({ busy: false, rows: null, sec: null, err: null }); }, [subject.key]);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const find = async () => {
    const c = new AbortController(); ctl.current = c;
    setRes({ busy: true, rows: null, sec: null, err: null });
    try {
      const [rows, sec] = await Promise.all([rpSearch(subject, kind, year, extra, c.signal), subject.us && routes.sec ? rpSecList(lvSplit(subject.ticker).base, c.signal).catch(() => null) : Promise.resolve(null)]);
      setRes({ busy: false, rows, sec, err: null }); addLog && addLog("Report search", `${subject.short} · ${kind}`);
    } catch (e) { setRes({ busy: false, rows: null, sec: null, err: lvMessage(e) }); }
  };
  const meta = (title) => ({ title, company: subject.name, kind });
  const openUrl = async (url, title) => {
    const c = new AbortController(); ctl.current = c;
    setOp({ busy: url, prog: null, msg: "Fetching the full text…", err: null });
    try { const d = await rpFetchUrl(url, meta(title), c.signal); rpAdd(d); setOp({ busy: null, prog: null, msg: null, err: null }); addLog && addLog("Report opened", d.title);
      flash && flash(`${d.parts.length} ${d.unit}s loaded.`); }
    catch (e) { setOp({ busy: null, prog: null, msg: null, err: lvMessage(e) }); }
  };
  const openSec = async f => {
    const c = new AbortController(); ctl.current = c;
    setOp({ busy: f.accession_number, prog: 0, msg: "Reading the filing from SEC EDGAR…", err: null });
    try { const d = await rpFetchSec(lvSplit(subject.ticker).base, f, meta(), p => setOp(o => ({ ...o, prog: p })), c.signal); rpAdd(d); setOp({ busy: null, prog: null, msg: null, err: null }); }
    catch (e) { setOp({ busy: null, prog: null, msg: null, err: lvMessage(e) }); }
  };
  const openFile = async file => {
    if (!file) return;
    const c = new AbortController(); ctl.current = c;
    setOp({ busy: "file", prog: 0, msg: `Reading ${file.name}…`, err: null });
    try { const d = await rpReadFile(file, meta(), (p, m) => setOp(o => ({ ...o, prog: p, msg: m || o.msg })), c.signal); rpAdd(d); setOp({ busy: null, prog: null, msg: null, err: null }); addLog && addLog("File opened", file.name); }
    catch (e) { setOp({ busy: null, prog: null, msg: null, err: e && e.code ? lvMessage(e) : "That file couldn't be read. PDFs need the PDF reader, which loads from cdnjs; if your network blocks it, save the report as text and upload that." }); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const lab = { fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 };
  const web = !routes.ready || !!routes.web;            // without a route to the web, only upload is offered
  return <Card>
    <Title sub={`${web ? `Find ${subject.short}'s reports and load` : `Load ${subject.short}'s reports as`} the whole document, not a summary: annual reports, results, presentations, call transcripts, rating rationales${subject.us && routes.sec ? " and SEC filings" : ""}. Or upload a PDF you already have.`}>Reports and filings</Title>
    {routes.ready && !routes.web && <div style={{ background: T.surfaceSunk, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: T.text, lineHeight: 1.6, marginBottom: 12 }}>
      {routes.pub ? "Finding reports on the web is part of the owner's private copy. Upload a PDF or text file here and the reader and Claude work on it in the same way."
        : "Finding reports on the web isn't reachable from this device. Upload a PDF or text file and the reader and Claude work on it in the same way."}</div>}
    {routes.web === "cloud" && <div style={{ background: T.primaryTint, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: T.text, lineHeight: 1.6, marginBottom: 12 }}>
      From here this runs through your Firecrawl connector: a search uses about 4 credits and opening a web page 1. A PDF uses a credit a page, so only its first {LV_PDF_PAGES} pages are read; uploading the file reads all of it for nothing.<CloudMeter /></div>}
    {web && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,160px),1fr))", gap: 12, maxWidth: 820 }}>
      <div><div style={lab}>Document</div><Sel v={kind} onChange={setKind}>{RP_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></div>
      <div><div style={lab}>Year</div><NI v={year} onChange={setYear} align="left" placeholder={subject.india ? "2025-26" : "2025"} /></div>
      <div><div style={lab}>Other words (optional)</div><NI v={extra} onChange={setExtra} align="left" placeholder="e.g. Q1, integrated, BRSR" /></div>
    </div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: web ? 12 : 0 }}>
      {web && <Btn variant="filled" size="sm" onClick={find} disabled={res.busy || !routes.web}>{res.busy ? "Searching…" : "Find documents"}</Btn>}
      <Btn variant={web ? "outline" : "filled"} size="sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={!!op.busy}>Upload a file</Btn>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf,.txt,.md,.html,.htm" style={{ display: "none" }} onChange={e => openFile(e.target.files && e.target.files[0])} />
      <span style={{ fontSize: 11.5, color: T.textMute }}>PDF or text. The file stays in this browser.</span>
    </div>
    {web && <form onSubmit={e => { e.preventDefault(); if (routes.web && /^https?:\/\//i.test(link.trim())) openUrl(link.trim()); }} style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 820 }}>
      <input value={link} onChange={e => setLink(e.target.value)} placeholder="Or paste a link to a report (PDF or web page)" aria-label="Link to a report"
        style={{ flex: 1, minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, fontFamily: SANS, outline: "none" }} />
      <Btn size="sm" variant="tonal" onClick={() => /^https?:\/\//i.test(link.trim()) && openUrl(link.trim())} disabled={!/^https?:\/\//i.test(link.trim()) || !!op.busy || !routes.web}>Open</Btn>
    </form>}
    {op.busy && <div style={{ marginTop: 10, fontSize: 12, color: T.textSec }}>{op.msg}{op.prog != null && <span style={{ display: "inline-block", width: 120, height: 6, borderRadius: 3, background: T.surfaceSunk, marginLeft: 10, verticalAlign: "middle", overflow: "hidden" }}>
      <span style={{ display: "block", height: "100%", width: `${Math.round((op.prog || 0) * 100)}%`, background: T.primary }} /></span>}
      <button onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} setOp({ busy: null, prog: null, msg: null, err: null }); }} style={{ marginLeft: 10, border: "none", background: "transparent", color: T.primaryDark, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>Stop</button></div>}
    {op.err && <div style={{ marginTop: 10, fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>{op.err}</div>}
    {res.err && <div style={{ marginTop: 10, fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>{res.err}</div>}
    {res.sec && res.sec.length > 0 && <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>SEC filings</div>
      {res.sec.map(f => <div key={f.accession_number} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${T.border}` }}>
        <div style={{ flex: "1 1 260px", fontSize: 12.5, color: T.text }}><b>Form {f.form_type}</b> · period to {String(f.period_of_report || "").slice(0, 10)} · filed {String(f.filing_date || "").slice(0, 10)}</div>
        <Btn size="sm" variant="outline" disabled={!!op.busy} onClick={() => openSec(f)}>{op.busy === f.accession_number ? "Loading…" : "Read in full"}</Btn></div>)}
    </div>}
    {res.rows && <div style={{ marginTop: 14 }}>
      {!res.rows.length ? <div style={{ fontSize: 12.5, color: T.textSec }}>Nothing came up. Try another year or document type, or paste a link from the company's investor page.</div>
        : res.rows.map(r => <div key={r.url} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{r.title || r.host}</div>
            <div style={{ fontSize: 11, color: T.textMute, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ wordBreak: "break-all" }}>{r.host}</span>{r.pdf && <Chip>PDF</Chip>}{r.own && <Chip kind="green">Company site</Chip>}{r.exch && <Chip kind="primary">Exchange filing</Chip>}</div>
            {rpGarbled(r.snippet.repeat(4)) || /[\uFFFD\u0080-\u009F]/.test(r.snippet)
              ? <div style={{ fontSize: 11.5, color: T.amber, marginTop: 4, lineHeight: 1.5 }}>The text in this PDF looks scrambled, so the reader may not be able to use it. A copy from the company's own site usually reads cleanly.</div>
              : <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 4, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.snippet.replace(/\s+/g, " ").slice(0, 300)}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn size="sm" variant="tonal" disabled={!!op.busy} onClick={() => openUrl(r.url, r.title)}>{op.busy === r.url ? "Loading…" : "Open in reader"}</Btn>
            <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.primaryDark, padding: "6px 4px", fontFamily: SANS }}>Source ↗</a>
          </div>
        </div>)}
    </div>}
    {RP.docs.length > 0 && <div style={{ marginTop: 16 }}>
      <div style={lab}>Opened documents (kept in this browser)</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{RP.docs.map(d => <span key={d.key} style={{ display: "inline-flex", alignItems: "center", background: RP.cur === d.key ? T.primaryTint : T.surfaceSunk, borderRadius: 999 }}>
        <button onClick={() => rpOpen(d.key)} title={d.title} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: 11.5, color: RP.cur === d.key ? T.primaryDark : T.textSec, padding: "5px 4px 5px 11px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.company ? `${d.company.split(" ").slice(0, 2).join(" ")}: ` : ""}{d.title}</button>
        <button aria-label={`Close ${d.title}`} onClick={() => rpClose(d.key)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMute, padding: "5px 10px 5px 4px", fontSize: 12 }}>×</button></span>)}</div>
    </div>}
  </Card>;
}

/* Text with the search phrase highlighted */
function Marked({ text, q }) {
  const T = useT();
  const needle = String(q || "").trim();
  if (needle.length < 2) return text;
  const out = [], low = text.toLowerCase(), n = needle.toLowerCase();
  let i = 0, k = low.indexOf(n), key = 0;
  while (k >= 0) { if (k > i) out.push(text.slice(i, k)); out.push(<mark key={key++} style={{ background: T.amberTint, color: T.text, borderRadius: 3, padding: "0 1px", boxShadow: `0 0 0 1px ${T.amber}` }}>{text.slice(k, k + n.length)}</mark>); i = k + n.length; k = low.indexOf(n, i); }
  out.push(text.slice(i));
  return out;
}
/* Long unbroken text reads better in short paragraphs */
const rpParas = t => {
  const byLine = String(t).split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  const sents = String(t).split(/(?<=[.!?])\s+(?=[A-Z₹$•(“"])/);
  const out = []; let cur = "";
  sents.forEach(s => { if ((cur + " " + s).length > 700 && cur) { out.push(cur.trim()); cur = s; } else cur += " " + s; });
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function ReaderCard({ doc, aiAvail, sampleRef, aiMessage, plain }) {
  const T = useT();
  const [pn, setPn] = useState(1);
  const [q, setQ] = useState(""), [qq, setQq] = useState("");
  const [hi, setHi] = useState(0);
  const [ai, setAi] = useState({ busy: false, text: null, err: null, mode: null });
  const [ask, setAsk] = useState("");
  const ctl = useRef(null), viewRef = useRef(null);
  useEffect(() => { setPn(1); setQ(""); setQq(""); setAi({ busy: false, text: null, err: null, mode: null }); }, [doc.key]);
  const ver = useDocs();
  useEffect(() => { if (RP.jumpTo && RP.cur === doc.key) { const n = RP.jumpTo.n; RP.jumpTo = null; jump(n); } }, [ver]);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  const hits = useMemo(() => rpFind(doc, qq), [doc.key, qq]);
  const part = doc.parts[Math.min(Math.max(1, pn), doc.parts.length) - 1] || { n: 1, text: "" };
  const jump = n => { setPn(Math.min(Math.max(1, n), doc.parts.length)); setTimeout(() => { try { viewRef.current && viewRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch {} }, 30); };
  const goHit = k => { if (!hits.length) return; const j = (k + hits.length) % hits.length; setHi(j); jump(hits[j].part); };
  const U = rpRef(doc);
  const runAi = async (mode, question) => {
    const sample = sampleRef && sampleRef.current;
    if (!sample) { setAi({ busy: false, text: null, err: "AI isn't available in this view.", mode }); return; }
    try { ctl.current && ctl.current.abort(); } catch {}
    const c = new AbortController(); ctl.current = c;
    setAi({ busy: true, text: null, err: null, mode });
    const style = plain ? "Write for someone with no finance background: short sentences, explain each financial term in a few words the first time, and say why each point matters." : "Write for a finance student: precise and compact.";
    const head = `You are reading "${doc.title}"${doc.company ? `, a document about ${doc.company}` : ""}. The document is split into numbered ${U.toLowerCase()}s. Cite the ${U.toLowerCase()} for every fact like [${U} 12]. Use only the document text given to you; if something isn't there, say so. ${style}`;
    try {
      let input, opts = { signal: c.signal, modelTier: "default", onText: ({ text }) => setAi(s => ({ ...s, text })) };
      if (mode === "points") {
        input = `${head}\n\nGive the main points of this document under these headings: **In short** (three sentences), **Performance**, **Strategy and outlook**, **Risks and red flags**, **Numbers worth noting**, **Worth reading in full** (which ${U.toLowerCase()}s and why). Bullets under each heading, 4–7 bullets at most per heading.\n\nExcerpts selected from across the document:\n\n${rpDigest(doc)}`;
      } else {
        const lim = await sample.limits().catch(() => null);
        if (lim && lim.tools) {
          opts.tools = [
            { name: "search_document", description: `Search the open document for passages about a topic. Returns up to 6 excerpts with their ${U.toLowerCase()} numbers.`, inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to look for" } }, required: ["query"] },
              execute: x => rpRank(doc, String(x.query || ""), 6, 1500).map(r => ({ [U.toLowerCase()]: r.part, text: r.text })) },
            { name: "read_part", description: `Read one ${U.toLowerCase()} of the document in full (up to 6,000 characters).`, inputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
              execute: x => { const p = doc.parts[Math.round(+x.n) - 1]; if (!p) throw new Error(`There are ${doc.parts.length} ${U.toLowerCase()}s.`); return { [U.toLowerCase()]: p.n, text: p.text.slice(0, 6000) }; } },
          ];
          input = `${head}\n\nThe document has ${doc.parts.length} ${U.toLowerCase()}s. Use search_document (and read_part when an excerpt is cut short) to find what you need, then answer. Starting excerpts:\n\n${rpRank(doc, question, 4, 1500).map(r => `[${U} ${r.part}] ${r.text}`).join("\n\n") || "(no direct match; search with other words)"}\n\nQuestion: ${question}`;
        } else {
          input = `${head}\n\nExcerpts that match the question:\n\n${rpRank(doc, question, 10, 2600).map(r => `[${U} ${r.part}] ${r.text}`).join("\n\n") || "(no passage matched the question's words)"}\n\nQuestion: ${question}`;
        }
      }
      const { text, truncated } = await sample(input, opts);
      setAi({ busy: false, text, err: truncated ? "The answer was cut short. Ask a narrower question for the rest." : null, mode });
    } catch (e) { setAi(s => ({ busy: false, text: e && e.text ? e.text : s.text, err: (aiMessage ? aiMessage(e) : "") || null, mode })); }
  };
  const words = Math.round(doc.chars / 6);
  return <Card>
    <div ref={viewRef} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: "1 1 300px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>{doc.title}</div>
        <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 4, lineHeight: 1.5, wordBreak: "break-all" }}>{doc.parts.length} {doc.unit}s · about {words.toLocaleString("en-IN")} words · {doc.src === "sec" ? "SEC EDGAR" : doc.src === "pdf" || doc.src === "file" ? "your file" : rpHost(doc.url)} · opened {lvWhen(doc.at)}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {aiAvail && <Btn size="sm" variant="filled" onClick={() => runAi("points")} disabled={ai.busy}>{ai.busy && ai.mode === "points" ? "Reading…" : "Main points"}</Btn>}
        <Btn size="sm" variant="ghost" onClick={() => rpClose(doc.key)}>Close</Btn>
      </div>
    </div>
    {doc.note && <div style={{ background: T.primaryTint, borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>{doc.note}</div>}
    {doc.garbled && <div style={{ background: T.amberTint, borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
      Much of this text is scrambled: the PDF's fonts don't carry a text map, so the words can't be read back out. Try another copy (the company's own website often has a clean one), or open the PDF on your computer.</div>}
    {doc.sections.length > 0 && <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 }}>In this document</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{doc.sections.map(s => <button key={s.name} onClick={() => jump(s.part)} style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, color: T.textSec, cursor: "pointer", fontFamily: SANS }}>{s.name} <span style={{ color: T.textMute }}>· {U.slice(0, 1)}{s.part}</span></button>)}</div>
    </div>}
    <form onSubmit={e => { e.preventDefault(); setQq(q); setHi(0); const h = rpFind(doc, q); if (h.length) jump(h[0].part); }} style={{ display: "flex", gap: 8, marginTop: 14, maxWidth: 680, flexWrap: "wrap" }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find in this document: revenue, capex, guidance, contingent…" aria-label="Find in document"
        style={{ flex: "1 1 240px", minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, fontFamily: SANS, outline: "none" }} />
      <Btn size="sm" variant="tonal" onClick={() => { setQq(q); setHi(0); const h = rpFind(doc, q); if (h.length) jump(h[0].part); }}>Find</Btn>
      {qq && <span style={{ fontSize: 12, color: T.textSec, alignSelf: "center" }}>{hits.length ? `${hi + 1} of ${hits.length}${hits.length >= 400 ? "+" : ""}` : "No matches"}</span>}
      {hits.length > 1 && <><Btn size="sm" variant="ghost" onClick={() => goHit(hi - 1)}>Previous</Btn><Btn size="sm" variant="ghost" onClick={() => goHit(hi + 1)}>Next</Btn></>}
    </form>
    {qq && hits.length > 0 && <div style={{ marginTop: 8, maxHeight: 150, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
      {hits.slice(0, 60).map((h, k) => <button key={k} onClick={() => { setHi(k); jump(h.part); }} style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderTop: k ? `1px solid ${T.border}` : "none", background: k === hi ? T.primarySoft : T.surface, padding: "6px 10px", cursor: "pointer", fontFamily: SANS, fontSize: 11.5, color: T.textSec, lineHeight: 1.45 }}>
        <b style={{ color: T.text }}>{U} {h.part}</b> · …<Marked text={h.snip.replace(/\s+/g, " ")} q={qq} />…</button>)}
    </div>}
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
      <Btn size="sm" variant="outline" onClick={() => jump(pn - 1)} disabled={pn <= 1}>‹ Previous</Btn>
      <span style={{ fontSize: 12, color: T.textSec }}>{U} <input value={pn} onChange={e => { const v = parseInt(e.target.value, 10); if (v) jump(v); }} aria-label={`${U} number`} style={{ width: 52, textAlign: "center", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 6px", fontFamily: MONO, fontSize: 12, background: T.surface, color: T.text }} /> of {doc.parts.length}</span>
      <Btn size="sm" variant="outline" onClick={() => jump(pn + 1)} disabled={pn >= doc.parts.length}>Next ›</Btn>
    </div>
    <div style={{ marginTop: 10, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", maxHeight: 460, overflowY: "auto" }}>
      {rpParas(part.text).map((p, k) => <p key={k} style={{ margin: k ? "10px 0 0" : 0, fontSize: 13, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><Marked text={p} q={qq} /></p>)}
    </div>
    {aiAvail && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
      <form onSubmit={e => { e.preventDefault(); if (ask.trim()) runAi("ask", ask.trim()); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask about this document: what is the capex plan? any auditor concerns?" aria-label="Ask about this document"
          style={{ flex: "1 1 260px", minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "9px 11px", fontSize: 13, fontFamily: SANS, outline: "none" }} />
        <Btn size="sm" variant="tonal" onClick={() => ask.trim() && runAi("ask", ask.trim())} disabled={ai.busy || !ask.trim()}>{ai.busy && ai.mode === "ask" ? "Reading…" : "Ask"}</Btn>
        {ai.busy && <Btn size="sm" variant="ghost" onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} }}>Stop</Btn>}
      </form>
      {ai.busy && !ai.text && <div style={{ fontSize: 12, color: T.textMute, marginTop: 10 }}>Claude is reading the relevant {U.toLowerCase()}s…</div>}
      {ai.err && <div style={{ fontSize: 12, color: T.red, marginTop: 10 }}>{ai.err}</div>}
      {ai.text && <div style={{ marginTop: 12, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
        <MdView text={ai.text} onCite={n => jump(n)} citeWord={U} /></div>}
    </div>}
  </Card>;
}

/* ═══════════════ The Reports & AI workspace ═══════════════ */
function ResearchModule({ sel, aiAvail, sampleRef, aiMessage, dlRef, flash, addLog, setSpace }) {
  const T = useT();
  useLive(); useDocs(); useResearchSel();
  const subject = rsSubject(sel);
  const [plain, setPlain] = usePlainMode();
  const doc = rpCur();
  const opts = [...sel.ids.map(id => ["co:" + id, SX.co(id).short]), ...lvProfiles().map(p => ["p:" + p.symbol, `${p.short} (profile)`])];
  const cur = subject.kind === "profile" ? "p:" + subject.p.symbol : "co:" + subject.c.id;
  const pick = v => { if (v.startsWith("p:")) ResearchSel.set({ profile: v.slice(2) }); else { ResearchSel.set(null); SuiteSel.focus(v.slice(3)); } };
  return <>
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -.2, color: T.text }}>Reports & AI analysis</div>
          <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 6, lineHeight: 1.6 }}>Read a company's own documents in full, search them, and let Claude pull out what matters. The full analysis brings together everything in Valuation Studio about the company in plain language, so you can decide what to look at next.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: T.textMute }}>Explanations</span>
          <Segment options={[["plain", "Plain language"], ["pro", "Finance detail"]]} value={plain ? "plain" : "pro"} onChange={v => setPlain(v === "plain")} size="sm" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12, marginTop: 16, maxWidth: 640 }}>
        <div><div style={{ fontSize: 11, fontWeight: 600, color: T.textMute, marginBottom: 6 }}>Company</div>
          <Sel v={cur} onChange={pick}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{!opts.some(o => o[0] === cur) && <option value={cur}>{subject.short}</option>}</Sel></div>
      </div>
      <SubjectFacts subject={subject} />
      <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 10 }}>To research another company, pick it in any workspace, or search for it under <button onClick={() => setSpace && setSpace("find")} style={{ border: "none", background: "transparent", color: T.primaryDark, cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11.5 }}>Find companies</button>.</div>
    </Card>
    <FullAnalysis subject={subject} sel={sel} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} dlRef={dlRef} flash={flash} addLog={addLog} plain={plain} />
    <ReportsCard subject={subject} flash={flash} addLog={addLog} />
    {doc && <ReaderCard doc={doc} aiAvail={aiAvail} sampleRef={sampleRef} aiMessage={aiMessage} plain={plain} />}
  </>;
}
function SubjectFacts({ subject }) {
  const T = useT();
  if (subject.kind === "profile") {
    const p = subject.p, P = p.profile;
    return <div style={{ marginTop: 14, fontSize: 12.5, color: T.textSec, lineHeight: 1.65 }}>
      <div><b style={{ color: T.text }}>{p.name}</b> · {p.symbol} · {P.industry} · {P.country}</div>
      <div>Price {fmtPx(p.price, p.cur)}{P.mcapY ? ` · market value ${fmtCap(P.mcapY, p.cur)}` : ""}{P.pe ? ` · P/E ${P.pe.toFixed(1)}x` : ""}{P.pb ? ` · P/B ${P.pb.toFixed(2)}x` : ""}</div>
      <div style={{ color: T.amber }}>{p.reason}</div>
    </div>;
  }
  const c = subject.c, m = suiteMarket(c), L = SUITE.last;
  return <div style={{ marginTop: 14, fontSize: 12.5, color: T.textSec, lineHeight: 1.65 }}>
    <div><b style={{ color: T.text }}>{c.name}</b> · {tickerOf(c)} · {c.live ? `${c.live.profile.industry} · ${c.live.profile.country}` : `${SX.ind(SUITE.indOf[c.id]).name} · India · verified dataset`}</div>
    <div>Price {pxFmt(c)} · market value {SX.cr(c.mcap)} · P/E {fmtU(m.pe, "x", 1)} · EV/EBITDA {fmtU(m.evEbitda, "x", 1)} · revenue {ylab(c, L)} {SX.cr(c.rev[L])}</div>
    {c.live && c.live.profile.summary && <div style={{ marginTop: 6 }}>{c.live.profile.summary.slice(0, 420)}{c.live.profile.summary.length > 420 ? "…" : ""}</div>}
  </div>;
}
