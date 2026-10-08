# site/

The published page: plain static files served as-is by GitHub Pages and usable from `file://`. Classic
`<script>` tags only (no ES modules, no `fetch`), relative paths only.

- `index.html`, `style.css`
- `lib/`: pure modules (no DOM, no storage), loadable by `<script>` and by `require()` in tests; globals under `window.FGP`
- `app/`: DOM code (views, onboarding, tooltips)
- `data/`: generated game data

Nothing here yet. See docs/ui.md and the M1 file list in docs/roadmap.md.
