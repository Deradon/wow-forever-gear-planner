// Auctionator price import (docs/pricing-import.md §1.5, §2.5–§2.7): saved-variables bytes → per-realm price rows
// {itemId: [copper, day, qty]} with the validation messages of §2.6. Classic script and CommonJS; no DOM.
(function (root) {
  "use strict";

  var MAX_BYTES = 64 * 1024 * 1024;
  var DB_VERSION = 8;
  var MAX_STORED_ROWS = 50000;
  var OLD_DAYS = 21;
  // Install folder of the client whose saved-variables hold the file (S5: the live name is set at launch).
  var FOLDERS = { beta: "_classic_beta_", live: null };

  function deps() {
    if (typeof module !== "undefined" && module.exports) return { lua: require("./lua-literal"), cbor: require("./cbor") };
    return { lua: root.FGP.luaLiteral, cbor: root.FGP.cbor };
  }

  // Days since 2020-01-01 00:00 local time, as Auctionator counts them.
  function dayNumber(date) {
    var d0 = new Date(2020, 0, 1), d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((d - d0) / 86400000);
  }
  function dayToDate(day) { return new Date(2020, 0, 1 + day); }
  function isoDay(day) {
    var d = dayToDate(day), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  var MESSAGES = {
    "too-large": "This is too large for an Auctionator file.",
    "not-lua": "This isn't a saved-variables file. Pick Auctionator.lua from the saved-variables folder.",
    "no-database": "This file has no Auctionator price data. Is it another addon's file?",
    "database-off": "Auctionator's price database is switched off (/atr options) or empty.",
    "no-realms": "No prices yet: scan at the auction house, then /reload and pick the file again.",
    "version": "Auctionator database version {n}; this importer knows " + DB_VERSION + ". Trying anyway.",
    "realm-damaged": "Prices for realm {realm} are damaged ({detail}) and were skipped.",
    "unknown-items": "None of these {n} prices are for items this planner knows. Is this a Forever file?",
    "future": "This scan is dated in the future; check your PC clock.",
    "old": "These prices are {n} days old.",
    "backup": "This is the backup from the previous session (Auctionator.lua.bak).",
  };
  function msg(code, vars) {
    var t = MESSAGES[code];
    for (var k in vars || {}) if (Object.prototype.hasOwnProperty.call(vars, k)) t = t.replace("{" + k + "}", vars[k]);
    return { code: code, text: t };
  }

  function utf8Label(latin1Key) {
    var bytes = new Uint8Array(latin1Key.length);
    for (var i = 0; i < latin1Key.length; i++) bytes[i] = latin1Key.charCodeAt(i) & 0xff;
    return new TextDecoder("utf-8").decode(bytes);
  }

  function get(m, k) { return m instanceof Map ? m.get(k) : undefined; }

  function maxDay(m) {
    if (!(m instanceof Map)) return null;
    var best = null;
    m.forEach(function (_, k) { var d = +k; if (Number.isInteger(d) && (best === null || d > best)) best = d; });
    return best;
  }

  // Rows of one realm's decoded data (Map of itemKey → entry Map).
  function realmRows(data, isKnown) {
    var rows = {}, entries = 0, nonNumeric = 0, invalid = 0, known = 0, newest = null, oldest = null;
    data.forEach(function (e, id) {
      if (id === "version") return;
      if (!/^\d+$/.test(id)) { nonNumeric++; return; }
      var m = get(e, "m");
      if (typeof m !== "number" || !Number.isInteger(m) || m <= 0) { invalid++; return; }
      var last = maxDay(get(e, "h"));
      if (last === null) last = maxDay(get(e, "a"));
      var a = get(e, "a"), q = a instanceof Map && last !== null ? a.get(String(last)) : undefined;
      rows[id] = [m, last, typeof q === "number" ? q : null];
      entries++;
      if (isKnown && isKnown(+id)) known++;
      if (last !== null) {
        if (newest === null || last > newest) newest = last;
        if (oldest === null || last < oldest) oldest = last;
      }
    });
    return { rows: rows, entries: entries, skipped: { nonNumeric: nonNumeric, invalid: invalid }, known: known, newestDay: newest, oldestDay: oldest };
  }

  // Read an Auctionator.lua file. opts: {today (day number), isKnown(id) → bool, fileName}. Each realm carries
  // `format`: "cbor" (C_EncodingUtil blob) or "table" (plain Lua table), for the redacted diagnostic.
  // Returns {ok: false, error} or {ok: true, realms, warnings, dbVersion}.
  function readFile(bytes, opts) {
    opts = opts || {};
    var d = deps(), warnings = [];
    if (bytes.length > MAX_BYTES) return { ok: false, error: msg("too-large") };
    if (opts.fileName && /\.bak$/i.test(opts.fileName)) warnings.push(msg("backup"));
    var g;
    try { g = d.lua.readGlobal(bytes, "AUCTIONATOR_PRICE_DATABASE"); } catch (e) { return { ok: false, error: msg("not-lua"), detail: e.message }; }
    if (!g.found) return { ok: false, error: msg("no-database") };
    if (g.value === null || !(g.value instanceof Map)) return { ok: false, error: msg("database-off") };
    var db = g.value, ver = db.get("__dbversion");
    if (ver !== DB_VERSION) warnings.push(msg("version", { n: ver === undefined ? "unknown" : ver }));
    var realms = [];
    db.forEach(function (v, key) {
      if (key === "__dbversion") return;
      var label = utf8Label(key), data = v, r, format = v instanceof Uint8Array ? "cbor" : v instanceof Map ? "table" : typeof v;
      try {
        if (v instanceof Uint8Array) data = d.cbor.decode(v);
        if (!(data instanceof Map)) throw new Error("not a table");
        r = realmRows(data, opts.isKnown);
      } catch (e) {
        warnings.push(msg("realm-damaged", { realm: label, detail: e.message }));
        realms.push({ key: key, label: label, format: format, error: e.message, rows: {}, entries: 0, usable: false });
        return;
      }
      r.key = key; r.label = label; r.format = format; r.usable = r.entries > 0;
      realms.push(r);
    });
    if (!realms.length) return { ok: false, error: msg("no-realms"), warnings: warnings };
    realms.forEach(function (r) {
      if (!r.usable) return;
      if (opts.isKnown && r.known === 0) warnings.push(msg("unknown-items", { n: r.entries }));
      if (typeof opts.today === "number" && r.newestDay !== null) {
        if (r.newestDay > opts.today + 1) warnings.push(msg("future"));
        else if (opts.today - r.newestDay > OLD_DAYS) warnings.push(msg("old", { n: opts.today - r.newestDay }));
      }
    });
    return { ok: true, realms: realms, warnings: warnings, dbVersion: ver === undefined ? null : ver };
  }

  // Preselected realm (§2.7): the remembered key if usable, else the newest scan day, else the most entries.
  function defaultRealm(realms, remembered) {
    var usable = realms.filter(function (r) { return r.usable; });
    for (var i = 0; i < usable.length; i++) if (usable[i].key === remembered) return usable[i];
    usable.sort(function (a, b) { return (b.newestDay || 0) - (a.newestDay || 0) || b.entries - a.entries || (a.key < b.key ? -1 : 1); });
    return usable[0] || null;
  }

  // Stored price set (pricing §6, D32): the imported and the default list share this shape.
  function toPriceSet(realm, meta) {
    meta = meta || {};
    return {
      format: 1, source: "auctionator", dataset: meta.dataset || null, build: meta.build || null,
      realm: realm.label, fileName: meta.fileName || null, importedAt: meta.importedAt || null,
      scanDay: realm.newestDay, entries: realm.entries,
      skipped: realm.skipped.nonNumeric + realm.skipped.invalid, rows: realm.rows,
    };
  }

  // Keep only planner-known IDs (safety valve for huge or non-Forever files, §6).
  function filterRows(set, isKnown) {
    var rows = {}, n = 0;
    for (var id in set.rows) if (Object.prototype.hasOwnProperty.call(set.rows, id) && isKnown(+id)) { rows[id] = set.rows[id]; n++; }
    var out = {};
    for (var k in set) if (Object.prototype.hasOwnProperty.call(set, k)) out[k] = set[k];
    out.rows = rows; out.entries = n; out.filtered = true;
    return out;
  }

  // Change summary between two sets: "312 prices changed, 40 new, 18 no longer in the file".
  function compareSets(prev, next) {
    var changed = 0, added = 0, removed = 0, id;
    var a = (prev && prev.rows) || {}, b = (next && next.rows) || {};
    for (id in b) if (Object.prototype.hasOwnProperty.call(b, id)) { if (!(id in a)) added++; else if (a[id][0] !== b[id][0]) changed++; }
    for (id in a) if (Object.prototype.hasOwnProperty.call(a, id) && !(id in b)) removed++;
    return { changed: changed, added: added, removed: removed };
  }

  var api = {
    MAX_BYTES: MAX_BYTES, DB_VERSION: DB_VERSION, MAX_STORED_ROWS: MAX_STORED_ROWS, FOLDERS: FOLDERS, MESSAGES: MESSAGES,
    dayNumber: dayNumber, dayToDate: dayToDate, isoDay: isoDay, readFile: readFile, realmRows: realmRows,
    defaultRealm: defaultRealm, toPriceSet: toPriceSet, filterRows: filterRows, compareSets: compareSets,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.auctionator = api; }
})(this);
