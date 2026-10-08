# Notice

forever-gear-planner is an unofficial fan project. It is not affiliated with, endorsed, sponsored or approved by
Blizzard Entertainment.

- **Game data.** Item, recipe, spell and related game data in `site/data/` is derived from World of Warcraft client
  data. That data, the game's names and texts, and World of Warcraft®, Warcraft® and Blizzard Entertainment® are
  trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries. The MIT
  license in `LICENSE` covers this project's code, curation files and documentation, not Blizzard's data.
- **Data source.** Client database tables are read from [wago.tools](https://wago.tools) exports at build time;
  raw tables are not redistributed in this repository (apart from a few dozen rows cut for the tests in
  `tests/fixtures/`).
- **Icon names.** Icon file names come from the [wowdev community listfile](https://github.com/wowdev/wow-listfile),
  fetched at build time and not redistributed; only the names of the icons the data uses are shipped.
- **Icons.** With the opt-in icon switch on, the page loads icon images from Wowhead's image host
  (`wow.zamimg.com`). The images are Blizzard's game art; they are not copied into this repository.
- **Curation.** Files in `curation/` record facts (which vendor sells a pattern, which reputation it needs) with
  citations; they do not copy text from third-party sites.
- **Links.** The page links to [Wowhead](https://www.wowhead.com/forever/) item pages. No third-party content is
  loaded unless the user switches icons on, and the planner works offline.
- **Prices.** Imported Auction House prices are read from the user's own Auctionator file inside the browser and are
  never uploaded.
