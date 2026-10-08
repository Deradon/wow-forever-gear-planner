# Pricing and Auctionator import

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: pricing / import engineer. Scope: how the public planner gets material and item prices (Auctionator file
import in the browser, a shipped default list, manual overrides, owned mats), how it stores them, how it derives unit
and craft costs, and how all of it is tested. The UI only sees one function (as `vision-scope.md` asks):

```js
price(itemId) → { copper, source, day, qty, age, stale } | null
// source: "override" | "vendor" | "ah" (imported) | "default" (shipped list) | "craft"
```

Everything here runs in the page, from `file://` and from GitHub Pages, without a build step or dependencies.

## 1. What the Auctionator file looks like (measured)

Measured on the original user's Forever beta file, read-only, with Auctionator version 340 (its TOC lists interface
16001, i.e. Forever). No prices or realm names are reproduced here; the numbers are shape facts.

### 1.1 The file

| Fact | Value |
|---|---|
| File | `Auctionator.lua`, one per WoW account (not per character), in the account's saved-variables folder |
| Size | 232,503 bytes, of which 222,257 are the `AUCTIONATOR_PRICE_DATABASE` statement |
| Line endings | CRLF (510 lines). No BOM. |
| Globals | 8 statements `NAME = value`: `AUCTIONATOR_CONFIG`, `_SAVEDVARS`, `_SHOPPING_LISTS`, `_PRICE_DATABASE`, `_POSTING_HISTORY`, `_VENDOR_PRICE_CACHE`, `_RECENT_SEARCHES`, `_SELLING_GROUPS` |
| Tokens outside strings (whole file) | `{ } [ ] = ,`, `true`, `false`, `nil`, decimal integers, 6 decimal floats. No negative numbers, no comments, no array-style (keyless) fields in this file; other saved-variables files use `-- [n]` comments, so the parser accepts them. |
| Written | Only on logout or `/reload` (also true for every WoW saved-variables file). A scan is invisible to the file until then. |

The price database statement has exactly three lines inside the braces:

```lua
AUCTIONATOR_PRICE_DATABASE = {
["__dbversion"] = 8,
["<realm key>"] = "<219,032-byte CBOR blob as a Lua string literal>",
}
```

### 1.2 Realm keys

- One realm key in the measured file. It is a **ruleset name, not `<Realm> <Faction>`**. Auctionator's
  source explains why: Forever loads Auctionator's "modern AH" code path, whose `GetConnectedRealmRoot()` returns
  `GetRegionalRulesetName()` when the client reports regionally unique realm names, else the alphabetically first
  connected realm. The legacy-AH path (Classic Era style) returns `"<Realm> <Faction>"`.
- Consequence: on Forever, one key likely covers a whole ruleset (and both factions, since there is no faction
  suffix). That is weak evidence for a cross-faction AH, not proof (Auctionator mirrors Retail here). Other flavors'
  files, or a file after realm changes, can hold several keys of either shape. The key `__dbversion` is not a realm.

### 1.3 The Lua string literal

Blizzard's saved-variables writer emits strings **byte for byte** and escapes only five things. Counted inside the
price database statement:

| Escape | Count | Byte |
|---|---|---|
| `\n` | 437 | 0x0A |
| `\r` | 389 | 0x0D |
| `\"` | 136 | 0x22 |
| `\\` | 93 | 0x5C |
| `\000` | 700 | 0x00, always three digits |

Everything else is raw: 34,048 raw control bytes (every value 0x01–0x1F except 0x0A and 0x0D), 22,863 raw bytes
≥ 0x80, and 0x7F. Two traps follow from that:

1. **The file is not text.** Reading it with `readAsText`/`file.text()` decodes it as UTF-8 and turns invalid
   sequences into U+FFFD, destroying the CBOR. It must be read as bytes (`ArrayBuffer`) and parsed as bytes.
2. **`\000` is followed by a digit in 700 of 700 cases** (CBOR length and integer bytes such as `D2471` follow NULs).
   Lua's rule is "up to three decimal digits", so a greedy 1–3 digit read is correct; a reader that takes one digit
   after `\` would turn `\0002` into byte 2.

### 1.4 The CBOR blob

The blob is RFC 8949 CBOR written by Blizzard's `C_EncodingUtil.SerializeCBOR`. A full walk (219,032 of 219,032 bytes
consumed) found:

| CBOR feature | Used? | Count / note |
|---|---|---|
| Major type 0 (unsigned int) | yes | 23,967; argument sizes: immediate 6,729, 1-byte 4,694, 2-byte 11,885, 4-byte 659; no 8-byte |
| Major type 1 (negative int) | no | |
| Major type 2 (**byte string**) | yes | 38,167: every string (item IDs, field names, day keys) |
| Major type 3 (text string) | **no** | (LibCBOR, the fallback encoder, would use it, see below) |
| Major type 4 (array) | yes | 2,207, all empty: an empty Lua table is written as `[]` (0x80) |
| Major type 5 (map) | yes | 11,994; the root has 3,551 entries (2-byte length), entries have 1–4 |
| Major type 6 (tags) | no | |
| Major type 7 (floats, true/false/null) | no | |
| Indefinite lengths | no | |
| Map keys | all byte strings | no integer keys |

Decoded root: a map of 3,550 item entries plus one `version` → `2` pair (Auctionator's per-realm format marker).
Every item key is a decimal item ID (range 35 to 286,981). No `g:<id>:<ilvl>` (modern-AH gear by item level ≥ 168),
`gr:<id>:<suffix>` (legacy-AH random-suffix gear) or `p:<species>` (battle pet) keys occurred, but Auctionator writes
them in other situations, so the importer skips any non-numeric key and counts it.

Entry shape (all 3,550 entries have exactly these four keys):

```js
{ m: 1234,                       // last seen minimum buyout, copper per unit
  h: { "2469": 1500, "2471": 1234 },  // per day: highest of that day's minimum prices
  l: { "2469": 1100 } | [],      // per day: lowest minimum price, only stored when below h; [] when empty
  a: { "2469": 12, "2471": 7 } } // per day: highest quantity seen in one scan that day
```

Measured: `a` has 1 day in 375 entries, 2 in 505, 3 in 2,670; `l` is the empty array in 2,207 entries. Values of
`m` fit in 4 bytes everywhere (largest has 10 decimal digits, i.e. a troll listing in the 100k-gold range); 3,372 of
3,550 fit in 2 bytes. Average 61.7 CBOR bytes per entry. 18 % of entries were seen with quantity ≤ 1.

### 1.5 What the numbers mean (from Auctionator's source)

- Day keys are **days since 2020-01-01 00:00 local time**: `floor((time() - time{2020,1,1,0}) / 86400)`, as decimal
  strings. Day 2471 = 2026-10-07, matching the scan date. Auctionator itself renders a day as
  `day * 86400 + SCAN_DAY_0`. In JS: `Math.floor((Date.now() - new Date(2020, 0, 1)) / 86400000)` (local midnight;
  the DST hour is irrelevant at day resolution).
- `m` is overwritten by every scan or search that sees the item, so it belongs to the newest day in `h`
  (Auctionator's own `GetPriceAge` uses `h`). `a[day]` is the maximum over that day's scans of the summed quantity of
  all listings. Prices are per unit (commodities are listed per unit on the modern AH).
- Days at or before "today − 21" are pruned (option `PRICE_HISTORY_DAYS`, default 21), but only when that item is
  seen again. An entry can therefore carry only old days.
- On logout Auctionator serializes the current realm with `C_EncodingUtil.SerializeCBOR`; other realms are
  serialized at login. **On clients without `C_EncodingUtil`** the current realm stays a plain Lua table in the file
  and other realms use LibCBOR (text strings for strings, float64 for non-integers, `[]` for empty tables, definite
  lengths). Forever has `C_EncodingUtil` (the measured file is all CBOR), but the importer handles both: the table
  form comes for free from the Lua parser, and LibCBOR's features cost ~10 lines.
- The `/atr` option that disables the price database leaves `AUCTIONATOR_PRICE_DATABASE = nil`.

## 2. Browser import flow

### 2.1 Where players find the file

UI text (the real folder names are spelled out in the UI; this document uses placeholders):

> 1. In game, scan at the auction house with Auctionator (a full scan, or searches for your mats).
> 2. Type `/reload` or log out. The file is only updated then.
> 3. Open your WoW folder (Battle.net app → WoW: Forever → gear icon → *Show in Explorer*), then
>    `<Forever folder>` → `<settings folder>` → `Account` → `<your account folder>` → `<saved-variables folder>` →
>    **`Auctionator.lua`**.
> 4. Pick it below or drop it here. **The file is read in your browser. Nothing is uploaded.**

- `<Forever folder>` is `_classic_beta_` on the beta (product `wow_classic_beta`, executable `WowB.exe`). The live
  folder name is **unknown until 2026-11-05** (open question 1). The text is one constant in the import module.
- `<your account folder>` is a number with a `#1`/`#2` suffix on Battle.net accounts (one per WoW license), or an
  upper-case account name on old accounts. Players with two licenses have two files (see merge, §2.7).
- `Auctionator.lua.bak` (the client's backup) is accepted with a note ("this is the backup from the previous
  session").

### 2.2 Picking and reading

- `<input type="file" accept=".lua,.bak">` plus a drop zone (`dragover` → `preventDefault`, `drop` →
  `e.dataTransfer.files[0]`). Both work from `file://` and on GitHub Pages. No `fetch`, no Web Worker (Chromium refuses
  `new Worker()` for `file://` scripts), no File System Access API in v1 (Chromium-only).
- Read with `file.arrayBuffer()` (falls back to `FileReader.readAsArrayBuffer` where missing), wrap in `Uint8Array`.
  Never as text (§1.3).
- Reject files over 64 MB before reading ("This is too large for an Auctionator file"). The measured file is 0.23 MB;
  a Retail file with many connected realms can reach tens of MB.
- Cost: the validated prototype (below) parses the measured file in 7 ms and decodes its CBOR in 11 ms (Node 24).
  Main-thread parsing is fine up to ~20 MB; show a "Reading…" state anyway.

### 2.3 The Lua literal reader (no Lua interpreter)

A saved-variables file is a list of assignments whose right-hand sides are table constructors. Grammar subset (EBNF):

```
file    = { ws Name ws "=" value } ws EOF
value   = ws ( string | number | "true" | "false" | "nil" | table )
table   = "{" ws [ field { sep field } [ sep ] ] ws "}"
field   = "[" value ws "]" ws "=" value      (* ["key"] = v  or  [1] = v *)
        | Name ws "=" value                   (* key = v *)
        | value                               (* positional: v, -- [1] *)
sep     = ws ( "," | ";" )
string  = '"' { char | escape } '"' | "'" { char | escape } "'"
escape  = "\" ( digit [digit [digit]] | "n" | "r" | "t" | "a" | "b" | "f" | "v" | "\" | '"' | "'" | newline )
number  = [ "-" ] ( decimal [ "." digits ] [ exponent ] | "0x" hexdigits )
ws      = { " " | TAB | CR | LF | "--" comment-to-end-of-line | "--[[" … "]]" | "--[=[" … "]=]" }
```

- Strings are returned as `Uint8Array` (bytes), never JS strings, so CBOR survives. `\ddd` reads up to three digits
  greedily and rejects values > 255. Any raw byte other than the closing quote and LF is taken literally.
- Not supported, each with an error naming the byte offset: long strings `[[…]]`, `\x`/`\z`/`\u` escapes (Lua 5.2+;
  WoW is 5.1), expressions, function calls. None appear in WoW-written files.
- Tables become `Map`s with string keys (`String(k)` for numeric keys; byte-string keys decoded as Latin-1, which is
  lossless for ASCII item IDs). Realm keys for display are decoded from their bytes with `TextDecoder("utf-8")`
  (realm names can be non-ASCII).
- The reader parses the file sequentially and keeps only `AUCTIONATOR_PRICE_DATABASE`. If parsing fails in an
  unrelated global, it retries from the first line that starts with `AUCTIONATOR_PRICE_DATABASE = ` (a fallback
  against unexpected tokens in other addons' sections; a CBOR blob containing that exact line-start sequence is
  astronomically unlikely and would still parse correctly via the first path).
- Size: the prototype reader is **85 lines** of plain JS.

### 2.4 The CBOR decoder

Spec (a subset of RFC 8949, enough for both Blizzard's encoder and LibCBOR):

| Initial byte | Handling |
|---|---|
| MT 0, 1 | integer; argument immediate / 1 / 2 / 4 / 8 bytes big-endian; 8-byte values above 2^53 rejected |
| MT 2 | byte string → JS string via Latin-1 (keys and field names are ASCII) |
| MT 3 | text string → `TextDecoder("utf-8")` |
| MT 4 | array (definite length) → JS array |
| MT 5 | map (definite length) → `Map`, keys `String(key)` |
| MT 6 | tag: ignored, the tagged item is returned |
| MT 7 | 20 false, 21 true, 22/23 null, 25 half, 26 float32, 27 float64; anything else rejected |
| AI 28–30, AI 31 | rejected: "reserved" / "indefinite length not supported" (neither encoder emits them) |

Guards: bounds check before every read ("truncated at byte N"), nesting depth ≤ 32, no trailing bytes after the root
item. Size: the prototype decoder is **39 lines**. It decodes the measured blob to exactly what `cbor2` (the
prototype's Python reference) produces: a hash over all 3,550 `(id, m, days, quantities)` rows matched.

### 2.5 From decoded data to a price set

```
for each realm key k ≠ "__dbversion":
    v = db.get(k)
    data = v instanceof Uint8Array ? decodeCbor(v) : v      // Lua-table form (no C_EncodingUtil)
    for each (id, e) in data:
        skip id == "version"; skip non-numeric ids (count g:/gr:/p: separately)
        days = keys of e.h (fallback: keys of e.a); last = max(days)   // [] means no days
        reject entry if m is not a finite integer > 0
        rows[id] = [m, last, a[last] ?? null]
```

Result per realm: `{ key, label, rows, entries, skipped, newestDay, oldestDay }`.

### 2.6 Validation and messages

| Condition | Message (shortened) | Action |
|---|---|---|
| Not parseable as Lua literals | "This isn't a saved-variables file. Pick `Auctionator.lua` from the saved-variables folder (step 3)." | stop |
| No `AUCTIONATOR_PRICE_DATABASE` | "This file has no Auctionator price data. Is it another addon's file?" | stop |
| It is `nil` | "Auctionator's price database is switched off (`/atr` options) or empty." | stop |
| `__dbversion` ≠ 8 | "Auctionator database version N; this importer knows 8. Trying anyway." | warn, continue |
| No realm keys | "No prices yet: scan at the AH, then `/reload` and pick the file again." | stop |
| CBOR error in one realm | "Prices for realm X are damaged (truncated at byte N) and were skipped." | skip realm |
| A realm with 0 usable entries | listed greyed out | not selectable |
| 0 entries match items the planner knows | "None of these N prices are for items this planner knows. Is this a Forever file?" | warn, allow |
| Newest day > today + 1 | "This scan is dated in the future; check your PC clock." | warn |
| Newest day older than 21 days | "These prices are N days old." | warn |

The success summary shows, per realm: label, entries, items used by the planner (mats / crafted items), newest scan
date and age, and after import "312 prices changed, 40 new, 18 no longer in the file".

### 2.7 Realm selection, replace vs merge

- One realm key: imported directly after the summary. Several: radio list, preselected the one with the newest scan
  day, else the most entries; the last chosen key is remembered and preselected next time.
- One imported price set is active at a time. **Replace** is the only v1 mode: an Auctionator file is already
  cumulative (21 days of history, last price per item), so a re-import supersedes the previous one. Merge (per item,
  newer `day` wins) is the one-line future answer for "two WoW licenses, two files"; it is not needed for the common
  case and doubles the states the UI must explain.
- The previous set is kept as one undo slot ("Undo import") until the next import.

## 3. Price model

### 3.1 Sources and precedence

For an item ID, `price(id)` resolves in this order:

1. **Override** (§5): the player's typed price. Always wins.
2. **Vendor**: the item is a vendor good per game data → `BuyPrice / VendorStackCount`. Wins over the AH (the
   prototype rule; AH copies of vendor thread are noise).
3. **AH**: imported set (`source: "ah"`), else the default list (`source: "default"`). An import always beats the
   default list, even when older; the age badge says how old.
4. **Craft**: if the item has a recipe in the data, its craft cost (§3.2). For intermediates (bolts, bars, leather,
   cured hides, dyes) the result is **min(AH, craft)**, as in the prototype's `unit_price`.
5. Otherwise `null` ("no price").

### 3.2 Craft cost (ported from the prototype's generator)

The prototype computes costs at generation time in Python (`unit_price`, `craft_cost`). In the public tool prices are
the player's, so this moves into the browser, ported 1:1:

```
craftCost(item, depth=0):
    r = recipe(item)                       // {mats: [[id, count], …], makes: n}
    total = 0, unknown = []
    for (id, count) in r.mats:
        u = unitPrice(id, depth + 1)       // vendor, else min(AH, craft) while depth < 4
        if u == null: unknown.push(id) else total += u.copper * count
    return { copper: round(total / r.makes), unknown, mats }
```

Depth cap 4 as in the prototype, plus a visiting set (no recipe cycle can recurse). Results are memoized per
"price-set version" (bumped on import, override change or owned-mats change). Cost for ~1,300 equipment items with
~600 mats is microseconds per lookup after the first pass.

### 3.3 Staleness

`age = today − day` (days, §1.5). Buckets shown as a dot/badge next to every AH price:

| Age | Label | Rule |
|---|---|---|
| 0–2 | fresh | used |
| 3–7 | recent | used |
| 8–21 | old | used, amber |
| > 21 | stale | used, red; beyond Auctionator's own history window |

A quantity of 1–2 shows "thin market" (18 % of the measured entries): the minimum buyout may be a single odd listing.
The default list uses the same rule with its scan day, so a months-old shipped list reads as stale by itself.

### 3.4 Missing prices

Never zero. A cost with unpriced mats shows the known part and "+?" (as the prototype does), totals say "N materials
without a price", and each unpriced mat has a "set price" affordance that creates an override. Soulbound mats (no AH
market) are labelled "not tradeable" instead of "no price" and count as zero cash but unknown value.

## 4. Default price list

- **What:** one anonymous scan, filtered to items the planner knows (mats, intermediates, crafted items). Shipped as
  `data/prices.js`:

  ```js
  // Generated by tools/build-prices.js. Do not edit.
  window.GEAR_PRICES = {
    "meta": { "format": 1, "build": "1.60.1.70205", "scanDay": 2471, "scanDate": "2026-10-07", "entries": 880 },
    "rows": { "2589": [123, 2471, 57], "2592": [456, 2470, 12] }  // id: [copper, day, qty]
  };
  ```

  Metadata is only scan date and build: no realm key, no account, no character, no file path. Auctionator's price
  database contains no seller names, so the rows themselves are anonymous.
- **Size:** measured 19.2 bytes per entry in compact JSON (with a relative day; ~22 with the absolute day used
  above). The beta scan has 880 planner-relevant entries → ~19 KB. A live scan covering all ~2,400 IDs the 1–60
  planner can reference (1,302 craftable equipment pieces with req. level ≤ 60, 589 distinct reagents, plus other
  crafted outputs) → ~53 KB, ~15 KB gzipped on Pages.
- **Regeneration:** `node tools/build-prices.js --file <Auctionator.lua> [--realm <key>] --build <build>
  --items data/items.js --out data/prices.js`. The tool reuses the page's own reader and decoder modules (they export
  for Node like the prototype's enchant rules do), so there is one implementation, tested once, and no Python or
  `cbor2`/`lupa` dependency. No hard-coded paths: the file comes from the command line. Without `--realm` and with
  several keys it lists them (entries, newest day) and exits. Output keys are sorted for clean diffs. It refuses a
  scan whose newest day is more than 14 days old unless `--allow-old`, and prints a summary (entries, matched,
  skipped).
- **Not shipping one** is a valid choice: prices are per region and ruleset, and a stale list misleads. The page must
  work without `data/prices.js` (it is loaded with a plain `<script>`; when absent, `window.GEAR_PRICES` is undefined
  and the UI says "No prices yet: import Auctionator or type prices"). Recommendation: ship one, but **never a beta
  scan for the live build** (the tool's `--build` must equal the game data's build), and ship none in the first live
  release until a scan from launch week exists (open question 3).

## 5. Manual overrides and owned mats

### 5.1 Overrides

- Per item ID: `{ "2589": { "c": 1200, "set": "2026-10-08" } }`. Edited inline on any unit price (shopping list,
  mat tooltip, item row) or in a "Prices" table listing all overrides with clear buttons.
- Input parser accepts `1g20s5c`, `1g 20s`, `1.2g`, `120s`, `85c`, `12005` (plain number = copper); rejects
  negatives; empty input removes the override. ~20 lines.
- Overrides are part of the user state and its JSON export; imported price sets are not (they are re-importable and
  can be large; open question 4).

### 5.2 "I have these mats"

- Per mat ID an owned count for the whole roster: `owned: { "2589": 40 }`. Entered in the shopping list's new "Have"
  column.
- **Cost stays opportunity cost.** The prototype already prices own mats at what they would fetch, and that is the
  right basis for every decision the planner supports: "craft or buy the finished piece on the AH", "which of two
  pieces for this slot", "is this upgrade worth N gold". Zeroing owned mats would make anything made from gathered
  mats look free, recommend crafting greens whose mats sell for more than the green, and make totals jump when a stack
  is sold. It also matches the "optimize gold per time" view: the mats' AH value is what crafting gives up.
- What owned counts change is **cash**: the shopping list shows `need = max(0, required − owned)` and two totals,
  "Value of mats used" (opportunity cost, unchanged) and "To buy" (cash for the missing part). That gives the
  "costs me nothing, I have it" reading without a mode switch.
- Simplification: no AH cut. Strictly, a mat you sell yields `m × 0.95` minus the deposit; using `m` for both
  buying and opportunity cost keeps one number per mat. The difference is under the noise of a min-buyout snapshot.

## 6. Storage

| Item | Size | Where |
|---|---|---|
| User state (roster, plans, overrides, owned) | prototype-like, tens of KB | `localStorage` key of the app, as today |
| Imported price set | measured file: 3,550 rows ≈ 67 KB as compact JSON (18.8 B/row); filtered to planner IDs: 880 rows ≈ 17 KB | separate `localStorage` key, written only on import |
| Undo slot | same as one set | separate key |
| Default list | ~19–53 KB | static file, not stored |

- Budget: about 5 million characters per origin in current browsers (Chromium counts UTF-16 code units, so ~10 MB of
  memory). On GitHub Pages the origin is `<user>.github.io`, **shared by all of that user's project pages**, so keys
  must carry an app prefix and the app should stay well below the limit.
- **Decision: store every numeric item entry of the chosen realm**, not only planner-known IDs. Numbers: a Forever
  scan of 3,550 items is ~67 KB; even 20,000 items would be ~380 KB, under 8 % of the budget. Storing all of it means
  a game-data update that adds items (new build, the jump from 1–30 to 1–60 curation) does not require a re-import,
  and later features (disenchant values, AH price in any tooltip) have the data. Safety valve: if the write throws
  `QuotaExceededError`, or the set has more than 50,000 rows (a Retail file picked by mistake), store only
  planner-known IDs and say so.
- Prices go under their own key so the frequent state saves (every click) do not re-serialize them.
- **No IndexedDB.** It is not needed at these sizes, its `file://` behaviour differs between browsers, and its async
  API complicates the synchronous `price()` lookup. Revisit only if a stored set ever exceeds ~2 MB.

Stored shape:

```js
// localStorage["<app>.prices.v1"]
{ "format": 1, "realm": "<label as shown>", "fileName": "Auctionator.lua", "importedAt": "2026-10-08T14:02",
  "scanDay": 2471, "entries": 3550, "skipped": 0,
  "rows": { "2589": [123, 2471, 57] } }
```

The realm label and file name stay in the user's browser (they are needed to show what is active); nothing is sent
anywhere.

## 7. Module layout and size estimate

| File (new repo) | Content | Lines (est.) |
|---|---|---|
| `js/import/lua-literal.js` | §2.3 reader | 90 (prototype: 85) |
| `js/import/cbor.js` | §2.4 decoder | 45 (prototype: 39) |
| `js/import/auctionator.js` | realm extraction, §2.5 rows, §2.6 validation, folder-name constant | 90 |
| `js/prices.js` | `price()`, precedence, craft cost, staleness, overrides, owned, money parser | 150 |
| UI (import panel, drop zone, realm picker, prices table, Have column) | in the app's view code | 200 |
| `tools/build-prices.js` | default-list generator (Node) | 60 |
| `tests/helpers/auctionator-fixture.js` | test-only CBOR encoder + Lua escaper + file writer | 80 |
| `tests/*.test.js` | §8 | 250 |

Copied from the prototype: its `money()` formatter (display) and the logic of its generator's `unit_price` /
`craft_cost` (ported to JS, §3.2). The import modules are new; a working version was validated against the real
file during this design.

## 8. Tests

All with `node --test`, no dependencies. **No owner file in the repo or in tests**; fixtures are generated.

- **Fixture helper** (`tests/helpers/auctionator-fixture.js`): a CBOR encoder in Blizzard's style (byte strings, `[]`
  for empty tables, minimal-length integers) and in LibCBOR's style (text strings, float64), a Lua string escaper in
  Blizzard's style (`\n \r \" \\ \000`, every other byte raw), and a file writer that emits a full saved-variables
  file with the other seven globals (booleans, floats, `nil`, nested tables, `-- [1]` comments), CRLF or LF.
- **Lua reader:** every byte 0–255 round-trips through escape → parse; `\000` followed by digits; `\0`, `\00`,
  `\255`, `\256` (error); CRLF inside tables; `--[[ ]]` comments; positional fields; unknown token in an unrelated
  global triggers the fallback path; unclosed string reports an offset.
- **CBOR decoder:** RFC 8949 Appendix A vectors for the supported subset (0, 23, 24, 255, 256, 65535, 65536,
  4294967295, 4294967296, −1, −1000, `h''`, `"a"`, `[]`, `[1,[2,3]]`, `{1:2}`, `{"a":1}`, `1.5` as f16/f32/f64,
  true/false/null); rejections: indefinite length, reserved AI, truncated input, trailing bytes, depth > 32, 2^53+1.
- **Round trip:** seeded PRNG generates 500 random Auctionator-shaped databases (1–3 realms, 0–5,000 items, 0–21 days,
  prices up to 2^32, quantities, empty `l`), encodes, writes the file, imports, and compares rows with the generator's
  expectation.
- **Import semantics:** two realms (one CBOR, one plain Lua table) both listed; `g:`/`p:` keys skipped and counted;
  `version` key ignored; `__dbversion` 7 warns; `nil` database and missing global give their messages.
- **Price model:** precedence (override > vendor > ah > default > craft), min(AH, craft) for intermediates, depth cap
  and cycle guard, unpriced mats → `unknown` list and "+?" totals, staleness buckets at the boundaries 2/3, 7/8,
  21/22, owned mats change "To buy" but not "Value", money parser cases.
- **Pipeline tool:** runs on a generated fixture, output is deterministic (byte-identical across runs), filtered to
  `--items`, refuses a mismatched `--build` and an old scan without `--allow-old`.
- **Local cross-check (not in CI):** a maintainer can run `build-prices.js --file <own file>` and compare counts with
  any other Auctionator reader. The original user already did this once with the Python reference (identical
  rows).

## 9. Later options (roadmap, not v1)

- **Companion export addon:** writes a compact saved variable (prices for planner IDs, owned mat counts from bags and
  bank, profession skills) or shows a copy-paste export string, removing the folder hunt. Same Lua reader.
- **Re-import button** via the File System Access API (stored file handle, Chromium only) for one-click refresh.
- **Bag/bank counts from existing addons** (e.g. the saved-variables files of inventory addons) to fill "Have";
  each is a new parser on top of the same Lua reader.
- **Other price sources:** TradeSkillMaster's market values come from its desktop app via an AppHelper addon
  file; whether TSM supports Forever, and whether its data may be read this way under its terms, is unknown (flag).
  Auctioneer and Retail-only price addons are not candidates. A plain "paste CSV of `itemId,copper`" input is cheap
  and covers anything else.
- **Merge** of two files (newer day per item), §2.7.
- **History charts** from `h`/`l`/`a` (the data is already in the file; the stored rows drop it).

## Assumptions about other areas

1. **Data model (game-data engineer):** item records carry, for every mat and intermediate: `vendor` (copper per
   unit, only for vendor-sold goods), `bind` (to detect soulbound mats), and a `recipe` `{ mats: [[id, count]],
   makes: n }` for every craftable intermediate, not just for equipment. The generator stops baking AH-derived
   `cost`, `unit`, `unitSource` and `ah` into the data; the browser derives them. Vendor-sold status needs a source
   (the prototype's hand list `VENDOR_MATS`, 25 names, or Wowhead "sold by" at build time); DB2 has only the price.
2. **Data model:** item IDs are the keys used everywhere (as in Auctionator); English names only for display.
3. **UI (product/UX):** a "Prices" area exists (settings or its own view) hosting import, the default-list status,
   the overrides table; the shopping list gains a "Have" column; prices show a source badge and an age dot. The UI
   calls `price(id)` and `craftCost(id)` only.
4. **Vision:** one active price set per roster (one realm/ruleset). Several rosters on different realms would need one
   set per roster; the stored shape allows a map keyed by roster later.
5. **Release/infra:** `data/prices.js` is an optional static file regenerated by a maintainer; CI runs `node --test`.
   The maintainer's own Auctionator file never enters the repo.
6. **Theorycraft:** spend tiers or "worth it" thresholds consume `price()` and handle `null`.

## Open questions

1. **Forever's live install folder name.** Beta is `_classic_beta_`; live is unknown until 2026-11-05.
   *Recommendation:* one constant, updated at launch; the UI text also says "the folder of your Forever install"
   so a wrong name does not strand the user.
2. **Is Forever's AH cross-faction, and is the realm key per region ruleset?** The beta key (ruleset name, no faction)
   suggests one AH per ruleset, but it mirrors Auctionator's Retail logic. *Recommendation:* design for "one realm key
   = one price set" regardless; re-check the key shape in a live file in launch week.
3. **Ship a default list at launch?** Beta prices are meaningless for live; launch-week prices are chaotic.
   *Recommendation:* ship none in the first live release, add one from a scan about a week after launch, refresh
   monthly; the page works without it.
4. **Include imported prices in the JSON export?** *Recommendation:* no (re-importable, up to hundreds of KB);
   export overrides and owned counts only. Revisit if users ask to move prices between PCs.
5. **Region in the default list's metadata?** EU and US prices differ. *Recommendation:* add `region` to `meta` if
   lists from both regions are ever shipped; until then one list, labelled "example prices".
6. **Vendor-good source for the public pipeline:** the prototype's 25-name hand list vs. a build-time Wowhead
   check. *Recommendation:* keep a hand list keyed by item ID in curated data (small, stable), flagged for review
   at launch.
7. **Troll/outlier listings:** a min buyout with quantity 1 can be far off. *Recommendation:* v1 shows "thin market"
   and relies on overrides; no automatic outlier filter (Auctionator's `h`/`l` history could feed one later).
8. **Apply the 5 % AH cut to the opportunity cost of owned mats?** *Recommendation:* no (§5.2).

## Decisions taken here

- Read the file as bytes; parse Lua literals ourselves (grammar §2.3); decode CBOR with a 40-line subset decoder that
  also covers LibCBOR's output and the plain-table form.
- Skip non-numeric item keys (`g:`, `gr:`, `p:`) and `version`; last-seen day = max day in `h`; quantity = `a[last]`.
- Replace-only import with one undo slot; realm preselected by newest scan.
- Precedence override > vendor > imported AH > default list > craft; intermediates at min(AH, craft); depth cap 4.
- Staleness buckets 0–2 / 3–7 / 8–21 / > 21 days; quantity ≤ 2 flagged "thin market".
- Owned mats reduce cash ("To buy"), never the opportunity cost.
- Store every numeric entry of the chosen realm in `localStorage` under its own key, with a planner-IDs-only
  fallback; no IndexedDB, no Web Worker.
- Default list filtered to planner IDs, metadata = scan date + build only, generated by a Node tool that reuses the
  page's modules.
- Fixtures are generated by a test helper; the original user's file is never committed or used in CI.
