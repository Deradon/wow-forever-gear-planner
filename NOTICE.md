# Notice

forever-gear-planner is an unofficial fan project. It is not affiliated with, endorsed, sponsored or approved by
Blizzard Entertainment.

- **Game data.** Item, recipe, spell and related game data in `site/data/` is derived from World of Warcraft client
  data. That data, the game's names and texts, and World of Warcraft®, Warcraft® and Blizzard Entertainment® are
  trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries. The MIT
  license in `LICENSE` covers this project's code, curation files and documentation, not Blizzard's data.
- **Data source.** Client database tables are read from [wago.tools](https://wago.tools) exports at build time;
  raw tables are not redistributed in this repository.
- **Curation.** Files in `curation/` record facts (which vendor sells a pattern, which reputation it needs) with
  citations; they do not copy text from third-party sites.
- **Links.** The page may link to third-party sites such as Wowhead. No third-party content is loaded unless the
  user opts in, and the planner works offline.
- **Prices.** Imported Auction House prices are read from the user's own Auctionator file inside the browser and are
  never uploaded.
