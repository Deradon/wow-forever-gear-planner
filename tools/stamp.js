#!/usr/bin/env node
"use strict";
// Cache busting at deploy time (docs/release-maintenance.md §5.3): rewrite every local src=/href= in
// <dir>/index.html to "file?v=<first 10 hex chars of the file's SHA-256>". Runs on the deploy copy (_site), never
// on site/, so commits carry no stamp churn. index.html itself is not stamped; the schema guard covers its window.
//
//   node tools/stamp.js <dir>

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Returns {html, stamped: [paths]}; throws when a referenced local file is missing.
function stamp(dir) {
  const file = path.join(dir, "index.html");
  const stamped = [];
  const html = fs.readFileSync(file, "utf8").replace(/(\s(?:src|href)=")([^"#?]+)(")/g, (m, pre, ref, post) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(ref)) return m;
    const p = path.join(dir, ref);
    if (!fs.existsSync(p)) throw new Error(`stamp: ${ref} is referenced by index.html but missing`);
    stamped.push(ref);
    return `${pre}${ref}?v=${crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 10)}${post}`;
  });
  return { html, stamped };
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node tools/stamp.js <dir>"); process.exit(2); }
  const { html, stamped } = stamp(dir);
  fs.writeFileSync(path.join(dir, "index.html"), html);
  console.log(`stamp: ${stamped.length} references in ${path.join(dir, "index.html")}`);
}

module.exports = { stamp };
