// Ranking: candidate filter, score and the per-slot upgrade path (docs/roles-stat-weights.md §6, synthesis D18,
// D19, D25, D26, D28). Pure functions over FGP_DATA sections; no DOM, no storage. Classic script and CommonJS.
(function (root) {
  "use strict";

  var PRIMARY = ["Str", "Agi", "Sta", "Int", "Spi"];
  var RANGED_TYPES = { Bow: 1, Gun: 1, Crossbow: 1, Thrown: 1 };
  var SLOTIDX = { Head: 0, Chest: 0, Legs: 0, Shoulder: 1, Waist: 1, Feet: 1, Hands: 1, Trinket: 1, Neck: 2, Wrist: 2, Finger: 2, Back: 2 };

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function assign(a, b) { var k; for (k in b) if (own(b, k)) a[k] = b[k]; return a; }

  // --- weights -------------------------------------------------------------------------------------------------

  function classRole(roles, cls, role) {
    var c = roles.classes[cls];
    if (!c) throw new Error("unknown class " + cls);
    for (var i = 0; i < c.roles.length; i++) if (c.roles[i].role === role) return c.roles[i];
    throw new Error(cls + " has no role " + role);
  }

  function defaultRole(roles, cls) { return roles.classes[cls].roles[0].role; }

  // Effective weights: profile ⊕ class tweaks ⊕ school shares × schoolBase ⊕ entry overrides (§4.7).
  function effectiveWeights(roles, entry) {
    var cr = classRole(roles, entry.cls, entry.role);
    var prof = roles.profiles[cr.profile];
    var w = assign(assign({}, prof.weights), cr.tweaks || {});
    var opts = entry.options || {};
    var shares = cr.schools || null;
    if (cr.options && cr.options.school) {
      var s = opts.school && cr.options.school.choices[opts.school] ? opts.school : cr.options.school.default;
      shares = cr.options.school.choices[s];
    }
    if (shares && prof.schoolBase) {
      var base = w[prof.schoolBase] || 0;
      for (var k in shares) if (own(shares, k)) w[k] = shares[k] * base;
    }
    if (entry.weights) assign(w, entry.weights);
    var weapon = assign(assign({ mh: 0, specials: 0, ranged: 0, wand: 0 }, prof.weapon || {}), cr.weapon || {});
    var twoHand = null;
    if (cr.options && cr.options.twoHand) {
      var on = opts.twoHand === undefined || opts.twoHand === null ? cr.options.twoHand.default : !!opts.twoHand;
      if (on) twoHand = cr.options.twoHand;
    }
    return { weights: w, weapon: weapon, profile: cr.profile, twoHand: twoHand };
  }

  function levelScale(roles, key, level) {
    if (roles.levelScaled.indexOf(key) < 0) return 1;
    return Math.max(roles.levelScale.floor, level / roles.levelScale.ref);
  }

  // Weapon term (§4.5). ctx: "main" (main hand or two-hand), "off" (off-hand weapon), "ranged", or "none".
  function weaponTerm(item, ew, roles, ctx) {
    var wp = item.weapon;
    if (!wp || ctx === "none") return 0;
    var w = ew.weights, cfg = ew.weapon;
    if (item.type === "Wand") return ctx === "ranged" ? wp.dps * cfg.wand : 0;
    if (RANGED_TYPES[item.type]) {
      if (ctx !== "ranged") return 0;
      return wp.dps * roles.apPerDps * (w.RAP || 0) * cfg.ranged * (1 + wp.speed * cfg.specials / 60);
    }
    if (ctx === "main") return wp.dps * roles.apPerDps * (w.AP || 0) * cfg.mh * (1 + wp.speed * cfg.specials / 60);
    if (ctx === "off") return wp.dps * roles.apPerDps * (w.AP || 0) * cfg.mh * roles.offHandFactor;
    return 0;
  }

  // Score of one item for an entry (§6.2). Ratings scale with the level the piece is worn from (its req).
  function score(item, ew, roles, ctx) {
    var w = ew.weights, s = 0, lvl = Math.max(1, item.req), k;
    for (k in item.stats) if (own(item.stats, k) && w[k]) s += w[k] * levelScale(roles, k, lvl) * item.stats[k];
    if (item.armor) s += (w.Armor || 0) * item.armor;
    s += weaponTerm(item, ew, roles, ctx || "main");
    if (item.effectScore) s += item.effectScore;
    return s;
  }

  // --- usability -----------------------------------------------------------------------------------------------

  function profOf(entry, name) {
    var ps = entry.professions || [];
    for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].id === name) return ps[i];
    return null;
  }

  function pace(roles, level) {
    var pts = roles.pace.points;
    if (level <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (level <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        return Math.round(a[1] + (b[1] - a[1]) * (level - a[0]) / (b[0] - a[0]));
      }
    }
    return pts[pts.length - 1][1];
  }

  // Skill of a crafter for a check at `level`: the entered skill, or the pace estimate (estimated: true).
  function skillAt(roles, entry, prof, level) {
    var p = profOf(entry, prof);
    if (!p) return null;
    if (typeof p.skill === "number") return { skill: p.skill, estimated: false };
    return { skill: pace(roles, level), estimated: true };
  }

  // First level the entry can wear the item by class proficiency (ignores req), or null. `place`: where it goes.
  function proficiencyLevel(item, entry, ew, rules, place) {
    var c = rules.classes[entry.cls];
    if (!c) return null;
    if (item.classes && item.classes.indexOf(entry.cls) < 0) return null;
    var lvl;
    if (item.itemClass === "armor") {
      if (item.slot === "Relic") return c.relic === item.type ? 1 : null;
      lvl = c.armor[item.type];
      if (lvl === undefined || lvl === null) return null;
      if (item.inv === 14 && (c.offHand.Shield === undefined || c.offHand.Shield === null)) return null;
      if (item.inv === 23) {
        var h = c.offHand.Held;
        if (h === undefined || h === null) return null;
        lvl = Math.max(lvl, h);
      }
      return lvl;
    }
    lvl = c.weapons[item.type];
    if ((lvl === undefined || lvl === null) && ew.twoHand && ew.twoHand.adds.indexOf(item.type) >= 0) lvl = ew.twoHand.from;
    if (lvl === undefined || lvl === null) return null;
    if (place === "off") {
      if (item.inv === 21 || item.inv === 17 || c.dualWield === null || c.dualWield === undefined) return null;
      lvl = Math.max(lvl, c.dualWield);
    } else if (item.inv === 22) return null;
    return lvl;
  }

  // --- availability and routes ---------------------------------------------------------------------------------

  var SCARCE_TEXT = { favor: "Favor", rep: "reputation", drop: "drop only" };

  // Why a recipe is scarce (D19), or null: every source is Favor, a reputation vendor or a drop, and the pattern
  // cannot simply be bought on the AH (a tradeable world drop is not scarce).
  function scarcity(recipe, sources) {
    var kinds = {}, i;
    if (!sources || !sources.length) return null;
    for (i = 0; i < sources.length; i++) {
      var e = sources[i];
      if (e.kind === "favor") kinds.favor = 1;
      else if (e.kind === "vendor" && e.rep) kinds.rep = 1;
      else if (e.kind === "drop") kinds.drop = 1;
      else return null;
    }
    if (kinds.drop && !kinds.favor && !kinds.rep && recipe.pattern && recipe.pattern.bind === "none") return null;
    return kinds.favor ? "favor" : kinds.rep ? "rep" : "drop";
  }

  function sideOk(e, faction) { return e.side === "both" || e.side === faction; }

  // A recipe the roster's faction can learn: a source on its side, or a tradeable pattern (AH).
  function recipeOpen(recipe, sources, roster) {
    if (recipe.avail === "unobtainable") return false;
    var known = false, open = false;
    for (var i = 0; i < sources.length; i++) {
      var e = sources[i];
      if (e.kind === "unobtainable") continue;
      if (e.kind !== "unknown") known = true;
      if (sideOk(e, roster.faction || "alliance")) open = true;
    }
    if (recipe.pattern && recipe.pattern.bind === "none") open = true;
    if (roster.knownSourceOnly && !known) return false;
    return open;
  }

  function learnedKey(entryId, spell) { return entryId + ":" + spell; }

  // How the entry gets the item: {via: "self"|"crafter"|"ah", crafter, recipe, flags, scarce, unconfirmed} or null.
  function route(itemId, item, entry, roster, data, opts) {
    if (item.avail === "unobtainable") return null;
    var roles = data.roles, recs = item.recipes, best = null;
    var entries = roster.entries || [];
    for (var i = 0; i < recs.length; i++) {
      var spell = recs[i], r = data.recipes.rows[spell], src = data.sources.rows[spell] || [];
      if (!r || !recipeOpen(r, src, roster)) continue;
      var crafters = [];
      if (profOf(entry, r.prof)) crafters.push(entry);
      if (item.bind !== "BoP") for (var j = 0; j < entries.length; j++) if (entries[j].id !== entry.id && profOf(entries[j], r.prof)) crafters.push(entries[j]);
      var via, crafter = null;
      if (crafters.length) { crafter = crafters[0]; via = crafter.id === entry.id ? "self" : "crafter"; }
      else if (item.bind !== "BoP" && roster.includeAH !== false) via = "ah";
      else continue;
      var flags = [], sc = scarcity(r, src);
      if (sc && crafter && (opts.allLearned || (opts.learned && opts.learned[learnedKey(crafter.id, spell)]))) sc = null;
      if (via === "ah" && sc && opts.allLearned) sc = null;
      if (crafter) {
        var sk = skillAt(roles, crafter, r.prof, Math.max(1, item.req));
        if (sk && sk.skill < r.skill.learn) flags.push(sk.estimated ? "~!" : "!");
      }
      if (r.pattern && r.pattern.spec) flags.push("needs " + r.pattern.spec);
      var unknown = true;
      for (var k = 0; k < src.length; k++) if (src[k].kind !== "unknown") unknown = false;
      if (unknown) flags.push("source unknown");
      if (sc) flags.push("needs " + SCARCE_TEXT[sc]);
      var cand = { via: via, crafter: crafter ? crafter.id : null, recipe: spell, flags: flags, scarce: sc, unconfirmed: r.avail === "unconfirmed" || item.avail === "unconfirmed" };
      // Prefer: not scarce, confirmed, self, roster crafter, AH; then the lowest recipe ID (recipes are sorted).
      var rank = function (c) { return (c.scarce ? 8 : 0) + (c.unconfirmed ? 4 : 0) + (c.via === "self" ? 0 : c.via === "crafter" ? 1 : 2); };
      if (!best || rank(cand) < rank(best)) best = cand;
    }
    return best;
  }

  // Equip-skill gate (D26): filter when the entry lacks the profession, or its entered skill is below the rank for
  // a piece it could wear now; estimated skill only flags.
  function equipGate(item, entry, roles) {
    if (!item.equipSkill) return { ok: true, flag: null };
    var p = profOf(entry, item.equipSkill.prof);
    if (!p) return { ok: false, flag: null };
    if (typeof p.skill === "number") {
      if (p.skill >= item.equipSkill.rank) return { ok: true, flag: null };
      if (item.req <= (entry.level || 1)) return { ok: false, flag: null };
      return { ok: true, flag: "!" };
    }
    return { ok: true, flag: pace(roles, Math.max(1, item.req)) < item.equipSkill.rank ? "~!" : null };
  }

  // Candidates for an entry: [{id, item, route, from, place: {main, off, ranged, slot}, score: {...}, alt}].
  function candidates(data, roster, entry, opts) {
    opts = opts || {};
    var ew = effectiveWeights(data.roles, entry), out = [], rows = data.items.rows, hidden = opts.hidden || {};
    for (var id in rows) {
      if (!own(rows, id)) continue;
      var item = rows[id];
      if (hidden[id]) continue;
      var gate = equipGate(item, entry, data.roles);
      if (!gate.ok) continue;
      var rt = route(+id, item, entry, roster, data, opts);
      if (!rt) continue;
      if (gate.flag) rt.flags.push("equip " + gate.flag);
      // A gadget (no stats, an unscored use/equip effect, no weapon) would rank on armor alone: list it as an
      // alternative instead of a step, unless curation gave its effect a score.
      var gadget = !!(item.effects && !item.weapon && !item.effectScore && !Object.keys(item.stats).length);
      var c = { id: +id, item: item, route: rt, gadget: gadget, alt: !!(rt.scarce || rt.unconfirmed || gadget) && !(opts.inHand && opts.inHand[id]), places: {} };
      var req = Math.max(1, item.req), p;
      if (item.slot === "Two-Hand" || item.slot === "Main Hand" || item.slot === "One-Hand") {
        p = proficiencyLevel(item, entry, ew, data.rules, "main");
        if (p !== null) {
          // white: the auto-attack part of the weapon term, which a dual-wield miss penalty reduces.
          var white = item.weapon && item.type !== "Wand" && !RANGED_TYPES[item.type] ? item.weapon.dps * data.roles.apPerDps * (ew.weights.AP || 0) * ew.weapon.mh : 0;
          c.places.main = { from: Math.max(req, p), score: score(item, ew, data.roles, "main"), white: white };
        }
      }
      if (item.slot === "Off-hand" || item.slot === "One-Hand") {
        p = proficiencyLevel(item, entry, ew, data.rules, "off");
        if (p !== null) c.places.off = { from: Math.max(req, p), score: score(item, ew, data.roles, item.inv === 22 || item.inv === 13 ? "off" : "none") };
      }
      if (item.slot === "Ranged" || item.slot === "Relic") {
        p = proficiencyLevel(item, entry, ew, data.rules, "ranged");
        if (p !== null) c.places.ranged = { from: Math.max(req, p), score: score(item, ew, data.roles, "ranged") };
      }
      if (!c.places.main && !c.places.off && !c.places.ranged) {
        p = proficiencyLevel(item, entry, ew, data.rules, "slot");
        if (p !== null) c.places.slot = { from: Math.max(req, p), score: score(item, ew, data.roles, "none") };
      }
      if (c.places.main || c.places.off || c.places.ranged || c.places.slot) out.push(c);
    }
    return { list: out, weights: ew };
  }

  // --- par baseline --------------------------------------------------------------------------------------------

  function topPrimary(w) {
    var v = PRIMARY.map(function (k) { return w[k] || 0; }).sort(function (a, b) { return b - a; });
    return (v[0] + v[1]) / 2;
  }

  function parStats(data, ew, level, idx) {
    var row = data.rules.par[level] || data.rules.par[60];
    return data.roles.baseline.efficiency * row.budget[idx] * topPrimary(ew.weights);
  }

  function parWeapon(data, ew, level, kind, ctx) {
    var b = data.roles.baseline, row = data.rules.par[level] || data.rules.par[60];
    var dps = { oneHand: row.dps[0], twoHand: row.dps[1], ranged: row.dps[1] * 0.6, wand: row.dps[2] }[kind] * b.dpsEfficiency;
    var fake = { type: kind === "wand" ? "Wand" : kind === "ranged" ? "Gun" : "Sword", weapon: { dps: dps, speed: b.speed[kind] } };
    return weaponTerm(fake, ew, data.roles, ctx || (kind === "wand" || kind === "ranged" ? "ranged" : "main"));
  }

  // Armor of a green of item level = level in the heaviest type the class wears by then (cloaks are cloth).
  var ARMOR_ORDER = ["Plate", "Mail", "Leather", "Cloth"];
  function parArmor(data, entry, ew, group, level) {
    var loc = data.rules.armorLocation[group.id];
    if (!loc) return 0;
    var row = data.rules.par[level] || data.rules.par[60], c = data.rules.classes[entry.cls], type = "Cloth";
    if (group.id !== "Back") {
      for (var i = 0; i < ARMOR_ORDER.length; i++) {
        var l = c.armor[ARMOR_ORDER[i]];
        if (l !== undefined && l !== null && l <= level) { type = ARMOR_ORDER[i]; break; }
      }
    }
    return (ew.weights.Armor || 0) * row.armor[type] * loc[type];
  }

  // Par score of a slot group at a level (§6.4 step 2).
  function par(data, entry, ew, group, level) {
    var c = data.rules.classes[entry.cls];
    if (group.id === "Weapons") {
      var two = false;
      for (var t in c.weapons) if (own(c.weapons, t) && /^2H |^Polearm$|^Staff$/.test(t) && c.weapons[t] !== null && c.weapons[t] <= level) two = true;
      if (two) return parStats(data, ew, level, 0) + parWeapon(data, ew, level, "twoHand");
      var main = parStats(data, ew, level, 3) + parWeapon(data, ew, level, "oneHand");
      var dw = c.dualWield !== null && c.dualWield !== undefined && c.dualWield <= level;
      return main + (dw ? parStats(data, ew, level, 3) + parWeapon(data, ew, level, "oneHand", "off") : parStats(data, ew, level, 2));
    }
    if (group.id === "Ranged") {
      if (c.relic) return 0;
      var w = c.weapons;
      if (w.Wand !== undefined && w.Wand !== null) return parStats(data, ew, level, 4) + parWeapon(data, ew, level, "wand");
      return parStats(data, ew, level, 4) + parWeapon(data, ew, level, "ranged");
    }
    var idx = SLOTIDX[group.id];
    return parStats(data, ew, level, idx === undefined ? 2 : idx) * (group.count || 1) + parArmor(data, entry, ew, group, level);
  }

  // --- slot-group sets -----------------------------------------------------------------------------------------

  function byScoreThenId(a, b) { return b.s - a.s || a.c.id - b.c.id; }

  // Sets available at `level` for a group from candidate list `cands` (already filtered for the group).
  function setsAt(group, cands, level, limit, dwHit) {
    var out = [], i, j;
    if (group.id === "Weapons") {
      var mains = [], offs = [];
      for (i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.places.main && c.places.main.from <= level) {
          if (c.item.inv === 17) out.push({ items: [c], s: c.places.main.score });
          else mains.push({ c: c, s: c.places.main.score });
        }
        if (c.places.off && c.places.off.from <= level) offs.push({ c: c, s: c.places.off.score });
      }
      mains.sort(byScoreThenId); offs.sort(byScoreThenId);
      mains = mains.slice(0, limit); offs = offs.slice(0, limit);
      for (i = 0; i < mains.length; i++) {
        out.push({ items: [mains[i].c], s: mains[i].s });
        for (j = 0; j < offs.length; j++) {
          var oc = offs[j].c, dw = oc.item.inv === 13 || oc.item.inv === 22;
          var sc = dw ? mains[i].s - (1 - dwHit) * mains[i].c.places.main.white + offs[j].s * dwHit : mains[i].s + offs[j].s;
          out.push({ items: [mains[i].c, oc], s: sc });
        }
      }
      for (j = 0; j < offs.length; j++) out.push({ items: [offs[j].c], s: offs[j].s });
      return out;
    }
    var place = group.id === "Ranged" ? "ranged" : "slot", list = [];
    for (i = 0; i < cands.length; i++) {
      var p = cands[i].places[place];
      if (p && p.from <= level) list.push({ c: cands[i], s: p.score });
    }
    list.sort(byScoreThenId);
    list = list.slice(0, limit);
    for (i = 0; i < list.length; i++) {
      out.push({ items: [list[i].c], s: list[i].s });
      if ((group.count || 1) > 1) for (j = i + 1; j < list.length; j++) out.push({ items: [list[i].c, list[j].c], s: list[i].s + list[j].s });
    }
    return out;
  }

  function setKey(set) { return set.items.map(function (c) { return c.id; }).join("+"); }

  function inGroup(group, c) {
    for (var i = 0; i < group.slots.length; i++) if (group.slots[i] === c.item.slot) return true;
    return false;
  }

  // --- the path (§6.4) -----------------------------------------------------------------------------------------

  function tierOf(worth, cost, level) {
    if (cost === null || cost === undefined) return "mid";
    var m = Math.max(1, Math.pow(level / worth.tierScale.fromLevel, worth.tierScale.power));
    if (cost < worth.tierCap.cheap * m) return "cheap";
    if (cost < worth.tierCap.mid * m) return "mid";
    return "keeper";
  }

  function setCost(set, opts) {
    if (!opts.costOf) return null;
    var t = 0;
    for (var i = 0; i < set.items.length; i++) {
      var v = opts.costOf(set.items[i].id);
      if (v === null || v === undefined) return null;
      t += v;
    }
    return t;
  }

  function matCount(set, data) {
    var n = 0;
    for (var i = 0; i < set.items.length; i++) {
      var r = data.recipes.rows[set.items[i].route.recipe];
      n += r ? r.mats.length : 0;
    }
    return n;
  }

  function pinned(set, opts) {
    if (!opts.inHand) return false;
    for (var i = 0; i < set.items.length; i++) if (opts.inHand[set.items[i].id]) return true;
    return false;
  }

  // Greedy walk over levels with the minimum-gain rule; banned sets and items are skipped.
  function walk(data, entry, ew, group, cands, banned, opts) {
    var worth = data.roles.worth, steps = [], cur = null, end = worth.planEnd;
    var start = opts.fromLevel || 1;
    for (var lvl = start; lvl <= end; lvl++) {
      var sets = setsAt(group, cands, lvl, 6, data.roles.dualWieldHit).filter(function (s) {
        return !banned.sets[setKey(s)] && !s.items.some(function (c) { return banned.items[c.id]; });
      });
      sets.sort(function (a, b) {
        return b.s - a.s || (setCost(a, opts) === null ? 1 : 0) - (setCost(b, opts) === null ? 1 : 0) ||
          (setCost(a, opts) || 0) - (setCost(b, opts) || 0) || matCount(a, data) - matCount(b, data) ||
          (a.items.some(function (c) { return c.route.scarce; }) ? 1 : 0) - (b.items.some(function (c) { return c.route.scarce; }) ? 1 : 0) ||
          (setKey(a) < setKey(b) ? -1 : setKey(a) > setKey(b) ? 1 : 0);
      });
      var best = sets[0] || null, p = par(data, entry, ew, group, lvl);
      // Pieces in hand win (ui.md §4.3 rule 5) unless a candidate beats them by the minimum gain.
      for (var k = 0; k < sets.length; k++) {
        if (!pinned(sets[k], opts)) continue;
        if (sets[k].s + Math.max(worth.minGainAbs, worth.minGainRel * sets[k].s) >= best.s) best = sets[k];
        break;
      }
      if (cur) {
        var need = cur.score + Math.max(worth.minGainAbs, worth.minGainRel * cur.score);
        if (best && setKey(best) !== cur.key && (best.s >= need || (pinned(best, opts) && !cur.pinned))) { cur.to = lvl - 1; cur = null; }
        else if (cur.score <= p && !cur.pinned) { cur.to = lvl - 1; cur = null; }
        else continue;
      }
      if (best && (best.s > p || pinned(best, opts))) {
        cur = { key: setKey(best), set: best, from: lvl, to: end, score: best.s, par: p, pinned: pinned(best, opts) };
        steps.push(cur);
      }
    }
    return steps;
  }

  function contiguous(a, b) { return a && b && a.to + 1 === b.from; }

  // Keep-for-N (§6.4 step 4) and the later option (step 5). Returns the index of the first step to drop, or -1
  // when the path is stable. A step kept too briefly is dropped, unless dropping its short-lived-making successor
  // instead yields more score × levels over the same window (one craft either way): then the successor goes.
  function failing(steps, data, opts) {
    var worth = data.roles.worth;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], next = steps[i + 1], prev = steps[i - 1];
      if (s.pinned) continue;
      var kept = contiguous(s, next) ? next.from - s.from : (s.to >= worth.planEnd ? Infinity : s.to - s.from + 1);
      var tier = tierOf(worth, setCost(s.set, opts), s.from);
      if (kept < worth.keepMin[tier]) {
        if (contiguous(s, next) && !next.pinned) {
          // The successor that makes this step short-lived goes first when it is shorter-lived itself: banning this
          // step for it would be permanent even after the successor is dropped in a later round.
          var after0 = steps[i + 2], nextKept = contiguous(next, after0) ? after0.from - next.from : (next.to >= worth.planEnd ? Infinity : next.to - next.from + 1);
          if (nextKept < kept && nextKept < worth.keepMin[tierOf(worth, setCost(next.set, opts), next.from)]) return i + 1;
          var after = steps[i + 2], end = contiguous(next, after) ? after.from : next.to + 1;
          var base = contiguous(prev, s) ? prev.score : s.par;
          var dropS = base * (next.from - s.from) + next.score * (end - next.from);
          var dropNext = s.score * (end - s.from);
          if (dropNext >= dropS) return i + 1;
        }
        return i;
      }
      if (contiguous(s, next)) {
        var d = next.from - s.from;
        if (d <= worth.laterMax && next.score * (worth.horizon - d) > s.score * worth.horizon) return i;
      }
    }
    return -1;
  }

  function finish(steps, group, cands, data, opts) {
    var worth = data.roles.worth;
    return steps.map(function (s, i) {
      var prev = i > 0 && contiguous(steps[i - 1], s) ? steps[i - 1].score : s.par;
      var next = steps[i + 1];
      var kept = contiguous(s, next) ? next.from - s.from : (s.to >= worth.planEnd ? Infinity : s.to - s.from + 1);
      var gain = prev > 0 ? (s.score - prev) / prev : Infinity;
      var others = 0;
      for (var k = 0; k < cands.length; k++) {
        var c = cands[k];
        if (s.set.items.indexOf(c) >= 0) continue;
        var pl = c.places.main || c.places.off || c.places.ranged || c.places.slot;
        if (pl && pl.from <= s.to) others++;
      }
      var unconfirmed = s.set.items.some(function (c) { return c.route.unconfirmed; });
      var core = !unconfirmed && ((gain >= worth.coreGain && kept >= worth.coreKeep) || (others === 0 && kept >= worth.coreAlone));
      var routes = {};
      s.set.items.forEach(function (c) { routes[c.id] = { via: c.route.via, crafter: c.route.crafter, recipe: c.route.recipe, flags: c.route.flags.slice() }; });
      return {
        from: s.from, to: s.to, items: s.set.items.map(function (c) { return c.id; }), score: round2(s.score), par: round2(s.par),
        gain: gain === Infinity ? null : round2(gain), kept: kept === Infinity ? null : kept,
        tier: tierOf(worth, setCost(s.set, opts), s.from), core: core, pinned: !!s.pinned, routes: routes,
      };
    });
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  function groupPath(data, entry, ew, group, cands, opts) {
    var banned = { sets: {}, items: {} }, steps, guard = 0;
    for (;;) {
      steps = walk(data, entry, ew, group, cands, banned, opts);
      var bad = failing(steps, data, opts);
      if (bad < 0 || ++guard > 200) break;
      // Drop what the failing step added over its predecessor (a weaker variant of the same set would fail the
      // same way); a step that only rearranges its predecessor is dropped as a set.
      var s = steps[bad], prev = contiguous(steps[bad - 1], s) ? steps[bad - 1].set.items : [];
      var fresh = s.set.items.filter(function (c) { return prev.indexOf(c) < 0 && !(opts.inHand && opts.inHand[c.id]); });
      if (fresh.length) fresh.forEach(function (c) { banned.items[c.id] = true; });
      else banned.sets[s.key] = true;
    }
    return finish(steps, group, cands, data, opts);
  }

  // The per-slot path for one roster entry. opts: {hidden, inHand, learned, allLearned, costOf, fromLevel}.
  // Returns {entry, weights, groups: [{id, steps, alternatives}]}. Scarce (D19) and unconfirmed (D15) pieces
  // never enter the main path; they are listed as alternatives where a path including them would use them.
  function path(data, roster, entry, opts) {
    opts = opts || {};
    var cs = candidates(data, roster, entry, opts), groups = [];
    var gs = data.rules.slotGroups;
    for (var g = 0; g < gs.length; g++) {
      var group = gs[g];
      var all = cs.list.filter(function (c) { return inGroup(group, c); });
      var main = all.filter(function (c) { return !c.alt; });
      var steps = groupPath(data, entry, cs.weights, group, main, opts);
      var alternatives = [];
      if (main.length !== all.length) {
        groupPath(data, entry, cs.weights, group, all, opts).forEach(function (s) {
          var why = [];
          s.items.forEach(function (id) {
            var c = all.filter(function (x) { return x.id === id; })[0];
            if (c.alt) why.push(c.route.unconfirmed ? "unconfirmed" : c.route.scarce ? "needs " + SCARCE_TEXT[c.route.scarce] : "effect not scored");
          });
          if (why.length) alternatives.push({ from: s.from, to: s.to, items: s.items, score: s.score, routes: s.routes, why: why });
        });
      }
      groups.push({ id: group.id, steps: steps, alternatives: alternatives });
    }
    return { entry: entry.id, weights: cs.weights, groups: groups };
  }

  // Group ID of an item slot string.
  function groupOf(rules, slot) {
    for (var i = 0; i < rules.slotGroups.length; i++) if (rules.slotGroups[i].slots.indexOf(slot) >= 0) return rules.slotGroups[i].id;
    return null;
  }

  var api = {
    effectiveWeights: effectiveWeights, defaultRole: defaultRole, score: score, weaponTerm: weaponTerm,
    proficiencyLevel: proficiencyLevel, scarcity: scarcity, recipeOpen: recipeOpen, route: route, equipGate: equipGate,
    candidates: candidates, par: par, path: path, groupOf: groupOf, pace: pace, tierOf: tierOf,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.rank = api; }
})(this);
