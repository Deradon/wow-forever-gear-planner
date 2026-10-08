"use strict";
// DB2 tables from wago.tools: cache layout, fetching, and the committed hash manifest.
//
// Cache: <cache>/db2/<build>/<Table>.csv, where <cache> is --cache, else $FGP_CACHE, else
// $XDG_CACHE_HOME/forever-gear-planner, else ~/.cache/forever-gear-planner. Never inside the repo.
// Manifest: build-inputs/db2-<build>.sha256, "<sha256>  <Table>.csv" per line, sorted by table name.
// `fetch` downloads missing tables and records new hashes; `build` only reads and verifies (offline).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { readTable } = require("./csv");

const USER_AGENT = "forever-gear-planner/0.1 (+github)";

// Tables of the dataset build (game-data-pipeline §2).
const TABLES = [
  "ArmorLocation", "CharBaseInfo", "ChrClasses", "ChrRaces", "Faction", "Item", "ItemArmorQuality",
  "ItemAppearance", "ItemArmorShield", "ItemArmorTotal", "ItemDamageOneHand", "ItemDamageTwoHand", "ItemDamageWand",
  "ItemEffect", "ItemModifiedAppearance", "ItemSet", "ItemSetSpell", "ItemSparse", "ItemXItemEffect", "RandPropPoints", "SkillLine", "SkillLineAbility",
  "SpellEffect", "SpellName", "SpellReagents",
];
// Pinned Era/SoD reference build for origin checks; never refreshed.
const REFERENCE_BUILD = "1.15.9.70003";
const REFERENCE_TABLES = ["Item", "ItemSparse", "SkillLineAbility"];

function cacheRoot(opt) {
  if (opt) return path.resolve(opt);
  if (process.env.FGP_CACHE) return path.resolve(process.env.FGP_CACHE);
  const xdg = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(xdg, "forever-gear-planner");
}

function tablePath(cache, build, table) {
  return path.join(cache, "db2", build, `${table}.csv`);
}

function manifestPath(repo, build) {
  return path.join(repo, "build-inputs", `db2-${build}.sha256`);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readManifest(file) {
  const m = new Map();
  if (!fs.existsSync(file)) return m;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const hit = /^([0-9a-f]{64}) {2}(\S+)\.csv$/.exec(line);
    if (hit) m.set(hit[2], hit[1]);
  }
  return m;
}

function writeManifest(file, m) {
  const names = [...m.keys()].sort();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, names.map((t) => `${m.get(t)}  ${t}.csv\n`).join(""));
}

async function download(build, table, dest) {
  const url = `https://wago.tools/db2/${table}/csv?build=${encodeURIComponent(build)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`fetch ${table}: HTTP ${res.status} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 200).toString("utf8");
  if (!/^﻿?[A-Za-z_][A-Za-z0-9_]*[,\r\n]/.test(head) || /<html/i.test(head)) {
    throw new Error(`fetch ${table}: response does not look like a CSV`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + ".part", buf);
  fs.renameSync(dest + ".part", dest);
  return buf;
}

// Fetch missing tables of one build and record hashes of tables without a manifest entry.
// A table whose hash differs from its entry fails unless acceptNewHashes.
async function fetchBuild({ repo, cache, build, tables, acceptNewHashes, log }) {
  const mfile = manifestPath(repo, build);
  const m = readManifest(mfile);
  const changes = [];
  for (const t of tables) {
    const p = tablePath(cache, build, t);
    let buf;
    if (fs.existsSync(p)) buf = fs.readFileSync(p);
    else {
      log(`fetching ${t} (${build})`);
      buf = await download(build, t, p);
    }
    const h = sha256(buf);
    if (!m.has(t)) { m.set(t, h); changes.push(`${t}: recorded`); }
    else if (m.get(t) !== h) {
      if (!acceptNewHashes) throw new Error(`${t}.csv (${build}) differs from ${path.relative(repo, mfile)}; rerun with --accept-new-hashes to update deliberately`);
      m.set(t, h); changes.push(`${t}: hash updated`);
    }
  }
  writeManifest(mfile, m);
  return changes;
}

// Read and verify the tables of one build against its manifest. No network.
// verify: false skips the manifest (synthetic test fixtures only).
function loadBuild({ repo, cache, build, tables, acceptNewHashes, verify = true }) {
  const mfile = manifestPath(repo, build);
  const m = readManifest(mfile);
  const missing = tables.filter((t) => !fs.existsSync(tablePath(cache, build, t)));
  if (missing.length) {
    throw new Error(`missing in ${path.join(cache, "db2", build)}: ${missing.join(", ")}; run: node pipeline/main.js fetch --build ${build}`);
  }
  const out = {}, hashes = {};
  let updated = false;
  for (const t of tables) {
    const buf = fs.readFileSync(tablePath(cache, build, t));
    const h = sha256(buf);
    hashes[t] = h;
    if (verify && !m.has(t)) throw new Error(`${t}.csv (${build}) has no entry in ${path.relative(repo, mfile)}; run: node pipeline/main.js fetch --build ${build}`);
    if (verify && m.get(t) !== h) {
      if (!acceptNewHashes) throw new Error(`${t}.csv (${build}) differs from ${path.relative(repo, mfile)}; rerun with --accept-new-hashes to update deliberately`);
      m.set(t, h); updated = true;
    }
    out[t] = readTable(buf.toString("utf8"), t).rows;
  }
  if (updated) writeManifest(mfile, m);
  return { tables: out, hashes };
}

module.exports = {
  USER_AGENT, TABLES, REFERENCE_BUILD, REFERENCE_TABLES,
  cacheRoot, tablePath, manifestPath, readManifest, writeManifest, sha256, fetchBuild, loadBuild,
};
