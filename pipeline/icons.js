"use strict";
// Icon names (D7 as amended 2026-10-08): Item.IconFileDataID joined with the wowdev community listfile.
//
// Cache: <cache>/listfile/<tag>/community-listfile.csv (146 MB, "<FileDataID>;<path>" per line); never committed.
// Manifest: build-inputs/listfile-<tag>.sha256, "<sha256>  community-listfile.csv". `fetch` downloads the pinned
// release and records the hash; `build` streams the file once (constant memory), verifies the hash and keeps only
// the interface/icons/ rows the build needs.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { USER_AGENT } = require("./db2");

// Pinned release of https://github.com/wowdev/wow-listfile; bump deliberately with a data release.
const LISTFILE_TAG = "202610080338";
const FILE = "community-listfile.csv";
const url = (tag) => `https://github.com/wowdev/wow-listfile/releases/download/${tag}/${FILE}`;
const listfilePath = (cache, tag) => path.join(cache, "listfile", tag, FILE);
const manifestPath = (repo, tag) => path.join(repo, "build-inputs", `listfile-${tag}.sha256`);

function readManifest(file) {
  if (!fs.existsSync(file)) return null;
  const m = /^([0-9a-f]{64}) {2}community-listfile\.csv$/m.exec(fs.readFileSync(file, "utf8"));
  return m ? m[1] : null;
}

function hashFile(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest("hex");
}

// Download the pinned listfile if missing, then record its hash (or check it against the manifest).
async function fetchListfile({ repo, cache, tag = LISTFILE_TAG, acceptNewHashes, log }) {
  const dest = listfilePath(cache, tag);
  if (!fs.existsSync(dest)) {
    log(`fetching ${FILE} (${tag})`);
    const res = await fetch(url(tag), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`fetch ${FILE}: HTTP ${res.status} from ${url(tag)}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + ".part"));
    fs.renameSync(dest + ".part", dest);
  }
  const h = hashFile(dest), mfile = manifestPath(repo, tag), old = readManifest(mfile);
  if (old === h) return [];
  if (old && !acceptNewHashes) throw new Error(`${FILE} (${tag}) differs from ${path.relative(repo, mfile)}; rerun with --accept-new-hashes to update deliberately`);
  fs.writeFileSync(mfile, `${h}  ${FILE}\n`);
  return [`${FILE} (${tag}): ${old ? "hash updated" : "recorded"}`];
}

// Stream the cached listfile once: hash every byte, keep interface/icons/ rows whose FileDataID is in `ids`.
// Returns {names: Map FileDataID → file stem (e.g. "inv_sword_04"), sha256}. verify: false skips the manifest
// (synthetic test fixtures only).
function iconNames({ repo, cache, tag = LISTFILE_TAG, ids, verify = true }) {
  const file = listfilePath(cache, tag);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}; run: node pipeline/main.js fetch --build <build>`);
  const h = crypto.createHash("sha256"), names = new Map(), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  let rest = "";
  const line = (l) => {
    const i = l.indexOf(";");
    if (i < 0) return;
    const p = l.slice(i + 1).trim().toLowerCase();
    if (!p.startsWith("interface/icons/")) return;
    const id = +l.slice(0, i);
    if (ids.has(id)) names.set(id, path.posix.basename(p).replace(/\.[a-z0-9]+$/, ""));
  };
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.subarray(0, n));
      const lines = (rest + buf.toString("latin1", 0, n)).split("\n");
      rest = lines.pop();
      lines.forEach(line);
    }
    if (rest) line(rest);
  } finally { fs.closeSync(fd); }
  const sha256 = h.digest("hex");
  if (verify) {
    const want = readManifest(manifestPath(repo, tag));
    if (!want) throw new Error(`${FILE} (${tag}) has no ${path.relative(repo, manifestPath(repo, tag))}; run: node pipeline/main.js fetch --build <build>`);
    if (want !== sha256) throw new Error(`${FILE} (${tag}) differs from ${path.relative(repo, manifestPath(repo, tag))}`);
  }
  return { names, sha256 };
}

module.exports = { LISTFILE_TAG, url, listfilePath, manifestPath, fetchListfile, iconNames };
