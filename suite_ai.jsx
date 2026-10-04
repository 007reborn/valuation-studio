/* ═══════════════════════════════════════════════════════════════════════
   AI ANALYST — a chat panel on every workspace that can look things up in
   the page (company figures, ratios, credit scores, the DCF model, open
   reports) and, through the viewer's own servers, search companies and the
   web; plus a one-click full company analysis written in plain language.
   Uses the page's `sample` capability (the viewer's own Claude usage).
   ═══════════════════════════════════════════════════════════════════════ */
let DCF_SNAP = null;                    // set by the DCF model on every render (see build.js)
function usePlainMode() {
  const [p, setP] = useState(() => { try { return localStorage.getItem("vs:plain") !== "0"; } catch { return true; } });
  const set = v => { setP(v); try { localStorage.setItem("vs:plain", v ? "1" : "0"); } catch {} PLAIN_SUBS.forEach(f => { try { f(v); } catch {} }); };
  useEffect(() => { const f = v => setP(v); PLAIN_SUBS.add(f); return () => PLAIN_SUBS.delete(f); }, []);
  return [p, set];
}
const PLAIN_SUBS = new Set();

/* ── Small, safe markdown renderer (no HTML from the model ever reaches the page) ── */
function mdInline(s, kb, onCite) {
  const out = [], re = /(\*\*([^*]+)\*\*)|(\[(Part|Page|Parts|Pages|p\.)\s*(\d+)[^\]]*\])|(`([^`]+)`)|(\*([^*\s][^*]*?)\*)|(https?:\/\/[^\s)]+)/g;
  let i = 0, k = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    if (m[1]) out.push(<b key={kb + "b" + k++}>{m[2]}</b>);
    else if (m[3]) { const n = +m[5], lbl = m[3].slice(1, -1);
      out.push(onCite ? <button key={kb + "c" + k++} onClick={() => onCite(n)} title={`Go to ${lbl}`} style={{ border: "none", background: "transparent", color: "inherit", textDecoration: "underline", textDecorationStyle: "dotted", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}>[{lbl}]</button> : m[3]); }
    else if (m[6]) out.push(<code key={kb + "k" + k++} style={{ fontFamily: MONO, fontSize: "0.92em" }}>{m[7]}</code>);
    else if (m[8]) out.push(<i key={kb + "i" + k++}>{m[9]}</i>);
    else if (m[10]) out.push(<a key={kb + "a" + k++} href={m[10]} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", wordBreak: "break-all" }}>{m[10]}</a>);
    i = re.lastIndex;
  }
  if (i < s.length) out.push(s.slice(i));
  return out;
}
function MdView({ text, onCite, compact }) {
  const T = useT();
  const lines = String(text || "").replace(/\r/g, "").split("\n"), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    if (!t) { blocks.push({ k: "gap" }); continue; }
    if (/^\|.*\|$/.test(t)) {
      const rows = []; while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { const r = lines[i].trim().slice(1, -1).split("|").map(x => x.trim()); if (!r.every(x => /^:?-{2,}:?$/.test(x))) rows.push(r); i++; }
      i--; blocks.push({ k: "table", rows }); continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push({ k: "h", lvl: h[1].length, t: h[2].replace(/\*\*/g, "") }); continue; }
    if (/^\*\*[^*]+\*\*:?$/.test(t)) { blocks.push({ k: "h", lvl: 3, t: t.replace(/\*\*|:$/g, "") }); continue; }
    const b = t.match(/^([-*•])\s+(.*)$/), n = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (b || n) { const kind = b ? "ul" : "ol", last = blocks[blocks.length - 1], item = (b || n)[2], depth = raw.search(/\S/) >= 2 ? 1 : 0;
      if (last && last.k === kind) last.items.push({ t: item, depth }); else blocks.push({ k: kind, items: [{ t: item, depth }] }); continue; }
    if (/^-{3,}$|^_{3,}$/.test(t)) { blocks.push({ k: "hr" }); continue; }
    blocks.push({ k: "p", t });
  }
  const fs = compact ? 12.5 : 13;
  return <div style={{ fontSize: fs, lineHeight: 1.65, color: T.text }}>{blocks.map((B, j) => {
    if (B.k === "gap") return <div key={j} style={{ height: 4 }} />;
    if (B.k === "hr") return <hr key={j} style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "10px 0" }} />;
    if (B.k === "h") return <div key={j} style={{ fontWeight: 600, fontSize: B.lvl <= 2 ? fs + 2 : fs + 0.5, color: B.lvl <= 2 ? T.text : T.primaryDark, margin: `${j ? 12 : 0}px 0 4px` }}>{mdInline(B.t, j + ":", onCite)}</div>;
    if (B.k === "p") return <p key={j} style={{ margin: "4px 0" }}>{mdInline(B.t, j + ":", onCite)}</p>;
    if (B.k === "table") return <div key={j} style={{ overflowX: "auto", margin: "6px 0" }}><table style={{ borderCollapse: "collapse", fontSize: fs - 1 }}><tbody>{B.rows.map((r, ri) =>
      <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ border: `1px solid ${T.border}`, padding: "4px 8px", fontWeight: ri === 0 ? 600 : 400, background: ri === 0 ? T.surfaceSunk : "transparent", whiteSpace: "nowrap" }}>{mdInline(c, `${j}:${ri}:${ci}`, onCite)}</td>)}</tr>)}</tbody></table></div>;
    const L = B.k === "ul" ? "ul" : "ol";
    return React.createElement(L, { key: j, style: { margin: "4px 0", paddingLeft: 20 } }, B.items.map((it, ii) => <li key={ii} style={{ margin: "3px 0", marginLeft: it.depth ? 16 : 0 }}>{mdInline(it.t, `${j}:${ii}:`, onCite)}</li>));
  })}</div>;
}

/* ── Word (.docx) from markdown, zipped with the Excel library's own zip writer ── */
function mdToDocx(title, md) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const runs = s => {
    const out = []; const re = /\*\*([^*]+)\*\*/g; let i = 0, m;
    const clean = x => x.replace(/\*([^*\s][^*]*?)\*/g, "$1").replace(/`([^`]+)`/g, "$1");
    while ((m = re.exec(s))) { if (m.index > i) out.push(`<w:r><w:t xml:space="preserve">${esc(clean(s.slice(i, m.index)))}</w:t></w:r>`); out.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(clean(m[1]))}</w:t></w:r>`); i = re.lastIndex; }
    if (i < s.length) out.push(`<w:r><w:t xml:space="preserve">${esc(clean(s.slice(i)))}</w:t></w:r>`);
    return out.join("");
  };
  const P = (inner, style, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;
  const body = [P(runs(title), "Title")];
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || /^-{3,}$/.test(t)) continue;
    if (/^\|.*\|$/.test(t)) {
      const rows = []; while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { const r = lines[i].trim().slice(1, -1).split("|").map(x => x.trim()); if (!r.every(x => /^:?-{2,}:?$/.test(x))) rows.push(r); i++; }
      i--;
      const cols = Math.max(...rows.map(r => r.length)), b = `<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>`;
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${b}</w:tblBorders></w:tblPr><w:tblGrid>${"<w:gridCol/>".repeat(cols)}</w:tblGrid>${rows.map((r, ri) =>
        `<w:tr>${[...Array(cols).keys()].map(ci => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${P(ri === 0 ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(String(r[ci] || "").replace(/\*\*/g, ""))}</w:t></w:r>` : runs(r[ci] || ""))}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`, P(""));
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) { body.push(P(runs(h[2].replace(/\*\*/g, "")), h[1].length <= 2 ? "Heading1" : "Heading2")); continue; }
    if (/^\*\*[^*]+\*\*:?$/.test(t)) { body.push(P(runs(t.replace(/\*\*|:$/g, "")), "Heading2")); continue; }
    const bl = t.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (bl) { body.push(P(`<w:r><w:t xml:space="preserve">${/^\d/.test(bl[1]) ? esc(bl[1]) + " " : "•\t"}</w:t></w:r>${runs(bl[2])}`, null, `<w:ind w:left="400" w:hanging="260"/><w:spacing w:after="60"/>`)); continue; }
    body.push(P(runs(t), null, `<w:spacing w:after="120"/>`));
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const sty = (id, name, sz, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1A3D6D"/><w:sz w:val="${sz}"/>${extra}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${sty("Title", "Title", 36)}${sty("Heading1", "heading 1", 28)}${sty("Heading2", "heading 2", 24)}</w:styles>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const drels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const enc = s => new TextEncoder().encode(s);
  const z = XLSX.CFB.utils.cfb_new();
  [["[Content_Types].xml", ct], ["_rels/.rels", rels], ["word/document.xml", doc], ["word/_rels/document.xml.rels", drels], ["word/styles.xml", styles]].forEach(([p, s]) => XLSX.CFB.utils.cfb_add(z, p, enc(s)));
  return XLSX.CFB.write(z, { fileType: "zip", type: "array" });
}
async function aiSave(dlRef, flash, filename, data) {
  const dl = dlRef && dlRef.current;
  if (!dl) { flash && flash("File downloads aren't available in this view."); return; }
  try { await dl.save({ filename, data }); flash && flash("Saved."); }
  catch (e) { const c = e && e.code; if (c === "declined") return; flash && flash(c === "rate_limited" ? "A save prompt is already open." : "Couldn't offer the file just now."); }
}

/* ── What the AI is told about a company: compact, labelled, every number from the page ── */
const aiN = (v, d = 1) => SX.ok(v) ? (+v).toFixed(d) : "n/a";
function aiResolve(q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return SX.co(SuiteSel.get().focus);
  return SUITE.byId[q] || SUITE.cos.find(c => c.id.toLowerCase() === s || c.ticker.toLowerCase() === s || c.short.toLowerCase() === s) ||
    SUITE.cos.find(c => c.name.toLowerCase().includes(s) || c.short.toLowerCase().includes(s) || s.includes(c.short.toLowerCase())) || null;
}
function aiCompanyPack(c, ids, deep = true) {
  if (!c) return "No such company is loaded.";
  const R = SUITE_R[c.id], L = SUITE.last, m = suiteMarket(c), yrs = [0, 1, 2, 3, 4].filter(j => SX.ok(c.rev[j]));
  const row = (label, f) => `${label}: ${yrs.map(j => `${ylab(c, j)} ${f(j)}`).join(" | ")}`;
  const peers = (ids || []).filter(x => x !== c.id && SUITE.byId[x]);
  const lines = [
    `${c.name} (${tickerOf(c)}). ${c.live ? `${c.live.profile.industry}, ${c.live.profile.sector}; ${c.live.profile.country}. Live data from stockanalysis.com (S&P Global) and Yahoo Finance, fetched ${lvWhen(c.live.fetchedAt)}; fiscal years end in ${monthFull(c.live.ye)}.` : `${SX.ind(SUITE.indOf[c.id]).name}, India. Verified dataset: consolidated, years to 31 March, cross-checked against Yahoo Finance.`}`,
    c.live && c.live.profile.summary ? `Business: ${c.live.profile.summary.slice(0, 900)}` : null,
    `Amounts in ₹ crore${c.live && c.live.stmtCur !== "INR" ? ` (reported in ${c.live.stmtCur}, translated at ₹${c.live.fxSI.toFixed(4)} per ${c.live.stmtCur}; ratios unaffected)` : ""}.`,
    row("Revenue", j => (c.rev[j] / 10).toFixed(0)), row("Revenue growth %", j => j && SX.ok(c.rev[j - 1]) ? aiN((c.rev[j] / c.rev[j - 1] - 1) * 100) : "n/a"),
    row("EBITDA", j => (c.ebitda[j] / 10).toFixed(0)), row("Net income", j => (c.ni[j] / 10).toFixed(0)),
    row("EBITDA margin %", j => aiN(R[j].em)), row("Net margin %", j => aiN(R[j].nm)), row("ROE %", j => aiN(R[j].roe)), row("ROCE %", j => aiN(R[j].roce)), row("ROIC %", j => aiN(R[j].roic)),
    row("Debt to equity x", j => aiN(R[j].de, 2)), row("Net debt ÷ EBITDA x", j => aiN(R[j].nde, 2)), row("Interest cover x", j => aiN(R[j].icov)),
    row("Operating cash flow ÷ EBITDA %", j => aiN(R[j].cconv, 0)), row("Free-cash-flow margin %", j => aiN(R[j].fcfm)),
    deep ? row("Receivable days", j => aiN(R[j].dso, 0)) : null, deep ? row("Inventory days", j => aiN(R[j].dio, 0)) : null, deep ? row("Payable days", j => aiN(R[j].dpo, 0)) : null,
    `Market (${pxAsOf(c)}): price ${pxFmt(c)}; market value ₹${(c.mcap / 10).toFixed(0)} crore; P/E ${aiN(m.pe)}x; P/B ${aiN(m.pb, 2)}x; EV/EBITDA ${aiN(m.evEbitda)}x; EV/sales ${aiN(m.evSales, 2)}x; dividend yield ${aiN(m.dy, 2)}%; 52-week range ${aiN(c.wkLo, 2)}–${aiN(c.wkHi, 2)}; beta ${c.beta ? `${c.beta.adj.toFixed(2)} (5-year monthly, R² ${c.beta.r2.toFixed(2)})` : "n/a"}.`,
    c.live && c.live.profile.analyst && c.live.profile.analyst.n ? `Analysts on Yahoo Finance: ${c.live.profile.analyst.n} covering, average rating ${c.live.profile.analyst.rating || "n/a"}, mean target ${aiN(c.live.profile.analyst.target, 2)} (${c.live.cur}).` : null,
  ];
  if (deep) {
    const cs = creditScore(c, L), al = altman(c, L, c.mcap), pf = piotroski(c, L), bn = beneish(c, L), zm = zmijewski(c, L), stx = creditStress(c, L, 25, 200);
    lines.push(`Credit (${ylab(c, L)}): scorecard ${aiN(cs.score, 0)}/100 (${cs.band ? cs.band[0] : "n/a"}); under a 25% EBITDA fall and +2 points on interest, ${aiN(stx.score, 0)}/100. Altman emerging-market score ${aiN(al.ems, 2)} (≈${al.rating}, zone ${al.zone}); market-based Z ${aiN(al.z, 2)}. Piotroski F ${pf ? pf.score + "/9" : "n/a"}. Beneish M ${bn ? aiN(bn.m, 2) + ` (${bn.zone === "flag" ? "above the −1.78 cut-off: read the accounts closely" : bn.zone === "watch" ? "watch zone" : "clear"})` : "n/a"}. Zmijewski distress probability ${aiN(zm.p * 100)}%. Synthetic rating from interest cover ${synthRating(R[L].icov, !(c.int[L] > 0))}.`);
    const oo = oneOffs(c, L);
    if (oo) lines.push(`Net income includes about ₹${(oo / 10).toFixed(0)} crore not explained by pre-tax profit less tax (a one-off or discontinued item).`);
  }
  if (peers.length) {
    const ks = [["roe", "ROE %"], ["roce", "ROCE %"], ["em", "EBITDA margin %"], ["de", "D/E x"], ["nde", "ND/EBITDA x"], ["ccc", "cash cycle days"]];
    lines.push(`Peers in the comparison (latest year): ` + peers.map(id => { const x = SX.co(id), r = SUITE_R[id][L], mx = suiteMarket(x);
      return `${x.short}: ${ks.map(([k, l]) => `${l} ${aiN(r[k])}`).join(", ")}, P/E ${aiN(mx.pe)}x, EV/EBITDA ${aiN(mx.evEbitda)}x`; }).join("; ") + ".");
    lines.push(`Peer medians: ${[["roe", "ROE %"], ["roce", "ROCE %"], ["em", "EBITDA margin %"], ["nde", "ND/EBITDA x"]].map(([k, l]) => `${l} ${aiN(peerMedian(k, c.id, L, [c.id, ...peers]))}`).join(", ")}.`);
  }
  if (c.note) lines.push(`Data note: ${c.note}`);
  if (c.live && c.live.warns && c.live.warns.length) lines.push(`Data warnings: ${c.live.warns.join(" ")}`);
  if (c.live && c.live.notes && c.live.notes.length) lines.push(`Data notes: ${c.live.notes.join(" ")}`);
  if (c.live && c.live.cross) { const bad = c.live.cross.filter(x => !x.ok); if (bad.length) lines.push(`Cross-check: Yahoo Finance differs on ${bad.map(x => `${x.l.toLowerCase()} (up to ${(x.d * 100).toFixed(1)}%)`).join(", ")}.`); }
  return lines.filter(Boolean).join("\n");
}
function aiProfilePack(p) {
  const P = p.profile, k = p.key || {}, yrs = k.years || [];
  const ser = (l, a) => a && a.some(SX.ok) ? `${l}: ${yrs.map((y, j) => `${y} ${SX.ok(a[j]) ? Math.round(a[j]).toLocaleString("en-US") : "n/a"}`).join(" | ")}` : null;
  return [`${p.name} (${p.exch || ""}: ${p.symbol}). ${P.industry}, ${P.sector}; ${P.country}. Held as a profile only: ${p.reason}`,
    P.summary ? `Business: ${P.summary.slice(0, 900)}` : null,
    `Price ${fmtPx(p.price, p.cur)}; market value ${fmtCap(P.mcapY, p.cur)}; P/E ${aiN(P.pe)}x; P/B ${aiN(P.pb, 2)}x; price ÷ sales ${aiN(P.ps, 2)}x; ROE ${SX.ok(P.roe) ? aiN(P.roe * 100) + "%" : "n/a"}; net margin ${SX.ok(P.margin) ? aiN(P.margin * 100) + "%" : "n/a"}; beta ${p.beta ? p.beta.adj.toFixed(2) : "n/a"}. Data from Yahoo Finance, fetched ${lvWhen(p.fetchedAt)}.`,
    yrs.length ? `Reported figures (millions${k.cur ? " of " + k.cur : ""}), newest first:` : null,
    ser("Revenue", k.rev), ser("Net income", k.ni), ser("Total assets", k.ta), ser("Equity", k.eq), ser("Operating cash flow", k.cfo),
  ].filter(Boolean).join("\n");
}
function aiDcfText() {
  const S = DCF_SNAP;
  if (!S || !S.co || !S.co.name || !S.dcf || !SX.ok(S.dcf.price)) return null;
  const sym = curSym(S.cur), px = parseFloat(S.co.price), up = px > 0 ? (S.dcf.price / px - 1) * 100 : null;
  return [`The DCF model holds ${S.co.name} (${S.cur}). Value per share ${sym}${S.dcf.price.toFixed(2)} against a price of ${sym}${aiN(px, 2)}${SX.ok(up) ? ` (${up >= 0 ? "+" : ""}${up.toFixed(1)}%)` : ""}.`,
    `WACC ${aiN(S.effWACC, 2)}%, terminal growth ${aiN(S.gN, 1)}%, terminal value ${aiN(S.dcf.tvP, 0)}% of enterprise value.`,
    S.exitR && SX.ok(S.exitR.price) ? `Exit-multiple method at ${aiN(S.exitN, 1)}x EBITDA: ${sym}${S.exitR.price.toFixed(2)} a share (implies ${aiN(S.exitR.gImp, 1)}% growth for ever).` : null,
    S.compsR && S.compsR.evRange ? `Peer EV/EBITDA range: ${sym}${aiN(S.compsR.evRange.lo, 0)}–${sym}${aiN(S.compsR.evRange.hi, 0)} a share (median ${sym}${aiN(S.compsR.evRange.mid, 0)}).` : null,
    S.compsR && S.compsR.peRange ? `Peer P/E range: ${sym}${aiN(S.compsR.peRange.lo, 0)}–${sym}${aiN(S.compsR.peRange.hi, 0)} (median ${sym}${aiN(S.compsR.peRange.mid, 0)}).` : null,
    S.vd ? `Model verdict: ${S.vd.label}${S.vd.line ? ` — ${S.vd.line}` : ""}.` : null,
    S.checks && S.checks.some(x => x && (x.level === "warn" || x.level === "error")) ? `Model warnings: ${S.checks.filter(x => x && (x.level === "warn" || x.level === "error")).slice(0, 4).map(x => x.title).join("; ")}.` : null,
  ].filter(Boolean).join(" ");
}
function aiViewText(space, sel) {
  const c = SX.co(sel.focus), names = { find: "Find companies", dcf: "DCF valuation", ratios: "Ratio analysis", credit: "Credit risk", wc: "Working capital", fpa: "FP&A variance", research: "Reports & AI" };
  const doc = rpCur(), rs = ResearchSel.get();
  return [`Workspace open: ${names[space] || space}.`, `Industry list: ${SX.ind(sel.ind).name}. Company in focus: ${c.name} (${tickerOf(c)}). Comparison: ${sel.ids.map(id => SX.co(id).short).join(", ")}. Year: ${yLabel(sel.yi)}.`,
    rs && rs.profile && lvProfile(rs.profile) ? `Research subject (profile only): ${lvProfile(rs.profile).name}.` : null,
    doc ? `Open document: "${doc.title}" (${doc.parts.length} ${doc.unit}s).` : "No document is open.",
    aiDcfText() || "The DCF model is empty."].filter(Boolean).join(" ");
}
const AI_RULES = plain => `You are the analyst inside Valuation Studio, a company-analysis workbench. The person may have no finance background.
How to answer:
- Start with the direct answer in one or two sentences, then the supporting points.
- ${plain ? "Plain language: explain any financial term in a few words the first time (for example, \"ROE, the profit made on shareholders' money\"), use everyday comparisons, and say what each number means for the company." : "The person knows finance: be precise and compact, and use standard terms."}
- Get figures from the tools; never invent a number. If data is missing or uncertain, say so. Say where a figure comes from: the verified dataset, live data with its date, an open report with its part or page, or a web result with its site.
- Be balanced: give strengths and risks.
- On decisions such as whether to invest: help the person think it through: what the evidence says, what today's price assumes, the case for and against, what would change the view, and what to check next. You may say where the evidence points ("on these assumptions the shares look expensive"), but don't tell them to buy, sell or hold; end such answers with one short line that this is educational, not personal financial advice.
- Keep answers under 250 words unless asked for more. Use short headings or bullets when they help.`;

/* Tools the analyst may call: page functions, plus the viewer's live servers where they're reachable. */
function aiTools({ setSpace, getSel, onAct }) {
  const act = (l, f) => async (x, ctx) => { onAct && onAct(l(x)); return f(x, ctx); };
  const T = [
    { name: "get_current_view", description: "What the person is looking at now: workspace, company in focus, the comparison, the year, any open document and the DCF model. Call this first when a question says 'this'.",
      execute: act(() => "Checked the current view", () => aiViewText(getSel().space, getSel().sel)) },
    { name: "get_company", description: "Five-year figures, ratios, market multiples, credit scores and peer comparison for one loaded company (verified or live). Pass a name, short name or ticker; empty means the company in focus.",
      inputSchema: { type: "object", properties: { company: { type: "string" } } },
      execute: act(x => `Looked up ${x && x.company ? x.company : "the company in focus"}`, x => { const c = aiResolve(x && x.company); if (!c) throw new Error(`Not loaded: ${x && x.company}. Loaded: ${SUITE.cos.map(y => y.short).join(", ")}`); return aiCompanyPack(c, getSel().sel.ids.includes(c.id) ? getSel().sel.ids : [c.id]); }) },
    { name: "list_companies", description: "Names of every company on this device: the 47 verified Indian companies by industry, the pre-loaded ones and any loaded live.",
      execute: act(() => "Listed the loaded companies", () => SUITE.ind.map(g => `${g.name}: ${g.cos.map(id => SX.co(id).short).join(", ")}`).join("\n")) },
    { name: "get_dcf", description: "The DCF model's current result: value per share against the price, WACC, terminal growth, exit multiple and peer ranges.",
      execute: act(() => "Read the DCF model", () => aiDcfText() || "The DCF model is empty. The person can load a company under DCF valuation.") },
    { name: "explain_term", description: "The studio's glossary entry for a finance term (definition, why it matters, what to watch).",
      inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
      execute: act(x => `Looked up "${x.term}"`, x => { const key = String(x.term || "").toLowerCase().replace(/[^a-z]/g, ""); const g = (typeof GLOSSARY !== "undefined") && (GLOSSARY[key] || Object.values(GLOSSARY).find(v => v.t.toLowerCase().replace(/[^a-z]/g, "").includes(key)));
        return g ? `${g.t}: ${g.d} Why it matters: ${g.w} Watch out: ${g.c}` : "Not in the glossary; explain it from general knowledge."; }) },
    { name: "open_workspace", description: "Switch the page to a workspace so the person can see the detail: find, dcf, ratios, credit, wc, fpa or research.",
      inputSchema: { type: "object", properties: { workspace: { type: "string", enum: ["find", "dcf", "ratios", "credit", "wc", "fpa", "research"] } }, required: ["workspace"] },
      execute: act(x => `Opened ${x.workspace}`, x => { if (!SUITE_SPACES.some(s => s[0] === x.workspace)) throw new Error("Unknown workspace"); setSpace && setSpace(x.workspace); return "Done."; }) },
    { name: "search_report", description: "Search the open document (annual report, filing, transcript) for passages about a topic. Returns excerpts with part or page numbers to cite.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      execute: act(x => `Searched the open document for "${x.query}"`, x => { const d = rpCur(); if (!d) return "No document is open. The person can open one under Reports & AI."; const r = rpRank(d, String(x.query || ""), 6, 1400); return r.length ? r.map(p => `[${rpRef(d)} ${p.part}] ${p.text}`).join("\n\n") : "No passage matched; try other words."; }) },
    { name: "search_companies", description: "Search companies by name or ticker: those already on this device and, where a live connection exists, every listed company worldwide (Yahoo Finance). Returns symbols to load.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      execute: act(x => `Searched for "${x.query}"`, async (x, ctx) => {
        const q = String(x.query || ""), local = lvLocalSearch(q), rt = lvRoutes(await lvStatus()).quotes; let live = [], note = "";
        /* at home the wide search is free; away from home it costs a credit, so it runs only when the device has no match */
        if (rt === "home" || (rt === "cloud" && !local.length)) { try { live = await lvSearch(q, ctx && ctx.signal, !!local.length); } catch (e) { note = e && e.next ? "Only companies on this device were searched." : lvMessage(e); } }
        else if (!rt) note = "Only companies on this device were searched; live search isn't reachable from here.";
        return (lvMergeSearch(local, live).slice(0, 8).map(r => `${r.name} | ${r.symbol} | ${r.exch} | ${r.industry}${r.local ? " | on this device" : ""}`).join("\n") || "No match.") + (note ? `\n(${note})` : ""); }) },
    { name: "load_company", description: "Open a listed company so it can be analysed (by Yahoo symbol, e.g. RELIANCE.NS, AAPL, 7203.T): from this device when it's already here, otherwise by fetching its statements and price live. Set compare to true to add it to the current comparison.",
      inputSchema: { type: "object", properties: { symbol: { type: "string" }, compare: { type: "boolean" } }, required: ["symbol"] },
      execute: act(x => `Opened ${x.symbol}`, async (x, ctx) => { const s = getSel().sel; let r;
        try { r = await lvLoadInto(String(x.symbol || ""), { gid: x.compare ? s.ind : null, signal: ctx && ctx.signal, focus: !!x.compare }); }
        catch (e) { throw new Error(e && e.lv ? lvMessage(e) : (e && e.message) || "The company couldn't be loaded."); }
        return lvOutcome(r) + (r.id ? `\n\n${aiCompanyPack(SX.co(r.id), [r.id], false)}` : r.profile ? `\n\n${aiProfilePack(r.profile)}` : ""); }) },
    { name: "web_search", description: "Search the web for recent news or facts (results with site and snippet). Use for events, management commentary or anything newer than the statements.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      execute: act(x => `Searched the web: "${x.query}"`, async (x, ctx) => { let hits;
        try { hits = await lvWebSearch({ query: String(x.query || ""), max: 6 }, ctx && ctx.signal); } catch (e) { throw new Error(e && e.lv ? lvMessage(e) : (e && e.message) || "The web search failed."); }
        return hits.map(r => `${r.title} (${rpHost(r.url)}): ${r.snippet.replace(/\s+/g, " ").slice(0, 420)}`).join("\n\n") || "No results."; }) },
  ];
  return T;
}

/* ── One-click full analysis ── */
const AN_STORE = "vs:analyses";
const anLoad = () => { try { return JSON.parse(localStorage.getItem(AN_STORE)) || {}; } catch { return {}; } };
function anSave(key, v) { try { const m = anLoad(); m[key] = v; const ks = Object.keys(m).sort((a, b) => String(m[b].at).localeCompare(String(m[a].at))); ks.slice(6).forEach(k => delete m[k]); localStorage.setItem(AN_STORE, JSON.stringify(m)); } catch {} }
function FullAnalysis({ subject, sel, aiAvail, sampleRef, aiMessage, dlRef, flash, addLog, plain }) {
  const T = useT();
  const routes = useRoutes();
  const [st, setSt] = useState(() => { const s = anLoad()[subject.key]; return s ? { busy: false, text: s.text, err: null, at: s.at, stage: null } : { busy: false, text: null, err: null, at: null, stage: null }; });
  const [news, setNews] = useState(true);
  const [deeper, setDeeper] = useState(false);
  const ctl = useRef(null);
  useEffect(() => { const s = anLoad()[subject.key]; setSt(s ? { busy: false, text: s.text, err: null, at: s.at, stage: null } : { busy: false, text: null, err: null, at: null, stage: null }); }, [subject.key]);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  if (!aiAvail) return <Card><Title sub="Claude writes a complete, plain-language analysis of the company from everything in Valuation Studio.">Full company analysis</Title>
    <div style={{ fontSize: 12.5, color: T.textSec }}>AI features aren't available in this view.</div></Card>;
  const liveOk = !!routes.web;
  const run = async () => {
    const sample = sampleRef && sampleRef.current; if (!sample) return;
    try { ctl.current && ctl.current.abort(); } catch {}
    const c = new AbortController(); ctl.current = c;
    setSt({ busy: true, text: null, err: null, at: null, stage: "Gathering the figures…" });
    const pack = subject.kind === "co" ? aiCompanyPack(subject.c, sel.ids) : aiProfilePack(subject.p);
    const dcf = DCF_SNAP && DCF_SNAP.co && DCF_SNAP.co.name === subject.name ? aiDcfText() : null;
    const doc = rpCur(), docOk = doc && (!doc.company || doc.company === subject.name);
    let newsTxt = null;
    if (news && liveOk) {
      setSt(s => ({ ...s, stage: "Checking recent news…" }));
      try { const r = await lvWebSearch({ query: `${subject.name} news results outlook`, max: 6, recent: true }, c.signal);
        newsTxt = r.map(x => `- ${x.title} (${rpHost(x.url)}): ${x.snippet.replace(/\s+/g, " ").slice(0, 380)}`).join("\n"); }
      catch (e) { if (e && e.code === "cancelled") { setSt(s => ({ ...s, busy: false, stage: null })); return; } }
    }
    setSt(s => ({ ...s, stage: "Claude is writing…" }));
    const input = `Write a full analysis of ${subject.name} for ${plain ? "someone with no finance background who wants to understand the company and decide what to do next" : "a finance student preparing an equity and credit view"}. Use ONLY the information below; if something needed is missing, say so rather than guessing. Today is ${new Date().toDateString()}.

Sections, as markdown headings (##):
1. The company in brief — what it does and how it makes money (two or three sentences).
2. Verdict in plain words — five or six sentences: business quality, financial strength, what the share price assumes, and the main thing to watch.
3. Growth and profitability — the five-year trend in revenue, margins and returns, compared with peers.
4. Financial strength and credit risk — debt, interest cover, liquidity, and what the credit scores say.
5. Cash generation and working capital — is profit turning into cash; how long cash is tied up.
6. Valuation — what the multiples${dcf ? " and the DCF model" : ""} say about the price against peers; what growth the price seems to assume.
${docOk ? "7. From the company's own document — the points that matter, citing [Part N] or [Page N].\n" : ""}${newsTxt ? "8. Recent news — anything that changes the picture, with the site name.\n" : ""}9. Risks and red flags.
10. What could go right.
11. Questions to answer before deciding — a checklist of 5–7 items, each with where in Valuation Studio to check it.
12. Glossary — the terms used, one line each.

Rules: ${plain ? "short sentences; explain each financial term in a few words the first time; say what numbers mean (\"₹100 of sales turns into ₹14 of operating profit\"). " : ""}Quote figures with their year. Be balanced. Don't tell the reader to buy, sell or hold; end with one line that this is educational analysis, not personal financial advice. About ${deeper ? "1,800" : "1,300"} words.

COMPANY DATA
${pack}
${dcf ? `\nDCF MODEL\n${dcf}\n` : ""}${docOk ? `\nFROM "${doc.title}" (excerpts; cite as [${rpRef(doc)} N])\n${rpDigest(doc, 14000)}\n` : ""}${newsTxt ? `\nRECENT NEWS (web search, last month)\n${newsTxt}\n` : ""}`;
    try {
      const { text, truncated } = await sample(input, { modelTier: deeper ? "complex" : "default", signal: c.signal, cache: false, onText: ({ text }) => setSt(s => ({ ...s, text, stage: null })) });
      const at = new Date().toISOString();
      setSt({ busy: false, text, err: truncated ? "The analysis was cut short at the length limit." : null, at, stage: null });
      anSave(subject.key, { text, at });
      addLog && addLog("Full analysis written", subject.short);
    } catch (e) { setSt(s => ({ busy: false, text: e && e.text ? e.text : s.text, err: (aiMessage ? aiMessage(e) : "") || null, at: s.at, stage: null })); }
  };
  const fname = `${subject.short.replace(/[^A-Za-z0-9]+/g, "_")}_analysis_${new Date().toISOString().slice(0, 10)}`;
  return <Card>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <Title sub={`Claude brings together ${subject.short}'s figures, peers, credit scores${DCF_SNAP && DCF_SNAP.co && DCF_SNAP.co.name === subject.name ? ", your DCF" : ""}${rpCur() ? ", the open document" : ""}${liveOk ? " and recent news" : ""} into one ${plain ? "plain-language " : ""}analysis, with a checklist of what to look at before deciding.`}>Full company analysis</Title>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {st.text && !st.busy && <><Btn size="sm" variant="outline" onClick={() => aiSave(dlRef, flash, fname + ".docx", mdToDocx(`${subject.name}: company analysis`, st.text))}>Word</Btn>
          <Btn size="sm" variant="ghost" onClick={() => aiSave(dlRef, flash, fname + ".md", `# ${subject.name}: company analysis\n\n${st.text}\n`)}>Markdown</Btn></>}
        <Btn size="sm" variant="filled" onClick={run} disabled={st.busy}>{st.busy ? "Writing…" : st.text ? "Write it again" : "Write the analysis"}</Btn>
        {st.busy && <Btn size="sm" variant="ghost" onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} }}>Stop</Btn>}
      </div>
    </div>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: T.textSec, marginTop: 4 }}>
      {liveOk && <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={news} onChange={e => setNews(e.target.checked)} /> Include recent news{routes.web === "cloud" ? " (2 Firecrawl credits)" : ""}</label>}
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={deeper} onChange={e => setDeeper(e.target.checked)} /> Deeper analysis (slower)</label>
      {st.at && !st.busy && <span style={{ color: T.textMute }}>Written {lvWhen(st.at)}</span>}
    </div>
    {st.stage && <div style={{ fontSize: 12, color: T.textMute, marginTop: 12 }}>{st.stage}</div>}
    {st.err && <div style={{ fontSize: 12, color: T.red, marginTop: 10 }}>{st.err}</div>}
    {st.text && <div style={{ marginTop: 14, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <MdView text={st.text} onCite={n => rpJump(n)} />
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 12 }}>Written by Claude from the figures in Valuation Studio. Check anything important against the source.</div>
    </div>}
  </Card>;
}

/* ── The chat panel ── */
function AiDock({ space, setSpace, aiAvail, sampleRef, aiMessage, flash }) {
  const T = useT();
  const sel = useSuiteSel();
  useLive();
  const [open, setOpen] = useState(false);
  const routes = useRoutes();
  const [plain, setPlain] = usePlainMode();
  const [msgs, setMsgs] = useState([]);           // {role, text, acts?, err?}
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef(null), endRef = useRef(null), selRef = useRef({ space, sel });
  selRef.current = { space, sel };
  const [W, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => { try { endRef.current && endRef.current.scrollIntoView({ block: "end" }); } catch {} }, [msgs, open]);
  useEffect(() => () => { try { ctl.current && ctl.current.abort(); } catch {} }, []);
  if (!aiAvail) return null;
  const c = SX.co(sel.focus);
  const narrow = W < 640;
  const send = async (q) => {
    const text = String(q || draft).trim(); if (!text || busy) return;
    const sample = sampleRef && sampleRef.current; if (!sample) return;
    setDraft("");
    const history = msgs.filter(m => !m.err && m.text).slice(-10);
    const mine = { role: "user", text };
    setMsgs(m => [...m, mine, { role: "assistant", text: "", acts: [] }]);
    setBusy(true);
    const ctrl = new AbortController(); ctl.current = ctrl;
    const onAct = a => setMsgs(m => { const n = [...m]; const last = { ...n[n.length - 1] }; last.acts = [...(last.acts || []), a]; n[n.length - 1] = last; return n; });
    try {
      const lim = await sample.limits().catch(() => null);
      const useTools = !!(lim && lim.tools);
      let tools = useTools ? aiTools({ setSpace, getSel: () => selRef.current, onAct }) : undefined;
      if (tools && lim.tools.maxCount && tools.length > lim.tools.maxCount) tools = tools.slice(0, lim.tools.maxCount);
      const rt = lvRoutes(await lvStatus().catch(() => null));
      if (tools && !rt.web) tools = tools.filter(t => t.name !== "web_search");
      const ctx = `${AI_RULES(plain)}\n\nWhat the person sees right now: ${aiViewText(space, sel)}${useTools ? "" : `\n\nFigures for the company in focus:\n${aiCompanyPack(c, sel.ids)}`}`;
      const turns = [{ role: "user", content: ctx }];
      history.forEach(m => turns.push({ role: m.role, content: m.text.slice(0, 6000) }));
      turns.push({ role: "user", content: text });
      while (JSON.stringify(turns).length > 60000 && turns.length > 3) turns.splice(1, 1);
      const opts = { signal: ctrl.signal, modelTier: "default", onText: ({ text: t }) => setMsgs(m => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], text: t }; return n; }) };
      if (tools) opts.tools = tools; else opts.cache = false;
      const { text: answer, truncated } = await sample(turns, opts);
      setMsgs(m => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], text: answer + (truncated ? "\n\n_(Cut short — ask me to continue.)_" : "") }; return n; });
    } catch (e) {
      const msg = (aiMessage ? aiMessage(e) : "") || (e && e.code === "cancelled" ? "" : "Couldn't reach Claude just now.");
      setMsgs(m => { const n = [...m]; const last = n[n.length - 1]; n[n.length - 1] = { ...last, text: e && e.text ? e.text : last.text, err: msg || (last.text ? null : "Stopped.") }; return n; });
    }
    setBusy(false);
  };
  const chips = [`Explain this page in simple words`, `Is ${c.short} financially healthy?`, `What is ${c.short} worth, and why?`, `What are the biggest risks for ${c.short}?`,
    `How does ${c.short} compare with its peers?`, `What should I check before investing in ${c.short}?`];
  const panel = narrow ? { left: 0, right: 0, top: 0, bottom: 0, borderRadius: 0, width: "100%" } : { right: 16, bottom: 16, top: 16, width: Math.min(440, W - 32), borderRadius: 16 };
  return <>
    {!open && <button onClick={() => setOpen(true)} aria-label="Ask Claude, the AI analyst" style={{ position: "fixed", right: narrow ? 12 : 18, bottom: narrow ? 12 : 18, zIndex: 60, display: "inline-flex", alignItems: "center", gap: 8,
      background: T.primary, color: T.dark ? "#0E1319" : "#fff", border: "none", borderRadius: 999, padding: narrow ? "9px 14px" : "11px 18px", fontFamily: SANS, fontSize: narrow ? 12.5 : 13.5, fontWeight: 600, cursor: "pointer", boxShadow: T.sh3 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill="currentColor" /></svg>Ask Claude</button>}
    {open && <div role="dialog" aria-label="AI analyst" style={{ position: "fixed", zIndex: 70, background: T.surface, border: narrow ? "none" : `1px solid ${T.border}`, boxShadow: T.sh3, display: "flex", flexDirection: "column", overflow: "hidden", ...panel }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>AI analyst</div>
          <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Looking at {c.short} · {(SUITE_SPACES.find(s => s[0] === space) || [, ""])[1]}</div>
        </div>
        <Segment options={[["plain", "Plain"], ["pro", "Finance"]]} value={plain ? "plain" : "pro"} onChange={v => setPlain(v === "plain")} size="sm" />
        <button onClick={() => setOpen(false)} aria-label="Close the AI analyst" style={{ border: "none", background: "transparent", color: T.textSec, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "grid", gap: 12, alignContent: "start" }}>
        {!msgs.length && <div>
          <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.6 }}>Ask anything about the companies here, in your own words. Claude looks up the figures on this page, {routes.quotes ? "can search for and load other companies" : "can open any company on this device"}, reads any report you've opened, and explains what it all means.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>{chips.map(t => <button key={t} onClick={() => send(t)} style={{ border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text, borderRadius: 999, padding: "6px 11px", fontSize: 12, cursor: "pointer", fontFamily: SANS, textAlign: "left" }}>{t}</button>)}</div>
        </div>}
        {msgs.map((m, i) => m.role === "user"
          ? <div key={i} style={{ justifySelf: "end", maxWidth: "88%", background: T.primaryTint, color: T.primaryDark, borderRadius: "14px 14px 4px 14px", padding: "8px 12px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.text}</div>
          : <div key={i} style={{ maxWidth: "100%" }}>
            {m.acts && m.acts.length > 0 && <div style={{ fontSize: 11, color: T.textMute, marginBottom: 6, lineHeight: 1.5 }}>{m.acts.slice(-4).map((a, k) => <div key={k}>· {a}</div>)}</div>}
            {m.text ? <MdView text={m.text} compact onCite={n => { if (rpCur()) { setSpace && setSpace("research"); setTimeout(() => rpJump(n), 60); if (narrow) setOpen(false); } }} /> : !m.err && <div style={{ fontSize: 12.5, color: T.textMute }}>Thinking…</div>}
            {m.err && <div style={{ fontSize: 12, color: T.red, marginTop: 6 }}>{m.err}</div>}
          </div>)}
        <div ref={endRef} />
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, padding: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder={`Ask about ${c.short}, or anything on this page`} aria-label="Your question"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            style={{ flex: 1, minWidth: 0, resize: "none", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, padding: "9px 11px", fontSize: 13, fontFamily: SANS, outline: "none", lineHeight: 1.45 }} />
          {busy ? <Btn size="sm" variant="outline" onClick={() => { try { ctl.current && ctl.current.abort(); } catch {} }}>Stop</Btn>
            : <Btn size="sm" variant="filled" onClick={() => send()} disabled={!draft.trim()}>Send</Btn>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: T.textMute }}>
          <span>Uses your Claude usage. Educational, not investment advice.</span>
          {msgs.length > 0 && !busy && <button onClick={() => setMsgs([])} style={{ border: "none", background: "transparent", color: T.textSec, cursor: "pointer", fontSize: 11, fontFamily: SANS, padding: 0 }}>New chat</button>}
        </div>
      </div>
    </div>}
  </>;
}
