// Onboarding: the empty state (faction, one / several / example), the entry form for add and edit, the example
// roster and entry deletion with Undo (docs/ui.md §3; synthesis D22–D24). The form keeps its values in A.form
// so a re-render (class or role changed) never loses typing.
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var LABEL_MAX = 24;
  var EXAMPLE = [
    { cls: "Mage", label: "Example Mage", role: "caster", level: 20, professions: ["Tailoring", "Enchanting"] },
    { cls: "Warrior", label: "Example Warrior", role: "melee", level: 14, professions: ["Mining", "Blacksmithing"] },
    { cls: "Rogue", label: "Example Rogue", role: "melee", level: 9, professions: [] },
  ];

  function esc(v) { return A.esc(v); }
  function D() { return A.D; }
  function classes() { return Object.keys(D().roles.classes).sort(); }
  function classRole(cls, role) {
    var rs = D().roles.classes[cls].roles;
    for (var i = 0; i < rs.length; i++) if (rs[i].role === role) return rs[i];
    return rs[0];
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- form model ------------------------------------------------------------------------------------------------

  function newForm(start, inline) {
    return { mode: "add", start: start, inline: inline, id: null, cls: null, role: null, school: null, twoHand: null, level: "",
      label: "", profs: [{ id: "", skill: "", spec: "" }, { id: "", skill: "", spec: "" }], showProfs: start === "several", errors: {}, added: 0 };
  }
  function formFromEntry(e) {
    var f = newForm("edit", false);
    f.mode = "edit"; f.id = e.id; f.cls = e.cls; f.role = e.role; f.level = String(e.level); f.label = e.label;
    f.school = e.options.school || null;
    f.twoHand = e.options.twoHand === undefined ? null : e.options.twoHand;
    e.professions.forEach(function (p, i) { f.profs[i] = { id: p.id, skill: p.skill === null ? "" : String(p.skill), spec: p.spec || "" }; });
    f.showProfs = e.professions.length > 0;
    return f;
  }
  A.openForm = function (start, inline) { A.form = newForm(start, inline); A.commit(["f-cls-" + A.slug(classes()[0])]); };
  A.editEntry = function (id) {
    var e = A.entry(id);
    if (!e) return;
    A.form = formFromEntry(e);
    A.commit(["f-level"]);
  };

  // Read the current control values into A.form (radios, selects, inputs, the professions <details>).
  function syncForm(f) {
    if (!f || !A.form) return;
    var el = f.elements, F = A.form, r;
    var clsChanged = false, roleChanged = false;
    if ((r = el.namedItem("cls")) && r.value && F.cls !== r.value) { F.cls = r.value; F.role = null; F.school = null; F.twoHand = null; clsChanged = true; }
    if (!clsChanged && (r = el.namedItem("role")) && r.value && F.cls && F.role !== r.value) { F.role = r.value; F.school = null; F.twoHand = null; roleChanged = true; }
    if (!clsChanged && !roleChanged) {
      if ((r = el.namedItem("school"))) F.school = r.value || null;
      if ((r = el.namedItem("twoHand"))) F.twoHand = !!r.checked;
    }
    if ((r = el.namedItem("level"))) F.level = r.value;
    if ((r = el.namedItem("label"))) F.label = r.value;
    [0, 1].forEach(function (i) {
      var p = el.namedItem("prof" + i), s = el.namedItem("skill" + i), sp = el.namedItem("spec" + i);
      if (p && p.value !== F.profs[i].id) { F.profs[i].id = p.value; F.profs[i].spec = ""; }
      if (s) F.profs[i].skill = s.value;
      if (sp) F.profs[i].spec = sp.value;
    });
    var det = f.querySelector && f.querySelector("details.profs");
    if (det) F.showProfs = det.open;
  }
  A.syncForm = syncForm;

  // Specialisation select (roles §5.3, D28): for a profession with specialisations, once the level is 40 or more or
  // the entered skill 200 or more.
  function specShown(F, i) {
    var p = F.profs[i], specs = p.id && A.ctx.professions[p.id] || [];
    return specs.length > 0 && (Number(F.level) >= 40 || (String(p.skill).trim() !== "" && Number(p.skill) >= 200));
  }
  A.specShown = specShown;

  // Validate A.form; returns {errors, entry} with the entry shape of D24.
  A.formEntry = function (F) {
    var errors = {}, cap = D().meta.skillCap;
    if (!F.cls || !D().roles.classes[F.cls]) errors.cls = "Pick a class.";
    var level = String(F.level).trim() === "" ? NaN : Number(F.level);
    if (!Number.isInteger(level) || level < 1 || level > 60) errors.level = "Level is a whole number from 1 to 60.";
    var profs = [], picked = [];
    F.profs.forEach(function (p, i) {
      if (!p.id) return;
      if (picked.indexOf(p.id) >= 0) { errors["prof" + i] = "The same profession twice."; return; }
      picked.push(p.id);
      var sk = String(p.skill).trim(), n = sk === "" ? null : Number(sk);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > cap)) { errors["skill" + i] = "Skill is 0 to " + cap + ", or empty to estimate it from the level."; return; }
      var specs = A.ctx.professions[p.id] || [];
      profs.push({ id: p.id, skill: n, spec: specShown(F, i) && specs.indexOf(p.spec) >= 0 ? p.spec : null });
    });
    if (String(F.label).length > LABEL_MAX) errors.label = "At most " + LABEL_MAX + " characters.";
    if (Object.keys(errors).length) return { errors: errors, entry: null };
    var cr = classRole(F.cls, F.role || FGP.rank.defaultRole(D().roles, F.cls)), options = {};
    if (cr.options && cr.options.school && F.school && cr.options.school.choices[F.school]) options.school = F.school;
    if (cr.options && cr.options.twoHand && F.twoHand !== null) options.twoHand = F.twoHand;
    return { errors: {}, entry: { cls: F.cls, label: String(F.label).trim(), role: cr.role, level: level, professions: profs, options: options, favor: 0 } };
  };

  // Add or update an entry from a validated form result; returns its ID.
  A.saveEntry = function (data, id) {
    var es = A.S.roster.entries;
    var e = id ? A.entry(id) : null;
    if (e) {
      ["cls", "label", "role", "level", "professions", "options"].forEach(function (k) { e[k] = data[k]; });
    } else {
      // A new entry, or one deleted (another tab, an undo) while its edit form was open: added again.
      id = FGP.state.newEntryId(A.env.random, es);
      data.id = id;
      es.push(data);
    }
    A.S = FGP.state.normalize(A.S, A.ctx);
    A.S.prefs.selected = id;
    if (!A.S.seen.build) A.S.seen = { build: D().meta.build, generated: D().meta.generated };
    return id;
  };

  A.loadExample = function () {
    A.S.roster.entries = [];
    EXAMPLE.forEach(function (x) {
      A.saveEntry({ cls: x.cls, label: x.label, role: x.role, level: x.level, options: {}, favor: 0,
        professions: x.professions.map(function (p) { return { id: p, skill: null, spec: null }; }) });
    });
    A.S.prefs.selected = A.S.roster.entries[0].id;
    A.S.prefs.dismissed.example = false;
    A.form = null;
  };

  // Delete an entry and everything keyed to it; Undo restores the state from before.
  A.deleteEntry = function (id) {
    var before = JSON.stringify(A.S), name = A.nameOf(id);
    A.S = FGP.state.removeEntry(A.S, id);
    A.form = null;
    A.commit(A.S.roster.entries.length ? ["card-" + A.S.prefs.selected] : ["start-one"]);
    A.toast("Deleted " + name, { label: "Undo", fn: function () {
      A.S = FGP.state.normalize(JSON.parse(before), A.ctx);
      A.commit(["card-" + id]);
      A.toast(name + " is back");
    } });
  };

  // --- HTML ------------------------------------------------------------------------------------------------------

  function errId(name) { return "err-" + name; }
  function fieldErr(name) {
    var e = A.form.errors[name];
    return e ? '<div class="err" id="' + errId(name) + '">' + esc(e) + "</div>" : "";
  }
  function described(name) { return A.form.errors[name] ? ' aria-describedby="' + errId(name) + '" aria-invalid="true"' : ""; }

  function roleHint(cls, role) {
    var ew = FGP.rank.effectiveWeights(D().roles, { cls: cls, role: role, options: {} }), w = ew.weights;
    var keys = Object.keys(w).filter(function (k) { return k !== "Armor" && w[k] >= 0.5; }).sort(function (a, b) { return w[b] - w[a]; }).slice(0, 3);
    return keys.map(A.statLabel).join(", ");
  }

  A.formHtml = function () {
    var F = A.form, edit = F.mode === "edit", cls = F.cls, out = [];
    var title = edit ? "Edit " + A.nameOf(F.id) : F.start === "one" ? "Your character" : "Add a character";
    out.push('<form class="entry panel' + (F.inline ? "" : " side-form") + '" data-submit="entry" novalidate aria-labelledby="form-title">');
    out.push('<h2 id="form-title">' + esc(title) + "</h2>");
    if (F.added) out.push('<p class="muted">' + esc(A.plural(F.added, "character")) + " added. Add the next one, or press Done.</p>");
    // Class
    out.push('<fieldset' + described("cls") + "><legend>Class</legend><div class=\"radios cls\">" + classes().map(function (c) {
      return '<label class="cls-' + A.slug(c) + '"><input type="radio" name="cls" id="f-cls-' + A.slug(c) + '" value="' + esc(c) + '" data-change="form"' + (cls === c ? " checked" : "") + "> " + esc(c) + "</label>";
    }).join("") + "</div>" + fieldErr("cls") + "</fieldset>");
    // Role (+ school, two-hand)
    if (cls) {
      var roles = D().roles.classes[cls].roles, cr = classRole(cls, F.role), role = cr.role;
      out.push("<fieldset><legend>Role</legend><div class=\"radios\">" + roles.map(function (r) {
        return '<label title="' + esc(roleHint(cls, r.role)) + '"><input type="radio" name="role" id="f-role-' + esc(r.role) + '" value="' + esc(r.role) + '" data-change="form"' +
          (r.role === role ? " checked" : "") + "> " + esc(D().roles.roles[r.role].label) + "</label>";
      }).join("") + '</div><div class="hint-line">Weighs most: ' + esc(roleHint(cls, role)) + ".</div>");
      if (cr.options && cr.options.school) {
        var sc = cr.options.school, cur = F.school || sc["default"];
        out.push('<div class="frow" style="margin-top:6px"><label for="f-school">School</label><select id="f-school" name="school" data-change="form">' +
          Object.keys(sc.choices).map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(cap(k)) + (k === sc["default"] ? " (default)" : "") + "</option>"; }).join("") +
          "</select></div>");
      }
      if (cr.options && cr.options.twoHand) {
        var th = cr.options.twoHand, on = F.twoHand === null ? th["default"] : F.twoHand;
        out.push('<div class="frow" style="margin-top:6px"><label><input type="checkbox" id="f-twohand" name="twoHand" data-change="form"' + (on ? " checked" : "") +
          "> Two-handed " + esc(th.adds.join(" and ")) + " from level " + esc(th.from) + "</label></div>");
      }
      out.push("</fieldset>");
    }
    // Level
    out.push('<div class="frow"><label for="f-level">Level</label><input type="number" id="f-level" name="level" min="1" max="60" step="1" class="inp-num" value="' + esc(F.level) +
      '" data-change="form"' + described("level") + "><span class=\"hint-line\">1–60</span></div>" + fieldErr("level"));
    // Professions
    var profNames = Object.keys(A.ctx.professions), kinds = {};
    D().rules.professions.forEach(function (p) { kinds[p.name] = p.kind; });
    function profSelect(i) {
      var cur = F.profs[i].id, opts = ['<option value="">None</option>'];
      ["crafting", "gathering"].forEach(function (k) {
        opts.push('<optgroup label="' + cap(k) + '">' + profNames.filter(function (n) { return kinds[n] === k; }).map(function (n) {
          return '<option value="' + esc(n) + '"' + (n === cur ? " selected" : "") + ">" + esc(n) + "</option>";
        }).join("") + "</optgroup>");
      });
      return '<div class="frow"><label for="f-prof' + i + '">' + (i + 1) + '</label><select id="f-prof' + i + '" name="prof' + i + '" data-change="form"' + described("prof" + i) + ">" + opts.join("") + "</select>" +
        '<label for="f-skill' + i + '">skill</label><input type="number" id="f-skill' + i + '" name="skill' + i + '" min="0" max="' + D().meta.skillCap + '" class="inp-num" placeholder="~" value="' +
        esc(F.profs[i].skill) + '" data-change="form"' + described("skill" + i) + "></div>" + fieldErr("prof" + i) + fieldErr("skill" + i) + specSelect(i);
    }
    function specSelect(i) {
      if (!specShown(F, i)) return "";
      var p = F.profs[i];
      return '<div class="frow"><label for="f-spec' + i + '">' + esc(p.id) + ' specialisation</label><select id="f-spec' + i + '" name="spec' + i + '" data-change="form">' +
        '<option value="">None yet</option>' + A.ctx.professions[p.id].map(function (sp) {
          return '<option value="' + esc(sp) + '"' + (sp === p.spec ? " selected" : "") + ">" + esc(sp) + "</option>";
        }).join("") + '</select><span class="hint-line">Decides which specialisation recipes this character can make; until one is chosen they count as makeable, marked "needs …".</span></div>';
    }
    out.push('<details class="profs" id="f-profs"' + (F.showProfs || F.profs[0].id || F.profs[1].id ? " open" : "") + "><summary id=\"f-profs-sum\">" +
      (F.start === "one" ? "This character has professions (optional)" : "Professions (optional, up to two)") + "</summary>" +
      profSelect(0) + profSelect(1) + '<div class="hint-line">Empty skill = estimated from the level (shown with ~). Crafters in your roster make BoE pieces for the others and mail them.</div></details>');
    // Label
    out.push('<div class="frow"><label for="f-label">Label</label><input type="text" id="f-label" name="label" maxlength="' + LABEL_MAX + '" value="' + esc(F.label) +
      '" placeholder="optional, e.g. Main, Alt 2" data-change="form"' + described("label") + '><span class="hint-line">Stays in this browser and in files you export.</span></div>' + fieldErr("label"));
    // Buttons
    out.push('<div class="actions">');
    if (edit) {
      out.push('<button type="submit" class="btn btn-primary" id="f-save" name="go" value="save">Save</button>');
      out.push('<button type="button" class="btn btn-danger" id="f-delete" data-act="entry-delete" data-key="' + esc(F.id) + '">Delete character…</button>');
    } else if (F.added >= 1) {
      out.push('<button type="button" class="btn btn-primary" id="f-done" data-act="form-done">Done</button>');
      out.push('<button type="submit" class="btn" id="f-another" name="go" value="another">Add and add another</button>');
    } else {
      out.push('<button type="submit" class="btn btn-primary" id="f-show" name="go" value="show">Add and show plan</button>');
      if (F.start !== "one") out.push('<button type="submit" class="btn" id="f-another" name="go" value="another">Add and add another</button>');
    }
    out.push('<button type="button" class="btn btn-quiet right" id="f-cancel" data-act="form-cancel">Cancel</button></div></form>');
    return out.join("");
  };

  A.views.onboarding = {
    html: function () {
      var meta = D().meta, ref = D().reference, f = A.S.roster.faction, out = [];
      if (A.S.roster.entries.length && A.form) return A.formHtml();
      out.push('<section class="onb">');
      out.push('<div class="panel"><h2>Plan crafted gear for WoW: Forever, levels 1–60</h2>');
      out.push('<p class="lead">Tell the planner which characters you level. It works out, per slot and level, which crafted piece to make or buy, ' +
        "who in your roster can make it, where the pattern comes from, and what it costs at your Auction House.</p>");
      out.push('<p class="muted">Everything stays in this browser. Data: build ' + esc(meta.build) + " (" + esc(meta.status) + "), generated " + esc(meta.generated) + ". " + esc(ref.notice.derived) + "</p>");
      out.push('<fieldset><legend>Faction</legend><div class="radios">' + ["alliance", "horde"].map(function (x) {
        return '<label><input type="radio" name="faction" id="faction-' + x + '" value="' + x + '" data-change="faction"' + (f === x ? " checked" : "") + "> " + cap(x) + "</label>";
      }).join("") + '</div><div class="hint-line">Recipe vendors, Merchant\'s Favor vendors and the Auction House differ by faction, and mail only reaches characters of the same faction. ' +
        esc(ref.coverage.horde) + "</div></fieldset>");
      var st = A.form && A.form.inline ? A.form.start : null;
      out.push('<div class="starts">' +
        '<button type="button" class="start" id="start-one" data-act="start" data-key="one" aria-pressed="' + (st === "one") + '"><strong>I play one character</strong><span>Buy crafted gear on the AH, or craft for myself.</span></button>' +
        '<button type="button" class="start" id="start-several" data-act="start" data-key="several" aria-pressed="' + (st === "several") + '"><strong>I level several characters</strong><span>Crafters make gear for alts and mail it.</span></button>' +
        '<button type="button" class="start" id="start-example" data-act="start" data-key="example"><strong>Show me an example</strong><span>A 3-character roster you can edit or clear.</span></button></div>');
      out.push('<p>Have a saved file? <button type="button" class="btn" id="import-state-onb" data-act="import-state">Import planner file…</button></p></div>');
      if (A.form && A.form.inline) out.push(A.formHtml());
      out.push("</section>");
      return out.join("");
    },
  };

  // --- actions ---------------------------------------------------------------------------------------------------

  A.changes.faction = function (el) {
    A.S.roster.faction = el.value === "horde" ? "horde" : "alliance";
    A.commit();
  };
  A.acts.start = function (el) {
    var k = el.getAttribute("data-key");
    if (k === "example") { A.loadExample(); A.commit(["card-" + A.S.prefs.selected]); return; }
    A.openForm(k, true);
  };
  A.changes.form = function (el) {
    var name = el.name, shown = A.form ? [specShown(A.form, 0), specShown(A.form, 1)].join() : "";
    syncForm(el.form);
    if (name === "cls" || name === "role") A.commit();
    // The specialisation select appears or goes: re-render after Tab has moved focus, so focus stays where it went.
    else if (A.form && [specShown(A.form, 0), specShown(A.form, 1)].join() !== shown) setTimeout(function () { A.commit(); }, 0);
  };
  A.submits.entry = function (f, submitter) {
    syncForm(f);
    var F = A.form, go = submitter ? submitter.value : F.mode === "edit" ? "save" : "show";
    var res = A.formEntry(F);
    F.errors = res.errors;
    if (!res.entry) {
      var first = ["cls", "level", "prof0", "skill0", "prof1", "skill1", "label"].filter(function (k) { return res.errors[k]; })[0];
      A.commit([first === "cls" ? "f-cls-" + A.slug(classes()[0]) : "f-" + first]);
      return;
    }
    var id = A.saveEntry(res.entry, F.mode === "edit" ? F.id : null);
    if (go === "another") {
      var added = F.added + 1, inline = F.inline && true;
      A.form = newForm("several", inline);
      A.form.added = added;
      A.commit(["f-cls-" + A.slug(classes()[0])]);
      A.toast("Added " + A.nameOf(id));
      return;
    }
    A.form = null;
    if (A.currentView() !== "gear") { A.focusNext = ["card-" + id]; A.go("gear"); return; }
    A.commit(["card-" + id]);
  };
  A.acts["form-cancel"] = function () {
    var inline = A.form && A.form.inline;
    A.form = null;
    A.commit(inline && !A.S.roster.entries.length ? ["start-one"] : ["card-" + A.S.prefs.selected, "start-one"]);
  };
  A.acts["form-done"] = function () { A.form = null; A.commit(["card-" + A.S.prefs.selected]); };
  A.acts["entry-add"] = function () { A.openForm("several", false); };
  A.acts["entry-edit"] = function (el) { A.editEntry(el.getAttribute("data-key")); };
  A.acts["entry-delete"] = function (el) {
    var id = el.getAttribute("data-key"), e = A.entry(id);
    if (!e) return;
    var pre = id + ":", items = Object.keys(A.S.items).filter(function (k) { return k.indexOf(pre) === 0; }).length;
    var recs = Object.keys(A.S.recipes).filter(function (k) { return k.indexOf(pre) === 0; }).length;
    A.dialog({
      title: "Delete " + A.nameOf(id) + " (" + e.cls + " " + e.level + ")?",
      body: "<p>This removes " + esc(A.plural(items, "tracked item")) + " and " + esc(A.plural(recs, "recipe mark")) + ". You can undo it right after.</p>",
      buttons: [{ label: "Cancel", id: "dlg-cancel" }, { label: "Delete", id: "dlg-delete", cls: "btn-danger", fn: function () { A.deleteEntry(id); } }],
      focus: "dlg-cancel",
    });
  };
  A.acts["clear-example"] = function () {
    var keep = A.S.roster.entries.filter(function (e) { return !/^Example /.test(e.label || ""); }).map(function (e) { return e.id; });
    A.S.roster.entries.slice().forEach(function (e) { if (keep.indexOf(e.id) < 0) A.S = FGP.state.removeEntry(A.S, e.id); });
    A.commit(A.S.roster.entries.length ? ["card-" + A.S.prefs.selected] : ["start-one"]);
  };
  A.acts["keep-example"] = function () { A.S.prefs.dismissed.example = true; A.commit(["search"]); };
})(this);
