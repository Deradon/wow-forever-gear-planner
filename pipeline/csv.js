"use strict";
// RFC 4180 CSV reader: quoted fields may hold commas, quotes ("") and line breaks; CRLF or LF rows.

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") i++;
    if (c === "\n" || c === "\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (quoted) throw new Error("CSV: unterminated quoted field");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Header + rows as objects keyed by column name. Values stay strings; callers convert.
function readTable(text, name) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error(`CSV ${name || ""}: empty`);
  const header = rows[0];
  const out = new Array(rows.length - 1);
  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    if (vals.length !== header.length) {
      throw new Error(`CSV ${name || ""}: row ${r + 1} has ${vals.length} fields, header has ${header.length}`);
    }
    const o = {};
    for (let c = 0; c < header.length; c++) o[header[c]] = vals[c];
    out[r - 1] = o;
  }
  return { header, rows: out };
}

module.exports = { parseCsv, readTable };
