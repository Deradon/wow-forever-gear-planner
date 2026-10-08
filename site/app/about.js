// About: data freshness, the beta notice, source coverage per level band and faction, data notes and citations,
// and "Your data": storage status, export, import, reset, orphans and the privacy statement (docs/ui.md §9,
// §10.6, §10.7; synthesis D20, D35, D37).
(function (root) {
  "use strict";

  var FGP = root.FGP = root.FGP || {};
  var A = FGP.app = FGP.app || {};
  var BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60]];

  function esc(v) { return A.esc(v); }
  function D() { return A.D; }

  // Share of gear recipes (obtainable items) whose sources for a faction include a known kind, per level band.
  A.coverage = function () {
    if (A.memo.coverage) return A.memo.coverage;
    var out = { alliance: BANDS.map(function () { return { known: 0, total: 0 }; }), horde: null };
    out.horde = BANDS.map(function () { return { known: 0, total: 0 }; });
    var rows = D().recipes.rows;
    for (var spell in rows) {
      if (!A.own(rows, spell) || rows[spell].kind !== "gear") continue;
      var it = D().items.rows[rows[spell].item];
      if (!it || it.avail === "unobtainable") continue;
      var b = Math.min(BANDS.length - 1, Math.max(0, Math.floor((Math.max(1, it.req) - 1) / 10)));
      var src = D().sources.rows[spell] || [];
      ["alliance", "horde"].forEach(function (f) {
        var known = src.some(function (e) { return (e.side === "both" || e.side === f) && e.kind !== "unknown" && e.kind !== "unobtainable"; });
        out[f][b].total++;
        if (known) out[f][b].known++;
      });
    }
    A.memo.coverage = out;
    return out;
  };

  A.exportObject = function (includePrices) {
    return FGP.state.exportState(A.S, { now: A.isoNow(), dataBuild: D().meta.build, includePrices: !!includePrices, priceSet: A.prices.imported });
  };
  A.exportFile = function () {
    var obj = A.exportObject(A.exportPrices);
    A.download(FGP.state.exportFileName(A.isoNow().slice(0, 10)), JSON.stringify(obj, null, 1));
    A.toast("Exported " + A.plural(A.S.roster.entries.length, "character"));
  };

  // Parse a planner export (text); returns {ok, error, obj, summary}.
  A.readExport = function (text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: "This is not a planner export (not JSON)." }; }
    var v = FGP.state.validateImport(obj);
    return { ok: v.ok, error: v.error, obj: obj, summary: v.summary };
  };

  // Replace the state with an import (after the user confirmed); prices included in the file become the active set.
  A.applyImport = function (obj) {
    var res = FGP.state.importState(obj, A.ctx);
    A.S = res.state;
    A.form = null;
    A.dataUpdate = FGP.state.dataChanged(A.S, D().meta) && A.S.seen.build ? { from: A.S.seen.build, to: D().meta.build } : null;
    if (!A.S.seen.build) A.S.seen = { build: D().meta.build, generated: D().meta.generated };
    if (res.importedPrices && res.importedPrices.rows) {
      A.storageSet(FGP.state.KEYS.pricesUndo, JSON.stringify(A.prices.imported || null));
      A.storageSet(FGP.state.KEYS.prices, JSON.stringify(res.importedPrices));
      A.prices.undo = true;
      A.setImported(res.importedPrices);
    }
    A.memo.paths = {};
    return res;
  };

  A.resetState = function () {
    A.S = FGP.state.reset(A.S);
    A.S.seen = { build: D().meta.build, generated: D().meta.generated };
    A.dataUpdate = null;
    A.form = null;
    A.memo.paths = {};
  };

  function sizeOf(key) {
    var t = A.storageGet(key);
    return t === null ? null : t.length;
  }
  function kb(n) { return n === null ? "—" : n < 1024 ? n + " characters" : (n / 1024).toFixed(1) + " K characters"; }

  A.views.about = {
    html: function () {
      var meta = D().meta, ref = D().reference, out = [];
      out.push('<div class="cols">');
      out.push('<div class="panel"><h2>Data</h2><dl class="kv">' +
        "<dt>Build</dt><dd>" + esc(meta.build) + " (" + esc(meta.status) + ", " + esc(meta.product) + ")</dd>" +
        "<dt>Generated</dt><dd>" + esc(meta.generated) + " by " + esc(meta.generator) + "</dd>" +
        "<dt>Contents</dt><dd>" + esc(meta.counts.items) + " items, " + esc(meta.counts.recipes) + " recipes, " + esc(meta.counts.mats) + " materials, levels " + esc(meta.levels.join("–")) + "</dd>" +
        "<dt>Prices</dt><dd>" + (A.prices.imported ? "Auctionator file, scan " + esc(A.prices.imported.scanDay !== null ? FGP.auctionator.isoDay(A.prices.imported.scanDay) : "?") : "none imported") + "</dd>" +
        "<dt>Page</dt><dd>version " + esc(FGP.version.APP_VERSION) + ", state schema " + esc(FGP.state.SCHEMA) + "</dd></dl>" +
        '<p style="margin-top:8px">' + esc(ref.notice.beta.replace("{build}", meta.build)) + "</p><p>" + esc(ref.notice.derived) + "</p>" +
        '<h3 style="margin-top:10px">Data notes</h3><ul>' + ref.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></div>");

      var cov = A.coverage(), mine = A.S.roster.faction;
      out.push('<div class="panel"><h2>Recipe sources</h2><p>' + esc(ref.coverage.sources) + "</p><p>" + esc(ref.coverage.unknown) + "</p>" +
        '<div class="tbl-wrap"><table><caption class="sr">Share of gear recipes with a known source</caption><thead><tr><th>Item level band</th><th class="num">Alliance</th><th class="num">Horde</th></tr></thead><tbody>' +
        BANDS.map(function (b, i) {
          function cell(f) { var c = cov[f][i]; return '<td class="num' + (f === mine ? " route-bold" : "") + '">' + (c.total ? Math.round(c.known / c.total * 100) + " %" : "—") + ' <span class="faint small">of ' + c.total + "</span></td>"; }
          return "<tr><td>" + b[0] + "–" + b[1] + "</td>" + cell("alliance") + cell("horde") + "</tr>";
        }).join("") + '</tbody></table></div><p class="small muted" style="margin-top:6px">' + esc(ref.coverage.horde) + "</p>" +
        '<h3 style="margin-top:10px">Sources cited</h3><ul class="small">' + Object.keys(ref.cites).map(function (k) {
          var c = ref.cites[k];
          return "<li><strong>" + esc(k) + "</strong>: " + (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.label) + "</a>" : esc(c.label)) + "</li>";
        }).join("") + "</ul></div>");
      out.push("</div>");

      var st = A.store, orph = FGP.state.orphans(A.S, D()), nOrph = orph.items.length + orph.recipes.length;
      out.push('<div class="panel section"><h2>Your data</h2><dl class="kv">' +
        "<dt>Storage</dt><dd>" + (st.ok ? "this browser (localStorage)" : '<span class="err">blocked: changes are lost on reload; use Export</span>') + (st.readOnly ? ' · <span class="err">read-only (saved by a newer page)</span>' : "") + "</dd>" +
        "<dt>Planner state</dt><dd>" + esc(kb(sizeOf(FGP.state.KEYS.state))) + " · " + esc(A.plural(A.S.roster.entries.length, "character")) + ", " + esc(A.plural(Object.keys(A.S.items).length, "tracked item")) +
        ", " + esc(A.plural(Object.keys(A.S.prices.overrides).length, "price override")) + "</dd>" +
        "<dt>Imported prices</dt><dd>" + esc(kb(sizeOf(FGP.state.KEYS.prices))) + "</dd>" +
        (nOrph ? "<dt>No longer in the data</dt><dd>" + esc(A.plural(nOrph, "entry", "entries")) + ": " + orph.items.concat(orph.recipes).map(esc).join(", ") + "</dd>" : "") + "</dl>" +
        '<div class="actions" style="margin-top:10px"><button type="button" class="btn" id="export-state" data-act="export-state">Export planner file</button>' +
        '<label class="small"><input type="checkbox" id="export-prices" data-change="export-prices"' + (A.exportPrices ? " checked" : "") + (A.prices.imported ? "" : " disabled") + "> include imported prices</label>" +
        '<button type="button" class="btn" id="import-state" data-act="import-state">Import planner file…</button>' +
        '<button type="button" class="btn btn-danger right" id="reset-state" data-act="reset-state">Reset…</button></div>' +
        '<p class="small muted" style="margin-top:10px">Nothing leaves your browser: no account, no upload, no tracking. Your Auctionator file is read here and never sent anywhere. ' +
        "Item names link to Wowhead; nothing loads from there unless you click a link. A planner file contains your roster, labels and progress.</p></div>");
      return out.join("");
    },
  };

  // --- actions ---------------------------------------------------------------------------------------------------

  A.acts["export-state"] = function () { A.exportFile(); };
  A.changes["export-prices"] = function (el) { A.exportPrices = !!el.checked; };
  A.acts["import-state"] = function () {
    A.pickFile(".json,application/json", function (file) {
      A.readBytes(file, function (err, bytes) {
        var r = err ? { ok: false, error: "The browser could not read this file." } : A.readExport(new root.TextDecoder("utf-8").decode(bytes));
        if (!r.ok) { A.dialog({ title: "Can't import this file", body: "<p>" + esc(r.error) + "</p>", buttons: [{ label: "OK", id: "dlg-ok" }], focus: "dlg-ok" }); return; }
        var s = r.summary;
        A.dialog({
          title: "Replace your planner data?",
          body: "<p>The file has " + esc(A.plural(s.entries, "character")) + ", " + esc(A.plural(s.items, "tracked item")) + ", " + esc(A.plural(s.recipes, "recipe mark")) + " and " +
            esc(A.plural(s.overrides, "price override")) + (s.importedPrices ? ", plus imported prices" : "") + ". Exported " + esc(s.exported || "?") + " with data build " + esc(s.dataBuild || "?") + ".</p>" +
            "<p>It replaces everything the planner holds now" + (A.S.roster.entries.length ? " (" + esc(A.plural(A.S.roster.entries.length, "character")) + ")" : "") + ".</p>",
          buttons: [{ label: "Cancel", id: "dlg-cancel" }, { label: "Replace current data", id: "dlg-replace", cls: "btn-primary", fn: function () {
            A.applyImport(r.obj);
            A.save();
            A.focusNext = A.S.roster.entries.length ? ["card-" + A.S.prefs.selected] : ["start-one"];
            A.go("gear");
            A.toast("Imported " + A.plural(A.S.roster.entries.length, "character"));
          } }],
          focus: "dlg-cancel",
        });
      });
    });
  };
  A.acts["reset-state"] = function () {
    A.dialog({
      title: "Delete all characters and progress?",
      body: "<p>This removes your roster, tracked items, recipe marks and your own prices from this browser. Export first if you want a backup. " +
        "Theme and imported Auctionator prices stay.</p>",
      buttons: [{ label: "Export first", id: "dlg-export", fn: function () { A.exportFile(); A.acts["reset-state"](); } },
        { label: "Cancel", id: "dlg-cancel" },
        { label: "Delete everything", id: "dlg-reset", cls: "btn-danger", fn: function () { A.resetState(); A.commit(["reset-state"]); A.toast("Planner reset"); } }],
      focus: "dlg-cancel",
    });
  };
})(this);
