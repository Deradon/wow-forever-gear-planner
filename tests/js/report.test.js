"use strict";
// Build report diff section (game-data-pipeline §14 step 3 items 2–6) against a baseline directory, on the
// fixture subset: the baseline is the same build's output, edited so that every diff path has something to show.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generate } = require("../../pipeline/main");
const { report } = require("../../pipeline/report");
const emit = require("../../pipeline/emit");

const REPO = path.resolve(__dirname, "..", "..");
const CACHE = path.join(REPO, "tests", "fixtures");
const g = generate({ repo: REPO, cache: CACHE, build: "1.60.1.70205", date: "2026-10-08", verify: false });

const dirs = [];
test.after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

// Write the generated sections as a baseline directory after edit(sections) changed a deep copy.
function baseline(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fgp-base-"));
  dirs.push(dir);
  const s = JSON.parse(JSON.stringify(g.sections));
  edit(s);
  for (const name of ["meta", "items", "recipes", "mats", "sources"]) fs.writeFileSync(path.join(dir, `${name}.js`), emit.render(name, s[name]));
  return dir;
}
const diff = (dir) => report(g, { repo: REPO, cache: CACHE, verify: false, diffAgainst: dir }).split("## 8. Diff against ")[1];

test("diff: removed, changed field by field, added by family, counts, new content", () => {
  const dir = baseline((s) => {
    s.meta.build = "1.15.9.70003"; // the Era fixture's ItemSparse lacks the Forever-new items: R1 rows
    delete s.items.rows[2307]; delete s.recipes.rows[2158]; delete s.sources.rows[2158]; // added now
    s.items.rows[999999] = { ...s.items.rows[6214], name: "Old Test Blade", recipes: [999998] }; // removed now
    s.recipes.rows[999998] = { ...s.recipes.rows[7408], item: 999999 };
    s.items.rows[3851].stats = { Sta: 11 }; s.items.rows[3851].ilvl -= 1; // changed
    s.recipes.rows[3494].pattern = { id: 10858, name: null, bind: null, rep: null, spec: null, stub: true }; // stub became real
  });
  const d = diff(dir);
  assert.match(d, new RegExp(`^directory ${path.basename(dir)}\\n`), "a directory is named by its last component");
  assert.ok(!d.includes(os.tmpdir()), "no local path in the report");
  assert.match(d, /\| items \| 18 \| 18 \| 1 \| 1 \| 1 \|/);
  assert.match(d, /### 8\.1 Removed[^#]*- item Old Test Blade \(999999, req 11\)\n- recipe 999998 Old Test Blade \(Blacksmithing, gear\)/);
  assert.match(d, /- item Solid Iron Maul \(3851, req 26\): ilvl (\d+) → \d+; stats\.Sta 11 → 12\n/);
  assert.match(d, /- recipe 3494 Solid Iron Maul \(Blacksmithing, gear\): pattern\.name null → "Plans: Solid Iron Maul"; pattern\.bind null → "BoP"; pattern\.stub true → –\n/);
  assert.match(d, /### 8\.3 Added[^#]*- \*\*Leatherworking · [^*]+\*\*: Fine Leather Boots \(2307, req 13\)/);
  assert.match(d, /\| Leatherworking \| [^\n]*\d+ → \d+/, "profession counts show old → new where they differ");
  assert.match(d, /R1 becoming real\): [^\n]*Glimmering Staff \(249392, req \d+\)/);
  assert.match(d, /Stub patterns that became real \(R3\): 3494 Solid Iron Maul \(Blacksmithing, gear\) → Plans: Solid Iron Maul \(10858\)/);
});

test("diff: an identical baseline shows no changes and skips R1 for the same build", () => {
  const d = diff(baseline(() => {}));
  assert.match(d, /\| items \| 18 \| 18 \| 0 \| 0 \| 0 \|/);
  for (const h of ["8.1 Removed", "8.2 Changed", "8.3 Added"]) assert.match(d, new RegExp(`### ${h.replace(".", "\\.")}[^\\n]*\\n\\nNone\\.`));
  assert.match(d, /R1: same build as the baseline, not checked/);
});

test("diff: an unreadable baseline is reported, not thrown", () => {
  assert.match(diff("no-such-tag-fgp"), /^no-such-tag-fgp\n\nBaseline not readable/);
});
