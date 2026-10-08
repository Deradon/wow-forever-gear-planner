"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const { parseCsv, readTable } = require("../../pipeline/csv");
const db2 = require("../../pipeline/db2");

test("plain rows, LF and CRLF, trailing newline", () => {
  assert.deepStrictEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepStrictEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
  assert.deepStrictEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("quoted fields with commas, quotes and line breaks; empty fields", () => {
  assert.deepStrictEqual(parseCsv('ID,Name\n1,"Pattern: A, B"\n2,"say ""hi"""\n3,"two\nlines"\n4,\n'),
    [["ID", "Name"], ["1", "Pattern: A, B"], ["2", 'say "hi"'], ["3", "two\nlines"], ["4", ""]]);
});

test("byte order mark is skipped; unterminated quote fails", () => {
  assert.deepStrictEqual(parseCsv("﻿ID\n1\n"), [["ID"], ["1"]]);
  assert.throws(() => parseCsv('ID\n"open\n'), /unterminated/);
});

test("readTable keys rows by header and rejects ragged rows", () => {
  assert.deepStrictEqual(readTable("ID,Name\n7,x\n").rows, [{ ID: "7", Name: "x" }]);
  assert.throws(() => readTable("ID,Name\n7\n", "T"), /row 2 has 1 fields/);
});

const BUILD = "1.60.1.70205";
const cache = db2.cacheRoot();
const haveCache = fs.existsSync(db2.tablePath(cache, BUILD, "ItemSparse"));

test("every cached table of the pinned build parses with consistent field counts", { skip: !haveCache && "DB2 cache not found (run node pipeline/main.js fetch)" }, () => {
  const counts = {};
  for (const t of db2.TABLES) counts[t] = readTable(fs.readFileSync(db2.tablePath(cache, BUILD, t), "utf8"), t).rows.length;
  // Records, cross-checked once with Python's csv module. The planning documents quote 19,226 and 31,822: those
  // are line counts (header plus line breaks inside quoted fields), not records.
  assert.strictEqual(counts.ItemSparse, 19224);
  assert.strictEqual(counts.Item, 31821);
  assert.strictEqual(counts.ChrClasses, 9);
});
