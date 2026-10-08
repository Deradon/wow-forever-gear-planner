// Offline item tooltips from the shipped data, item links to Wowhead (no script), opt-in icons (D7 as amended
// 2026-10-08), stat chips and recipe-source badges (docs/ui.md §11; synthesis D18, D19, D21). Shared by the Gear,
// Prices and About views.
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var PRIMARY = ["Str", "Agi", "Sta", "Int", "Spi"];
  var SCHOOL = { FrostDmg: "frost", FireDmg: "fire", ShadowDmg: "shadow", HolyDmg: "holy", NatureDmg: "nature", ArcaneDmg: "arcane" };
  var SPELLY = { SP: 1, Heal: 1, SpellDmg: 1 };
  var BIND_TEXT = { BoP: "Binds when picked up", BoE: "Binds when equipped", BoU: "Binds when used" };
  var ON_TEXT = { use: "Use", equip: "Equip", hit: "Chance on hit" };
  // The only third-party host the page ever loads from, and only while the visitor has switched icons on (About).
  var ICON_HOST = "https://wow.zamimg.com/images/wow/icons/small/";

  function D() { return A.D; }
  function esc(v) { return A.esc(v); }

  // --- item basics -----------------------------------------------------------------------------------------------

  A.item = function (id) { return D().items.rows[id] || null; };
  A.itemName = function (id) {
    var it = D().items.rows[id] || D().mats.rows[id];
    return it ? it.name : "Item " + id;
  };
  A.statLabel = function (k) { return D().rules.statLabels[k] || k; };
  A.typeText = function (it) {
    if (it.itemClass === "armor") return it.type === "Misc" ? "" : it.type;
    return String(it.type || "").replace(/^2H /, "");
  };

  // Attributes for an element that shows a planner tooltip.
  A.ttAttrs = function (kind, id) { return ' data-tt="' + kind + '" data-id="' + esc(id) + '"'; };

  // Icon of an item or mat; empty unless the visitor switched icons on (no image request otherwise).
  A.icon = function (id) {
    if (A.S.prefs.icons !== true) return "";
    var it = D().items.rows[id] || D().mats.rows[id];
    if (!it || !it.icon || !/^[a-z0-9_-]+$/.test(it.icon)) return "";
    return '<img class="icon" src="' + ICON_HOST + it.icon + '.jpg" alt="" width="18" height="18" loading="lazy" referrerpolicy="no-referrer">';
  };

  // Item name as a link to its Wowhead page (opens in a new tab; no request until clicked).
  A.itemLink = function (id, idAttr) {
    var it = A.item(id) || D().mats.rows[id];
    if (!it) return esc("Item " + id);
    return '<a class="iname q' + (it.quality || 1) + '" href="' + esc(A.whUrl(id)) + '" target="_blank" rel="noopener"' +
      (idAttr ? ' id="' + esc(idAttr) + '"' : "") + A.ttAttrs(D().items.rows[id] ? "item" : "mat", id) + ">" + A.icon(id) + esc(it.name) + "</a>";
  };

  A.statChips = function (it) {
    var out = [];
    Object.keys(it.stats || {}).forEach(function (k) {
      var v = it.stats[k], cls = SCHOOL[k] ? "chip st-" + SCHOOL[k] : SPELLY[k] ? "chip sp" : "chip";
      out.push('<span class="' + cls + '">' + (v > 0 ? "+" : "") + esc(v) + " " + esc(A.statLabel(k)) + "</span>");
    });
    if (it.weapon) out.push('<span class="chip dps" title="Damage per second · speed">' + it.weapon.dps.toFixed(1) + " DPS · " + it.weapon.speed.toFixed(2) + "</span>");
    if (it.armor) out.push('<span class="chip">' + esc(it.armor) + " Armor</span>");
    if (it.effects && it.effects.length) out.push('<span class="chip" title="Use, equip and on-hit effects are not scored">effect</span>');
    return out.length ? '<div class="chips">' + out.join("") + "</div>" : '<span class="faint">—</span>';
  };

  A.bindBadge = function (it) {
    if (it.bind === "BoP") return '<span class="badge b-bop" title="Binds when picked up: only the crafter can wear it">BoP</span>';
    if (it.bind === "BoE" || it.bind === "BoU") return '<span class="badge b-boe" title="' + esc(BIND_TEXT[it.bind]) + ': can be mailed or sold">' + esc(it.bind) + "</span>";
    return '<span class="badge b-boe" title="Does not bind">—</span>';
  };

  // --- recipe sources (faction-aware) ------------------------------------------------------------------------------

  // Source entries of a recipe for the roster's faction; {list, otherSide} where otherSide means only the other
  // faction has a source.
  A.sourcesFor = function (spell) {
    var all = D().sources.rows[spell] || [], f = A.S.roster.faction, mine = all.filter(function (e) { return e.side === "both" || e.side === f; });
    // Known sources first, so the badge never says "source unknown" when another source is known.
    var list = (mine.length ? mine : all).slice().sort(function (a, b) { return (a.kind === "unknown") - (b.kind === "unknown"); });
    return { list: list, otherSide: !mine.length && all.length > 0 };
  };

  function npcText(e) {
    var n = e.npc && D().sources.npcs[e.npc];
    return n ? n.name + (n.zone ? ", " + n.zone : "") : "";
  }
  function repText(e) {
    if (!e.rep) return "";
    var f = D().sources.factions[e.rep.faction];
    return (f ? f.name : "faction " + e.rep.faction) + " " + e.rep.standing;
  }

  // Short label and badge class of one source entry.
  A.sourceLabel = function (e) {
    switch (e.kind) {
      case "trainer": return { text: "Trainer", cls: "b-trainer" };
      case "vendor": return e.rep ? { text: "Reputation", cls: "b-rep" } : { text: "Vendor", cls: "b-vendor" };
      case "favor": return { text: "Favor " + (e.cost && e.cost.favor || ""), cls: "b-favor" };
      case "quest": return { text: "Quest", cls: "b-quest" };
      case "drop": return { text: e.where === "dungeon" ? "Dungeon drop" : "Drop", cls: "b-drop" };
      case "unobtainable": return { text: "Unobtainable", cls: "b-unobtainable" };
      default: return { text: "source unknown", cls: "b-unknown" };
    }
  };
  var CERTAINTY = { forever: "confirmed for Forever", vanilla: "as in vanilla, not yet checked in Forever", db: "derived from the game data", unknown: "unverified" };
  // One line of text describing a source entry (badge title, tooltip).
  A.sourceText = function (e) {
    var parts = [A.sourceLabel(e).text];
    var npc = npcText(e);
    if (npc) parts.push(npc);
    if (e.kind === "favor" && e.cost && e.cost.favor) parts[0] = "Merchant's Favor " + e.cost.favor;
    if (e.cost && e.cost.copper) parts.push(A.moneyText(e.cost.copper));
    if (e.rep) parts.push(repText(e));
    if (e.limited) parts.push("limited supply");
    if (e.quest) parts.push("quest \"" + e.quest + "\"");
    if (e.where) parts.push(e.where === "zone" && e.zone ? e.zone : e.where === "dungeon" && e.instance ? e.instance : e.where === "world" ? "world drop" : e.where);
    if (e.text) parts.push(e.text);
    if (e.reason) parts.push(e.reason);
    if (e.note) parts.push(e.note);
    parts.push(CERTAINTY[e.certainty] || e.certainty);
    if (e.side !== "both") parts.push(e.side === "alliance" ? "Alliance" : "Horde");
    return parts.join(" · ");
  };

  // Badges for a recipe's source: the first source for the faction (+N more), a "tradeable pattern" marker when the
  // pattern can be bought on the AH (D21), and a certainty marker for derived or unchecked sources.
  A.sourceBadges = function (spell) {
    var r = D().recipes.rows[spell], s = A.sourcesFor(spell);
    if (!r) return "";
    var e = s.list[0] || { kind: "unknown", side: "both", certainty: "unknown" };
    var lab = A.sourceLabel(e), title = s.list.map(A.sourceText).join("\n");
    var out = '<span class="badge ' + lab.cls + '" title="' + esc(title) + '">' + esc(lab.text) + (s.list.length > 1 ? " +" + (s.list.length - 1) : "") + "</span>";
    if (s.otherSide) out += '<span class="badge b-bad" title="Only the other faction has a source for this recipe">other faction</span>';
    if (r.pattern && r.pattern.bind === "none") out += '<span class="badge b-pattern" title="The pattern is tradeable: it can also be bought on the Auction House">tradeable pattern</span>';
    if (e.kind !== "unknown" && e.certainty === "db") out += '<span class="badge b-cert" title="' + esc(CERTAINTY.db) + '">from game data</span>';
    else if (e.kind !== "unknown" && e.certainty === "unknown") out += '<span class="badge b-cert" title="' + esc(CERTAINTY.unknown) + '">unverified</span>';
    return out;
  };

  // With a route, a specialisation its crafter has reads as the spec name, not "needs <spec>" (D28).
  A.skillText = function (spell, rt) {
    var r = D().recipes.rows[spell];
    if (!r) return "";
    var spec = r.pattern && r.pattern.spec, needs = spec && (!rt || rt.via === "ah" || rt.flags.indexOf("needs " + spec) >= 0);
    return esc(r.prof) + " " + (r.skill.approx ? '<span title="Approximate: the skill where the recipe turns yellow">~</span>' : "") + esc(r.skill.learn) +
      (spec ? ' <span class="badge ' + (needs ? "b-warn" : "b-info") + '" title="Specialisation recipe' + (needs ? "" : ": the crafter has it") + '">' + (needs ? "needs " : "") + esc(spec) + "</span>" : "");
  };

  // --- tooltip content -------------------------------------------------------------------------------------------

  function ttRow(left, right, cls) {
    return '<div class="wtt-row' + (cls ? " " + cls : "") + '"><span>' + left + "</span>" + (right ? "<span>" + right + "</span>" : "") + "</div>";
  }
  function ttSlot(it) {
    if (it.slot === "Off-hand") return it.inv === 23 ? "Held In Off-hand" : "Off Hand";
    if (it.slot === "Ranged" && it.type === "Thrown") return "Thrown";
    return it.slot || "";
  }
  function frame(body, id) {
    return '<div class="wtt-box">' + body + '<a class="wtt-open" href="' + esc(A.whUrl(id)) + '" target="_blank" rel="noopener">Open on Wowhead ↗</a></div>';
  }

  // Where the item stands in the selected entry's path: "best for Head 25–34" (ui.md §4.3).
  A.bestFor = function (entry, id) {
    if (!entry) return null;
    var p = A.pathFor(entry);
    for (var g = 0; g < p.groups.length; g++) {
      var gr = p.groups[g];
      for (var i = 0; i < gr.steps.length; i++) if (gr.steps[i].items.indexOf(+id) >= 0) return { group: gr.id, step: gr.steps[i], alt: false };
      for (i = 0; i < gr.alternatives.length; i++) if (gr.alternatives[i].items.indexOf(+id) >= 0) return { group: gr.id, step: gr.alternatives[i], alt: true };
    }
    return null;
  };

  function itemTip(id) {
    var it = A.item(id), o = [];
    o.push('<div class="wtt-name q' + (it.quality || 1) + '">' + A.icon(id) + esc(it.name) + "</div>");
    o.push('<div class="wtt-y">Item Level ' + esc(it.ilvl) + "</div>");
    if (BIND_TEXT[it.bind]) o.push("<div>" + BIND_TEXT[it.bind] + "</div>");
    var type = A.typeText(it);
    o.push(ttRow(esc(ttSlot(it)), esc(type)));
    if (it.weapon) {
      o.push(ttRow(esc(it.weapon.min) + " - " + esc(it.weapon.max) + " Damage", "Speed " + it.weapon.speed.toFixed(2)));
      o.push("<div>(" + it.weapon.dps.toFixed(1) + " damage per second)</div>");
    }
    if (it.armor) o.push("<div>" + esc(it.armor) + " Armor</div>");
    var keys = Object.keys(it.stats || {});
    keys.filter(function (k) { return PRIMARY.indexOf(k) >= 0; }).sort(function (a, b) { return PRIMARY.indexOf(a) - PRIMARY.indexOf(b); })
      .forEach(function (k) { o.push("<div>" + (it.stats[k] > 0 ? "+" : "") + esc(it.stats[k]) + " " + esc(A.statLabel(k)) + "</div>"); });
    keys.filter(function (k) { return PRIMARY.indexOf(k) < 0; })
      .forEach(function (k) { o.push('<div class="wtt-g">' + (it.stats[k] > 0 ? "+" : "") + esc(it.stats[k]) + " " + esc(A.statLabel(k)) + "</div>"); });
    (it.effects || []).forEach(function (e) { o.push('<div class="wtt-g">' + esc(ON_TEXT[e.on] || e.on) + ": " + esc(e.text) + ' <span class="wtt-d">(not scored)</span></div>'); });
    if (it.set) {
      var set = D().items.sets[it.set.id];
      o.push('<div class="wtt-y">' + esc(it.set.name) + (set ? " (" + set.items.length + " pieces)" : "") + "</div>");
      if (set) set.bonuses.forEach(function (b) { o.push('<div class="wtt-d">Set bonus (' + esc(b.pieces) + " pieces)</div>"); });
    }
    if (it.classes) o.push("<div>Classes: " + it.classes.map(function (c) { return A.classSpan(c); }).join(", ") + "</div>");
    if (it.equipSkill) o.push("<div>Requires " + esc(it.equipSkill.prof) + " (" + esc(it.equipSkill.rank) + ")</div>");
    if (it.req) o.push("<div>Requires Level " + esc(it.req) + "</div>");

    var p = [], entry = A.selected(), pr = A.pricer(), rt = null;
    if (entry) {
      var names = A.names();
      rt = FGP.rank.route(+id, it, entry, A.S.roster, D(), { learned: A.entryMaps(entry.id).learned });
      if (rt) p.push('<div><span class="wtt-k">Get via</span> ' + A.viaText(rt, it, names, id) + "</div>");
      else p.push('<div><span class="wtt-k">Get via</span> <span class="tt-warn">' + esc(names[entry.id]) + " can't get this (BoP for another profession, or no source)</span></div>");
      var bf = A.bestFor(entry, id);
      if (bf) p.push("<div>" + (bf.alt ? "Alternative" : "Best") + " for " + esc(bf.group) + " " + esc(bf.step.from) + "–" + esc(bf.step.to) +
        (bf.step.core ? " · core" : "") + (bf.alt ? " (" + esc(bf.step.why.join(", ")) + ")" : "") + "</div>");
    }
    var spell = rt ? rt.recipe : it.recipes[0];
    var rec = D().recipes.rows[spell];
    if (rec) {
      p.push('<div><span class="wtt-k">Recipe</span> ' + A.skillText(spell) + "</div>");
      A.sourcesFor(spell).list.forEach(function (e) { p.push('<div><span class="wtt-k">Source</span> ' + esc(A.sourceText(e)) + "</div>"); });
    }
    if (it.avail !== "ok") p.push('<div class="tt-warn">' + esc(it.avail) + (it.reason ? ": " + esc(it.reason) : "") + "</div>");
    if (it.note) p.push('<div class="wtt-d">' + esc(it.note) + "</div>");
    var cc = pr.craftCost(+id);
    if (cc && cc.mats.length) {
      p.push('<div class="wtt-mats">' + cc.mats.map(function (m) {
        return ttRow(esc(m[1]) + "× " + esc(A.itemName(m[0])), m[2] !== null ? A.money(m[2] * m[1]) + ' <span class="wtt-d">' + esc(m[3]) + "</span>" :
          '<span class="wtt-d">' + (m[3] === "soulbound" ? "not tradeable" : "no price") + "</span>");
      }).join("") + "</div>");
    }
    var ah = pr.market(+id);
    p.push(ttRow('<span class="wtt-k">Mats</span> ' + (cc && cc.mats.length ? A.money(cc.copper) + (cc.unknown.length + cc.soulbound.length ? "+?" : "") : "—"),
      '<span class="wtt-k">AH</span> ' + (ah ? A.money(ah.copper) + " " + esc(A.ageText(ah.age === null ? 0 : ah.age)) : "no price")));
    return frame(o.join("") + '<div class="wtt-plan">' + p.join("") + "</div>", id);
  }

  function matTip(id) {
    var m = D().mats.rows[id], pr = A.pricer(), u = pr.unitPrice(+id, 0);
    var o = ['<div class="wtt-name q' + (m.quality || 1) + '">' + A.icon(id) + esc(m.name) + "</div>"];
    var p = [ttRow('<span class="wtt-k">Unit</span> ' + (u ? A.money(u.copper) : "no price"), u ? esc(A.priceSource(u)) : "")];
    if (m.vendor) p.push('<div class="wtt-d">Sold by vendors</div>');
    if (m.gathered) p.push('<div class="wtt-d">Gathered: ' + esc(m.gathered) + "</div>");
    if (m.madeBy && m.madeBy.length) p.push('<div class="wtt-d">Crafted (' + esc(D().recipes.rows[m.madeBy[0]] ? D().recipes.rows[m.madeBy[0]].prof : "") + ")</div>");
    return frame(o.join("") + '<div class="wtt-plan">' + p.join("") + "</div>", id);
  }

  A.tipHtml = function (kind, id) {
    if (kind === "item" && A.item(id)) return itemTip(id);
    if (kind === "mat" && D().mats.rows[id]) return matTip(id);
    return "";
  };

  // --- showing and placing (pointer, keyboard focus, touch; prototype showTip/placeTip) ---------------------------

  var tt = { el: null, mode: null, x: 0, y: 0 };
  function tipEl() { return root.document.getElementById("wtt"); }
  function trigger(t) { return t && t.closest ? t.closest("[data-tt]") : null; }

  function place() {
    var tip = tipEl();
    if (!tip || tip.hidden || !tt.el) return;
    var vw = root.document.documentElement.clientWidth, vh = root.innerHeight, m = 8;
    var w = tip.offsetWidth, h = tip.offsetHeight, x, y;
    if (tt.mode === "mouse") {
      x = tt.x + 16; y = tt.y + 18;
      if (x + w > vw - m) x = tt.x - w - 12;
      if (y + h > vh - m) y = tt.y - h - 12;
    } else {
      var r = tt.el.getBoundingClientRect();
      x = r.left; y = r.bottom + 6;
      if (y + h > vh - m && r.top - h - 6 >= m) y = r.top - h - 6;
    }
    x = Math.max(m, Math.min(x, vw - w - m));
    y = Math.max(m, Math.min(y, vh - h - m));
    tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function show(el, mode, x, y) {
    if (A.S.prefs.tooltips === "off") return;
    var html = A.tipHtml(el.getAttribute("data-tt"), el.getAttribute("data-id"));
    var tip = tipEl();
    if (!html || !tip) { hide(); return; }
    if (tt.el && tt.el !== el) tt.el.removeAttribute("aria-describedby");
    tt.el = el; tt.mode = mode;
    if (x !== undefined) { tt.x = x; tt.y = y; }
    tip.innerHTML = html;
    tip.classList.toggle("touch", mode === "touch");
    tip.hidden = false;
    el.setAttribute("aria-describedby", "wtt");
    place();
  }
  function hide() {
    var tip = tipEl();
    if (tt.el) tt.el.removeAttribute("aria-describedby");
    tt.el = null; tt.mode = null;
    if (tip) tip.hidden = true;
  }
  A.tip = { show: show, hide: hide };

  A.boots = A.boots || [];
  A.boots.push(function () {
    var d = root.document, lastTouch = 0;
    d.addEventListener("pointerover", function (ev) {
      if (ev.pointerType === "touch") return;
      var el = trigger(ev.target);
      if (el && el !== tt.el) show(el, "mouse", ev.clientX, ev.clientY);
    });
    d.addEventListener("pointermove", function (ev) {
      if (tt.mode !== "mouse") return;
      tt.x = ev.clientX; tt.y = ev.clientY;
      place();
    });
    d.addEventListener("pointerout", function (ev) {
      if (tt.mode !== "mouse") return;
      var el = trigger(ev.target), to = trigger(ev.relatedTarget);
      if (el && el === tt.el && to !== el) hide();
    });
    d.addEventListener("focusin", function (ev) {
      var el = trigger(ev.target);
      if (el) show(el, "focus");
      else if (tt.mode === "focus") hide();
    });
    d.addEventListener("focusout", function (ev) { if (tt.mode === "focus" && trigger(ev.target) === tt.el) hide(); });
    // Touch: the first tap on an item shows its tooltip, the second follows the link.
    d.addEventListener("touchstart", function () { lastTouch = Date.now(); }, { passive: true });
    d.addEventListener("click", function (ev) {
      if (Date.now() - lastTouch > 800) return;
      var el = trigger(ev.target);
      if (!el) { if (tt.mode === "touch" && !(ev.target.closest && ev.target.closest("#wtt"))) hide(); return; }
      if (tt.el !== el || tt.mode !== "touch") { ev.preventDefault(); show(el, "touch"); }
    }, true);
    root.addEventListener("scroll", function () { if (tt.mode === "touch" || tt.mode === "focus") place(); else hide(); }, { passive: true });
    root.addEventListener("resize", place);
  });
})(this);
