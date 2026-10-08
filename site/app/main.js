// Boot, data and schema check, state and storage (D35), render loop with focus restore, toasts, dialogs and
// keyboard shortcuts (docs/ui.md §2, §10, §12). Views register on FGP.app.views; DOM work starts on
// DOMContentLoaded, so this file also loads in Node for tests (no document there, render is a no-op).
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var SECTIONS = ["meta", "items", "recipes", "mats", "sources", "rules", "roles", "reference"];
  var VIEWS = [["gear", "Gear"], ["prices", "Prices"], ["about", "About"]];
  var THEMES = ["auto", "light", "dark"];

  A.views = A.views || {};
  A.acts = A.acts || {};     // click on [data-act]
  A.changes = A.changes || {}; // change on [data-change]
  A.inputs = A.inputs || {};   // input on [data-input] (debounced)
  A.submits = A.submits || {}; // submit on form[data-submit]
  A.VIEWS = VIEWS;

  // --- helpers -------------------------------------------------------------------------------------------------

  function own(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k); }
  function esc(v) {
    return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }
  function idPart(s) { return String(s === null || s === undefined || s === "" ? "all" : s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  function plural(n, w, ws) { return n + " " + (n === 1 ? w : ws || w + "s"); }
  function money(c) {
    if (c === null || c === undefined || isNaN(c)) return '<span class="faint">—</span>';
    c = Math.round(c);
    var g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cc = c % 100, out = [];
    if (g) out.push('<span class="coin g">' + g + "g</span>");
    if (s) out.push('<span class="coin s">' + s + "s</span>");
    if (cc || !out.length) out.push('<span class="coin c">' + cc + "c</span>");
    return out.join("");
  }
  function whUrl(id) { return "https://www.wowhead.com/forever/item=" + id; }
  function classSpan(cls, text) { return '<span class="cn cls-' + slug(cls) + '">' + esc(text === undefined ? cls : text) + "</span>"; }
  function ageText(age) { return age <= 0 ? "today" : age === 1 ? "1 day" : age + " days"; }

  A.own = own; A.esc = esc; A.slug = slug; A.idPart = idPart; A.plural = plural; A.money = money; A.whUrl = whUrl;
  A.classSpan = classSpan; A.ageText = ageText;
  A.moneyText = function (c) { return FGP.pricing.formatMoney(c); };

  // Where a price comes from, for its tooltip (ui.md §9).
  A.priceSource = function (p) {
    if (!p) return "No price: import an Auctionator file or set your own price on the Prices tab.";
    if (p.source === "override") return "Your price (override)";
    if (p.source === "vendor") return "Vendor price";
    if (p.source === "ah" || p.source === "default") {
      return (p.source === "ah" ? "AH min buyout" : "Default list") + (p.day !== null ? ", scan " + FGP.auctionator.isoDay(p.day) : "") +
        (p.qty !== null ? ", " + plural(p.qty, "listing") : "") + (p.thin ? " (thin market: may be one odd listing)" : "");
    }
    if (p.source === "craft") return "Craft cost of the mats" + (p.partial ? "; some mats have no price (+?)" : "");
    return p.source;
  };
  A.ageBadge = function (p) {
    if (!p || p.age === null || p.age === undefined) return "";
    return '<span class="age age-' + esc(p.band) + '" title="Price age: ' + esc(p.band) + '">' + esc(ageText(p.age)) + "</span>";
  };
  // A price with its source in the tooltip and its age; "no price" when unknown (never zero, pricing §3.4).
  A.priceHtml = function (p) {
    if (!p) return '<span class="noprice" title="' + esc(A.priceSource(null)) + '">no price</span>';
    return '<span title="' + esc(A.priceSource(p)) + '">' + money(p.copper) + (p.partial ? '<span class="faint">+?</span>' : "") + "</span>" + A.ageBadge(p);
  };

  // --- environment (tests replace storage, clock and random) -----------------------------------------------------

  function defaultStorage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function cryptoRandom() {
    try {
      var b = new Uint32Array(1);
      root.crypto.getRandomValues(b);
      return b[0] / 4294967296;
    } catch (e) { return Math.random(); }
  }

  A.store = { ok: true, error: null, status: "empty", readOnly: false };

  function storageGet(key) {
    try {
      if (!A.env.storage) throw new Error("no storage");
      return A.env.storage.getItem(key);
    } catch (e) { A.store.ok = false; A.store.error = e.name || String(e); return null; }
  }
  function storageSet(key, value) {
    try {
      if (!A.env.storage) throw new Error("no storage");
      A.env.storage.setItem(key, value);
      return true;
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) { A.store.quota = true; return false; }
      A.store.ok = false; A.store.error = e.name || String(e);
      return false;
    }
  }
  function storageRemove(key) { try { if (A.env.storage) A.env.storage.removeItem(key); } catch (e) { /* storage blocked */ } }
  A.storageGet = storageGet; A.storageSet = storageSet; A.storageRemove = storageRemove;

  // --- data, state and prices ----------------------------------------------------------------------------------

  function dataProblems(D) {
    if (!D) return ["The game data did not load (data/forever/*.js)."];
    var out = [];
    SECTIONS.forEach(function (s) { if (!D[s]) out.push("Data section \"" + s + "\" is missing (data/forever/" + s + ".js)."); });
    if (D.meta && D.meta.schema !== FGP.version.SUPPORTED_SCHEMA) out.push("The data has schema " + D.meta.schema + "; this page reads schema " + FGP.version.SUPPORTED_SCHEMA + ". Reload to update.");
    if (D.meta && D.meta.dataset !== FGP.version.DATASET) out.push("The data is for \"" + D.meta.dataset + "\", not \"" + FGP.version.DATASET + "\".");
    return out;
  }

  function parseSet(text) {
    if (!text) return null;
    try {
      var v = JSON.parse(text);
      return v && typeof v === "object" && v.rows && typeof v.rows === "object" ? v : null;
    } catch (e) { return null; }
  }

  // opts: {data, storage, now (→ Date), random}. Returns the list of data problems (empty when the page can run).
  A.init = function (opts) {
    opts = opts || {};
    A.env = {
      storage: own(opts, "storage") ? opts.storage : defaultStorage(),
      now: opts.now || function () { return new Date(); },
      random: opts.random || cryptoRandom,
    };
    A.D = opts.data || root.FGP_DATA;
    A.problems = dataProblems(A.D);
    A.store = { ok: true, error: null, status: "empty", readOnly: false, quota: false };
    A.memo = {};
    A.query = "";
    A.form = null;
    A.undoAction = null;
    A.priceVersion = 0;
    A.today = FGP.auctionator.dayNumber(A.env.now());
    if (A.problems.length) { A.S = FGP.state.defaults(); return A.problems; }
    A.ctx = FGP.state.contextFrom(A.D);
    A.loadState();
    A.prices = { imported: parseSet(storageGet(FGP.state.KEYS.prices)), undo: !!storageGet(FGP.state.KEYS.pricesUndo) };
    return A.problems;
  };

  A.loadState = function () {
    var res = FGP.state.load(storageGet(FGP.state.KEYS.state), A.ctx);
    A.S = res.state;
    A.store.status = res.status;
    A.store.readOnly = res.readOnly;
    if (res.backup) storageSet(res.backup.key, res.backup.text);
    var meta = A.D.meta;
    A.dataUpdate = null;
    if (A.S.seen.build === null && !A.S.roster.entries.length) { A.S.seen = { build: meta.build, generated: meta.generated }; }
    else if (FGP.state.dataChanged(A.S, meta)) A.dataUpdate = { from: A.S.seen.build, to: meta.build };
    A.memo = {};
  };

  A.save = function () {
    if (A.store.readOnly) return false;
    return storageSet(FGP.state.KEYS.state, FGP.state.serialize(A.S));
  };

  // Entries, display names (label, else class; duplicates get a suffix, ui.md §3.2) and per-item state.
  A.entries = function () { return A.S.roster.entries; };
  A.entry = function (id) {
    var es = A.S.roster.entries;
    for (var i = 0; i < es.length; i++) if (es[i].id === id) return es[i];
    return null;
  };
  A.selected = function () { return A.entry(A.S.prefs.selected) || A.S.roster.entries[0] || null; };
  A.names = function () {
    var out = {}, seen = {};
    A.S.roster.entries.forEach(function (e) {
      var base = (e.label || "").trim() || e.cls, n = (seen[base] || 0) + 1;
      seen[base] = n;
      out[e.id] = n > 1 ? base + " " + n : base;
    });
    return out;
  };
  A.nameOf = function (id) { return A.names()[id] || id; };
  A.itemKey = function (eid, iid) { return eid + ":" + iid; };
  A.itemState = function (eid, iid) { return A.S.items[A.itemKey(eid, iid)] || {}; };
  A.setItem = function (eid, iid, patch) {
    var k = A.itemKey(eid, iid), v = {}, p;
    for (p in A.S.items[k] || {}) if (own(A.S.items[k], p)) v[p] = A.S.items[k][p];
    for (p in patch) if (own(patch, p)) { if (patch[p] === null || patch[p] === undefined || patch[p] === false) delete v[p]; else v[p] = patch[p]; }
    if (Object.keys(v).length) A.S.items[k] = v; else delete A.S.items[k];
  };
  // Hidden and in-hand item maps of one entry, and the roster's learned recipes, as rank.path wants them.
  A.entryMaps = function (eid) {
    var hidden = {}, inHand = {}, learned = {}, k, pre = eid + ":";
    for (k in A.S.items) {
      if (!own(A.S.items, k) || k.indexOf(pre) !== 0) continue;
      var v = A.S.items[k], id = k.slice(pre.length);
      if (v.hidden) hidden[id] = true;
      if (v.status === "have" || v.status === "equipped") inHand[id] = true;
    }
    for (k in A.S.recipes) if (own(A.S.recipes, k)) learned[k] = true;
    return { hidden: hidden, inHand: inHand, learned: learned };
  };

  // One pricer per price state (overrides + imported set); one path per entry and inputs.
  A.pricer = function () {
    var key = A.priceVersion + ":" + JSON.stringify(A.S.prices.overrides);
    if (A.memo.pricerKey !== key) {
      A.memo.pricerKey = key;
      A.memo.pricer = FGP.pricing.createPricer(A.D, { overrides: A.S.prices.overrides, imported: A.prices.imported, defaultSet: null }, { today: A.today });
      A.memo.paths = {};
    }
    return A.memo.pricer;
  };
  A.pathFor = function (entry) {
    var pr = A.pricer(), maps = A.entryMaps(entry.id);
    var key = JSON.stringify([A.S.roster, maps]);
    var paths = A.memo.paths || (A.memo.paths = {});
    if (!paths[entry.id] || paths[entry.id].key !== key) {
      paths[entry.id] = {
        key: key,
        value: FGP.rank.path(A.D, A.S.roster, entry, { hidden: maps.hidden, inHand: maps.inHand, learned: maps.learned, costOf: pr.costOf }),
      };
    }
    return paths[entry.id].value;
  };

  A.pricesChanged = function () { A.priceVersion++; A.memo.pricerKey = null; };
  A.setImported = function (set) {
    A.prices.imported = set;
    A.pricesChanged();
  };

  // --- search ----------------------------------------------------------------------------------------------------

  A.setQuery = function (q) { A.query = String(q || ""); A.terms = A.query.toLowerCase().split(/\s+/).filter(Boolean); };
  A.matches = function (hay) {
    var t = A.terms || [];
    if (!t.length) return true;
    hay = String(hay).toLowerCase();
    for (var i = 0; i < t.length; i++) if (hay.indexOf(t[i]) < 0) return false;
    return true;
  };

  // --- rendering -------------------------------------------------------------------------------------------------

  function doc() { return root.document || null; }
  function $(id) { var d = doc(); return d ? d.getElementById(id) : null; }

  A.currentView = function () {
    var h = (root.location && root.location.hash || "").replace(/^#/, "");
    for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i][0] === h) return h;
    return "gear";
  };
  A.go = function (view) {
    if (root.location) {
      if (root.location.hash === "#" + view) A.render();
      else root.location.hash = view;
    }
  };

  A.viewHtml = function (view) {
    if (A.problems.length) {
      return '<div class="panel"><h2>The page can\'t start</h2><ul class="msgs">' + A.problems.map(function (p) { return '<li class="bad">' + esc(p) + "</li>"; }).join("") +
        '</ul><p class="muted">Keep <code>index.html</code> next to its <code>data</code>, <code>lib</code> and <code>app</code> folders.</p></div>';
    }
    if (view === "gear" && (!A.S.roster.entries.length || A.form && A.form.inline)) return A.views.onboarding.html();
    return A.views[view].html();
  };

  function navHtml(v) {
    return VIEWS.map(function (x, i) {
      return '<a href="#' + x[0] + '" id="tab-' + x[0] + '"' + (x[0] === v ? ' aria-current="page"' : "") + ">" + esc(x[1]) + "<kbd>" + (i + 1) + "</kbd></a>";
    }).join("");
  }

  // Banners: storage, read-only state, data update, example roster, beta notice (ui.md §9, §10.5, §10.6; U4).
  A.banners = function () {
    var out = [], meta = A.D && A.D.meta;
    if (A.problems && A.problems.length) return out;
    if (!A.store.ok) out.push({ cls: "b-err", html: "Browser storage is blocked, so changes won't survive a reload. Use <strong>Export</strong> on the About tab to keep them." });
    if (A.store.readOnly) out.push({ cls: "b-err", html: "Your saved planner data was written by a newer version of this page. Reload to update; nothing is saved until then." });
    if (A.store.status === "corrupt" || A.store.status === "foreign") out.push({ cls: "", html: "Your saved planner data could not be read and was set aside as a backup in this browser. The planner starts empty." });
    if (A.dataUpdate) {
      var orph = FGP.state.orphans(A.S, A.D), n = orph.items.length + orph.recipes.length;
      out.push({ cls: "b-info", html: "Game data updated: build " + esc(A.dataUpdate.from || "?") + " → " + esc(A.dataUpdate.to) +
        ". Your progress is kept; pieces you have stay in your plan, recommendations may have changed." +
        (n ? " " + esc(plural(n, "tracked entry", "tracked entries")) + " no longer in the data (see About)." : "") +
        ' <button type="button" class="linkbtn" id="dismiss-update" data-act="dismiss-update">Dismiss</button>' });
    }
    if (A.isExample() && !A.S.prefs.dismissed.example) {
      out.push({ cls: "b-info", html: "Example roster: edit it, or " +
        '<button type="button" class="linkbtn" id="clear-example" data-act="clear-example">clear the example</button> · ' +
        '<button type="button" class="linkbtn" id="keep-example" data-act="keep-example">keep it</button>' });
    }
    if (meta && meta.status === "beta") out.push({ cls: "b-info", html: esc(A.D.reference.notice.beta.replace("{build}", meta.build)) });
    return out;
  };
  A.isExample = function () {
    return A.S.roster.entries.some(function (e) { return /^Example /.test(e.label || ""); });
  };

  function footHtml() {
    var meta = A.D && A.D.meta, imp = A.prices && A.prices.imported, v = FGP.version.APP_VERSION;
    var parts = ["Forever Gear Planner " + esc(v)];
    if (meta) parts.push("build " + esc(meta.build) + " (" + esc(meta.status) + ") · data " + esc(meta.generated));
    if (imp) parts.push("prices: Auctionator " + (imp.scanDay !== null && imp.scanDay !== undefined ? "scan " + esc(FGP.auctionator.isoDay(imp.scanDay)) : "file"));
    else if (meta) parts.push("prices: none imported");
    return parts.join(" · ") + " · Keys: <kbd>1</kbd>–<kbd>3</kbd> views, <kbd>/</kbd> search, <kbd>[</kbd> <kbd>]</kbd> previous/next character, " +
      "<kbd>h</kbd> hide the focused row, <kbd>u</kbd> undo, <kbd>t</kbd> theme, <kbd>?</kbd> all keys.";
  }

  A.applyTheme = function () {
    var d = doc();
    if (!d) return;
    var t = A.S.prefs.theme || "auto";
    if (t === "auto") d.documentElement.removeAttribute("data-theme");
    else d.documentElement.setAttribute("data-theme", t);
    var b = $("btn-theme");
    if (b) b.textContent = "Theme: " + (t === "auto" ? "system" : t);
  };

  A.render = function () {
    var d = doc();
    if (!d) return;
    var active = d.activeElement, id = active && active.id, sel = null;
    try { if (active && typeof active.selectionStart === "number") sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; }
    if (A.tip) A.tip.hide();
    var v = A.currentView();
    $("tabs").innerHTML = navHtml(v);
    $("banner").innerHTML = A.banners().map(function (b) { return '<div class="banner ' + b.cls + '"><div>' + b.html + "</div></div>"; }).join("");
    $("foot").innerHTML = footHtml();
    A.applyTheme();
    var html;
    try { html = A.viewHtml(v); } catch (err) {
      html = '<div class="panel"><h2>Something broke while rendering</h2><pre class="small">' + esc(err && err.stack || err) + "</pre></div>";
      if (root.console) root.console.error(err);
    }
    $("view").innerHTML = html;
    var want = A.focusNext;
    A.focusNext = null;
    if (want) A.focus(want);
    else if (id && id !== "search") {
      var el = $(id);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } }
      }
    }
  };

  // Focus the first element of a list of IDs that exists (after a render).
  A.focus = function (ids) {
    ids = [].concat(ids);
    for (var i = 0; i < ids.length; i++) {
      var el = ids[i] && $(ids[i]);
      if (el) { el.focus({ preventScroll: false }); return true; }
    }
    return false;
  };

  A.commit = function (focus) {
    if (focus) A.focusNext = focus;
    A.save();
    A.render();
  };

  // --- toasts and dialogs ----------------------------------------------------------------------------------------

  var toastTimer = null;
  function hideToast() {
    var t = $("toast");
    if (!t) return;
    if (t.contains(doc().activeElement) || t.matches(":hover")) { toastTimer = setTimeout(hideToast, 1500); return; }
    t.classList.remove("show", "has-action");
  }
  // action: {label, fn}; also run by the "u" key while it is the latest undo.
  A.toast = function (msg, action) {
    if (action) A.undoAction = action;
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    if (action) {
      var b = doc().createElement("button");
      b.type = "button"; b.className = "toast-btn"; b.id = "toast-action"; b.textContent = action.label; b.title = action.label + " (u)";
      b.addEventListener("click", function () { A.runUndo(); });
      t.appendChild(doc().createTextNode(" · ")); t.appendChild(b);
    }
    t.classList.toggle("has-action", !!action);
    t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, action ? 6000 : 2400);
  };
  A.runUndo = function () {
    var a = A.undoAction;
    A.undoAction = null;
    var t = $("toast");
    if (t) t.classList.remove("show", "has-action");
    if (a) a.fn();
    return !!a;
  };

  // A modal <dialog>: {title, body (HTML), buttons: [{label, id, cls, fn}], focus: button id}. Esc cancels.
  var dlgButtons = [];
  A.dialog = function (o) {
    var dlg = $("dlg");
    if (!dlg) return;
    dlgButtons = o.buttons || [];
    dlg.innerHTML = '<h2 id="dlg-title">' + esc(o.title) + "</h2>" + (o.body || "") + '<div class="actions">' +
      dlgButtons.map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || "") + '" id="' + esc(b.id) + '" data-act="dlg" data-key="' + i + '">' + esc(b.label) + "</button>"; }).join("") + "</div>";
    A.dialogReturn = doc().activeElement && doc().activeElement.id;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    var f = o.focus && $(o.focus);
    if (f) f.focus();
  };
  A.closeDialog = function () {
    var dlg = $("dlg");
    if (dlg && dlg.open) { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); }
  };
  A.acts.dlg = function (el) {
    var b = dlgButtons[+el.getAttribute("data-key")];
    A.closeDialog();
    if (A.dialogReturn) A.focus(A.dialogReturn);
    if (b && b.fn) b.fn();
  };

  // --- files -----------------------------------------------------------------------------------------------------

  A.pickFile = function (accept, cb) {
    var input = doc().createElement("input");
    input.type = "file"; input.accept = accept; input.hidden = true;
    input.addEventListener("change", function () { var f = input.files && input.files[0]; input.remove(); if (f) cb(f); });
    doc().body.appendChild(input);
    input.click();
  };
  A.readBytes = function (file, cb) {
    if (file.arrayBuffer) { file.arrayBuffer().then(function (b) { cb(null, new Uint8Array(b)); }, function (e) { cb(e); }); return; }
    var r = new root.FileReader();
    r.onload = function () { cb(null, new Uint8Array(r.result)); };
    r.onerror = function () { cb(r.error || new Error("read failed")); };
    r.readAsArrayBuffer(file);
  };
  A.download = function (name, text) {
    var blob = new root.Blob([text], { type: "application/json" });
    var url = root.URL.createObjectURL(blob), a = doc().createElement("a");
    a.href = url; a.download = name;
    doc().body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  };
  A.isoNow = function () {
    var d = A.env.now(), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  };

  // --- shared actions ----------------------------------------------------------------------------------------------

  A.acts.theme = function () {
    A.S.prefs.theme = THEMES[(THEMES.indexOf(A.S.prefs.theme) + 1) % THEMES.length];
    A.save(); A.applyTheme();
    A.toast("Theme: " + (A.S.prefs.theme === "auto" ? "follow system" : A.S.prefs.theme));
  };
  A.acts["dismiss-update"] = function () {
    A.S.seen = { build: A.D.meta.build, generated: A.D.meta.generated };
    A.dataUpdate = null;
    A.commit(["search"]);
  };
  A.acts.keys = function () {
    var rows = [["1", "Gear"], ["2", "Prices"], ["3", "About"], ["/", "Search"], ["[ and ]", "Previous / next character"],
      ["h", "Hide the focused item row for this character"], ["u", "Undo the last hide or delete"], ["t", "Theme: system, light, dark"],
      ["Esc", "Clear the search, then the slot filter"], ["?", "This list"]];
    A.dialog({ title: "Keyboard shortcuts", body: '<dl class="kv">' + rows.map(function (r) { return "<dt><kbd>" + esc(r[0]) + "</kbd></dt><dd>" + esc(r[1]) + "</dd>"; }).join("") +
      '</dl><p class="muted small" style="margin-top:8px">Single keys work outside text fields. Tab moves through every control.</p>',
      buttons: [{ label: "Close", id: "dlg-close" }], focus: "dlg-close" });
  };

  // Select another roster entry ([ and ], card buttons) and keep focus on its card.
  A.selectEntry = function (id, focus) {
    if (!A.entry(id)) return;
    A.S.prefs.selected = id;
    A.form = null;
    A.commit(focus ? ["card-" + id] : null);
  };
  A.cycleEntry = function (step) {
    var es = A.S.roster.entries;
    if (es.length < 2) return;
    var cur = A.selected(), i = es.indexOf(cur);
    A.selectEntry(es[(i + step + es.length) % es.length].id, true);
  };

  // --- events ----------------------------------------------------------------------------------------------------

  function isField(t) {
    return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }
  var inputTimer = null;

  function onClick(ev) {
    var el = ev.target.closest && ev.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var fn = A.acts[el.getAttribute("data-act")];
    if (!fn) return;
    if (el.tagName === "A" || el.getAttribute("role") === "button") ev.preventDefault();
    fn(el, ev);
  }
  function onChange(ev) {
    var el = ev.target.closest && ev.target.closest("[data-change]");
    if (!el) return;
    clearTimeout(inputTimer);
    var fn = A.changes[el.getAttribute("data-change")];
    if (fn) fn(el, ev);
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.id === "search") {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(function () { A.setQuery(t.value); A.render(); }, 150);
      return;
    }
    var el = t.closest && t.closest("[data-input]");
    if (!el) return;
    var fn = A.inputs[el.getAttribute("data-input")];
    if (!fn) return;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function () { fn(el, ev); }, 250);
  }
  function onSubmit(ev) {
    var f = ev.target.closest && ev.target.closest("form[data-submit]");
    if (!f) return;
    ev.preventDefault();
    var fn = A.submits[f.getAttribute("data-submit")];
    if (fn) fn(f, ev.submitter || null, ev);
  }

  function onKey(ev) {
    var d = doc(), t = ev.target;
    var dlg = $("dlg");
    if (dlg && dlg.open) return;
    if (ev.key === "Escape") {
      if (A.tip) A.tip.hide();
      if (t && t.id === "search" && t.value) { t.value = ""; A.setQuery(""); A.render(); return; }
      if (isField(t)) { t.blur(); return; }
      if (A.query) { $("search").value = ""; A.setQuery(""); A.render(); return; }
      if (A.S.prefs.slot) { A.S.prefs.slot = ""; A.commit(); }
      return;
    }
    if (isField(t) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "Enter" || ev.key === " ") {
      // Divs with role="button" (slot lanes) act like buttons.
      if (t && t.getAttribute && t.getAttribute("role") === "button" && t.tagName !== "BUTTON") { ev.preventDefault(); onClick({ target: t, preventDefault: function () {} }); }
      return;
    }
    var n = parseInt(ev.key, 10);
    if (n >= 1 && n <= VIEWS.length) { ev.preventDefault(); A.go(VIEWS[n - 1][0]); return; }
    if (ev.key === "/") { ev.preventDefault(); var s = $("search"); s.focus(); s.select(); return; }
    if (ev.key === "[" || ev.key === "]") { ev.preventDefault(); A.cycleEntry(ev.key === "]" ? 1 : -1); return; }
    if (ev.key === "u") { if (A.runUndo()) ev.preventDefault(); return; }
    if (ev.key === "t") { ev.preventDefault(); A.acts.theme(); return; }
    if (ev.key === "?") { ev.preventDefault(); A.acts.keys(); return; }
    if (ev.key === "h") {
      var row = d.activeElement && d.activeElement.closest && d.activeElement.closest("[data-row]");
      var btn = row && row.querySelector('[data-act="hide"],[data-act="unhide"]');
      if (btn) { ev.preventDefault(); btn.click(); }
    }
  }

  function onStorage(ev) {
    if (ev.key !== FGP.state.KEYS.state && ev.key !== FGP.state.KEYS.prices) return;
    if (ev.key === FGP.state.KEYS.prices) A.setImported(parseSet(storageGet(FGP.state.KEYS.prices)));
    else A.loadState();
    A.prices.undo = !!storageGet(FGP.state.KEYS.pricesUndo);
    A.render();
    A.toast("Updated from another tab");
  }

  function boot() {
    A.init({});
    var d = doc();
    d.addEventListener("click", onClick);
    d.addEventListener("change", onChange);
    d.addEventListener("input", onInput);
    d.addEventListener("submit", onSubmit);
    d.addEventListener("keydown", onKey);
    root.addEventListener("hashchange", function () { A.form = A.form && A.form.inline ? A.form : null; A.render(); var v = $("view"); if (v) v.focus({ preventScroll: true }); });
    root.addEventListener("storage", onStorage);
    if (A.boots) A.boots.forEach(function (fn) { fn(); });
    if (!A.problems.length) A.save();
    A.render();
  }
  A.boots = A.boots || [];

  if (root.document && root.document.addEventListener) root.document.addEventListener("DOMContentLoaded", boot);
})(this);
