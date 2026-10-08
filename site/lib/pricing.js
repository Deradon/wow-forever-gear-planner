// Price model (docs/pricing-import.md §3, §5; synthesis D31, D33, D34): precedence override > vendor > imported AH
// > default list > craft, intermediates at min(AH, craft) with a depth cap of 4, staleness bands, money parsing.
// Classic script and CommonJS; no DOM, no storage.
(function (root) {
  "use strict";

  var DEPTH = 4;
  var BANDS = [[2, "fresh"], [7, "recent"], [21, "old"]];

  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  function band(age) {
    if (age === null || age === undefined) return null;
    for (var i = 0; i < BANDS.length; i++) if (age <= BANDS[i][0]) return BANDS[i][1];
    return "stale";
  }

  // data: FGP_DATA (items, recipes, mats). prices: {overrides: {id: {c, set}}, imported: set|null, defaultSet: set|null}.
  // opts: {today: Auctionator day number}. A pricer is cheap; make a new one when prices change.
  function createPricer(data, prices, opts) {
    prices = prices || {};
    opts = opts || {};
    var overrides = prices.overrides || {}, imported = prices.imported && prices.imported.rows, dflt = prices.defaultSet && prices.defaultSet.rows;
    var memo = {};

    function mat(id) { return data.mats && data.mats.rows[id]; }
    function recipesOf(id) {
      var m = mat(id);
      if (m && m.madeBy && m.madeBy.length) return m.madeBy;
      var it = data.items.rows[id];
      return it ? it.recipes : [];
    }

    function market(id) {
      var r = imported && imported[id], src = "ah";
      if (!r) { r = dflt && dflt[id]; src = "default"; }
      if (!r) return null;
      var age = typeof opts.today === "number" && r[1] !== null ? opts.today - r[1] : null;
      return { copper: r[0], source: src, day: r[1], qty: r[2], age: age, band: band(age), thin: r[2] !== null && r[2] <= 2 };
    }

    function fixed(id) {
      if (own(overrides, id)) return { copper: overrides[id].c, source: "override", day: null, qty: null, age: null, band: null, thin: false };
      var m = mat(id);
      if (m && m.vendor && m.vendor.copper > 0) return { copper: m.vendor.copper / m.vendor.stack, source: "vendor", day: null, qty: null, age: null, band: null, thin: false };
      return null;
    }

    // Unit price of a material: override, vendor, else the cheaper of the market and crafting it (complete costs only).
    function unitPrice(id, depth, visiting) {
      depth = depth || 0;
      var f = fixed(id);
      if (f) return f;
      var ah = market(id), craft = null;
      if (depth < DEPTH && recipesOf(id).length) {
        var c = craftCost(id, depth, visiting);
        if (c && !c.unknown.length && !c.soulbound.length) craft = { copper: c.copper, source: "craft", recipe: c.recipe, day: null, qty: null, age: null, band: null, thin: false };
      }
      if (ah && craft) return craft.copper < ah.copper ? craft : ah;
      return ah || craft;
    }

    // Craft cost of one unit of `id` from its cheapest recipe: {copper, unknown, soulbound, recipe, mats}.
    function craftCost(id, depth, visiting) {
      depth = depth || 0;
      var key = id + ":" + depth;
      if (own(memo, key)) return memo[key];
      visiting = visiting || {};
      if (visiting[id]) return null;
      visiting[id] = true;
      var best = null, rs = recipesOf(id);
      for (var i = 0; i < rs.length; i++) {
        var r = data.recipes.rows[rs[i]];
        if (!r) continue;
        var total = 0, unknown = [], soulbound = [], mats = [];
        for (var j = 0; j < r.mats.length; j++) {
          var mid = r.mats[j][0], n = r.mats[j][1], u = unitPrice(mid, depth + 1, visiting);
          if (u) { total += u.copper * n; mats.push([mid, n, u.copper, u.source]); continue; }
          var m = mat(mid);
          if (m && m.bind === "BoP") soulbound.push(mid); else unknown.push(mid);
          mats.push([mid, n, null, m && m.bind === "BoP" ? "soulbound" : null]);
        }
        var c = { copper: Math.round(total / (r.out || 1)), unknown: unknown, soulbound: soulbound, recipe: rs[i], mats: mats };
        if (!best || c.unknown.length + c.soulbound.length < best.unknown.length + best.soulbound.length ||
            (c.unknown.length + c.soulbound.length === best.unknown.length + best.soulbound.length && c.copper < best.copper)) best = c;
      }
      delete visiting[id];
      memo[key] = best;
      return best;
    }

    // price(id) → {copper, source, day, qty, age, band, thin, partial?, unknown?} | null (pricing §3.1).
    function price(id) {
      var f = fixed(id);
      if (f) return f;
      var ah = market(id), isMat = !!mat(id), c = recipesOf(id).length ? craftCost(id, 0) : null;
      if (isMat) {
        var u = unitPrice(id, 0);
        if (u) return u;
      } else if (ah) return ah;
      if (!c || (!c.mats.length)) return null;
      var known = !c.unknown.length && !c.soulbound.length;
      if (!known && c.copper === 0) return null;
      return { copper: c.copper, source: "craft", day: null, qty: null, age: null, band: null, thin: false, recipe: c.recipe, partial: !known, unknown: c.unknown.concat(c.soulbound) };
    }

    // Cost of a piece for the ranking's spend tier: its price, or null when unknown (D25 treats null as "mid").
    function costOf(id) {
      var p = price(id);
      return p && !p.partial ? p.copper : null;
    }

    return { price: price, unitPrice: unitPrice, craftCost: craftCost, costOf: costOf, market: market };
  }

  // Cash vs value for a list of [itemId, count] (pricing §5.2): owned mats reduce "to buy", never the value.
  function shopping(pricer, list, owned) {
    owned = owned || {};
    var value = 0, toBuy = 0, unknown = [];
    for (var i = 0; i < list.length; i++) {
      var id = list[i][0], n = list[i][1], u = pricer.unitPrice(id, 0);
      if (!u) { unknown.push(id); continue; }
      value += u.copper * n;
      toBuy += u.copper * Math.max(0, n - (owned[id] || 0));
    }
    return { value: Math.round(value), toBuy: Math.round(toBuy), unknown: unknown };
  }

  // "1g20s5c", "1g 20s", "1.2g", "120s", "85c", "12005" (copper). Empty → {empty: true}; bad → {error}.
  function parseMoney(text) {
    var s = String(text === undefined || text === null ? "" : text).trim().toLowerCase();
    if (!s) return { empty: true };
    if (/^\d+$/.test(s)) return { copper: parseInt(s, 10) };
    var re = /(\d+(?:\.\d+)?)\s*([gsc])/g, m, total = 0, seen = {}, rest = s;
    while ((m = re.exec(s))) {
      if (seen[m[2]]) return { error: "repeated unit " + m[2] };
      seen[m[2]] = 1;
      total += parseFloat(m[1]) * { g: 10000, s: 100, c: 1 }[m[2]];
      rest = rest.replace(m[0], "");
    }
    if (!Object.keys(seen).length || rest.replace(/\s+/g, "") !== "") return { error: "not a price: " + text };
    return { copper: Math.round(total) };
  }

  function formatMoney(copper) {
    if (copper === null || copper === undefined) return "";
    var c = Math.round(copper), neg = c < 0;
    c = Math.abs(c);
    var g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), k = c % 100, out = [];
    if (g) out.push(g + "g");
    if (s) out.push(s + "s");
    if (k || !out.length) out.push(k + "c");
    return (neg ? "-" : "") + out.join(" ");
  }

  var api = { createPricer: createPricer, shopping: shopping, parseMoney: parseMoney, formatMoney: formatMoney, band: band, DEPTH: DEPTH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.pricing = api; }
})(this);
