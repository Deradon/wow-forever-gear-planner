// Prices view: Auctionator import by file picker or drop, realm choice, replace with one undo slot, manual
// overrides, and a redacted diagnostic for bug reports (docs/pricing-import.md §2, §5, §6; synthesis D31–D37, U3).
// The file is read in the browser; nothing is uploaded.
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};

  function esc(v) { return A.esc(v); }
  function D() { return A.D; }
  function atr() { return FGP.auctionator; }
  function K() { return FGP.state.KEYS; }

  // Import state of this page session: {phase, fileName, size, result, realmKey, summary, error, notes, names}.
  A.imp = { phase: null, names: false };

  A.isKnown = function (id) { return A.own(D().items.rows, id) || A.own(D().mats.rows, id); };

  // Read bytes of an Auctionator file (picker, drop or tests). Imports directly when one realm is usable.
  A.importBytes = function (bytes, fileName, size) {
    var res = atr().readFile(bytes, { today: A.today, isKnown: A.isKnown, fileName: fileName });
    A.imp = { phase: res.ok ? "read" : "error", fileName: fileName || null, size: size === undefined ? bytes.length : size, result: res, realmKey: null,
      summary: null, notes: [], names: A.imp.names };
    if (!res.ok) return res;
    var cur = A.prices.imported, remembered = null;
    if (cur) res.realms.forEach(function (r) { if (r.label === cur.realm) remembered = r.key; });
    var pick = atr().defaultRealm(res.realms, remembered);
    A.imp.realmKey = pick ? pick.key : null;
    if (res.realms.filter(function (r) { return r.usable; }).length === 1 && pick) A.applyRealm(pick.key);
    return res;
  };

  // Store the chosen realm as the active set; the previous set goes to the undo slot (pricing §2.7, §6).
  A.applyRealm = function (key) {
    var res = A.imp.result, realm = res && res.realms.filter(function (r) { return r.key === key && r.usable; })[0];
    if (!realm) return false;
    var meta = D().meta, set = atr().toPriceSet(realm, { dataset: meta.dataset, build: meta.build, fileName: A.imp.fileName, importedAt: A.isoNow() });
    var notes = [];
    if (set.entries > atr().MAX_STORED_ROWS) { set = atr().filterRows(set, A.isKnown); notes.push("This file has very many prices; only the " + set.entries + " items this planner knows were kept."); }
    var prev = A.prices.imported;
    A.keepUndo(prev);
    if (!A.storageSet(K().prices, JSON.stringify(set))) {
      if (!set.filtered) {
        set = atr().filterRows(set, A.isKnown);
        notes.push("Browser storage is full, so only the " + set.entries + " items this planner knows were kept.");
      }
      if (!A.storageSet(K().prices, JSON.stringify(set))) notes.push("These prices could not be saved in this browser; they last until you reload.");
    }
    A.setImported(set);
    A.imp.phase = "done";
    A.imp.realmKey = key;
    A.imp.summary = atr().compareSets(prev, set);
    A.imp.notes = notes;
    return true;
  };

  // The one undo slot (pricing §2.7): the set before the last import, null for "no prices"; kept in memory too,
  // so a failed storage write never makes undo restore the wrong set.
  A.keepUndo = function (prev) {
    A.prices.undo = true;
    A.prices.undoSet = prev || null;
    if (!A.storageSet(K().pricesUndo, JSON.stringify(prev || null))) A.storageRemove(K().pricesUndo);
  };
  A.undoImport = function () {
    if (!A.prices.undo) return false;
    var prev = A.prices.undoSet && A.prices.undoSet.rows ? A.prices.undoSet : null;
    if (prev) A.storageSet(K().prices, JSON.stringify(prev)); else A.storageRemove(K().prices);
    A.storageRemove(K().pricesUndo);
    A.prices.undo = false;
    A.prices.undoSet = null;
    A.setImported(prev);
    A.imp = { phase: null, names: A.imp.names };
    return true;
  };

  A.clearImported = function () {
    if (!A.prices.imported) return;
    A.keepUndo(A.prices.imported);
    A.storageRemove(K().prices);
    A.setImported(null);
    A.imp = { phase: null, names: A.imp.names };
  };

  // Items and mats whose name (case-insensitive) or ID matches the text.
  A.findItems = function (text) {
    var t = String(text || "").trim().toLowerCase(), out = [];
    if (!t) return out;
    if (/^\d+$/.test(t)) return A.isKnown(t) ? [+t] : [];
    [D().items.rows, D().mats.rows].forEach(function (rows) {
      for (var id in rows) if (A.own(rows, id) && rows[id].name.toLowerCase() === t && out.indexOf(+id) < 0) out.push(+id);
    });
    return out;
  };

  // Set or clear an override (pricing §5.1): empty text removes it. Returns {ok, error}.
  A.setOverride = function (id, text) {
    var p = FGP.pricing.parseMoney(text);
    if (p.empty) { delete A.S.prices.overrides[id]; return { ok: true }; }
    if (p.error) return { ok: false, error: "Not a price. Use e.g. 1g 20s, 85s, 40c or a plain number of copper." };
    A.S.prices.overrides[id] = { c: p.copper, set: atr().isoDay(A.today) };
    return { ok: true };
  };

  // Redacted diagnostic (critique gap 14): format, counts, offsets; realm names and the file name only on opt-in.
  A.diagnostic = function (names) {
    var imp = A.imp, res = imp.result, lines = [];
    lines.push("Forever Gear Planner " + FGP.version.APP_VERSION + " · data " + D().meta.build + " (" + D().meta.status + ")");
    if (!res) return lines.concat(["no file read in this session"]).join("\n");
    lines.push("file: " + (names ? imp.fileName || "?" : "(name hidden)") + " · " + imp.size + " bytes" + (/\.bak$/i.test(imp.fileName || "") ? " · .bak backup" : ""));
    if (!res.ok) {
      lines.push("result: error " + res.error.code);
      if (res.detail) lines.push("detail: " + String(res.detail).replace(/unexpected name \S+/, "unexpected name (hidden)"));
    } else {
      lines.push("result: ok · Auctionator database version " + (res.dbVersion === null ? "unknown" : res.dbVersion) + " · " + res.realms.length + " realm key" + (res.realms.length === 1 ? "" : "s") + (names ? "" : " (names hidden)"));
      res.realms.forEach(function (r, i) {
        var parts = ["realm " + (i + 1) + (names ? " \"" + r.label + "\"" : ""), "format " + (r.format || "?")];
        if (r.error) parts.push("damaged: " + r.error);
        else {
          parts.push(r.entries + " entries", "skipped " + r.skipped.nonNumeric + " non-numeric, " + r.skipped.invalid + " invalid", r.known + " known to the planner");
          if (r.newestDay !== null) parts.push("newest scan " + atr().isoDay(r.newestDay) + " (" + A.plural(A.today - r.newestDay, "day") + " old)");
        }
        lines.push(parts.join(" · "));
      });
    }
    var warns = (res.warnings || []).map(function (w) { return w.code === "realm-damaged" && !names ? "realm-damaged" : w.code + (w.code === "old" || w.code === "version" || w.code === "unknown-items" ? " (" + w.text + ")" : ""); });
    if (warns.length) lines.push("warnings: " + warns.join("; "));
    return lines.join("\n");
  };

  // --- HTML ------------------------------------------------------------------------------------------------------

  function statusHtml() {
    var s = A.prices.imported, n = Object.keys(A.S.prices.overrides).length;
    var out = ['<div class="panel"><h2>Price sources</h2><dl class="kv">'];
    if (s) {
      var age = s.scanDay !== null && s.scanDay !== undefined ? A.today - s.scanDay : null, band = FGP.pricing.band(age);
      out.push("<dt>Imported</dt><dd>Auctionator file" + (s.fileName ? " <code>" + esc(s.fileName) + "</code>" : "") + ", realm " + esc(s.realm) + "</dd>");
      out.push("<dt>Scanned</dt><dd>" + (age === null ? "unknown" : esc(atr().isoDay(s.scanDay)) + ' <span class="age age-' + esc(band) + '">' + esc(age > 0 ? A.ageText(age) + " old" : "today") + " · " + esc(band) + "</span>") + "</dd>");
      out.push("<dt>Prices</dt><dd>" + esc(s.entries) + " items" + (s.filtered ? " (only items the planner knows)" : "") + (s.build && s.build !== D().meta.build ? ' <span class="badge b-warn">imported with data build ' + esc(s.build) + "</span>" : "") + "</dd>");
      out.push("<dt>Imported at</dt><dd>" + esc(s.importedAt || "?") + "</dd>");
    } else {
      out.push("<dt>Imported</dt><dd>none yet: every price shows “no price” until you import your Auctionator file or set your own.</dd>");
    }
    out.push("<dt>Your prices</dt><dd>" + esc(A.plural(n, "override")) + "</dd><dt>Precedence</dt><dd>your price › vendor › Auction House › craft cost of the mats</dd></dl>");
    out.push('<div class="actions" style="margin-top:8px">' +
      (A.prices.undo ? '<button type="button" class="btn" id="price-undo" data-act="price-undo">Undo last import</button>' : "") +
      (s ? '<button type="button" class="btn btn-quiet" id="price-clear" data-act="price-clear">Remove imported prices</button>' : "") + "</div>");
    out.push('<p class="muted small" style="margin-top:8px">' + esc(D().reference.notice.prices) + "</p></div>");
    return out.join("");
  }

  function importHtml() {
    var folder = atr().FOLDERS.live || atr().FOLDERS.beta, imp = A.imp, out = [];
    out.push('<div class="panel"><h2>Import your Auctionator file</h2><ol class="steps">' +
      "<li>In game, scan at the Auction House with Auctionator (a full scan, or searches for your mats).</li>" +
      "<li>Type <code>/reload</code> or log out. The file is only written then.</li>" +
      "<li>Open your WoW folder (Battle.net app → WoW: Forever → gear icon → <em>Show in Explorer</em>), then <code>" + esc(folder) +
      "</code> → <code>WTF</code> → <code>Account</code> → <code>&lt;your account folder&gt;</code> → <code>SavedVariables</code> → <code>Auctionator.lua</code>.</li>" +
      "<li>Pick it below or drop it here. <strong>The file is read in your browser. Nothing is uploaded.</strong></li></ol>");
    out.push('<div class="drop" id="price-drop" data-drop="prices"><p>Drop <code>Auctionator.lua</code> here, or</p>' +
      '<button type="button" class="btn btn-primary" id="price-pick" data-act="price-pick">Choose Auctionator file…</button></div>');
    if (imp.phase === "reading") out.push('<p class="muted">Reading…</p>');
    var res = imp.result;
    if (res) {
      var msgs = [];
      if (!res.ok) msgs.push('<li class="bad">' + esc(res.error.text) + "</li>");
      (res.warnings || []).forEach(function (w) { msgs.push('<li class="warn">' + esc(w.text) + "</li>"); });
      (imp.notes || []).forEach(function (t) { msgs.push('<li class="warn">' + esc(t) + "</li>"); });
      if (imp.phase === "done" && imp.summary) {
        var s = A.prices.imported;
        msgs.unshift("<li>Imported " + esc(s.entries) + " prices for realm " + esc(s.realm) + ": " + imp.summary.changed + " changed, " + imp.summary.added + " new, " + imp.summary.removed + " no longer in the file.</li>");
      }
      if (msgs.length) out.push('<ul class="msgs" role="status">' + msgs.join("") + "</ul>");
      if (res.ok && imp.phase === "read") {
        out.push('<fieldset><legend>Which realm?</legend><div class="realms">' + res.realms.map(function (r, i) {
          var id = "realm-" + i, info = r.usable ? r.entries + " prices, " + r.known + " used by the planner" + (r.newestDay !== null ? ", scanned " + atr().isoDay(r.newestDay) + " (" + A.ageText(A.today - r.newestDay) + ")" : "") : r.error ? "damaged" : "no prices";
          return '<label' + (r.usable ? "" : ' class="off"') + '><input type="radio" name="realm" id="' + id + '" value="' + i + '" data-change="realm"' + (r.key === imp.realmKey ? " checked" : "") + (r.usable ? "" : " disabled") +
            "> <strong>" + esc(r.label) + '</strong> <span class="muted small">' + esc(info) + "</span></label>";
        }).join("") + "</div>" + (res.realms.some(function (r) { return r.usable; }) ? '<button type="button" class="btn btn-primary" id="realm-use" data-act="realm-use">Use these prices</button>' :
          '<p class="err">No realm in this file has usable prices.</p>') + "</fieldset>");
      }
      out.push('<details class="section" id="diag"><summary>Diagnostic for a bug report</summary><p class="small muted">Copy this into an issue instead of attaching your file: your file holds character and realm names. ' +
        "Realm names and the file name are left out unless you tick the box.</p>" +
        '<label class="small"><input type="checkbox" id="diag-names" data-change="diag-names"' + (imp.names ? " checked" : "") + "> Include realm names and the file name</label>" +
        '<textarea class="diag" id="diag-text" readonly aria-label="Diagnostic text">' + esc(A.diagnostic(imp.names)) + "</textarea></details>");
    }
    out.push("</div>");
    return out.join("");
  }

  function overridesHtml() {
    var ov = A.S.prices.overrides, ids = Object.keys(ov).sort(function (a, b) { return A.itemName(a).localeCompare(A.itemName(b)); }), pr = A.pricer();
    var out = ['<div class="panel"><h2>Your prices</h2><p class="muted small">A price you set wins over vendor, Auction House and craft prices. Use it for mats you gather or items the scan missed.</p>'];
    out.push('<form class="frow" data-submit="override" novalidate><label for="ov-item">Item</label><input type="text" id="ov-item" name="item" list="ov-names" class="inp" size="28" value="' + esc(A.imp.ovItem || "") +
      '" placeholder="name or item ID" autocomplete="off"' + (A.imp.ovError ? ' aria-describedby="ov-err"' : "") + '><label for="ov-price">Price</label><input type="text" id="ov-price" name="price" class="inp" size="10" placeholder="1g 20s" value="' +
      esc(A.imp.ovPrice || "") + '"><button type="submit" class="btn" id="ov-set">Set price</button></form>' + (A.imp.ovError ? '<div class="err" id="ov-err">' + esc(A.imp.ovError) + "</div>" : ""));
    out.push('<datalist id="ov-names">' + datalist() + "</datalist>");
    if (!ids.length) out.push('<div class="empty">No prices of your own yet.</div>');
    else {
      out.push('<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Item</th><th class="num">Your price</th><th class="num">Market</th><th>Set</th><th></th></tr></thead><tbody>' + ids.map(function (id) {
        var m = pr.market(+id);
        return "<tr><td>" + A.itemLink(id) + '</td><td class="num">' + A.money(ov[id].c) + '</td><td class="num">' + A.priceHtml(m) + "</td><td>" + esc(ov[id].set || "") +
          '</td><td><button type="button" class="linkbtn" id="ov-clear-' + esc(id) + '" data-act="ov-clear" data-key="' + esc(id) + '" aria-label="Clear your price for ' + esc(A.itemName(id)) + '">clear</button></td></tr>';
      }).join("") + "</tbody></table></div>");
    }
    out.push("</div>");
    return out.join("");
  }

  var namesCache = null;
  function datalist() {
    if (namesCache) return namesCache;
    var seen = {}, names = [];
    [D().mats.rows, D().items.rows].forEach(function (rows) { for (var id in rows) if (A.own(rows, id) && !seen[rows[id].name]) { seen[rows[id].name] = 1; names.push(rows[id].name); } });
    namesCache = names.sort().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("");
    return namesCache;
  }

  A.views.prices = {
    html: function () {
      var out = [];
      if (!A.S.roster.entries.length) out.push('<p class="muted">No characters yet: <a href="#gear" id="goto-gear" data-act="view" data-key="gear">set up your roster</a> to see prices in a plan.</p>');
      out.push('<div class="cols">' + statusHtml() + importHtml() + "</div>");
      out.push('<div class="section">' + overridesHtml() + "</div>");
      return out.join("");
    },
  };

  // --- actions ---------------------------------------------------------------------------------------------------

  A.importFile = function (file) {
    if (file.size > atr().MAX_BYTES) {
      A.imp = { phase: "error", fileName: file.name, size: file.size, result: { ok: false, error: { code: "too-large", text: atr().MESSAGES["too-large"] }, warnings: [] }, names: A.imp.names };
      A.render();
      return;
    }
    A.imp = { phase: "reading", names: A.imp.names };
    A.render();
    A.readBytes(file, function (err, bytes) {
      if (err) {
        A.imp = { phase: "error", fileName: file.name, size: file.size, result: { ok: false, error: { code: "read", text: "The browser could not read this file." }, warnings: [] }, names: A.imp.names };
        A.render();
        return;
      }
      A.importBytes(bytes, file.name, file.size);
      A.commit(["price-pick"]);
    });
  };

  A.acts["price-pick"] = function () { A.pickFile(".lua,.bak", A.importFile); };
  A.changes.realm = function (el) {
    var r = A.imp.result && A.imp.result.realms[+el.value];
    if (r) A.imp.realmKey = r.key;
  };
  A.acts["realm-use"] = function () { if (A.applyRealm(A.imp.realmKey)) A.commit(["price-pick"]); };
  A.acts["price-undo"] = function () { if (A.undoImport()) { A.commit(["price-pick"]); A.toast(A.prices.imported ? "Previous prices restored" : "Import undone: no imported prices"); } };
  A.acts["price-clear"] = function () {
    A.clearImported();
    A.commit(["price-pick"]);
    A.toast("Imported prices removed", { label: "Undo", fn: function () { A.undoImport(); A.commit(["price-pick"]); } });
  };
  A.changes["diag-names"] = function (el) { A.imp.names = !!el.checked; A.render(); };
  A.submits.override = function (f) {
    var item = f.elements.namedItem("item").value, price = f.elements.namedItem("price").value, ids = A.findItems(item);
    A.imp.ovItem = item; A.imp.ovPrice = price; A.imp.ovError = null;
    if (!ids.length) { A.imp.ovError = "No item or material with that name or ID."; A.commit(["ov-item"]); return; }
    for (var i = 0; i < ids.length; i++) {
      var r = A.setOverride(ids[i], price);
      if (!r.ok) { A.imp.ovError = r.error; A.commit(["ov-price"]); return; }
    }
    A.imp.ovItem = ""; A.imp.ovPrice = "";
    A.pricesChanged();
    A.commit(["ov-item"]);
    A.toast(String(price).trim() ? "Your price for " + A.itemName(ids[0]) + " is set" : "Your price for " + A.itemName(ids[0]) + " is cleared");
  };
  A.acts["ov-clear"] = function (el) {
    var id = el.getAttribute("data-key"), before = A.S.prices.overrides[id];
    delete A.S.prices.overrides[id];
    A.commit(["ov-item"]);
    A.toast("Your price for " + A.itemName(id) + " is cleared", { label: "Undo", fn: function () { A.S.prices.overrides[id] = before; A.commit(["ov-item"]); } });
  };

  // Drop zone (pricing §2.2): dragover must preventDefault for the drop to fire; works from file://.
  A.boots = A.boots || [];
  A.boots.push(function () {
    var d = root.document;
    function zone(ev) { return ev.target.closest && ev.target.closest("[data-drop]"); }
    function files(ev) { return ev.dataTransfer && [].indexOf.call(ev.dataTransfer.types || [], "Files") >= 0; }
    // A file dropped anywhere else must not replace the page with the file.
    d.addEventListener("dragover", function (ev) {
      var z = zone(ev);
      if (z) { ev.preventDefault(); z.classList.add("over"); }
      else if (files(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = "none"; }
    });
    d.addEventListener("dragleave", function (ev) { var z = zone(ev); if (z) z.classList.remove("over"); });
    d.addEventListener("drop", function (ev) {
      var z = zone(ev);
      if (!z) { if (files(ev)) ev.preventDefault(); return; }
      ev.preventDefault();
      z.classList.remove("over");
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) A.importFile(f);
    });
  });
})(this);
