"use strict";
// Price model (docs/pricing-import.md §3, §5) on a synthetic data set.
const test = require("node:test");
const assert = require("node:assert");
const pricing = require("../../site/lib/pricing");

// 100 = gear item from recipe 1000: 2 × intermediate 200 + 1 × vendor thread 201 (+ 1 × soulbound 203 in 1002).
// 200 = intermediate (recipe 1001 makes 2 from 3 × raw 202). 204 ↔ 205 form a recipe cycle.
const data = {
  items: { rows: { 100: { name: "Gear", recipes: [1000] }, 101: { name: "Bound gear", recipes: [1002] } } },
  recipes: {
    rows: {
      1000: { kind: "gear", item: 100, out: 1, mats: [[200, 2], [201, 1]] },
      1001: { kind: "intermediate", item: 200, out: 2, mats: [[202, 3]] },
      1002: { kind: "gear", item: 101, out: 1, mats: [[203, 1], [201, 1]] },
      1003: { kind: "intermediate", item: 204, out: 1, mats: [[205, 1]] },
      1004: { kind: "intermediate", item: 205, out: 1, mats: [[204, 1]] },
    },
  },
  mats: {
    rows: {
      200: { name: "Bolt", bind: "none", madeBy: [1001], vendor: null },
      201: { name: "Thread", bind: "none", madeBy: [], vendor: { copper: 50, stack: 5 } },
      202: { name: "Cloth", bind: "none", madeBy: [], vendor: null },
      203: { name: "Soulbound shard", bind: "BoP", madeBy: [], vendor: null },
      204: { name: "Loop A", bind: "none", madeBy: [1003], vendor: null },
      205: { name: "Loop B", bind: "none", madeBy: [1004], vendor: null },
    },
  },
};
const TODAY = 2471;
const set = (rows) => ({ rows });

test("precedence: override > vendor > imported AH > default list > craft (D31)", () => {
  const p = (prices) => pricing.createPricer(data, prices, { today: TODAY });
  const both = { imported: set({ 201: [999, TODAY, 5], 202: [30, TODAY, 9] }), defaultSet: set({ 202: [40, TODAY - 3, 9], 100: [5000, TODAY, 1] }) };
  assert.deepStrictEqual([p(both).price(201).source, p(both).price(201).copper], ["vendor", 10], "vendor wins over the AH");
  assert.deepStrictEqual([p(both).price(202).source, p(both).price(202).copper], ["ah", 30]);
  assert.deepStrictEqual([p({ defaultSet: both.defaultSet }).price(202).source, p({ defaultSet: both.defaultSet }).price(202).copper], ["default", 40]);
  assert.strictEqual(p({ ...both, overrides: { 201: { c: 7, set: "2026-10-08" } } }).price(201).source, "override");
  assert.strictEqual(p(both).price(100).source, "default", "a gear item with a market price shows it");
  const craftOnly = p({ imported: set({ 202: [30, TODAY, 9] }) }).price(100);
  // 200 = 3 × 30 / 2 = 45 each; 2 × 45 + 10 = 100.
  assert.deepStrictEqual([craftOnly.source, craftOnly.copper, craftOnly.partial], ["craft", 100, false]);
  assert.strictEqual(p({}).price(202), null, "no price is null, never zero");
});

test("intermediates at min(AH, craft)", () => {
  const cheapAh = pricing.createPricer(data, { imported: set({ 200: [20, TODAY, 3], 202: [30, TODAY, 9] }) }, { today: TODAY });
  assert.deepStrictEqual([cheapAh.price(200).source, cheapAh.price(200).copper], ["ah", 20]);
  const cheapCraft = pricing.createPricer(data, { imported: set({ 200: [90, TODAY, 3], 202: [30, TODAY, 9] }) }, { today: TODAY });
  assert.deepStrictEqual([cheapCraft.price(200).source, cheapCraft.price(200).copper], ["craft", 45]);
  assert.strictEqual(cheapCraft.craftCost(100).copper, 100);
});

test("unpriced and soulbound mats: known part plus the unknown list; depth cap and cycle guard", () => {
  const p = pricing.createPricer(data, {}, { today: TODAY });
  const c = p.craftCost(100);
  assert.deepStrictEqual(c.unknown, [200]);
  assert.strictEqual(c.copper, 10, "known part only");
  const partial = p.price(100);
  assert.strictEqual(partial.partial, true);
  assert.strictEqual(p.costOf(100), null, "partial costs do not feed the spend tier");
  const b = p.craftCost(101);
  assert.deepStrictEqual(b.soulbound, [203]);
  assert.strictEqual(p.price(204), null, "a recipe cycle ends without a price");
  assert.strictEqual(pricing.DEPTH, 4);
});

test("staleness bands at the boundaries; thin markets", () => {
  assert.deepStrictEqual([0, 2, 3, 7, 8, 21, 22].map(pricing.band), ["fresh", "fresh", "recent", "recent", "old", "old", "stale"]);
  const p = pricing.createPricer(data, { imported: set({ 202: [30, TODAY - 8, 2] }) }, { today: TODAY });
  const x = p.price(202);
  assert.deepStrictEqual([x.age, x.band, x.thin], [8, "old", true]);
});

test("owned mats change the cash to buy, never the value (§5.2)", () => {
  const p = pricing.createPricer(data, { imported: set({ 202: [30, TODAY, 9] }) }, { today: TODAY });
  const none = pricing.shopping(p, [[202, 10], [201, 4]], {});
  const some = pricing.shopping(p, [[202, 10], [201, 4]], { 202: 6 });
  assert.strictEqual(none.value, 340);
  assert.strictEqual(some.value, 340);
  assert.strictEqual(none.toBuy, 340);
  assert.strictEqual(some.toBuy, 160);
});

test("money parser and formatter", () => {
  const c = (s) => pricing.parseMoney(s).copper;
  assert.strictEqual(c("1g20s5c"), 12005);
  assert.strictEqual(c("1g 20s"), 12000);
  assert.strictEqual(c("1.2g"), 12000);
  assert.strictEqual(c("120s"), 12000);
  assert.strictEqual(c("85c"), 85);
  assert.strictEqual(c("12005"), 12005);
  assert.ok(pricing.parseMoney("").empty);
  assert.ok(pricing.parseMoney("-5g").error);
  assert.ok(pricing.parseMoney("1g1g").error);
  assert.ok(pricing.parseMoney("five gold").error);
  assert.strictEqual(pricing.formatMoney(12005), "1g 20s 5c");
  assert.strictEqual(pricing.formatMoney(0), "0c");
  assert.strictEqual(pricing.formatMoney(10000), "1g");
});
