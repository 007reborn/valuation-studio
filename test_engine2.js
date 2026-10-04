/* Checks the JS engine against the independent Python reference (ref2.json) for every company and year. */
const fs = require("fs"), vm = require("vm");
const raw = JSON.parse(fs.readFileSync("suite_src2.json", "utf8"));
const src = fs.readFileSync("suite_engine.js", "utf8").replace("__SUITE_JSON__", JSON.stringify(raw));
const ctx = { console, Math, JSON, Object, Array, Number, String, isFinite, Infinity };
vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.E = { SUITE, SUITE_R, SX, suiteMarket, peerMedian, dupontGap, altman, piotroski, creditScore, beneish, zmijewski, yoyBridge, creditStress, debtHeadroom, bottomUpBeta, growthTable, commonSize, wcRelease, peerIds };", ctx);
const E = ctx.E, ref = JSON.parse(fs.readFileSync("ref2.json", "utf8"));
let n = 0, bad = [];
const near = (a, b, tol, tag) => {
  n++;
  if (a == null && b == null) return;
  if (a == null || b == null || Math.abs(a - b) > tol * Math.max(1, Math.abs(b))) bad.push(`${tag}: js ${a} vs py ${b}`);
};
for (const ind of E.SUITE.ind) {
  const ids = ind.cos.slice(0, 5);
  for (const id of ids) {
    const c = E.SX.co(id), R = ref[id];
    ["FY2023", "FY2024", "FY2025", "FY2026"].forEach((y, k) => {
      const i = k + 1, r = E.SUITE_R[id][i], P = R[y];
      for (const key of Object.keys(P.r)) near(r[key], P.r[key], 1e-9, `${id} ${y} ${key}`);
      near(E.altman(c, i).ems, P.ems, 1e-9, `${id} ${y} ems`);
      near(E.creditScore(c, i).score, P.score, 1e-9, `${id} ${y} score`);
      near(E.zmijewski(c, i).p, P.zm, 1e-9, `${id} ${y} zmijewski`);
      near(E.beneish(c, i).m, P.m, 1e-9, `${id} ${y} beneish`);
      const yb = E.yoyBridge(c, i);
      near(yb.vol, P.yoy[0], 1e-9, `${id} ${y} yoy vol`); near(yb.mar, P.yoy[1], 1e-9, `${id} ${y} yoy margin`);
      near(yb.cost, P.yoy[2], 1e-9, `${id} ${y} yoy cost`); near(yb.vol + yb.mar + yb.cost + yb.resid, P.yoy[3], 1e-9, `${id} ${y} yoy sum`);
      if (Math.abs(yb.resid) > Math.max(3, 0.002 * c.rev[i])) bad.push(`${id} ${y} yoy rounding residual too big: ${yb.resid}`);
      near(E.creditStress(c, i, 20, 200).score, P.stress, 1e-9, `${id} ${y} stress`);
      near(E.debtHeadroom(c, i, 2.5, 3.0, 9).cap, P.head, 1e-9, `${id} ${y} headroom`);
      for (const key of Object.keys(P.med)) near(E.peerMedian(key, id, i, ids), P.med[key], 1e-9, `${id} ${y} median ${key}`);
      const dg = E.dupontGap(r, { nm: E.peerMedian("nm", id, i, ids), ato: E.peerMedian("ato", id, i, ids), emult: E.peerMedian("emult", id, i, ids) });
      if (P.dup) { near(dg.gap, P.dup[0], 1e-9, `${id} ${y} dupont gap`); dg.parts.forEach((p, j) => near(p.pts, P.dup[j + 1], 1e-9, `${id} ${y} dupont ${p.l}`));
        near(dg.parts.reduce((s, p) => s + p.pts, 0), dg.gap, 1e-9, `${id} ${y} dupont sums`); }
      else if (dg) bad.push(`${id} ${y} dupont should be n/a`);
      if (P.pf != null) near(E.piotroski(c, i).score, P.pf, 0, `${id} ${y} piotroski`);
      const cs = E.commonSize(c, i);
      const bsA = cs.bs.slice(0, 8).reduce((s, r) => s + r[1], 0), bsL = cs.bs.slice(9, 14).reduce((s, r) => s + r[1], 0);
      near(bsA, 100, 1e-9, `${id} ${y} common-size assets`); near(bsL, 100, 5e-4, `${id} ${y} common-size liabilities+equity`);
    });
    const m = E.suiteMarket(c);
    near(E.altman(c, 4, c.mcap).z, R.z, 1e-9, `${id} z`); near(m.pe, R.pe, 1e-9, `${id} pe`); near(m.evEbitda, R.evEbitda, 1e-9, `${id} evEbitda`);
    const bu = E.bottomUpBeta(id, ids); near(bu ? bu.relevered : null, R.bu, 1e-9, `${id} bottom-up beta`);
    near(E.growthTable(c, 4)[0].c3, R.cagr3, 1e-9, `${id} revenue 3y CAGR`);
  }
}
console.log(`${n} checks, ${bad.length} mismatches`);
bad.slice(0, 40).forEach(b => console.log("  ", b));
process.exit(bad.length ? 1 : 0);
