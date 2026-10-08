# Session briefs

Handoff prompts for implementation sessions, one file per session, named `YYYY-MM-DD-<slug>.md` with the date the
brief was written. A brief is the complete specification a fresh session starts from; it points at the design
documents instead of repeating them. The orchestrating session that wrote it stays reachable for decisions.

A brief is launched with the command in its closing chat message, from the repo root, e.g.
`claude --model opus --effort high --permission-mode auto "$(cat docs/briefs/<file>)"`.

| Brief | Scope | Status |
|---|---|---|
| [2026-10-08-m1-pipeline-data-ranking.md](2026-10-08-m1-pipeline-data-ranking.md) | M1 part 1: Node pipeline, curation, generated data, ranking library, tests | done (3684cbb) |
| [2026-10-08-m1-page.md](2026-10-08-m1-page.md) | M1 part 2: the static page in `site/` (onboarding, Gear view, Prices, About), site-static test | done (51f5bb5) |
| [2026-10-08-p1-publish.md](2026-10-08-p1-publish.md) | P1: weapon-rule corrections, opt-in icons, Node privacy check, re-authored history, GitHub push, Actions, Pages, `v0.1.0` | done (9c70cf7, `v0.1.0`) |
