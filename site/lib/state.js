// User state, schema 1 (docs/ui.md §10, synthesis D24, D34, D35, D37): defaults, normalize, migrations, storage
// keys, export and import validation. Pure: callers pass storage strings in and out. Classic script and CommonJS.
(function (root) {
  "use strict";

  var SCHEMA = 1;
  var APP = "forever-gear-planner";
  var KEYS = {
    state: APP + ".state",
    prices: APP + ".prices",
    pricesUndo: APP + ".prices.undo",
    backup: function (schema) { return APP + ".backup." + schema; },
  };
  var ENTRY_ID = /^r[0-9a-z]{6}$/;
  var PAIR_KEY = /^(r[0-9a-z]{6}):(\d+)$/;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var LEVELS = [1, 60];
  var VIEWS = ["gear", "queue", "prices", "about"];
  var WITHIN = 5;

  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function clampInt(v, lo, hi, dflt) {
    var n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  function defaults() {
    return {
      schema: SCHEMA, app: APP,
      seen: { build: null, generated: null },
      roster: { faction: "alliance", includeAH: true, knownSourceOnly: false, entries: [] },
      items: {},
      recipes: {},
      prices: { overrides: {}, owned: {} },
      prefs: {
        selected: null, view: "gear", theme: "auto", tooltips: "planner", icons: false,
        filters: { core: false, hideDone: false, hideUnob: true },
        showHidden: { gear: false, queue: false }, slot: "", upTo: {},
        queueSel: null, within: WITHIN,
        dismissed: { freshness: null, example: false },
      },
    };
  }

  // Validation context from the loaded data (FGP_DATA): classes and roles, school choices, professions, skill cap.
  function contextFrom(data) {
    var classes = {}, roles = data.roles.classes, c;
    for (c in roles) {
      if (!own(roles, c)) continue;
      classes[c] = { roles: [], schools: {}, twoHand: {} };
      roles[c].roles.forEach(function (r) {
        classes[c].roles.push(r.role);
        if (r.options && r.options.school) classes[c].schools[r.role] = Object.keys(r.options.school.choices);
        if (r.options && r.options.twoHand) classes[c].twoHand[r.role] = true;
      });
    }
    var professions = {};
    data.rules.professions.forEach(function (p) { if (p.kind !== "secondary") professions[p.name] = p.specs || []; });
    return { classes: classes, professions: professions, skillCap: data.meta ? data.meta.skillCap : 300 };
  }

  function normEntry(e, ctx, seen) {
    if (!isObj(e) || typeof e.id !== "string" || !ENTRY_ID.test(e.id) || seen[e.id]) return null;
    var cls = typeof e.cls === "string" ? e.cls : null;
    if (!cls || (ctx && !own(ctx.classes, cls))) return null;
    var c = ctx ? ctx.classes[cls] : null;
    var role = typeof e.role === "string" ? e.role : null;
    if (c && c.roles.indexOf(role) < 0) role = c.roles[0];
    if (!role) return null;
    var out = {
      id: e.id, cls: cls, label: typeof e.label === "string" ? e.label.slice(0, 40) : "", role: role,
      level: clampInt(e.level, LEVELS[0], LEVELS[1], 1), professions: [], options: {},
      favor: clampInt(e.favor, 0, 1e6, 0),
    };
    var cap = ctx ? ctx.skillCap : 300, profSeen = {};
    (Array.isArray(e.professions) ? e.professions : []).forEach(function (p) {
      if (!isObj(p) || typeof p.id !== "string" || profSeen[p.id] || out.professions.length >= 2) return;
      if (ctx && !own(ctx.professions, p.id)) return;
      profSeen[p.id] = 1;
      var spec = typeof p.spec === "string" && (!ctx || ctx.professions[p.id].indexOf(p.spec) >= 0) ? p.spec : null;
      out.professions.push({ id: p.id, skill: p.skill === null || p.skill === undefined || p.skill === "" ? null : clampInt(p.skill, 0, cap, null), spec: spec });
    });
    var o = isObj(e.options) ? e.options : {};
    if (typeof o.school === "string" && (!c || (c.schools[role] || []).indexOf(o.school) >= 0)) out.options.school = o.school;
    if (typeof o.twoHand === "boolean" && (!c || c.twoHand[role])) out.options.twoHand = o.twoHand;
    if (isObj(e.weights)) {
      var w = {}, any = false;
      for (var k in e.weights) if (own(e.weights, k) && typeof e.weights[k] === "number" && Number.isFinite(e.weights[k])) { w[k] = e.weights[k]; any = true; }
      if (any) out.weights = w;
    }
    return out;
  }

  function normItemState(v, entryIds) {
    if (!isObj(v)) return null;
    var o = {};
    if (v.status === "have" || v.status === "equipped") o.status = v.status;
    if (v.hidden === true) o.hidden = true;
    if (v.via === "ah" || (typeof v.via === "string" && entryIds[v.via])) o.via = v.via;
    if (isObj(v.enchant) && typeof v.enchant.pick === "string" && /^(spell|item):\d+$|^none$/.test(v.enchant.pick)) {
      o.enchant = { pick: v.enchant.pick, applied: v.enchant.applied === true };
    }
    return Object.keys(o).length ? o : null;
  }

  // Copy only known keys, validate every map key and value, clamp numbers, drop the rest (ui.md §10.5).
  function normalize(raw, ctx) {
    var d = defaults();
    if (!isObj(raw)) return d;
    if (isObj(raw.seen)) {
      d.seen.build = typeof raw.seen.build === "string" ? raw.seen.build : null;
      d.seen.generated = typeof raw.seen.generated === "string" ? raw.seen.generated : null;
    }
    var r = isObj(raw.roster) ? raw.roster : {};
    d.roster.faction = r.faction === "horde" ? "horde" : "alliance";
    d.roster.includeAH = r.includeAH !== false;
    d.roster.knownSourceOnly = r.knownSourceOnly === true;
    var seen = {};
    (Array.isArray(r.entries) ? r.entries : []).forEach(function (e) {
      var n = normEntry(e, ctx, seen);
      if (n) { seen[n.id] = true; d.roster.entries.push(n); }
    });
    var k, m;
    for (k in isObj(raw.items) ? raw.items : {}) {
      m = PAIR_KEY.exec(k);
      if (!m || !seen[m[1]]) continue;
      var v = normItemState(raw.items[k], seen);
      if (v) d.items[k] = v;
    }
    for (k in isObj(raw.recipes) ? raw.recipes : {}) {
      m = PAIR_KEY.exec(k);
      if (m && seen[m[1]] && (raw.recipes[k] === "bought" || raw.recipes[k] === "learned")) d.recipes[k] = raw.recipes[k];
    }
    var p = isObj(raw.prices) ? raw.prices : {};
    for (k in isObj(p.overrides) ? p.overrides : {}) {
      var ov = p.overrides[k];
      if (!/^\d+$/.test(k) || !isObj(ov) || typeof ov.c !== "number" || !Number.isFinite(ov.c) || ov.c < 0) continue;
      d.prices.overrides[k] = { c: Math.round(ov.c), set: typeof ov.set === "string" && DATE.test(ov.set) ? ov.set : null };
    }
    for (k in isObj(p.owned) ? p.owned : {}) {
      var n = clampInt(p.owned[k], 0, 1e7, 0);
      if (/^\d+$/.test(k) && n > 0) d.prices.owned[k] = n;
    }
    var pr = isObj(raw.prefs) ? raw.prefs : {};
    d.prefs.selected = typeof pr.selected === "string" && seen[pr.selected] ? pr.selected : (d.roster.entries[0] ? d.roster.entries[0].id : null);
    // The open view: from file:// the page can't use the URL hash (a host-bearing file URL makes it a cross-origin load).
    if (VIEWS.indexOf(pr.view) >= 0) d.prefs.view = pr.view;
    if (["auto", "light", "dark"].indexOf(pr.theme) >= 0) d.prefs.theme = pr.theme;
    if (["planner", "off"].indexOf(pr.tooltips) >= 0) d.prefs.tooltips = pr.tooltips;
    d.prefs.icons = pr.icons === true;
    var f = isObj(pr.filters) ? pr.filters : {};
    d.prefs.filters = { core: f.core === true, hideDone: f.hideDone === true, hideUnob: f.hideUnob !== false };
    d.prefs.showHidden = { gear: isObj(pr.showHidden) && pr.showHidden.gear === true, queue: isObj(pr.showHidden) && pr.showHidden.queue === true };
    // Queue (ui.md §5): the selected crafter (entry ID, "ah" or "all"); "within N levels", null = every level.
    d.prefs.queueSel = pr.queueSel === "ah" || pr.queueSel === "all" || (typeof pr.queueSel === "string" && seen[pr.queueSel]) ? pr.queueSel : null;
    d.prefs.within = pr.within === null ? null : clampInt(pr.within, 0, LEVELS[1], WITHIN);
    d.prefs.slot = typeof pr.slot === "string" ? pr.slot.slice(0, 20) : "";
    for (k in isObj(pr.upTo) ? pr.upTo : {}) if (seen[k]) d.prefs.upTo[k] = clampInt(pr.upTo[k], LEVELS[0], LEVELS[1], LEVELS[1]);
    var dm = isObj(pr.dismissed) ? pr.dismissed : {};
    d.prefs.dismissed = { freshness: typeof dm.freshness === "string" ? dm.freshness : null, example: dm.example === true };
    return d;
  }

  // Migrations from schema n to n + 1, applied in order. None yet: schema 1 is the first.
  var MIGRATIONS = {};

  function migrate(raw) {
    var v = raw, from = raw.schema;
    for (var s = from; s < SCHEMA; s++) {
      if (!MIGRATIONS[s]) throw new Error("no migration from schema " + s);
      v = MIGRATIONS[s](v);
    }
    return v;
  }

  // Load from the stored string (or null). Returns {state, status, readOnly, backup}:
  // status "empty" | "ok" | "migrated" | "newer" (read-only: never save over it) | "corrupt" | "foreign".
  function load(text, ctx) {
    if (text === null || text === undefined || text === "") return { state: defaults(), status: "empty", readOnly: false, backup: null };
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { state: defaults(), status: "corrupt", readOnly: false, backup: { key: KEYS.backup("corrupt"), text: text } }; }
    if (!isObj(raw) || (raw.app !== undefined && raw.app !== APP)) return { state: defaults(), status: "foreign", readOnly: false, backup: { key: KEYS.backup("foreign"), text: text } };
    var schema = typeof raw.schema === "number" ? raw.schema : 1;
    if (schema > SCHEMA) return { state: normalize(raw, ctx), status: "newer", readOnly: true, backup: null };
    if (schema < SCHEMA) return { state: normalize(migrate(raw), ctx), status: "migrated", readOnly: false, backup: { key: KEYS.backup(schema), text: text } };
    return { state: normalize(raw, ctx), status: "ok", readOnly: false, backup: null };
  }

  function serialize(state) { return JSON.stringify(state); }

  // Export (ui.md §10.7, D37): the state plus `exported` and `dataBuild`; imported prices only when asked for.
  function exportState(state, opts) {
    opts = opts || {};
    var out = JSON.parse(JSON.stringify(state));
    out.exported = opts.now || null;
    out.dataBuild = opts.dataBuild || null;
    if (opts.includePrices && opts.priceSet) out.importedPrices = opts.priceSet;
    return out;
  }

  function exportFileName(isoDate) { return APP + "-" + isoDate + ".json"; }

  // Validate an import before asking the user (ui.md §10.7). Returns {ok, error, summary}.
  function validateImport(obj) {
    if (!isObj(obj)) return { ok: false, error: "This is not a planner export (no JSON object)." };
    if (obj.app !== APP) return { ok: false, error: "This file was not exported by this planner." };
    if (typeof obj.schema !== "number" || obj.schema < 1) return { ok: false, error: "The export has no valid schema number." };
    if (obj.schema > SCHEMA) return { ok: false, error: "The export was made by a newer version of this page; reload to update." };
    var entries = isObj(obj.roster) && Array.isArray(obj.roster.entries) ? obj.roster.entries.length : 0;
    return {
      ok: true, error: null,
      summary: {
        schema: obj.schema, entries: entries, items: isObj(obj.items) ? Object.keys(obj.items).length : 0,
        recipes: isObj(obj.recipes) ? Object.keys(obj.recipes).length : 0,
        overrides: isObj(obj.prices) && isObj(obj.prices.overrides) ? Object.keys(obj.prices.overrides).length : 0,
        exported: typeof obj.exported === "string" ? obj.exported : null, dataBuild: typeof obj.dataBuild === "string" ? obj.dataBuild : null,
        importedPrices: isObj(obj.importedPrices),
      },
    };
  }

  // Replace the state with an import (after the user confirmed): migrate + normalize. Prices go separately.
  function importState(obj, ctx) {
    var v = validateImport(obj);
    if (!v.ok) throw new Error(v.error);
    var raw = obj.schema < SCHEMA ? migrate(obj) : obj;
    return { state: normalize(raw, ctx), importedPrices: isObj(obj.importedPrices) ? obj.importedPrices : null };
  }

  // Reset keeps theme, tooltip and icon prefs (ui.md §10.7).
  function reset(state) {
    var d = defaults();
    d.prefs.theme = state.prefs.theme; d.prefs.tooltips = state.prefs.tooltips; d.prefs.icons = state.prefs.icons;
    return d;
  }

  // "r" + 6 base-36 characters; `random` returns floats in [0, 1) (crypto-backed in the page).
  function newEntryId(random, existing) {
    var taken = {};
    (existing || []).forEach(function (e) { taken[typeof e === "string" ? e : e.id] = true; });
    for (var t = 0; t < 1000; t++) {
      var id = "r";
      for (var i = 0; i < 6; i++) id += "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(random() * 36)];
      if (!taken[id]) return id;
    }
    throw new Error("could not find a free entry ID");
  }

  // Delete a roster entry and every key that belongs to it (one prefix scan, ui.md §10.3).
  function removeEntry(state, id) {
    var s = JSON.parse(JSON.stringify(state)), k;
    s.roster.entries = s.roster.entries.filter(function (e) { return e.id !== id; });
    for (k in s.items) if (k.indexOf(id + ":") === 0) delete s.items[k];
    for (k in s.recipes) if (k.indexOf(id + ":") === 0) delete s.recipes[k];
    for (k in s.items) if (s.items[k].via === id) { delete s.items[k].via; if (!Object.keys(s.items[k]).length) delete s.items[k]; }
    delete s.prefs.upTo[id];
    if (s.prefs.queueSel === id) s.prefs.queueSel = null;
    if (s.prefs.selected === id) s.prefs.selected = s.roster.entries[0] ? s.roster.entries[0].id : null;
    return s;
  }

  // Keys whose item or recipe is missing from the loaded data (ui.md §10.6); never deleted silently.
  function orphans(state, data) {
    var out = { items: [], recipes: [] }, k, m;
    for (k in state.items) { m = PAIR_KEY.exec(k); if (m && !own(data.items.rows, m[2])) out.items.push(k); }
    for (k in state.recipes) { m = PAIR_KEY.exec(k); if (m && !own(data.recipes.rows, m[2])) out.recipes.push(k); }
    return out;
  }

  function dataChanged(state, meta) { return state.seen.build !== meta.build || state.seen.generated !== meta.generated; }

  var api = {
    SCHEMA: SCHEMA, APP: APP, KEYS: KEYS, ENTRY_ID: ENTRY_ID, MIGRATIONS: MIGRATIONS,
    defaults: defaults, contextFrom: contextFrom, normalize: normalize, migrate: migrate, load: load, serialize: serialize,
    exportState: exportState, exportFileName: exportFileName, validateImport: validateImport, importState: importState,
    reset: reset, newEntryId: newEntryId, removeEntry: removeEntry, orphans: orphans, dataChanged: dataChanged,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.state = api; }
})(this);
