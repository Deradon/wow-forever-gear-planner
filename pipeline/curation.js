"use strict";
// Load and validate curation/*.json (D5, D6). A hand-rolled schema check: types, enums, required and unknown keys.
// Reference checks against the generated data (IDs, names, NPC slugs) run in checkRefs once the build data exists.

const fs = require("fs");
const path = require("path");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CLASSES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];
const ROLES = ["melee", "ranged", "caster", "healer", "tank"];
const SIDES = ["alliance", "horde", "both"];
const CERTAINTY = ["forever", "vanilla", "db", "unknown"];
const STANDINGS = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
const AVAIL = ["ok", "unconfirmed", "unobtainable"];

// Schema DSL: "string" | "int" | "number" | "bool" | "date" | "slug" | "any" | {enum} | {array, min} |
// {object: {k: s}, optional: [k], open: bool} | {map: s, key: RegExp} | {nullable: s} | {test: fn, msg}.
function check(v, s, at, errs) {
  const fail = (m) => { errs.push(`${at}: ${m}`); return false; };
  if (typeof s === "string") {
    switch (s) {
      case "any": return true;
      case "string": return typeof v === "string" && v.length > 0 ? true : fail("expected a non-empty string");
      case "int": return Number.isInteger(v) ? true : fail("expected an integer");
      case "number": return typeof v === "number" && Number.isFinite(v) ? true : fail("expected a number");
      case "bool": return typeof v === "boolean" ? true : fail("expected true or false");
      case "date": return typeof v === "string" && DATE.test(v) ? true : fail("expected YYYY-MM-DD");
      case "slug": return typeof v === "string" && SLUG.test(v) ? true : fail("expected a lower-case slug");
      default: throw new Error(`schema: unknown type ${s}`);
    }
  }
  if (s.nullable) return v === null ? true : check(v, s.nullable, at, errs);
  if (s.enum) return s.enum.includes(v) ? true : fail(`expected one of ${s.enum.join(", ")}, got ${JSON.stringify(v)}`);
  if (s.test) return s.test(v) ? true : fail(s.msg);
  if (s.array) {
    if (!Array.isArray(v)) return fail("expected an array");
    if (s.min && v.length < s.min) return fail(`expected at least ${s.min} entries`);
    let ok = true;
    v.forEach((x, i) => { ok = check(x, s.array, `${at}[${i}]`, errs) && ok; });
    return ok;
  }
  if (s.map) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail("expected an object");
    let ok = true;
    for (const k of Object.keys(v)) {
      if (s.key && !s.key.test(k)) { ok = fail(`key ${JSON.stringify(k)} does not match ${s.key}`); continue; }
      ok = check(v[k], s.map, `${at}.${k}`, errs) && ok;
    }
    return ok;
  }
  if (s.object) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail("expected an object");
    let ok = true;
    const opt = new Set(s.optional || []);
    for (const k of Object.keys(s.object)) {
      if (!(k in v)) { if (!opt.has(k)) ok = fail(`missing "${k}"`); continue; }
      ok = check(v[k], s.object[k], `${at}.${k}`, errs) && ok;
    }
    if (!s.open) for (const k of Object.keys(v)) if (!(k in s.object)) ok = fail(`unknown key "${k}"`);
    return ok;
  }
  throw new Error("schema: bad node");
}

const intList = { array: "int", min: 1 };
const strList = { array: "string" };
// cite may be empty where an entry asserts no outside fact (an assumption or "not checked"); see game-data-pipeline §11.
const cite = { array: "string" };
const family = (extra, optional) => ({
  object: { why: "string", items: intList, names: strList, cite, checked: "date", note: "string", ...extra },
  optional: ["note", ...optional],
});

// --- sources.json and npcs.json (shapes agreed with the orchestrator, data-model §7, §11.1) ---
const common = { side: { enum: SIDES }, certainty: { enum: CERTAINTY }, cite, checked: "date", note: "string" };
const commonOpt = ["cite", "checked", "note"];
const copper = { object: { copper: "int" } };
const SOURCE_KINDS = {
  trainer: { object: { kind: "string", cost: copper, ...common }, optional: ["cost", ...commonOpt] },
  vendor: {
    object: { kind: "string", npc: "slug", cost: copper, limited: "bool", rep: { object: { faction: "int", standing: { enum: STANDINGS } } }, ...common },
    optional: ["cost", "limited", "rep", ...commonOpt],
  },
  favor: { object: { kind: "string", npc: "slug", cost: { object: { favor: "int" } }, ...common }, optional: commonOpt },
  quest: { object: { kind: "string", quest: "string", npc: "slug", ...common }, optional: ["npc", ...commonOpt] },
  drop: {
    object: { kind: "string", where: { enum: ["world", "zone", "dungeon"] }, zone: "string", instance: "string", bosses: strList, ...common },
    optional: ["zone", "instance", "bosses", ...commonOpt],
  },
  unknown: { object: { kind: "string", text: "string", ...common }, optional: ["text", ...commonOpt] },
  unobtainable: { object: { kind: "string", reason: "string", ...common }, optional: commonOpt },
};
// Entries are checked per kind by checkSource after the family shape (the DSL has no tagged unions).
function checkSource(e, at, errs) {
  if (!e || typeof e !== "object" || !SOURCE_KINDS[e.kind]) { errs.push(`${at}.kind: expected one of ${Object.keys(SOURCE_KINDS).join(", ")}`); return; }
  check(e, SOURCE_KINDS[e.kind], at, errs);
}
const sourcesSchema = { array: family({ sources: { array: "any", min: 1 } }, []) };
const npcSchema = {
  map: {
    object: {
      name: "string", side: { enum: ["alliance", "horde", "neutral"] }, npcId: { nullable: "int" }, zone: "string",
      coords: { test: (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number"), msg: "expected [x, y]" },
      role: "string", note: "string", cite, checked: "date",
    },
    optional: ["npcId", "zone", "coords", "role", "note", "cite", "checked"],
  },
  key: SLUG,
};

// --- items.json, mats.json ---
const itemsSchema = {
  array: family({ avail: { enum: AVAIL }, reason: "string", flags: strList, effectScore: "number" }, ["avail", "reason", "flags", "effectScore"]),
};
const matsSchema = {
  object: {
    vendor: { array: family({}, []) },
    gathered: { array: family({ prof: { enum: ["Skinning", "Mining", "Herbalism", "Fishing", "Enchanting"] } }, []) },
  },
};

// --- roles.json (roles-stat-weights §4.7, D22, D23, D27) ---
const weights = { map: "number" };
const weaponCfg = { object: { mh: "number", specials: "number", ranged: "number", wand: "number" }, optional: ["mh", "specials", "ranged", "wand"] };
const roleSchema = {
  object: {
    role: { enum: ROLES }, profile: "string", tweaks: weights, weapon: weaponCfg, schools: weights,
    options: {
      object: {
        school: { object: { default: "string", choices: { map: weights } } },
        twoHand: { object: { default: "bool", from: "int", adds: strList } },
      },
      optional: ["school", "twoHand"],
    },
    why: "string",
  },
  optional: ["tweaks", "weapon", "schools", "options", "why"],
};
const rolesSchema = {
  object: {
    schema: "int", why: "string", cite, checked: "date",
    levelScaled: strList, levelScale: { object: { ref: "number", floor: "number" } },
    apPerDps: "number", offHandFactor: "number", dualWieldHit: "number", dualWieldHitWhy: "string",
    profiles: { map: { object: { weights, schoolBase: "string", weapon: weaponCfg, why: "string" }, optional: ["schoolBase", "why"] } },
    roles: { map: { object: { label: "string" } } },
    classes: { map: { object: { id: "int", bit: "int", roles: { array: roleSchema, min: 1 } } } },
    baseline: {
      object: { why: "string", quality: "int", efficiency: "number", dpsEfficiency: "number", speed: { map: "number" } },
      optional: ["why"],
    },
    worth: {
      object: {
        why: "string", minGainAbs: "number", minGainRel: "number", tierCap: { map: "int" },
        tierScale: { object: { fromLevel: "int", power: "number" } }, keepMin: { map: "int" }, laterMax: "int",
        horizon: "int", planEnd: "int", coreGain: "number", coreKeep: "int", coreAlone: "int",
      },
      optional: ["why"],
    },
    pace: { object: { why: "string", heuristic: "bool", points: { array: { array: "int", min: 2 }, min: 2 } } },
  },
};

// --- rules.json (usability, slot groups, stat labels, professions; D25, S2) ---
const levelMap = { map: { nullable: "int" } };
const rulesSchema = {
  object: {
    schema: "int", why: "string", cite, checked: "date",
    classes: {
      map: {
        object: { armor: levelMap, weapons: levelMap, offHand: levelMap, dualWield: { nullable: "int" }, relic: { nullable: "string" }, why: "string" },
        optional: ["why"],
      },
    },
    slotGroups: { array: { object: { id: "string", slots: strList, count: "int" }, optional: ["count"] }, min: 1 },
    statLabels: { map: "string" },
    statsUnidentified: { array: family({ id: "int" }, []) },
    professions: {
      array: {
        object: { name: "string", line: "int", kind: { enum: ["crafting", "gathering", "secondary"] }, specs: strList },
        optional: ["specs"],
      },
    },
  },
};

// --- reference.json ---
const referenceSchema = {
  object: {
    schema: "int",
    notice: { map: "string" },
    coverage: { map: "string" },
    notes: strList,
    cites: { map: { object: { label: "string", url: { nullable: "string" } } }, key: /^[A-Z0-9]+$/ },
  },
};

const FILES = {
  roles: ["roles.json", rolesSchema],
  rules: ["rules.json", rulesSchema],
  items: ["items.json", itemsSchema],
  mats: ["mats.json", matsSchema],
  reference: ["reference.json", referenceSchema],
  sources: ["sources.json", sourcesSchema],
  npcs: ["npcs.json", npcSchema],
};

// Load every file and run the schema checks. Returns {data, errors}.
function load(dir) {
  const data = {}, errors = [];
  for (const [name, [file, schema]] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    let v;
    try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { errors.push(`curation/${file}: ${e.message}`); continue; }
    check(v, schema, `curation/${file}`, errors);
    data[name] = v;
  }
  if (Array.isArray(data.sources)) {
    data.sources.forEach((f, i) => (f.sources || []).forEach((e, j) => checkSource(e, `curation/sources.json[${i}].sources[${j}]`, errors)));
  }
  for (const [f, list] of [["sources", data.sources], ["items", data.items], ["mats", data.mats && data.mats.vendor], ["mats", data.mats && data.mats.gathered], ["rules", data.rules && data.rules.statsUnidentified]]) {
    (list || []).forEach((fam, i) => {
      if (fam.items && fam.names && fam.items.length !== fam.names.length) errors.push(`curation/${f}.json[${i}]: items and names differ in length`);
    });
  }
  (data.items || []).forEach((fam, i) => {
    if (fam.avail && fam.avail !== "ok" && !fam.reason) errors.push(`curation/items.json[${i}]: avail ${fam.avail} needs a reason`);
  });
  if (data.roles) checkRoles(data.roles, data.rules, errors);
  return { data, errors };
}

function checkRoles(roles, rules, errors) {
  const at = "curation/roles.json";
  for (const c of CLASSES) {
    if (!roles.classes || !roles.classes[c]) { errors.push(`${at}: class ${c} missing`); continue; }
    if (rules && rules.classes && !rules.classes[c]) errors.push(`curation/rules.json: class ${c} missing`);
    const cl = roles.classes[c];
    if (cl.bit !== 1 << (cl.id - 1)) errors.push(`${at}.classes.${c}: bit must be 1 << (id - 1)`);
    for (const r of cl.roles) {
      if (!roles.profiles[r.profile]) errors.push(`${at}.classes.${c}: unknown profile ${r.profile}`);
      if (r.options && r.options.school && !r.options.school.choices[r.options.school.default]) errors.push(`${at}.classes.${c}: school default not among choices`);
    }
  }
  for (const k of Object.keys(roles.classes || {})) if (!CLASSES.includes(k)) errors.push(`${at}: unknown class ${k}`);
  for (const k of Object.keys(roles.roles || {})) if (!ROLES.includes(k)) errors.push(`${at}: unknown role ${k}`);
  const pts = (roles.pace && roles.pace.points) || [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] <= pts[i - 1][0] || pts[i][1] < pts[i - 1][1]) errors.push(`${at}.pace.points: must rise in level and not fall in skill`);
  }
}

// Reference integrity against the built data: IDs exist, names match, an item sits in at most one family per file,
// NPC slugs resolve, cite keys resolve. `known` = {items: Map id→name, mats: Map id→name, factions: Set}.
function checkRefs(cur, known) {
  const errors = [], warnings = [];
  const cites = new Set(Object.keys((cur.reference && cur.reference.cites) || {}));
  const citeCheck = (list, at) => (list || []).forEach((k) => { if (!cites.has(k)) errors.push(`${at}: cite key ${k} is not in curation/reference.json cites`); });
  const families = (file, list, names) => {
    const seen = new Map();
    (list || []).forEach((fam, i) => {
      const at = `curation/${file}[${i}]`;
      citeCheck(fam.cite, at);
      fam.items.forEach((id, j) => {
        if (seen.has(id)) errors.push(`${at}: item ${id} is already in entry ${seen.get(id)}`);
        seen.set(id, i);
        if (!names.has(id)) errors.push(`${at}: item ${id} (${fam.names[j]}) is not in this build's data`);
        else if (names.get(id) !== fam.names[j]) errors.push(`${at}: item ${id} is named "${names.get(id)}", not "${fam.names[j]}"`);
      });
    });
  };
  families("sources.json", cur.sources, known.items);
  families("items.json", cur.items, known.items);
  families("mats.json vendor", cur.mats && cur.mats.vendor, known.mats);
  families("mats.json gathered", cur.mats && cur.mats.gathered, known.mats);
  (cur.sources || []).forEach((fam, i) => fam.sources.forEach((e, j) => {
    const at = `curation/sources.json[${i}].sources[${j}]`;
    if (e.npc && !(cur.npcs && cur.npcs[e.npc])) errors.push(`${at}: npc ${e.npc} has no record in curation/npcs.json`);
    if (e.rep && !known.factions.has(e.rep.faction)) errors.push(`${at}: faction ${e.rep.faction} is not in the Faction table`);
    citeCheck(e.cite, at);
  }));
  for (const [slug, n] of Object.entries(cur.npcs || {})) citeCheck(n.cite, `curation/npcs.json.${slug}`);
  citeCheck(cur.roles && cur.roles.cite, "curation/roles.json");
  citeCheck(cur.rules && cur.rules.cite, "curation/rules.json");
  const used = new Set();
  (cur.sources || []).forEach((fam) => fam.sources.forEach((e) => { if (e.npc) used.add(e.npc); }));
  for (const slug of Object.keys(cur.npcs || {})) if (!used.has(slug)) warnings.push(`curation/npcs.json: ${slug} is not used by any source`);
  return { errors, warnings };
}

module.exports = { load, check, checkRefs, checkSource, FILES, CLASSES, ROLES, SIDES, CERTAINTY, STANDINGS, AVAIL, DATE, SLUG };
