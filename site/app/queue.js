// Queue view: crafter buttons (roster crafters, Auction House, All), skill inputs, To craft with learned boxes and
// "mark in bags" buttons per character, the Auction House list, crafter pace and the shopping list with owned mats
// (docs/ui.md §5, pricing-import.md §5.2; synthesis D26, D28, D34). The model comes from site/lib/queue.js over the
// same per-entry paths the Gear view uses.
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var ABBR = { Tailoring: "Tail", Enchanting: "Ench", Blacksmithing: "BS", Leatherworking: "LW", Engineering: "Eng", Alchemy: "Alch" };

  function esc(v) { return A.esc(v); }
  function D() { return A.D; }

  // --- model -----------------------------------------------------------------------------------------------------

  A.queueModel = function () {
    var es = A.S.roster.entries, paths = {}, via = {}, learned = {};
    es.forEach(function (e) { paths[e.id] = A.pathFor(e); via[e.id] = A.entryMaps(e.id).via; });
    for (var k in A.S.recipes) if (A.own(A.S.recipes, k)) learned[k] = true;
    var q = FGP.queue.build(D(), A.S.roster, paths, A.S, {
      core: A.S.prefs.filters.core, within: A.S.prefs.within, showHidden: A.S.prefs.showHidden.queue, pricer: A.pricer(), via: via, learned: learned,
    });
    var sel = A.S.prefs.queueSel;
    if (sel !== "ah" && sel !== "all" && q.crafters.indexOf(sel) < 0) sel = q.crafters[0] || "ah";
    q.sel = sel;
    q.names = A.names();
    return q;
  };
  A.queueKeys = function (q) { return q.crafters.concat(["ah", "all"]); };

  function profsOf(e) {
    var kinds = {};
    D().rules.professions.forEach(function (p) { kinds[p.name] = p.kind; });
    return e.professions.filter(function (p) { return kinds[p.id] === "crafting"; });
  }

  function rowHay(r, names) {
    return [r.item.name, r.item.slot, r.item.type, r.prof, r.crafter === "ah" ? "auction house ah" : names[r.crafter]]
      .concat(r.needs.map(function (n) { return names[n.entry]; })).join(" ");
  }

  // --- HTML ------------------------------------------------------------------------------------------------------

  function selBar(q) {
    var btn = function (key, html, cls, title) {
      return '<button type="button" id="qsel-' + esc(key) + '" class="' + (cls || "") + '" data-act="qsel" data-key="' + esc(key) + '" aria-pressed="' + (q.sel === key) + '"' +
        (title ? ' title="' + esc(title) + '"' : "") + ">" + html + "</button>";
    };
    return '<div class="toolbar"><span class="muted">Crafter</span><div class="seg" role="group" aria-label="Crafter ([ and ] switch)">' + q.crafters.map(function (id) {
      var e = A.entry(id);
      return btn(id, '<span class="cn cls-' + A.slug(e.cls) + '">' + esc(q.names[id]) + '</span> <span class="faint">' + esc(profsOf(e).map(function (p) { return ABBR[p.id] || p.id; }).join("/")) + "</span>");
    }).join("") + btn("ah", "Auction House", "", "BoE pieces nobody in the roster crafts: buy them") + btn("all", "All", "", "Every crafter and the Auction House") + "</div></div>";
  }

  function skillBar(q) {
    if (q.sel === "ah" || q.sel === "all") return "";
    var e = A.entry(q.sel), cap = D().meta.skillCap;
    return '<div class="toolbar">' + profsOf(e).map(function (p) {
      var id = "qskill-" + e.id + "-" + A.slug(p.id), est = FGP.rank.pace(D().roles, e.level);
      return '<label for="' + id + '">' + esc(p.id) + ' skill</label><input type="number" class="inp inp-num" min="0" max="' + cap + '" id="' + id + '" data-input="qskill" data-change="qskill" data-key="' +
        esc(e.id + ":" + p.id) + '" value="' + (typeof p.skill === "number" ? p.skill : "") + '" placeholder="~' + est + '" aria-label="' + esc(p.id) + " skill of " + esc(q.names[e.id]) + ' (empty: estimated from the level)">' +
        (typeof p.skill === "number" ? "" : '<span class="faint" title="Estimated from level ' + e.level + ' (crafter pace heuristic)">~' + est + "</span>") +
        (p.spec ? ' <span class="badge b-info" title="Specialisation">' + esc(p.spec) + "</span>" : "");
    }).join("") + "</div>";
  }

  function filterBar(q) {
    var n = q.sel === "all" ? Object.keys(q.hiddenCount).reduce(function (t, k) { return t + q.hiddenCount[k]; }, 0) : q.hiddenCount[q.sel] || 0;
    return '<div class="toolbar"><label title="Only core pieces: a clear gain, kept for at least five levels"><input type="checkbox" id="q-core" data-change="filter" data-key="core"' +
      (A.S.prefs.filters.core ? " checked" : "") + "> Core only</label>" +
      (n ? '<label title="Pieces you hid for a character"><input type="checkbox" id="q-showhidden" data-change="qshowhidden"' + (A.S.prefs.showHidden.queue ? " checked" : "") + "> Show hidden (" + n + ")</label>" : "") +
      (A.query ? '<span class="ftag">search: ' + esc(A.query) + "</span>" : "") + "</div>";
  }

  function skillCell(r, names) {
    var flag = r.flag ? ' <span class="flag" title="' + esc("needs " + r.prof + " " + r.skill.learn + ", " + names[r.crafter] + " has " + (r.has.estimated ? "~" : "") + r.has.skill) + '">' + esc(r.flag) + "</span>" : "";
    var spec = r.flags.filter(function (f) { return /^needs /.test(f) && !/^needs (Favor|reputation|drop only)$/.test(f); });
    return esc(ABBR[r.prof] || r.prof) + " " + (r.skill.approx ? '<span title="Approximate: the skill where the recipe turns yellow">~</span>' : "") + esc(r.skill.learn) + flag +
      spec.map(function (f) { return ' <span class="badge b-warn" title="Specialisation recipe: a crafter with this specialisation can make it">' + esc(f) + "</span>"; }).join("");
  }

  function needButtons(r, names) {
    var who = r.crafter === "ah" ? "ah" : r.crafter;
    return r.needs.map(function (n) {
      var e = A.entry(n.entry);
      return '<button type="button" class="who cls-' + A.slug(e.cls) + (n.inWindow ? "" : " out") + '" id="qneed-' + esc(n.entry + "-" + r.itemId) + '" data-act="qmark" data-key="' +
        esc(n.entry + ":" + r.itemId) + '" data-via="' + esc(who) + '" title="Mark ' + esc(r.item.name) + " in bags for " + esc(names[n.entry]) + (n.core ? "" : " (optional piece)") +
        (n.inWindow ? "" : "; outside the shopping window") + '"><span class="cn">' + esc(names[n.entry]) + "</span> @" + n.level + (n.core ? "" : "*") + (n.count > 1 ? " ×" + n.count : "") +
        ' <span class="muted">now ' + n.now + "</span></button>";
    }).join("") + r.hiddenNeeds.map(function (n) {
      var e = A.entry(n.entry);
      return '<button type="button" class="who hid cls-' + A.slug(e.cls) + '" id="qunhide-' + esc(n.entry + "-" + r.itemId) + '" data-act="unhide" data-key="' + esc(n.entry + ":" + r.itemId) +
        '" title="Hidden for ' + esc(names[n.entry]) + '. Activate to unhide."><span class="cn">' + esc(names[n.entry]) + "</span> @" + n.level + ' <span class="muted">hidden</span></button>';
    }).join("");
  }

  // The crafter choice for a row (all its characters): shown when the piece has more than one route.
  function viaSelect(r, names) {
    var n = r.needs[0];
    if (!n) return "";
    var opts = FGP.rank.routeOptions(r.itemId, r.item, A.entry(n.entry), A.S.roster, D());
    if (opts.length < 2) return "";
    var cur = r.crafter;
    return '<select class="via-sel" id="qvia-' + esc(r.key.replace(":", "-")) + '" data-change="qvia" data-key="' + esc(r.key) + '" aria-label="Who makes ' + esc(r.item.name) + '">' +
      opts.map(function (o) {
        var v = o.via === "ah" ? "ah" : o.crafter;
        return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + (v === "ah" ? "Auction House" : esc(names[o.crafter])) + "</option>";
      }).join("") + "</select>";
  }

  function eachCell(r) {
    if (!r.each) return '<span class="noprice" title="' + esc(A.priceSource(null)) + '">no price</span>';
    if (r.crafter === "ah") return A.priceHtml(r.each);
    return '<span title="Mats at your prices">' + A.money(r.each.copper) + (r.each.partial ? '<span class="faint" title="Some mats have no price">+?</span>' : "") + "</span>";
  }

  function craftTable(rows, q, label) {
    var body = [], last = null;
    rows.forEach(function (r) {
      if (q.sel === "all" && r.crafter !== last) {
        last = r.crafter;
        body.push('<tr class="group"><td colspan="9">' + (r.crafter === "ah" ? "Auction House" : A.classSpan(A.entry(r.crafter).cls, q.names[r.crafter]) + " · " +
          esc(profsOf(A.entry(r.crafter)).map(function (p) { return p.id; }).join(", "))) + "</td></tr>");
      }
      if (r.crafter === "ah") { body.push(ahRow(r, q)); return; }
      var lk = r.crafter + ":" + r.recipe;
      body.push('<tr data-row="' + esc(r.key) + '" class="' + (r.needs.length ? "" : "dim") + '">' +
        '<td><input type="checkbox" id="qlrn-' + esc(r.crafter + "-" + r.recipe) + '" data-change="learned" data-key="' + esc(lk) + '"' + (A.S.recipes[lk] ? " checked" : "") +
        ' aria-label="' + esc(q.names[r.crafter]) + " has learned " + esc(r.item.name) + '"></td>' +
        '<td class="nowrap">' + skillCell(r, q.names) + "</td>" +
        '<td class="c-item">' + A.itemLink(r.itemId) + ' <span class="faint small">' + esc(r.item.slot) + "</span></td>" +
        '<td><div class="who-list">' + needButtons(r, q.names) + "</div></td>" +
        '<td class="num">' + r.qty + "</td>" +
        "<td>" + A.bindBadge(r.item) + " " + A.sourceBadges(r.recipe) + "</td>" +
        '<td class="num">' + eachCell(r) + "</td>" +
        '<td class="num">' + (r.total !== null && r.total !== undefined ? A.money(r.total) + (r.each.partial ? '<span class="faint">+?</span>' : "") : A.money(null)) + "</td>" +
        "<td>" + viaSelect(r, q.names) + "</td></tr>");
    });
    return '<div class="tbl-wrap"><table class="qtable" aria-label="' + esc(label) + '"><thead><tr><th title="Recipe learned">Lrn</th><th>Skill</th><th>Item</th><th>For, at level</th>' +
      '<th class="num">Qty</th><th>Source</th><th class="num">Each</th><th class="num">Total</th><th>Crafter</th></tr></thead><tbody>' + body.join("") + "</tbody></table></div>";
  }

  function priceFrom(p) {
    if (!p) return '<span class="faint">no price seen</span>';
    if (p.source === "ah" || p.source === "default") return esc((p.source === "ah" ? "AH " : "default list ") + (p.day !== null ? FGP.auctionator.isoDay(p.day) : ""));
    return esc({ vendor: "vendor", override: "your price", craft: "craft (cheaper)" }[p.source] || p.source);
  }

  function ahRow(r, q) {
    return '<tr data-row="' + esc(r.key) + '"><td></td><td class="nowrap">' + esc(ABBR[r.prof] || r.prof) + "</td>" +
      '<td class="c-item">' + A.itemLink(r.itemId) + ' <span class="faint small">' + esc(r.item.slot) + "</span></td>" +
      '<td><div class="who-list">' + needButtons(r, q.names) + "</div></td>" +
      '<td class="num">' + r.qty + "</td><td>" + A.bindBadge(r.item) + " " + priceFrom(r.each) + "</td>" +
      '<td class="num">' + eachCell(r) + '</td><td class="num">' + (r.total !== null && r.total !== undefined ? A.money(r.total) : A.money(null)) + "</td>" +
      "<td>" + viaSelect(r, q.names) + "</td></tr>";
  }

  function ahTable(rows, q) {
    return '<div class="tbl-wrap"><table class="qtable" aria-label="Auction House"><thead><tr><th></th><th>Made by</th><th>Item</th><th>For, at level</th><th class="num">Qty</th>' +
      '<th>Price from</th><th class="num">AH price</th><th class="num">Total</th><th>Crafter</th></tr></thead><tbody>' + rows.map(function (r) { return ahRow(r, q); }).join("") + "</tbody></table></div>";
  }

  function paceHtml(q, rows) {
    var ids = q.sel === "all" ? q.crafters : q.sel === "ah" ? [] : [q.sel];
    var lines = [];
    ids.forEach(function (id) {
      FGP.queue.pace(D(), rows, A.entry(id)).forEach(function (p) {
        if (!p.queued) return;
        var has = q.names[id] + " has " + (p.has.estimated ? "~" : "") + p.has.skill;
        lines.push("<li><strong>" + esc(p.prof) + ":</strong> " + (p.points.length ? p.points.map(function (x) {
          return esc(q.names[x.entry]) + " reaches " + x.level + " → needs " + x.skill;
        }).join(" · ") + " · " + esc(has) : esc(has) + ", enough for every queued recipe") + "</li>");
      });
    });
    if (!lines.length) return "";
    return '<section class="section"><div class="section-head"><h2>Crafter pace</h2><span class="hint">the next skill steps the queue needs, by when the character reaches the level</span></div>' +
      '<ul class="pace">' + lines.join("") + "</ul></section>";
  }

  function shopHtml(q, rows) {
    var sl = FGP.queue.shoppingList(D(), A.pricer(), rows, A.S.roster, A.S.prices.owned), names = q.names;
    var w = A.S.prefs.within;
    var head = '<div class="section-head"><h2>Shopping list</h2><label class="hint" for="q-within">only needed within <input class="inp inp-num" type="number" min="0" max="60" id="q-within" ' +
      'data-input="qwithin" data-change="qwithin" value="' + (w === null ? "" : w) + '" placeholder="all"> levels of each character</label></div>';
    var lines = sl.lines.filter(function (l) { return A.matches(l.name + " " + l.usedBy.map(A.itemName).join(" ")); });
    if (!lines.length) return '<section class="section">' + head + '<div class="empty">No materials needed for this selection.</div></section>';
    var body = lines.map(function (l) {
      var note = l.usedBy.map(A.itemName).join(", ") + (l.through.length ? " · via " + l.through.map(A.itemName).join(", ") : "");
      return '<tr data-row="mat-' + l.id + '"><td>' + A.itemLink(l.id) + '<div class="inote">' + esc(note) + "</div></td>" +
        '<td class="num"><strong>' + l.count + "</strong></td>" +
        '<td class="num"><input type="number" class="inp inp-num" min="0" id="qown-' + l.id + '" data-input="qown" data-change="qown" data-key="' + l.id + '" value="' + (l.owned || "") +
        '" placeholder="0" aria-label="You have of ' + esc(l.name) + '"></td>' +
        '<td class="num">' + l.need + "</td>" +
        '<td class="num">' + (l.soulbound ? '<span class="faint" title="Soulbound: no market; counts as zero cash, unknown value">not tradeable</span>' : A.priceHtml(l.unit)) + "</td>" +
        "<td>" + priceFrom(l.unit) + "</td>" +
        '<td class="num">' + A.money(l.total) + "</td>" +
        "<td>" + (l.gatheredBy.length ? l.gatheredBy.map(function (id) { return A.classSpan(A.entry(id).cls, names[id]); }).join(", ") + ' <span class="faint">(' + esc(l.gathered) + ")</span>" : "") + "</td></tr>";
    }).join("");
    return '<section class="section">' + head + '<div class="tbl-wrap"><table class="shop" aria-label="Shopping list"><thead><tr><th>Material</th><th class="num">Count</th><th class="num">Have</th>' +
      '<th class="num">Need</th><th class="num">Unit</th><th>Price from</th><th class="num">Total</th><th>Roster gathers</th></tr></thead><tbody>' + body + "</tbody></table></div>" +
      '<div class="totals"><span title="What the mats would fetch: owned mats count at their price (pricing §5.2)">Value of mats used <strong id="q-value">' + A.money(sl.value) + "</strong></span>" +
      '<span title="Cash for what you do not have yet">To buy <strong id="q-tobuy">' + A.money(sl.toBuy) + "</strong></span>" +
      (sl.unknown.length ? '<span class="muted" id="q-unknown">' + esc(A.plural(sl.unknown.length, "material")) + " without a price</span>" : "") + "</div></section>";
  }

  A.views.queue = {
    html: function () {
      if (!A.S.roster.entries.length) {
        return '<div class="panel"><h2>Queue</h2><p>Add your characters on the <button type="button" class="linkbtn" id="q-to-gear" data-act="view" data-key="gear">Gear</button> tab first; ' +
          "the queue then lists what each crafter makes for them.</p></div>";
      }
      var q = A.queueModel(), out = [selBar(q), skillBar(q), filterBar(q)];
      var rows = FGP.queue.select(q, q.sel).filter(function (r) { return A.matches(rowHay(r, q.names)); });
      var craft = rows.filter(function (r) { return r.crafter !== "ah"; }), ah = rows.filter(function (r) { return r.crafter === "ah"; });
      if (q.sel === "ah") {
        out.push('<section class="section"><div class="section-head"><h2>Auction House</h2><span class="hint">' + esc(A.plural(ah.length, "BoE piece")) +
          " nobody in the roster crafts. Activate a name to mark the piece in bags for that character.</span></div>" +
          (ah.length ? ahTable(ah, q) : '<div class="empty">Nothing to buy for this selection.</div>') + "</section>");
        return out.join("");
      }
      var n = craft.filter(function (r) { return r.needs.length; }).length;
      out.push('<section class="section"><div class="section-head"><h2>To craft</h2><span class="hint">' + esc(A.plural(n, "recipe")) +
        " for pieces not yet in bags or equipped. Activate a name to mark the piece in bags for that character. * optional piece; dimmed names are outside the shopping window.</span></div>" +
        (rows.length ? craftTable(q.sel === "all" ? rows : craft, q, "To craft") : '<div class="empty">Nothing left to craft for this selection.</div>') + "</section>");
      out.push(paceHtml(q, craft));
      out.push(shopHtml(q, craft));
      out.push('<p class="muted small">Kits, enchants and consumables are not in the queue yet; they come with the enchant and consumable data in a later release.</p>');
      return out.join("");
    },
  };

  // --- actions ---------------------------------------------------------------------------------------------------

  A.acts.qsel = function (el) {
    A.S.prefs.queueSel = el.getAttribute("data-key");
    A.commit([el.id]);
  };
  // [ and ] in the Queue: previous / next crafter button.
  A.cycleQueue = function (step) {
    var q = A.queueModel(), keys = A.queueKeys(q), i = keys.indexOf(q.sel);
    A.S.prefs.queueSel = keys[(i + step + keys.length) % keys.length];
    A.commit(["qsel-" + A.S.prefs.queueSel]);
  };
  function setSkill(el) {
    var k = el.getAttribute("data-key").split(":"), e = A.entry(k[0]);
    if (!e) return;
    var p = e.professions.filter(function (x) { return x.id === k[1]; })[0], t = String(el.value).trim(), v = t === "" ? null : parseInt(t, 10);
    if (!p || (v !== null && !Number.isFinite(v))) return;
    if (v !== null) v = Math.max(0, Math.min(D().meta.skillCap, v));
    if (p.skill === v) return;
    p.skill = v;
    A.commit();
  }
  A.inputs.qskill = setSkill;
  A.changes.qskill = setSkill;
  A.changes.qshowhidden = function (el) { A.S.prefs.showHidden.queue = !!el.checked; A.commit(); };
  function setWithin(el) {
    var t = String(el.value).trim(), v = t === "" ? null : parseInt(t, 10);
    if (v !== null && !Number.isFinite(v)) return;
    A.S.prefs.within = v === null ? null : Math.max(0, Math.min(60, v));
    A.commit();
  }
  A.inputs.qwithin = setWithin;
  A.changes.qwithin = setWithin;
  function setOwned(el) {
    var id = el.getAttribute("data-key"), t = String(el.value).trim(), v = t === "" ? 0 : parseInt(t, 10);
    if (!Number.isFinite(v)) return;
    if (v > 0) A.S.prices.owned[id] = Math.min(1e7, v); else delete A.S.prices.owned[id];
    A.commit();
  }
  A.inputs.qown = setOwned;
  A.changes.qown = setOwned;

  // Mark a piece in bags for a character, made by this row's crafter (or bought): status "have", via the crafter.
  A.acts.qmark = function (el) {
    var key = el.getAttribute("data-key"), k = key.split(":"), via = el.getAttribute("data-via"), before = A.S.items[key] ? JSON.parse(JSON.stringify(A.S.items[key])) : null;
    var box = el.closest && el.closest("table"), next = [];
    if (box) {
      var all = [].slice.call(box.querySelectorAll('[data-act="qmark"]')).map(function (b) { return b.id; }), i = all.indexOf(el.id);
      next = i < 0 ? all : all.slice(i + 1).concat(all.slice(0, i).reverse());
    }
    A.setItem(k[0], k[1], { status: "have", via: via });
    A.commit(next.concat(["qsel-" + (A.S.prefs.queueSel || "all")]));
    A.toast(A.itemName(k[1]) + " in bags for " + A.nameOf(k[0]), { label: "Undo", fn: function () {
      if (before) A.S.items[key] = before; else delete A.S.items[key];
      A.commit([el.id]);
    } });
  };
  // Crafter choice on a queue row: every character of the row gets it.
  A.changes.qvia = function (el) {
    var key = el.getAttribute("data-key"), q = A.queueModel(), r = q.rows.filter(function (x) { return x.key === key; })[0], v = el.value;
    if (!r) return;
    r.needs.forEach(function (n) { A.setItem(n.entry, r.itemId, { via: v }); });
    A.commit(["qsel-" + q.sel]);
    A.toast(A.itemName(r.itemId) + ": " + (v === "ah" ? "bought on the Auction House" : "made by " + A.nameOf(v)));
  };
})(this);
