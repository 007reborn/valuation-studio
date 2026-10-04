/* Render pass over the pre-loaded (library) companies: every workspace, every control that changes the view, desktop and phone,
   in the private and the public edition. A library group can hold a single company, so peer comparisons must degrade cleanly. */
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs");
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js", "xlsx.bundle.js": "node_modules/xlsx-js-style/dist/xlsx.bundle.js" };
const LIB = JSON.parse(fs.readFileSync("harvest/library.json", "utf8"));
const GROUPS = JSON.parse(fs.readFileSync("harvest/groups.json", "utf8")).groups;          // the pack's peer groups
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [], rows = []; let n = 0;
  for (const file of ["valuation_studio.html", "valuation_studio_public.html"]) for (const [w, h, tag] of [[1280, 900, "desk"], [390, 844, "phone"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", r => { const u = r.request().url(); if (u.startsWith("file://")) return r.continue(); const hit = Object.keys(local).find(k => u.endsWith(k)); if (hit) return r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(local[hit]) }); return r.abort(); });
    const p = await ctx.newPage(); const T = `${file.includes("public") ? "public" : "private"} ${tag}`;
    p.on("pageerror", e => errors.push(`[${T}] pageerror: ${e.message}`));
    p.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(`[${T}] console: ${m.text()}`); });
    await p.goto("file://" + path.resolve(file) + "#ratios"); await p.waitForTimeout(1300);
    const indSel = p.locator('select:has(option[value="pipes"])').first();
    const packIds = await indSel.evaluate(s => [...s.options].map(o => o.value).filter(v => v.startsWith("live:pack-")));
    const check = async label => { n++; const st = await p.evaluate(() => ({ bad: document.body.innerText.split("\n").filter(l => /NaN|Infinity|undefined|\[object|null/.test(l)).slice(0, 4), over: document.documentElement.scrollWidth - window.innerWidth, len: document.body.innerText.length, crash: /Something went wrong|crashed/i.test(document.body.innerText.slice(0, 4000)) }));
      if (st.bad.length || st.over > 1 || st.len < 500 || st.crash) rows.push(`${T} ${label}: ${JSON.stringify(st)}`); };
    const click = async name => { const q = p.getByRole("button", { name, exact: true }); if (await q.count()) { await q.first().click(); await p.waitForTimeout(70); return true; } return false; };
    if (packIds.length !== GROUPS.length) errors.push(`${T}: expected ${GROUPS.length} library groups in the picker, found ${packIds.join(",")}`);
    for (const space of ["ratios", "credit", "wc", "fpa", "dcf", "research"]) {
      const lbl = { dcf: /^DCF valuation/, ratios: /^Ratio analysis/, credit: /^Credit risk/, wc: /^Working capital/, fpa: /^FP&A variance/, research: /^Reports & AI/ }[space];
      await p.getByRole("button", { name: lbl }).first().click(); await p.waitForTimeout(450);
      if (space === "fpa") { const t = p.getByRole("button", { name: /^Listed companies/ }); if (await t.count()) { await t.first().click(); await p.waitForTimeout(200); } }
      if (space === "research") {      // the subject follows the last company in focus
        await check("research (last focus)"); continue; }
      for (const gid of packIds) {
        const sel = p.locator('select:has(option[value="pipes"])').first();
        if (!(await sel.count())) { errors.push(`${T} ${space}: no industry picker`); break; }
        await sel.selectOption(gid); await p.waitForTimeout(space === "dcf" ? 500 : 280);
        await check(`${space} ${gid}`);
        if (space === "ratios") { for (const nm of ["5-step", "3-step", "Balance sheet", "Income statement", "Cash flow"]) { if (await click(nm)) await check(`${space} ${gid} ${nm}`); }
          const ys = p.locator('select:has(option[value="1"]):has(option[value="4"])').first(); for (const y of ["1", "2", "3", "4"]) { await ys.selectOption(y).catch(() => {}); await p.waitForTimeout(90); await check(`${space} ${gid} year ${y}`); } }
        if (space === "credit") for (const nm of ["Lender", "Supplier", "Balanced", "Mild", "Crisis", "Severe"]) { if (await click(nm)) await check(`${space} ${gid} ${nm}`); }
        if (space === "wc") for (const nm of ["Top quartile", "Best peer", "Own best year", "Today", "Peer median", "3 years", "1 year"]) { if (await click(nm)) await check(`${space} ${gid} ${nm}`); }
        if (space === "dcf") { const go = p.getByRole("button", { name: /See what it.s worth/ }); if (await go.count()) { await go.first().click(); await p.waitForTimeout(500); await check(`${space} ${gid} result`); } }
      }
    }
    await ctx.close();
  }
  console.log(`${n} views checked; ${rows.length} with problems; ${errors.length} errors`);
  rows.slice(0, 25).forEach(r => console.log("  ", r.slice(0, 400))); errors.slice(0, 12).forEach(e => console.log("  ERR", e.slice(0, 300)));
  await b.close(); process.exit(rows.length || errors.length ? 1 : 0);
})();
