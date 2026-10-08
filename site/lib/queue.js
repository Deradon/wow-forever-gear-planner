// Crafting queue (docs/ui.md §5, pricing-import.md §5.2; synthesis D26, D28, D34): what each roster crafter makes,
// for whom and at which level, the Auction House list, crafter pace and the shopping list with owned mats. Pure
// functions over the per-entry paths of rank.path; no DOM, no storage. Classic script and CommonJS.
(function (root) {
  "use strict";

  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function rankLib() { return typeof module !== "undefined" && module.exports ? require("./rank") : root.FGP.rank; }
  function pricingLib() { return typeof module !== "undefined" && module.exports ? require("./pricing") : root.FGP.pricing; }
  function inHand(st) { return st === "have" || st === "equipped"; }

  function profOf(entry, name) {
    var ps = entry.professions || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === name) return ps[i];
    return null;
  }

  // Roster entries with at least one crafting profession, in roster order: [{id, entry, profs}].
  function crafters(data, roster) {
    var kinds = {};
    data.rules.professions.forEach(function (p) { kinds[p.name] = p.kind; });
    return (roster.entries || []).map(function (e) {
      return { id: e.id, entry: e, profs: e.professions.filter(function (p) { return kinds[p.id] === "crafting"; }).map(function (p) { return p.id; }) };
    }).filter(function (c) { return c.profs.length; });
  }

  // Skill of a crafter for a recipe needed at `level`: the entered skill, else the pace estimate (~).
  function skillOf(data, entry, prof, level) {
    var p = profOf(entry, prof);
    if (!p) return null;
    if (typeof p.skill === "number") return { skill: p.skill, estimated: false };
    return { skill: rankLib().pace(data.roles, Math.max(1, level)), estimated: true };
  }

  // Needs of one entry from its path: one per item, from the earliest stretch the entry has not outgrown.
  function entryNeeds(path, entry, items) {
    var out = {}, order = [];
    path.groups.forEach(function (g) {
      g.steps.forEach(function (s) {
        if (s.to < entry.level) return;
        var counts = {};
        s.items.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
        Object.keys(counts).forEach(function (id) {
          var st = items[entry.id + ":" + id];
          if (st && inHand(st.status)) return;
          var n = out[id];
          if (!n) { n = out[id] = { id: +id, level: s.from, core: s.core, count: counts[id], route: s.routes[id] }; order.push(id); return; }
          n.level = Math.min(n.level, s.from); n.core = n.core || s.core; n.count = Math.max(n.count, counts[id]);
        });
      });
    });
    return order.map(function (id) { return out[id]; });
  }

  // The queue: rows keyed by crafter and recipe spell (or "ah" and item) with the needs of every entry.
  // paths: {entryId: rank.path result}; state: {items, recipes}; opts: {core, within (null = all), showHidden,
  // pricer, via: {entryId: {itemId: via}}, learned}.
  function build(data, roster, paths, state, opts) {
    opts = opts || {};
    var items = state.items || {}, recipes = state.recipes || {}, map = {}, rows = [];
    var entries = roster.entries || [], byId = {};
    entries.forEach(function (e) { byId[e.id] = e; });
    var order = crafters(data, roster).map(function (c) { return c.id; });

    function rowFor(rt, itemId) {
      var key = rt.via === "ah" ? "ah:" + itemId : rt.crafter + ":" + rt.recipe;
      var row = map[key];
      if (row) return row;
      var r = data.recipes.rows[rt.recipe], it = data.items.rows[itemId];
      row = map[key] = {
        key: key, crafter: rt.via === "ah" ? "ah" : rt.crafter, recipe: rt.recipe, itemId: itemId, item: it, prof: r ? r.prof : null,
        skill: r ? r.skill : null, learned: rt.via !== "ah" && !!recipes[rt.crafter + ":" + rt.recipe],
        flags: rt.flags.filter(function (f) { return f !== "!" && f !== "~!" && !/^equip /.test(f); }),
        needs: [], hiddenNeeds: [],
      };
      if (rt.via !== "ah" && r) {
        var sk = skillOf(data, byId[rt.crafter], r.prof, it.req);
        row.has = sk;
        row.flag = sk && sk.skill < r.skill.learn ? (sk.estimated ? "~!" : "!") : null;
      }
      rows.push(row);
      return row;
    }

    var within = opts.within === undefined ? 5 : opts.within;
    entries.forEach(function (e) {
      var p = paths[e.id];
      if (!p) return;
      entryNeeds(p, e, items).forEach(function (n) {
        if (opts.core && !n.core) return;
        var row = rowFor(n.route, n.id);
        row.needs.push({ entry: e.id, level: n.level, now: e.level, core: n.core, count: n.count, inWindow: within === null || n.level <= e.level + within });
      });
    });

    // Hidden pieces: where they would be made, for "Show hidden (N)".
    var hiddenCount = {};
    Object.keys(items).forEach(function (k) {
      var v = items[k], m = /^(r[0-9a-z]{6}):(\d+)$/.exec(k);
      if (!v.hidden || !m || !byId[m[1]] || inHand(v.status)) return;
      var e = byId[m[1]], it = data.items.rows[m[2]];
      if (!it) return;
      var rt = rankLib().route(+m[2], it, e, roster, data, { via: (opts.via && opts.via[e.id]) || {}, learned: opts.learned || {} });
      if (!rt) return;
      var who = rt.via === "ah" ? "ah" : rt.crafter;
      hiddenCount[who] = (hiddenCount[who] || 0) + 1;
      if (!opts.showHidden) return;
      rowFor(rt, +m[2]).hiddenNeeds.push({ entry: e.id, level: Math.max(1, it.req), now: e.level });
    });

    var pricer = opts.pricer;
    rows.forEach(function (row) {
      row.needs.sort(byLevel); row.hiddenNeeds.sort(byLevel);
      row.qty = row.needs.reduce(function (t, n) { return t + n.count; }, 0);
      row.first = (row.needs[0] || row.hiddenNeeds[0]).level;
      row.each = null;
      if (!pricer) return;
      if (row.crafter === "ah") row.each = pricer.market(row.itemId);
      else {
        var c = pricer.craftCost(row.itemId);
        var missing = c ? c.unknown.length + c.soulbound.length : 0;
        if (c && c.mats.length && missing < c.mats.length) row.each = { copper: c.copper, source: "craft", partial: missing > 0 };
      }
      row.total = row.each && row.qty ? row.each.copper * row.qty : null;
    });
    rows.sort(function (a, b) {
      var ca = a.crafter === "ah" ? order.length : order.indexOf(a.crafter), cb = b.crafter === "ah" ? order.length : order.indexOf(b.crafter);
      var sa = a.skill ? a.skill.learn : 9999, sb = b.skill ? b.skill.learn : 9999;
      return ca - cb || sa - sb || a.first - b.first || (a.item.name < b.item.name ? -1 : a.item.name > b.item.name ? 1 : 0) || a.itemId - b.itemId;
    });
    return { rows: rows, hiddenCount: hiddenCount, crafters: order };
  }

  function byLevel(a, b) { return a.level - b.level || (a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0); }

  // Rows for a selection: an entry ID (its crafts), "ah" or "all". Rows without a shown need are dropped.
  function select(q, sel) {
    return q.rows.filter(function (r) { return (sel === "all" || r.crafter === sel) && (r.needs.length || r.hiddenNeeds.length); });
  }

  // Crafter pace (ui.md §5): per profession of the crafter, the next three points where the skill its queue needs
  // rises above what it has: [{prof, has: {skill, estimated}, points: [{entry, level, skill}]}].
  function pace(data, rows, crafter) {
    var out = [];
    crafter.professions.forEach(function (p) {
      var kind = data.rules.professions.filter(function (x) { return x.name === p.id; })[0];
      if (!kind || kind.kind !== "crafting") return;
      var has = typeof p.skill === "number" ? { skill: p.skill, estimated: false } : { skill: rankLib().pace(data.roles, crafter.level), estimated: true };
      var needs = [];
      rows.forEach(function (r) {
        if (r.crafter !== crafter.id || r.prof !== p.id || !r.skill) return;
        r.needs.forEach(function (n) { needs.push({ entry: n.entry, level: Math.max(n.level, n.now), gap: Math.max(0, n.level - n.now), skill: r.skill.learn }); });
      });
      needs.sort(function (a, b) { return a.gap - b.gap || b.skill - a.skill || (a.entry < b.entry ? -1 : 1); });
      var points = [], top = -1;
      needs.forEach(function (n) {
        if (n.skill <= top) return;
        top = n.skill;
        if (n.skill > has.skill && points.length < 3) points.push({ entry: n.entry, level: n.level, skill: n.skill });
      });
      out.push({ prof: p.id, has: has, points: points, queued: needs.length });
    });
    return out;
  }

  // Shopping list of rows (pricing §5.2): mats of the needs within the window, expanded through intermediates the
  // row's crafter makes itself when crafting them is the cheaper (or only) price; owned counts reduce "need" and
  // "To buy", never "Value of mats used". Returns {lines, value, toBuy, unknown}.
  function shoppingList(data, pricer, rows, roster, owned) {
    owned = owned || {};
    var lines = {}, order = [], byId = {}, depthCap = 4;
    (roster.entries || []).forEach(function (e) { byId[e.id] = e; });
    function line(id) {
      if (!lines[id]) { lines[id] = { id: +id, count: 0, usedBy: [], through: [] }; order.push(String(id)); }
      return lines[id];
    }
    function add(id, n, crafter, itemId, through, depth) {
      var cc = depth < depthCap ? pricer.craftCost(id, depth) : null, r = cc && data.recipes.rows[cc.recipe];
      var u = pricer.unitPrice(id, depth);
      var mine = r && profOf(crafter, r.prof);
      if (mine && (!u || u.source === "craft")) {
        var crafts = Math.ceil(n / (r.out || 1));
        r.mats.forEach(function (m) { add(m[0], crafts * m[1], crafter, itemId, through.concat([+id]), depth + 1); });
        return;
      }
      var l = line(id);
      l.count += n;
      if (l.usedBy.indexOf(itemId) < 0) l.usedBy.push(itemId);
      through.forEach(function (t) { if (l.through.indexOf(t) < 0) l.through.push(t); });
    }
    rows.forEach(function (row) {
      if (row.crafter === "ah") return;
      var n = row.needs.reduce(function (t, x) { return t + (x.inWindow ? x.count : 0); }, 0), r = data.recipes.rows[row.recipe];
      if (!n || !r) return;
      r.mats.forEach(function (m) { add(m[0], Math.ceil(n / (r.out || 1)) * m[1], byId[row.crafter], row.itemId, [], 1); });
    });
    var gatherers = {};
    (roster.entries || []).forEach(function (e) { e.professions.forEach(function (p) { (gatherers[p.id] = gatherers[p.id] || []).push(e.id); }); });
    var list = order.map(function (id) {
      var l = lines[id], m = data.mats.rows[id] || {}, u = pricer.unitPrice(+id, 0), have = owned[id] || 0;
      l.name = m.name || (data.items.rows[id] || {}).name || String(id);
      l.owned = have; l.need = Math.max(0, l.count - have);
      l.unit = u; l.total = u ? u.copper * l.count : null;
      l.soulbound = !u && m.bind === "BoP";
      l.gatheredBy = m.gathered ? gatherers[m.gathered] || [] : [];
      l.gathered = m.gathered || null;
      return l;
    }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id; });
    var sums = pricingLib().shopping(pricer, list.map(function (l) { return [l.id, l.count]; }), owned);
    return { lines: list, value: sums.value, toBuy: sums.toBuy, unknown: sums.unknown };
  }

  var api = { crafters: crafters, entryNeeds: entryNeeds, build: build, select: select, pace: pace, shoppingList: shoppingList, skillOf: skillOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.queue = api; }
})(this);
