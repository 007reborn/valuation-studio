/* Render pass over every workspace × industry × company, at desktop, phone and dark settings.
   Records page errors, horizontal overflow and empty renders; saves screenshots. */
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs");
const FILE = "file://" + path.resolve(process.argv[2] || "valuation_studio.html");
const SHOT = process.argv[3] || "shots";
const ONLY = process.argv[4] || "";            // e.g. "desk" to run one viewport
const local = {
  "react.production.min.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "xlsx.bundle.js": "node_modules/xlsx-js-style/dist/xlsx.bundle.js",
};
const IND = JSON.parse(fs.readFileSync("suite_src2.json", "utf8")).industries;
const SHORT = Object.fromEntries(JSON.parse(fs.readFileSync("suite_src2.json", "utf8")).cos.map(c => [c.id, c.short]));
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [], results = [];
  const mk = async (w, h, dark) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
    await ctx.route("**/*", r => { const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      const hit = Object.keys(local).find(k => u.endsWith(k));
      if (hit) return r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(local[hit]) });
      return r.abort(); });
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(`[${w}${dark ? " dark" : ""}] pageerror: ${e.message}`));
    p.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(`[${w}] console: ${m.text()}`); });
    return p;
  };
  const snap = async (p, tag, label) => {
    const st = await p.evaluate(() => ({ text: document.body.innerText.length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      boot: !!document.getElementById("boot"), crash: /Something went wrong|crashed/i.test(document.body.innerText.slice(0, 4000)) }));
    results.push({ tag, label, ...st });
  };
  const click = async (p, name, nth = 0, tag = "") => {
    const b = p.getByRole("button", { name, exact: true });
    const n = await b.count();
    if (n <= nth) { errors.push(`${tag} missing button "${name}" #${nth}`); return false; }
    await b.nth(nth).click(); await p.waitForTimeout(60); return true;
  };
  const indSel = p => p.locator('select:has(option[value="pipes"])').first();
  const yearSel = p => p.locator('select:has(option[value="1"]):has(option[value="4"])').first();
  for (const [w, h, tag, dark] of [[1280, 900, "desk", false], [390, 844, "phone", false], [1280, 900, "dark", true]]) {
    if (ONLY && ONLY !== tag) continue;
    const p = await mk(w, h, dark);
    await p.goto(FILE + "#ratios"); await p.waitForTimeout(1200);
    for (const space of ["ratios", "credit", "wc", "fpa", "dcf"]) {
      const lbl = { dcf: /^DCF valuation/, ratios: /^Ratio analysis/, credit: /^Credit risk/, wc: /^Working capital/, fpa: /^FP&A variance/ }[space];
      await p.getByRole("button", { name: lbl }).first().click(); await p.waitForTimeout(400);
      for (const ind of IND) {
        if (tag !== "desk" && !["pipes", "it", "gas"].includes(ind.id)) continue;
        await indSel(p).selectOption(ind.id); await p.waitForTimeout(250);
        const cos = ind.cos;
        for (const [k, id] of cos.entries()) {
          const nm = SHORT[id];
          if (space === "dcf") { if (k > 1 && tag !== "desk") break; await click(p, nm, 1, `${tag} dcf ${ind.id}`); await p.waitForTimeout(250); }
          else await click(p, nm, 1, `${tag} ${space} ${ind.id}`);
          if (space === "ratios" && k === 0) {
            await click(p, "5-step", 0, tag); await click(p, "Balance sheet", 0, tag);
            await p.locator("tr", { hasText: "Interest coverage" }).first().click().catch(() => {});
            await yearSel(p).selectOption("1").catch(() => errors.push("no year select")); await p.waitForTimeout(150); await snap(p, tag, `${space} ${ind.id} ${id} FY2023`);
            await yearSel(p).selectOption("4");
          }
          if (space === "credit" && k === 0) { for (const b of ["Lender", "Supplier", "Balanced", "Mild", "Crisis", "Severe"]) await click(p, b, 0, `${tag} credit`);
            await yearSel(p).selectOption("2"); await p.waitForTimeout(120); await snap(p, tag, `${space} ${ind.id} ${id} FY2024`); await yearSel(p).selectOption("4"); }
          if (space === "wc" && k === 0 && cos.length > 1) { for (const b of ["Top quartile", "Best peer", "Own best year", "Today", "Peer median", "3 years", "1 year"]) await click(p, b, 0, `${tag} wc`); }
          if (space === "fpa" && k === 0) {
            for (const b of ["Quarter", "Year to date", "Month", "Revenue", "Gross margin", "EBITDA", "Full year"]) await click(p, b, 0, `${tag} fpa`);
            await p.getByRole("button", { name: /^Listed companies/ }).first().click(); await p.waitForTimeout(150); await snap(p, tag, `fpa yoy ${ind.id}`);
            await p.getByRole("button", { name: /^Budget vs actual/ }).first().click(); await p.waitForTimeout(150);
          }
          await snap(p, tag, `${space} ${ind.id} ${id}`);
        }
        /* drop a peer and add it back */
        if (cos.length > 2 && space !== "fpa") { const last = SHORT[cos[cos.length - 1]];
          await click(p, SHORT[cos[0]], 1, `${tag} refocus`); await p.waitForTimeout(space === "dcf" ? 250 : 80);
          await click(p, last, 0, `${tag} toggle`); await p.waitForTimeout(120); await snap(p, tag, `${space} ${ind.id} minus ${last}`); await click(p, last, 0, `${tag} toggle`); }
        if (space === "dcf" && ind.id === "pipes") {
          await click(p, SHORT[cos[0]], 1, "dcf prince");
          await p.getByRole("button", { name: /^Consolidated · 25 Sep/ }).first().click().catch(() => errors.push("no basis toggle"));
          await p.waitForTimeout(250); await snap(p, tag, "dcf prince consolidated");
          await p.getByRole("button", { name: /^SIP model/ }).first().click().catch(() => {});
          await click(p, "Reset company", 0, "dcf"); await click(p, "Blank model", 0, "dcf"); await p.waitForTimeout(200);
          await click(p, SHORT[cos[1]], 1, "dcf after blank"); await p.waitForTimeout(250); await snap(p, tag, "dcf after blank");
        }
        if (ind.id === "pipes" || ind.id === "it") { await p.waitForTimeout(200); await p.screenshot({ path: `${SHOT}/${tag}_${space}_${ind.id}.png`, fullPage: true }); }
      }
    }
    await p.context().close();
  }
  await browser.close();
  const bad = results.filter(r => r.boot || r.crash || r.text < 800 || r.sw > r.cw + 1);
  console.log("checks:", results.length, "| problems:", bad.length);
  bad.slice(0, 30).forEach(b => console.log("  ", JSON.stringify(b)));
  const ue = [...new Set(errors)];
  console.log("errors:", ue.length); ue.slice(0, 30).forEach(e => console.log("  ", e));
})();
