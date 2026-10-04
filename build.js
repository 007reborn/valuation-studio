/* Builds valuation_studio.html = live page + analysis suite, using AST positions for every patch. */
const fs = require("fs");
const babel = require("@babel/core");
const parser = require("@babel/parser");
/* node build.js [source.html] [out.html] [--public]
   --public builds the edition that can be shared with anyone: the same page with no connector access and no data store,
   working from the verified dataset and the pre-loaded library only. */
const ARGS = process.argv.slice(2).filter(a => !a.startsWith("--")), PUBLIC = process.argv.includes("--public");
const SRC = ARGS[0] || "pub_current.html", OUT = ARGS[1] || (PUBLIC ? "valuation_studio_public.html" : "valuation_studio.html");
const LIB = fs.existsSync("harvest/library.json") ? JSON.parse(fs.readFileSync("harvest/library.json", "utf8")) : null;
const html = fs.readFileSync(SRC, "utf8");

/* 1. the inline application script */
const sOpen = html.indexOf("<script>\ntry {");
if (sOpen < 0) throw new Error("app script not found");
const sStart = sOpen + "<script>\n".length;
const sEnd = html.indexOf("</script>", sStart);
let app = html.slice(sStart, sEnd);

/* 1b. input labels: the model stores money in millions and shares in millions; only results are shown in crore */
for (const [from, to] of [
  ['`Shares outstanding (${unit === "Cr" ? "crore" : unit === "Bn" ? "billions" : "millions"})`', '"Shares outstanding (millions)"'],
  ['`Shares outstanding (${unit === "Cr" ? "crore" : "millions"})`', '"Shares outstanding (millions)"'],
  ['`Total debt (${unit})`', '`Total debt (${cur} million)`'],
  ['`Cash & investments (${unit})`', '`Cash & investments (${cur} million)`'],
  ['revenue (${unit})`', 'revenue (${cur} million)`'],
  ['cur, " ", unit === "Cr" ? "crore" : unit === "Bn" ? "billions" : "millions"), ", under "',
   'cur, " million"), unit !== "Mn" ? " (results are shown in " + (unit === "Cr" ? "crore" : "billions") + ")" : "", ", under "'],
  ['"Historical financials · ", co.basis, " · ", std.label, " · ", cur, " ", unit)', '"Historical financials · ", co.basis, " · ", std.label, " · ", cur, " million")'],
  ['[["Shares outstanding", "shares"], ["Market price", "price"], ["Total debt", "debt"], ["Cash & investments", "cash"], ["Minority interest", "mi"], ["Preferred stock", "ps"]]',
   '[["Shares outstanding (millions)", "shares"], ["Market price per share", "price"], ["Total debt (million)", "debt"], ["Cash & investments (million)", "cash"], ["Minority interest (million)", "mi"], ["Preferred stock (million)", "ps"]]'],
]) { const n = app.split(from).length - 1; if (n !== 1) throw new Error(`label patch matched ${n} times: ${from.slice(0, 60)}`); app = app.replace(from, () => to); }

/* 1c. opened as an ordinary web page (outside Claude) there is no download capability to ask for, and none is needed:
      the browser's own download works there. Inside Claude the capability stays the only way. */
{ const from = `        if (alive && d) {
          dlRef.current = d;
          setDlAvail(true);
        }`;
  const to = from + ` else if (alive && !(window.claude && window.claude.use)) {
          dlRef.current = { save: async ({ filename, data }) => {
            const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
            const a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 4000); return { status: "saved" }; } };
          setDlAvail(true);
        }`;
  const n = app.split(from).length - 1; if (n !== 1) throw new Error(`download patch matched ${n} times`); app = app.replace(from, () => to); }

/* 1d. a model value at or below zero leaves no threshold to compare the market price with */
{ const from = '`${fp((toN(co.price) - buyBelow) / buyBelow * 100)} above your threshold`';
  const to = '(buyBelow > 0 ? `${fp((toN(co.price) - buyBelow) / buyBelow * 100)} above your threshold` : "The model shows no positive value per share on these assumptions")';
  const n = app.split(from).length - 1; if (n !== 1) throw new Error(`threshold patch matched ${n} times`); app = app.replace(from, () => to); }

/* 2. compile the suite */
const raw = JSON.parse(fs.readFileSync("suite_src2.json", "utf8"));
const SUITE_FILES = ["suite_live_engine.js", "suite_sync.js", "suite_core.jsx", "suite_ratios.jsx", "suite_credit.jsx", "suite_wc.jsx", "suite_fpa.jsx", "suite_dcf.jsx",
  "suite_live.jsx", "suite_reports.jsx", "suite_ai.jsx"];
let suiteFiles = SUITE_FILES.map(f => fs.readFileSync(f, "utf8")).join("\n");
/* The public edition declares no connector access, so it doesn't ask the runtime for it either. */
if (PUBLIC) { const from = 'await window.claude.use("mcp")', n = suiteFiles.split(from).length - 1;
  if (n !== 1) throw new Error(`public cut matched ${n} times`); suiteFiles = suiteFiles.replace(from, () => "null"); }
/* Who built it: shown on the public edition only. */
const CREDIT = PUBLIC && fs.existsSync("credit.json") ? JSON.parse(fs.readFileSync("credit.json", "utf8")) : null;
const suiteSrc = `const VS_PUBLIC = ${PUBLIC ? "true" : "false"};\nconst VS_LIBRARY = ${LIB ? JSON.stringify(LIB) : "null"};\nconst VS_CREDIT = ${JSON.stringify(CREDIT)};\n`
  + fs.readFileSync("suite_engine.js", "utf8").replace("__SUITE_JSON__", () => JSON.stringify(raw))
  + "\n" + suiteFiles;
const suiteJs = babel.transformSync(suiteSrc, { presets: [["@babel/preset-react", { runtime: "classic" }]], babelrc: false, configFile: false, compact: false }).code;
const gloss = fs.readFileSync("glossary_add.js", "utf8").trim().replace(/^\(\{/, "").replace(/\}\)$/, "").trim();

/* 3. locate patch points */
const ast = parser.parse(app, { sourceType: "script", ranges: false });
const edits = [];
const walk = (node, fn, parent) => { if (!node || typeof node.type !== "string") return; fn(node, parent);
  for (const k of Object.keys(node)) { const v = node[k]; if (k === "loc") continue;
    if (Array.isArray(v)) v.forEach(n => n && typeof n.type === "string" && walk(n, fn, node));
    else if (v && typeof v.type === "string") walk(v, fn, node); } };
const isCE = (n, first) => n && n.type === "CallExpression" && n.callee.type === "MemberExpression" &&
  n.callee.object.name === "React" && n.callee.property.name === "createElement" &&
  (first === undefined || (n.arguments[0] && (n.arguments[0].name === first || n.arguments[0].value === first)));
const prop = (obj, key) => obj && obj.type === "ObjectExpression" ? obj.properties.find(p => p.key && (p.key.name === key || p.key.value === key)) : null;
const src = n => app.slice(n.start, n.end);
let vs = null, modeDecl = null, glossObj = null, barGroup = null, subJoin = null, mainBox = null, footSpan = null, presetsObj = null, loadPresetFn = null, compsDecl = null;
walk(ast, (n, parent) => {
  if (n.type === "FunctionDeclaration" && n.id && n.id.name === "ValuationStudio") vs = n;
  if (n.type === "VariableDeclaration" && n.declarations[0].id.type === "ArrayPattern" &&
      n.declarations[0].id.elements.map(e => e && e.name).join(",") === "mode,setMode") modeDecl = n;
  if (n.type === "VariableDeclarator" && n.id.name === "GLOSSARY") glossObj = n.init;
  if (n.type === "VariableDeclarator" && n.id.name === "PRESETS") presetsObj = n.init;
  if (n.type === "VariableDeclarator" && n.id.name === "loadPreset" && n.init && n.init.type === "ArrowFunctionExpression") loadPresetFn = n.init;
  if (n.type === "VariableDeclaration" && n.declarations.length === 1 && n.declarations[0].id.name === "compsR") compsDecl = n;
  if (isCE(n, "Segment")) { const o = prop(n.arguments[1], "options");
    if (o && src(o.value).includes('"guided"')) barGroup = parent; }
  if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property.name === "join" &&
      src(n).startsWith('[co.name || "No company yet"')) subJoin = n;
  if (isCE(n, "div")) { const st = prop(n.arguments[1], "style");
    if (st && prop(st.value, "maxWidth") && prop(st.value, "maxWidth").value.value === 1160 &&
        prop(st.value, "padding") && prop(st.value, "padding").value.value === "22px 22px") mainBox = n; }
  if (isCE(n, "span") && n.arguments.some(a => a.type === "StringLiteral" && a.value.startsWith("FCFF = NOPAT"))) footSpan = n;
});
for (const [k, v] of Object.entries({ vs, modeDecl, glossObj, barGroup, subJoin, mainBox, footSpan, presetsObj, loadPresetFn, compsDecl })) if (!v) throw new Error("patch point missing: " + k);
if (!isCE(barGroup)) throw new Error("bar group is not createElement");

/* a. suite code before ValuationStudio */
edits.push([vs.start, vs.start, suiteJs + "\n"]);
/* b. workspace state */
edits.push([modeDecl.end, modeDecl.end, `
  const [space, setSpaceRaw] = useState(() => {
    try { const h = (window.location.hash || "").slice(1); if (SUITE_SPACES.some(s => s[0] === h)) return h; } catch {}
    try { const s = localStorage.getItem("vs:space"); if (SUITE_SPACES.some(x => x[0] === s)) return s; } catch {}
    return "dcf";
  });
  const setSpace = v => {
    setSpaceRaw(v);
    try { localStorage.setItem("vs:space", v); } catch {}
    try { history.replaceState(null, "", "#" + v); } catch {}
    try { addLog("Workspace opened", v); } catch {}
  };`]);
/* c. DCF-only controls in the app bar */
let wrapped = 0;
barGroup.arguments.slice(2).forEach(a => {
  const s = src(a);
  const dcfOnly = (isCE(a, "Segment") && s.includes('"guided"')) || (isCE(a, "Sel") && s.includes("loadPreset")) ||
    (a.type === "LogicalExpression" && s.includes("exportXLSX")) || (isCE(a, "Btn") && (s.includes("saveModel") || s.includes("resetAll")));
  if (dcfOnly) { edits.push([a.start, a.end, `space === "dcf" && (${s})`]); wrapped++; }
});
if (wrapped !== 5) throw new Error("expected 5 DCF-only app-bar controls, wrapped " + wrapped);
/* d. subtitle */
edits.push([subJoin.start, subJoin.end, `(space === "dcf" ? ${src(subJoin)} : space === "fpa" ? "Budget against actual · year-on-year bridges · ₹ crore" : space === "find" ? ${JSON.stringify(PUBLIC ? "Every company in this edition, by name or industry" : "Search any listed company · compare it in every workspace")} : space === "research" ? "Annual reports and filings · AI analysis" : ${JSON.stringify(PUBLIC ? "47 verified companies and the pre-loaded library · ₹ crore" : "47 verified companies + any company loaded live · ₹ crore")})`]);
/* e. main container: nav first, DCF content only in the DCF space, suite otherwise */
const kids = mainBox.arguments.slice(2);
edits.push([kids[0].start, kids[0].start, `React.createElement(SuiteNav, { space, onChange: setSpace }), space === "dcf" && React.createElement(DcfPicker, { loadPreset, resetAll, co, setCompsIn, setWaccIn, waccIn, flash, addLog }), `]);
kids.forEach(k => edits.push([k.start, k.end, `space === "dcf" && (${src(k)})`]));
const lastKid = kids[kids.length - 1];
edits.push([lastKid.end, lastKid.end, `, space !== "dcf" && React.createElement(AnalysisSuite, { space, setSpace, flash, addLog, aiAvail, sampleRef, aiMessage, dlRef }), React.createElement(AiDock, { space, setSpace, aiAvail, sampleRef, aiMessage, dlRef, flash, addLog }), React.createElement(SuiteCredit, null)`]);
/* f. footer formula */
edits.push([footSpan.start, footSpan.end, `(space === "dcf" ? ${src(footSpan)} : React.createElement("span", null, space === "fpa" ? "Revenue variance = price + mix + volume. EBITDA bridge adds exactly from budget to actual." : space === "find" || space === "research" ? ${JSON.stringify(PUBLIC ? "This public edition works with the companies built into it. AI answers use the viewer's own Claude account." : "Live data comes through the Yahoo Finance, Tavily and SEC EDGAR servers on your home computer, or through your Firecrawl connector when you're away from it. AI answers use your Claude account.")} : ${JSON.stringify(PUBLIC ? "Ratio, credit, working-capital and peer FP&A figures: consolidated statements for 47 NSE-listed companies (FY2022–FY2026) and the pre-loaded companies, ₹ crore." : "Ratio, credit, working-capital and peer FP&A figures: consolidated statements for 47 NSE-listed companies (FY2022–FY2026) and any company loaded live, ₹ crore.")}))`]);
/* j. the DCF model's current result, for the AI analyst */
edits.push([compsDecl.end, compsDecl.end, `\n  try { DCF_SNAP = { co, cur, unit, effWACC, gN, dcf, exitR, exitN, vd, compsR, checks, asOf }; } catch (e) {}`]);
/* h. loadPreset also accepts a ready-made preset object (used by the DCF company picker) */
{ const p0 = loadPresetFn.params[0];
  if (loadPresetFn.params.length !== 1 || p0.name !== "name") throw new Error("loadPreset signature changed");
  edits.push([p0.start, p0.end, "(name, obj)"]);
  const body = src(loadPresetFn.body), at = body.indexOf("PRESETS[name]");
  if (at < 0) throw new Error("PRESETS[name] not found in loadPreset");
  edits.push([loadPresetFn.body.start + at, loadPresetFn.body.start + at + "PRESETS[name]".length, "(obj || PRESETS[name])"]); }
/* i. remove the approximate Infosys example: the picker now loads Infosys from verified data */
{ const props = presetsObj.properties, k = props.findIndex(p => p.key && p.key.value === "Infosys (India)");
  if (k < 0) throw new Error("Infosys preset not found");
  edits.push([props[k].start, props[k + 1] ? props[k + 1].start : props[k].end, ""]); }
/* g. glossary entries */
const lastProp = glossObj.properties[glossObj.properties.length - 1];
edits.push([lastProp.end, lastProp.end, ",\n  " + gloss]);

/* 4. apply, last first; nested edits on the same span were written to compose */
edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
for (const [s, e, t] of edits) app = app.slice(0, s) + t + app.slice(e);
parser.parse(app, { sourceType: "script" });          // throws if the patch broke syntax

let out = html.slice(0, sStart) + app + html.slice(sEnd);
if (!out.includes("<title>Valuation Studio — DCF Modeler</title>")) throw new Error("title not found");
out = out.replace("<title>Valuation Studio — DCF Modeler</title>", PUBLIC ? "<title>Valuation Studio Public Edition</title>" : "<title>Valuation Studio</title>");
fs.writeFileSync(OUT, out);
console.log(`${PUBLIC ? "public" : "private"} edition, library: ${LIB ? LIB.recs.length + " companies + " + LIB.profiles.length + " profiles" : "none"}`);
console.log(`built ${OUT}: ${(out.length / 1024).toFixed(1)} KB (was ${(html.length / 1024).toFixed(1)} KB), ${edits.length} edits`);
