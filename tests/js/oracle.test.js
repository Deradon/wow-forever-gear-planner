"use strict";
// Ranking quality gate (D30): the scrubbed oracle of the prototype's curated level 1–30 core picks.
// A row counts when its item (or its faction mirror) is in a core step covering that level in the path for that
// class, role and slot group. Gate: ≥ 80 % of the core rows; optional rows are reported only.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadSite } = require("./helpers/load-site");

const FIXTURE = path.resolve(__dirname, "..", "fixtures", "oracle.json");
const GATE = 0.8;

test("oracle: core picks reproduced", { skip: !fs.existsSync(FIXTURE) && "tests/fixtures/oracle.json is not in the tree yet (produced privately, D30)" }, (t) => {
  const o = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const { data, lib } = loadSite();
  const rank = lib.rank, items = data.items.rows, paths = {};
  const tally = { core: [0, 0], optional: [0, 0] }, misses = [];
  for (const r of o.rows) {
    const key = JSON.stringify([r.cls, r.role, r.profs || [], r.options || {}]);
    if (!paths[key]) {
      const entry = { id: "roracle", cls: r.cls, role: r.role, level: 1, professions: (r.profs || []).map((id) => ({ id, skill: null })), options: r.options || {} };
      paths[key] = rank.path(data, { faction: o.faction || "alliance", includeAH: true, entries: [entry] }, entry, { allLearned: true });
    }
    const group = paths[key].groups.find((g) => g.id === rank.groupOf(data.rules, r.slot));
    const it = items[r.item], ids = [r.item].concat(it && it.mirror ? [it.mirror] : []);
    const hit = !!group && group.steps.some((s) => s.core && s.from <= r.level && r.level <= s.to && s.items.some((id) => ids.includes(id)));
    const bucket = r.core === false ? "optional" : "core";
    tally[bucket][1]++;
    if (hit) tally[bucket][0]++;
    else if (bucket === "core") misses.push(`${r.cls} ${r.role} L${r.level} ${r.slot}: ${it ? it.name : r.item}`);
  }
  const pct = (x) => (x[1] ? (100 * x[0] / x[1]).toFixed(1) : "–");
  t.diagnostic(`core ${tally.core[0]}/${tally.core[1]} (${pct(tally.core)} %), optional ${tally.optional[0]}/${tally.optional[1]} (${pct(tally.optional)} %)`);
  for (const m of misses) t.diagnostic(`core miss: ${m}`);
  assert.ok(tally.core[1] > 0, "the fixture has core rows");
  assert.ok(tally.core[0] / tally.core[1] >= GATE, `core picks reproduced: ${pct(tally.core)} % < ${GATE * 100} %`);
});
