// Gear view: roster cards with inline level, roster switches, slot lanes 1–60, next upgrades, the full plan,
// alternatives (D19), Get via, status select, hide with Undo (docs/ui.md §4; synthesis D18, D19, D24–D26).
// gearModel() is pure over A.S and the data, so tests check it without a DOM; the HTML functions render it.
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var STATUS = [["", "to get"], ["have", "in bags"], ["equipped", "equipped"]];
  var LANE_STATE = { equipped: "equipped", have: "in bags", get: "get now", upgrade: "upgrade ready", empty: "empty" };
  var ARMOR_ORDER = ["Plate", "Mail", "Leather", "Cloth"];
  var SOON = 5;

  function esc(v) { return A.esc(v); }
  function D() { return A.D; }
  function inHand(st) { return st === "have" || st === "equipped"; }

  // --- model -----------------------------------------------------------------------------------------------------

  // Skill of a crafter for a recipe at the item's level: entered or estimated (~).
  function crafterSkill(crafter, prof, level) {
    var p = (crafter.professions || []).filter(function (x) { return x.id === prof; })[0];
    if (!p) return null;
    if (typeof p.skill === "number") return { skill: p.skill, estimated: false };
    return { skill: FGP.rank.pace(D().roles, Math.max(1, level)), estimated: true };
  }
  A.crafterSkill = crafterSkill;

  // Lines under the item name: skill shortfall, specialisation, scarce source, equip skill (D26, D28).
  function routeNotes(rt, it, names) {
    var out = [], r = D().recipes.rows[rt.recipe];
    rt.flags.forEach(function (f) {
      if ((f === "!" || f === "~!") && rt.crafter && r) {
        var sk = crafterSkill(A.entry(rt.crafter), r.prof, it.req);
        out.push("needs " + r.prof + " " + r.skill.learn + ", " + names[rt.crafter] + " has " + (sk.estimated ? "~" : "") + sk.skill);
      } else if (/^equip /.test(f) && it.equipSkill) out.push("needs " + it.equipSkill.prof + " " + it.equipSkill.rank + " to wear" + (f === "equip ~!" ? " (estimated skill)" : ""));
      else if (/^needs /.test(f) && !/^needs (Favor|reputation|drop only)$/.test(f)) out.push(f);
    });
    return out;
  }

  // Get via as HTML (ui.md §4.2): Self · Tailoring 130 / <name> → mail / AH · price.
  A.viaText = function (rt, it, names, id) {
    var r = D().recipes.rows[rt.recipe], flag = rt.flags.filter(function (f) { return f === "!" || f === "~!"; })[0] || "";
    var fl = flag ? ' <span class="flag" title="Crafter skill is below the recipe skill' + (flag === "~!" ? " (estimated)" : "") + '">' + esc(flag) + "</span>" : "";
    if (rt.via === "self") {
      var sk = crafterSkill(A.entry(rt.crafter), r.prof, it.req), p = A.entry(rt.crafter).professions.filter(function (x) { return x.id === r.prof; })[0];
      return '<span class="via">Self · ' + esc(r.prof) + " " + (p && typeof p.skill === "number" ? esc(p.skill) : "~" + esc(sk.skill)) + fl + "</span>";
    }
    if (rt.via === "crafter") {
      var c = A.entry(rt.crafter);
      return '<span class="via">' + A.classSpan(c.cls, names[c.id]) + " → mail" + fl + "</span>";
    }
    var ah = A.pricer().market(+id);
    return '<span class="via" title="Nobody in the roster crafts it: buy it on the Auction House">AH · ' + (ah ? A.money(ah.copper) : "no price seen") + "</span>";
  };

  function armorAt(entry, level) {
    var c = D().rules.classes[entry.cls];
    for (var i = 0; i < ARMOR_ORDER.length; i++) {
      var l = c.armor[ARMOR_ORDER[i]];
      if (l !== undefined && l !== null && l <= level) return ARMOR_ORDER[i];
    }
    return "Cloth";
  }

  // The Gear model for one entry: rows (one per item and contiguous stretch of the path), lanes, alternatives,
  // hidden items and progress. Filters are not applied here.
  A.gearModel = function (entry) {
    var path = A.pathFor(entry), L = entry.level, names = A.names(), rows = [], lanes = [], alts = [], gi = 0;
    var groupIds = D().rules.slotGroups.map(function (g) { return g.id; });
    path.groups.forEach(function (g) {
      var open = {};
      g.steps.forEach(function (s) {
        var counts = {};
        s.items.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
        Object.keys(counts).forEach(function (id) {
          var prev = open[id];
          if (prev && prev.to + 1 === s.from) { prev.to = s.to; prev.core = prev.core || s.core; prev.count = Math.max(prev.count, counts[id]); return; }
          var it = D().items.rows[id], st = A.itemState(entry.id, id);
          var row = { key: A.itemKey(entry.id, id), id: +id, it: it, group: g.id, order: groupIds.indexOf(g.id), from: s.from, to: s.to, core: s.core,
            count: counts[id], route: s.routes[id], status: st.status || "", alt: false, why: null, idx: gi++ };
          open[id] = row;
          rows.push(row);
        });
      });
      var main = {};
      g.steps.forEach(function (s) { s.items.forEach(function (id) { main[id] = true; }); });
      g.alternatives.forEach(function (s) {
        s.items.forEach(function (id) {
          if (main[id] || alts.some(function (a) { return a.id === id && a.group === g.id; })) return;
          var st = A.itemState(entry.id, id);
          alts.push({ key: A.itemKey(entry.id, id), id: +id, it: D().items.rows[id], group: g.id, order: groupIds.indexOf(g.id), from: s.from, to: s.to, core: false,
            count: 1, route: s.routes[id], status: st.status || "", alt: true, why: s.why.join(", "), idx: gi++ });
        });
      });
      // Lane state at the entry's level.
      if (!g.steps.length) { lanes.push({ group: g.id, state: "none", steps: [] }); return; }
      var cur = null, next = null, worn = null, i;
      for (i = 0; i < g.steps.length; i++) {
        var s = g.steps[i];
        if (s.from <= L && L <= s.to) cur = s;
        if (s.from > L && !next) next = s;
      }
      var stepRows = function (s) { return s.items.map(function (id) { return A.itemState(entry.id, id).status || ""; }); };
      for (i = g.steps.length - 1; i >= 0; i--) {
        if (g.steps[i].from > L) continue;
        if (stepRows(g.steps[i]).every(inHand)) { worn = g.steps[i]; break; }
      }
      var state;
      if (!cur) state = "empty";
      else {
        var sts = stepRows(cur);
        state = sts.every(function (x) { return x === "equipped"; }) ? "equipped" : sts.every(inHand) ? "have" : worn ? "upgrade" : "get";
      }
      lanes.push({ group: g.id, state: state, cur: cur, next: next, worn: worn, steps: g.steps });
    });
    rows.sort(function (a, b) { return a.from - b.from || a.order - b.order || a.idx - b.idx; });
    alts.sort(function (a, b) { return a.order - b.order || a.from - b.from; });
    var hidden = Object.keys(A.entryMaps(entry.id).hidden).map(function (id) { return { id: +id, it: D().items.rows[id] }; }).filter(function (h) { return h.it; });
    var prog = { core: 0, done: 0, soon: 0 };
    rows.forEach(function (r) {
      if (r.core) { prog.core++; if (r.status === "equipped") prog.done++; }
      if (r.from > L && r.from <= L + SOON && r.status !== "equipped") prog.soon++;
    });
    return { entry: entry, name: names[entry.id], names: names, level: L, rows: rows, lanes: lanes, alternatives: alts, hidden: hidden, progress: prog, armor: armorAt(entry, L) };
  };

  function rowHay(r, names) {
    var it = r.it, rec = D().recipes.rows[r.route.recipe], src = A.sourcesFor(r.route.recipe).list.map(function (e) { return A.sourceLabel(e).text; });
    return [it.name, it.slot, it.type, r.group, it.bind, rec && rec.prof, r.core ? "core" : "", r.route.via === "ah" ? "ah" : names[r.route.crafter] || "",
      Object.keys(it.stats).map(A.statLabel).join(" "), src.join(" "), r.route.flags.join(" ")].join(" ");
  }

  // Rows after the user's filters, slot filter and search.
  A.filterRows = function (m, rows, opts) {
    var f = A.S.prefs.filters, slot = A.S.prefs.slot;
    return rows.filter(function (r) {
      if (f.core && !r.core && !(opts && opts.keepAlt)) return false;
      if (f.hideDone && r.status === "equipped") return false;
      if (slot && r.group !== slot) return false;
      return A.matches(rowHay(r, m.names));
    });
  };
  // Next upgrades: what to get at the current level (not in hand yet) and what comes within five levels.
  A.nextRows = function (m) {
    return m.rows.filter(function (r) {
      return (r.from <= m.level && m.level <= r.to && !inHand(r.status)) || (r.from > m.level && r.from <= m.level + SOON);
    });
  };

  // --- HTML ------------------------------------------------------------------------------------------------------

  function trackPos(l) { return ((Math.max(1, Math.min(l, 60)) - 1) / 59 * 100).toFixed(2) + "%"; }
  function stateDot(st) { return '<i class="sd sd-' + st + '" aria-hidden="true"></i>'; }

  function profText(e) {
    if (!e.professions.length) return "no professions";
    return e.professions.map(function (p) {
      var sk = typeof p.skill === "number" ? p.skill : "~" + FGP.rank.pace(D().roles, e.level);
      var kind = D().rules.professions.filter(function (x) { return x.name === p.id; })[0];
      return p.id + (kind && kind.kind === "crafting" ? " " + sk : "");
    }).join(" · ");
  }
  function roleText(e) {
    var r = D().roles.roles[e.role].label;
    return r + (e.options.school ? " · " + e.options.school.charAt(0).toUpperCase() + e.options.school.slice(1) : "");
  }

  function cardHtml(e, sel, names) {
    var m = A.gearModel(e), p = m.progress, pct = p.core ? Math.round(p.done / p.core * 100) : 0;
    return '<div class="card cls-' + A.slug(e.cls) + (sel ? " sel" : "") + '">' +
      '<button type="button" class="card-name" id="card-' + esc(e.id) + '" data-act="select" data-key="' + esc(e.id) + '" aria-pressed="' + sel + '" title="Show the plan for ' + esc(names[e.id]) + ' ([ and ] switch)">' + esc(names[e.id]) + "</button>" +
      '<div class="card-sub">' + esc(e.cls) + " · " + esc(roleText(e)) + "</div>" +
      '<div class="card-row"><label for="lvl-' + esc(e.id) + '">Lvl</label><input type="number" min="1" max="60" id="lvl-' + esc(e.id) + '" value="' + esc(e.level) +
      '" data-input="level" data-change="level" data-key="' + esc(e.id) + '" aria-label="Level of ' + esc(names[e.id]) + '">' +
      '<button type="button" class="btn btn-small btn-quiet" id="edit-' + esc(e.id) + '" data-act="entry-edit" data-key="' + esc(e.id) + '" aria-label="Edit ' + esc(names[e.id]) + '">Edit</button></div>' +
      '<div class="card-sub">' + esc(profText(e)) + "</div>" +
      '<div class="card-prog">' + p.done + "/" + p.core + " core" + (p.soon ? " · " + p.soon + " soon" : "") +
      '<div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div></div>';
  }

  function rosterBar() {
    var r = A.S.roster;
    return '<div class="roster-bar" role="group" aria-label="Roster settings">' +
      '<label for="roster-faction">Faction</label><select id="roster-faction" data-change="faction">' +
      ["alliance", "horde"].map(function (f) { return '<option value="' + f + '"' + (r.faction === f ? " selected" : "") + ">" + (f === "alliance" ? "Alliance" : "Horde") + "</option>"; }).join("") + "</select>" +
      '<label title="BoE pieces nobody in the roster crafts can be bought on the Auction House"><input type="checkbox" id="roster-ah" data-change="roster" data-key="includeAH"' + (r.includeAH ? " checked" : "") + "> Include AH purchases</label>" +
      '<label title="' + esc(D().reference.coverage.unknown) + '"><input type="checkbox" id="roster-known" data-change="roster" data-key="knownSourceOnly"' + (r.knownSourceOnly ? " checked" : "") + "> Only recipes with a known source</label></div>";
  }

  function lanesHtml(m) {
    var L = m.level, sel = A.S.prefs.slot;
    var ticks = [1, 10, 20, 30, 40, 50, 60].filter(function (t) { return Math.abs(t - L) > 2; }).map(function (t) { return '<span class="ax-t" style="left:' + trackPos(t) + '">' + t + "</span>"; }).join("");
    var legend = '<span class="slegend">' + ["equipped", "have", "get", "upgrade", "empty"].map(function (st) { return "<span>" + stateDot(st) + LANE_STATE[st] + "</span>"; }).join("") +
      '<span><i class="mk-key" aria-hidden="true"></i>core</span></span>';
    var planned = m.lanes.filter(function (l) { return l.state !== "none"; }), none = m.lanes.filter(function (l) { return l.state === "none"; });
    var lanes = planned.map(function (l) {
      var segs = l.steps.map(function (s) {
        return '<span class="ln-seg' + (s.core ? " core" : "") + '" style="left:' + trackPos(s.from) + ";right:calc(100% - " + trackPos(s.to) + ')"></span>';
      }).join("");
      var marks = l.steps.map(function (s) {
        var sts = s.items.map(function (id) { return A.itemState(m.entry.id, id).status || ""; });
        var st = sts.every(function (x) { return x === "equipped"; }) ? "equipped" : sts.every(inHand) ? "have" : "get";
        return '<span class="mk mk-' + st + (s.core ? " mk-core" : "") + (s.to < L ? " mk-past" : "") + (s === l.worn ? " mk-worn" : "") + '" style="left:' + trackPos(s.from) + '"' + A.ttAttrs("item", s.items[0]) + "></span>";
      }).join("");
      var show = l.worn && l.state === "upgrade" ? l.worn : l.cur, nx = l.state === "upgrade" ? l.cur : l.next, ready = nx && nx.from <= L;
      var nowName = show ? show.items.filter(function (id, i, a) { return a.indexOf(id) === i; }).map(function (id) { return A.item(id).name; }).join(" + ") : null;
      var title = l.group + ": " + (nowName ? nowName + " (" + LANE_STATE[l.state] + ")" : LANE_STATE[l.state] + (l.next ? " until " + l.next.from : "")) +
        (nx ? ", next " + A.item(nx.items[0]).name + " at " + nx.from : "") + ". " + (sel === l.group ? "Activate to show all slots." : "Activate to filter the tables to this slot.");
      return '<div role="button" tabindex="0" class="lane lane-' + l.state + '" id="slot-' + A.idPart(l.group) + '" data-act="slot" data-key="' + esc(l.group) +
        '" aria-pressed="' + (sel === l.group) + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' +
        '<span class="ln-slot">' + esc(l.group) + "</span>" +
        '<span class="ln-now">' + stateDot(l.state) + (nowName ? '<span class="nm q' + A.item(show.items[0]).quality + '">' + esc(nowName) + "</span>" :
          '<span class="nm faint">' + esc(LANE_STATE[l.state]) + (l.next ? " until " + l.next.from : "") + "</span>") + "</span>" +
        '<span class="ln-track">' + segs + marks + "</span>" +
        '<span class="ln-next">' + (nx ? '<span class="lvl-pill' + (ready ? " ready" : "") + '">' + nx.from + '</span><span class="nm-s' + (ready ? " ready" : "") + '">' + esc(A.item(nx.items[0]).name) + "</span>" :
          '<span class="faint">—</span>') + "</span></div>";
    }).join("");
    var noneLine = none.length ? '<div class="lane-none">Crafting has nothing for ' + esc(m.name) + " in: " + none.map(function (l) { return esc(l.group); }).join(", ") + "</div>" : "";
    return '<section class="section"><div class="section-head"><h2>Slots</h2><span class="hint">level ' + L + " · what to wear now and every step of the path · pick a slot to filter the tables</span>" + legend + "</div>" +
      '<div class="lanes" role="group" aria-label="Slots; activate one to filter the tables" style="--now:' + trackPos(L) + '">' +
      '<div class="lane lane-axis"><span class="ln-slot"><button type="button" class="btn btn-small" id="slot-all" data-act="slot" data-key="" aria-pressed="' + (!sel) + '">All slots</button></span>' +
      '<span class="ln-now faint small">wear now</span><span class="ln-track" aria-hidden="true">' + ticks + '<span class="ax-now" style="left:' + trackPos(L) + '">' + L + "</span></span>" +
      '<span class="ln-next faint small">next upgrade</span></div>' + lanes + noneLine + "</div></section>";
  }

  function matsCell(r, bold) {
    var cc = A.pricer().craftCost(r.id);
    if (!cc || !cc.mats.length) return '<span class="faint">—</span>';
    var missing = cc.unknown.length + cc.soulbound.length;
    if (missing === cc.mats.length) return '<span class="noprice" title="No mat of this recipe has a price yet">no price</span>';
    var title = cc.mats.map(function (x) { return x[1] + "× " + A.itemName(x[0]) + (x[2] !== null ? " @ " + A.moneyText(x[2]) + " (" + x[3] + ")" : x[3] === "soulbound" ? " (not tradeable)" : " (no price)"); }).join("\n");
    return '<span class="' + (bold ? "route-bold" : "") + '" title="' + esc(title) + '">' + A.money(cc.copper) + (missing ? '<span class="faint" title="Some mats have no price">+?</span>' : "") + "</span>";
  }
  function ahCell(r, bold) {
    var p = A.pricer().market(r.id);
    return '<span class="' + (bold ? "route-bold" : "") + '">' + A.priceHtml(p) + "</span>";
  }

  function rowHtml(m, r, where) {
    var it = r.it, rt = r.route, eid = m.entry.id, base = where + "-" + eid + "-" + r.id;
    var notes = [];
    if (!r.alt) notes.push((r.core ? "Core: best" : "Best") + " for " + r.group + " " + r.from + "–" + r.to);
    else notes.push("Alternative for " + r.group + " " + r.from + "–" + r.to + ": " + r.why);
    notes = notes.concat(routeNotes(rt, it, m.names));
    if (it.avail === "unconfirmed") notes.push("unconfirmed: " + (it.reason || "may not be in the game"));
    if (it.note) notes.push(it.note);
    var learnBox = "";
    if (r.alt && rt.crafter && /Favor|reputation|drop only/.test(r.why)) {
      var lk = rt.crafter + ":" + rt.recipe;
      learnBox = '<label class="small"><input type="checkbox" id="learn-' + esc(base) + '" data-change="learned" data-key="' + esc(lk) + '"' + (A.S.recipes[lk] ? " checked" : "") +
        "> " + esc(m.names[rt.crafter]) + " has the pattern (moves it into the plan)</label>";
    }
    var self = rt.via !== "ah";
    return '<tr data-row="' + esc(r.key) + '" class="' + (r.status === "equipped" ? "done" : "") + '">' +
      '<td class="c-lvl"><span class="lvl-pill' + (r.from <= m.level ? " reached" : "") + '">' + r.from + "</span></td>" +
      '<td class="c-item">' + A.itemLink(r.id) + (r.count > 1 ? '<span class="times">×' + r.count + "</span>" : "") + (r.core ? '<span class="core-mark" title="Core: kept for a while and a clear gain">CORE</span>' : "") +
      notes.map(function (n, i) { return '<div class="inote' + (i > 0 && /^needs|unconfirmed/.test(n) ? " warn" : "") + '">' + esc(n) + "</div>"; }).join("") + learnBox + "</td>" +
      '<td class="c-slot nowrap">' + esc(it.slot) + ' <span class="faint">' + esc(A.typeText(it)) + "</span></td>" +
      '<td class="c-stats">' + A.statChips(it) + "</td>" +
      '<td class="c-bind">' + A.bindBadge(it) + "</td>" +
      '<td class="c-via">' + A.viaText(rt, it, m.names, r.id) + viaSelect(m, r, base) + "</td>" +
      '<td class="c-src">' + A.sourceBadges(rt.recipe) + "</td>" +
      '<td class="c-skill">' + A.skillText(rt.recipe, rt) + "</td>" +
      '<td class="c-cost num">' + matsCell(r, self) + "</td>" +
      '<td class="c-ah num">' + ahCell(r, !self) + "</td>" +
      '<td class="c-status"><div class="st-wrap"><select class="status st-' + (r.status || "get") + '" id="st-' + esc(base) + '" data-change="status" data-key="' + esc(r.key) + '" aria-label="Status of ' + esc(it.name) + '">' +
      STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === r.status ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="hide-btn" id="hb-' + esc(base) + '" data-act="hide" data-key="' + esc(r.key) + '" aria-label="Hide ' + esc(it.name) + " for " + esc(m.name) +
      '" title="Not for ' + esc(m.name) + ': hide it, the next-best piece takes its place (h)">✕</button></div></td></tr>';
  }

  // Crafter choice (ui.md §4.2): when more than one roster crafter (or the AH) can supply the piece; stored as `via`.
  function viaSelect(m, r, base) {
    var opts = FGP.rank.routeOptions(r.id, r.it, m.entry, A.S.roster, D());
    if (opts.length < 2) return "";
    var cur = A.itemState(m.entry.id, r.id).via || "";
    return '<select class="via-sel" id="via-' + esc(base) + '" data-change="via" data-key="' + esc(r.key) + '" aria-label="Who makes ' + esc(r.it.name) + " for " + esc(m.name) + '">' +
      '<option value=""' + (cur ? "" : " selected") + ">Recommended</option>" + opts.map(function (o) {
        var v = o.via === "ah" ? "ah" : o.crafter;
        return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + (o.via === "ah" ? "Auction House" : o.via === "self" ? "Self" : esc(m.names[o.crafter])) + "</option>";
      }).join("") + "</select>";
  }

  var HEAD = "<thead><tr><th>Lvl</th><th>Item</th><th>Slot</th><th>Stats</th><th>Bind</th><th>Get via</th><th>Source</th><th>Recipe</th>" +
    '<th class="num">Mats</th><th class="num">AH</th><th>Status</th></tr></thead>';

  function tableHtml(m, rows, where, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="empty">' + esc(opts.empty || "Nothing to show.") + "</div>";
    var body = [], last = null, nowShown = false;
    rows.forEach(function (r) {
      if (opts.group && r.from !== last) {
        var reached = r.from <= m.level, isNow = !nowShown && reached && !rows.some(function (o) { return o.from > r.from && o.from <= m.level; });
        if (isNow) nowShown = true;
        body.push('<tr class="group' + (reached ? " reached" : "") + '"><td colspan="11">Level ' + r.from + (isNow ? '<span class="now">◂ current ' + m.level + "</span>" : "") + "</td></tr>");
        last = r.from;
      }
      body.push(rowHtml(m, r, where));
    });
    return '<div class="tbl-wrap"><table class="items" aria-label="' + esc(opts.label || "") + '">' + HEAD + "<tbody>" + body.join("") + "</tbody></table></div>";
  }

  function filterBar(m) {
    var f = A.S.prefs.filters, nh = m.hidden.length;
    function cb(k, label, title) {
      return '<label title="' + esc(title) + '"><input type="checkbox" id="filter-' + k + '" data-change="filter" data-key="' + k + '"' + (f[k] ? " checked" : "") + "> " + label + "</label>";
    }
    return '<div class="toolbar">' + cb("core", "Core only", "Only core pieces: a clear gain, kept for at least five levels") + cb("hideDone", "Hide done", "Hide equipped pieces") +
      (nh ? '<label title="Pieces you hid for this character"><input type="checkbox" id="filter-showhidden" data-change="showhidden"' + (A.S.prefs.showHidden.gear ? " checked" : "") + "> Show hidden (" + nh + ")</label>" : "") +
      (A.S.prefs.slot ? '<span class="ftag">' + esc(A.S.prefs.slot) + ' only<button type="button" id="slot-clear" data-act="slot" data-key="" title="Show all slots (Esc)">clear ×</button></span>' : "") +
      (A.query ? '<span class="ftag">search: ' + esc(A.query) + "</span>" : "") + "</div>";
  }

  function hiddenLine(m) {
    if (!m.hidden.length || !A.S.prefs.showHidden.gear) return "";
    return '<div class="hidden-line" role="group" aria-label="Hidden for ' + esc(m.name) + '"><span>Hidden for ' + esc(m.name) + ":</span>" + m.hidden.map(function (h) {
      return '<span class="hid-item">' + A.itemLink(h.id) + ' <button type="button" class="linkbtn" id="unhide-' + esc(m.entry.id) + "-" + h.id + '" data-act="unhide" data-key="' + esc(A.itemKey(m.entry.id, h.id)) + '">Unhide</button></span>';
    }).join("") + "</div>";
  }

  function detailHtml(e) {
    var m = A.gearModel(e), out = [];
    out.push('<div class="detail-head cls-' + A.slug(e.cls) + '"><h2>' + esc(m.name) + '</h2><span class="meta">Level ' + m.level + " " + esc(e.cls) + " · " + esc(roleText(e)) + " · " +
      esc(m.armor) + " · " + esc(profText(e)) + "</span></div>");
    out.push(lanesHtml(m));
    var next = A.filterRows(m, A.nextRows(m));
    out.push('<section class="section"><div class="section-head"><h2>Next upgrades</h2><span class="hint">to get at level ' + m.level + " and up to level " + Math.min(60, m.level + SOON) + "</span></div>" +
      filterBar(m) + tableHtml(m, next, "next", { label: "Next upgrades", empty: "Nothing to get within " + SOON + " levels." + (A.S.prefs.slot || A.query ? " (filtered)" : "") }) + hiddenLine(m) + "</section>");
    var upTo = A.S.prefs.upTo[e.id] || 60;
    var full = A.filterRows(m, m.rows).filter(function (r) { return r.from <= upTo; });
    out.push('<section class="section"><div class="section-head"><h2>Full plan</h2><label class="upto" for="upto-' + esc(e.id) + '">up to level <input type="number" class="inp inp-num" min="1" max="60" id="upto-' +
      esc(e.id) + '" value="' + (A.S.prefs.upTo[e.id] || "") + '" placeholder="60" data-input="upto" data-change="upto" data-key="' + esc(e.id) + '"></label><span class="hint">' + full.length + " of " + m.rows.length + " pieces shown</span></div>" +
      tableHtml(m, full, "full", { group: true, label: "Full plan", empty: "No crafted piece fits these filters." }) + "</section>");
    var alts = A.filterRows(m, m.alternatives, { keepAlt: true });
    out.push('<section class="section"><div class="section-head"><h2>Alternatives</h2><span class="hint">Favor, reputation and drop-only patterns, unconfirmed items and unscored gadgets. ' +
      "They join the path once the crafter has the pattern.</span></div>" + tableHtml(m, alts, "alt", { label: "Alternatives", empty: "No alternatives." }) + "</section>");
    return out.join("");
  }

  A.views.gear = {
    html: function () {
      var es = A.S.roster.entries, sel = A.selected(), names = A.names();
      var out = [rosterBar(), '<div class="cards">' + es.map(function (e) { return cardHtml(e, e === sel, names); }).join("") +
        '<button type="button" class="card card-add" id="card-add" data-act="entry-add">+ Add character</button></div>'];
      if (A.form && !A.form.inline) out.push('<div class="section">' + A.formHtml() + "</div>");
      if (sel) out.push(detailHtml(sel));
      return out.join("");
    },
  };

  // --- actions ---------------------------------------------------------------------------------------------------

  A.acts.select = function (el) { A.selectEntry(el.getAttribute("data-key"), true); };
  function setLevel(el) {
    var e = A.entry(el.getAttribute("data-key")), v = parseInt(el.value, 10);
    if (!e || !Number.isFinite(v)) return;
    v = Math.max(1, Math.min(60, v));
    if (v === e.level) return;
    e.level = v;
    A.commit();
  }
  A.inputs.level = setLevel;
  A.changes.level = setLevel;
  function setUpTo(el) {
    var id = el.getAttribute("data-key"), v = parseInt(el.value, 10);
    if (!Number.isFinite(v)) delete A.S.prefs.upTo[id]; else A.S.prefs.upTo[id] = Math.max(1, Math.min(60, v));
    A.commit();
  }
  A.inputs.upto = setUpTo;
  A.changes.upto = setUpTo;
  A.changes.roster = function (el) { A.S.roster[el.getAttribute("data-key")] = !!el.checked; A.commit(); };
  A.changes.filter = function (el) { A.S.prefs.filters[el.getAttribute("data-key")] = !!el.checked; A.commit(); };
  A.changes.showhidden = function (el) { A.S.prefs.showHidden.gear = !!el.checked; A.commit(); };
  A.changes.status = function (el) {
    var k = el.getAttribute("data-key").split(":");
    A.setItem(k[0], k[1], { status: el.value || null });
    A.commit();
  };
  A.changes.via = function (el) {
    var k = el.getAttribute("data-key").split(":");
    A.setItem(k[0], k[1], { via: el.value || null });
    A.commit([el.id]);
  };
  A.changes.learned = function (el) {
    var k = el.getAttribute("data-key");
    if (el.checked) A.S.recipes[k] = "learned"; else delete A.S.recipes[k];
    A.commit();
  };
  A.acts.slot = function (el) {
    var g = el.getAttribute("data-key");
    A.S.prefs.slot = A.S.prefs.slot === g ? "" : g;
    A.commit([el.id, g ? "slot-" + A.idPart(g) : "slot-all", "slot-all"]);
  };

  // IDs of the other hide buttons in the same table, nearest first (focus target after a hide).
  function nearby(el) {
    var box = el && el.closest && el.closest("table");
    if (!box) return [];
    var all = [].slice.call(box.querySelectorAll('[data-act="hide"]')).map(function (b) { return b.id; }), i = all.indexOf(el.id);
    return i < 0 ? all : all.slice(i + 1).concat(all.slice(0, i).reverse());
  }
  // Hide a piece for one entry (ui.md §4.2): the next-best candidate takes its place; Undo brings it back.
  A.hide = function (key, origin) {
    var k = key.split(":"), name = A.itemName(k[1]), who = A.nameOf(k[0]);
    A.setItem(k[0], k[1], { hidden: true });
    A.commit(nearby(origin).concat(["filter-core"]));
    A.toast("Hidden " + name + " for " + who, { label: "Undo", fn: function () { A.unhide(key); } });
  };
  A.unhide = function (key) {
    var k = key.split(":");
    A.setItem(k[0], k[1], { hidden: null });
    A.commit(["hb-next-" + k[0] + "-" + k[1], "hb-full-" + k[0] + "-" + k[1], "hb-alt-" + k[0] + "-" + k[1], "filter-showhidden", "filter-core"]);
    A.toast(A.itemName(k[1]) + " is back for " + A.nameOf(k[0]));
  };
  A.acts.hide = function (el) { A.hide(el.getAttribute("data-key"), el); };
  A.acts.unhide = function (el) { A.unhide(el.getAttribute("data-key")); };
})(this);
