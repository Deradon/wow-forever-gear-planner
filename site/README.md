# site/

The published page: plain static files served as-is by GitHub Pages and usable from `file://`. Classic
`<script>` tags only (no ES modules, no `fetch`), relative paths only.

- `index.html`, `style.css`: the page and its themes; scripts load in the fixed order `data/forever/*.js`, `lib/*.js`,
  `app/*.js`, after a pre-paint theme script.
- `lib/`: pure modules (no DOM, no storage), loadable by `<script>` and by `require()` in tests; globals under `window.FGP`
- `app/`: DOM code under `window.FGP.app`: `main.js` (boot, data and schema check, storage, render loop with focus
  restore, toasts, dialogs, keyboard shortcuts), `onboarding.js` (empty state, entry form, example roster),
  `gear.js` (Gear view; `gearModel` is pure), `queue.js` (Queue view over `lib/queue.js`), `prices.js` (Auctionator import, your prices, diagnostic), `about.js`
  (data, coverage, export/import/reset), `tooltip.js` (offline tooltips, source badges, Wowhead links).
- `data/`: generated game data

Views return HTML strings and actions are plain functions on `FGP.app`, so `tests/js/site-app.test.js` runs them in
Node without a DOM; the browser adds only event wiring, focus and drag-and-drop. See docs/ui.md and docs/roadmap.md §M1, §M2.
