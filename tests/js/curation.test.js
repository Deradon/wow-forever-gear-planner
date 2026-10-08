"use strict";
// curation/*.json: schema (pipeline/curation.js) and reference integrity against the committed data.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const curation = require("../../pipeline/curation");
const { loadSite } = require("./helpers/load-site");

const DIR = path.resolve(__dirname, "..", "..", "curation");
const site = loadSite();

function known(data) {
  return {
    items: new Map(Object.entries(data.items.rows).map(([id, it]) => [+id, it.name])),
    mats: new Map(Object.entries(data.mats.rows).map(([id, m]) => [+id, m.name])),
    factions: new Set(Object.keys(data.sources.factions).map(Number)),
  };
}

test("every curation file passes the schema", () => {
  const { errors } = curation.load(DIR);
  assert.deepStrictEqual(errors, []);
});

test("references resolve against the committed data", () => {
  const { data } = curation.load(DIR);
  const refs = curation.checkRefs(data, known(site.data));
  assert.deepStrictEqual(refs.errors, []);
});

test("curated files have content", () => {
  const { data } = curation.load(DIR);
  assert.ok(data.items.length > 0 && data.mats.vendor.length > 0 && data.mats.gathered.length > 0);
  assert.ok(Object.keys(data.roles.classes).length === 9 && Object.keys(data.rules.classes).length === 9);
  assert.ok(Object.keys(data.reference.cites).length > 0);
});

// Copy curation/ to a temp dir, let `edit` change one file, and return the errors.
function errorsAfter(file, edit) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fgp-cur-"));
  for (const f of fs.readdirSync(DIR)) if (f.endsWith(".json")) fs.copyFileSync(path.join(DIR, f), path.join(tmp, f));
  const p = path.join(tmp, file);
  fs.writeFileSync(p, JSON.stringify(edit(JSON.parse(fs.readFileSync(p, "utf8")))));
  const { data, errors } = curation.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return errors.concat(errors.length ? [] : curation.checkRefs(data, known(site.data)).errors).join("\n");
}

const fam = (extra) => ({ why: "test", items: [2307], names: ["Fine Leather Boots"], cite: ["DB"], checked: "2026-10-08", ...extra });

test("schema rejections", () => {
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ avail: "gone" })])), /avail: expected one of/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ avail: "unobtainable" })])), /needs a reason/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ colour: "red" })])), /unknown key "colour"/);
  assert.match(errorsAfter("items.json", (a) => a.concat([{ ...fam(), why: undefined }])), /missing "why"/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ names: ["A", "B"] })])), /items and names differ/);
  assert.match(errorsAfter("sources.json", (a) => a.concat([fam({ items: [2309], names: ["Embossed Leather Boots"], sources: [{ kind: "favor", side: "both", certainty: "db" }] })])), /missing "npc"/);
  assert.match(errorsAfter("sources.json", (a) => a.concat([fam({ items: [2309], names: ["Embossed Leather Boots"], sources: [{ kind: "loot", side: "both", certainty: "db" }] })])), /kind: expected one of/);
  assert.match(errorsAfter("npcs.json", (o) => ({ ...o, "Bad Slug": { name: "X", side: "alliance" } })), /does not match/);
  assert.match(errorsAfter("roles.json", (o) => { o.classes.Mage.bit = 3; return o; }), /bit must be/);
  assert.match(errorsAfter("rules.json", (o) => { delete o.classes.Druid; return o; }), /class Druid missing/);
});

test("reference rejections: unknown item, renamed item, item in two families, missing NPC, unknown cite", () => {
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ items: [1], names: ["Nothing"] })])), /item 1 \(Nothing\) is not in this build/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ names: ["Fine Leather Shoes"] })])), /is named "Fine Leather Boots"/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam(), fam()])), /already in entry/);
  assert.match(errorsAfter("sources.json", (a) => a.concat([fam({ items: [2309], names: ["Embossed Leather Boots"], sources: [{ kind: "vendor", npc: "nobody-here", side: "both", certainty: "db" }] })])), /npc nobody-here has no record/);
  assert.match(errorsAfter("items.json", (a) => a.concat([fam({ items: [2309], names: ["Embossed Leather Boots"], cite: ["NOPE"] })])), /cite key NOPE/);
});

test("oracle fixture shape", { skip: !fs.existsSync(path.resolve(__dirname, "..", "fixtures", "oracle.json")) && "tests/fixtures/oracle.json not present yet" }, () => {
  const o = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "fixtures", "oracle.json"), "utf8"));
  const errs = [];
  const row = {
    object: {
      cls: { enum: curation.CLASSES }, role: { enum: curation.ROLES }, level: "int", slot: "string", item: "int", core: "bool",
      profs: { array: "string" }, options: { object: { school: "string", twoHand: "bool" }, optional: ["school", "twoHand"] },
    },
    optional: ["core", "profs", "options"],
  };
  curation.check(o, {
    object: { dataset: { enum: ["forever"] }, build: "string", faction: { enum: ["alliance", "horde"] }, checked: "date", note: "string", rows: { array: row, min: 1 } },
    optional: ["faction", "checked", "note"],
  }, "oracle.json", errs);
  assert.deepStrictEqual(errs, []);
  assert.strictEqual(o.build, site.data.meta.build);
  for (const r of o.rows) assert.ok(site.data.items.rows[r.item], `oracle item ${r.item} is shipped`);
});
