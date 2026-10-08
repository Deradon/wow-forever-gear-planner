"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { generate } = require("../../pipeline/main");
const emit = require("../../pipeline/emit");

const REPO = path.resolve(__dirname, "..", "..");
const opts = { repo: REPO, cache: path.join(REPO, "tests", "fixtures"), build: "1.60.1.70205", date: "2026-10-08", verify: false };

test("two generator runs on the fixture subset are byte-identical", () => {
  const a = generate(opts).files, b = generate(opts).files;
  assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const k of Object.keys(a)) assert.strictEqual(a[k], b[k], `${k}.js differs`);
});

test("the date is the only clock: another --date changes meta only", () => {
  const a = generate(opts).files, b = generate({ ...opts, date: "2026-10-09" }).files;
  for (const k of Object.keys(a)) if (k !== "meta") assert.strictEqual(a[k], b[k], `${k}.js depends on the date`);
  assert.notStrictEqual(a.meta, b.meta);
});

test("emitted files follow the data-file contract and round-trip through emit.parse", () => {
  const g = generate(opts);
  for (const [name, text] of Object.entries(g.files)) {
    assert.ok(text.endsWith("};\n"), `${name}: trailing ;\\n`);
    assert.ok(!text.includes("\r"), `${name}: LF only`);
    assert.strictEqual(text.split("\n")[0], emit.HEADER);
    const p = emit.parse(text);
    assert.strictEqual(p.section, name);
    assert.deepStrictEqual(p.value, JSON.parse(JSON.stringify(g.sections[name])));
  }
  assert.strictEqual(g.sections.meta.dataHash, emit.dataHash(g.files));
});

test("one record per line in row maps", () => {
  const text = generate(opts).files.items;
  const lines = text.split("\n").filter((l) => /^"\d+":\{"name"/.test(l));
  assert.strictEqual(lines.length, 18);
});
