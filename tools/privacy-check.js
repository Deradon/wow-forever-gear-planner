#!/usr/bin/env node
"use strict";
// Privacy check (docs/release-maintenance.md §10): fail if content headed for the public repo holds personal data.
//
//   node tools/privacy-check.js                 tracked and untracked (not ignored) files in the working tree
//   node tools/privacy-check.js --staged        staged blobs (.githooks/pre-commit)
//   node tools/privacy-check.js --message <f>   a commit message file (.githooks/commit-msg)
//   node tools/privacy-check.js --range A..B    blobs and commit messages new in A..B, ref names (pre-push, PRs)
//   node tools/privacy-check.js --history       every blob reachable from any ref, all commit and tag messages,
//                                               ref names (before the first push; CI on main)
// Options: --deny-file <path>, --no-private (generic rules only; prints a warning), --show-private (print private
// matches; local use only, never in CI).
//
// Two rule sets. Generic rules (below) describe the *shape* of private data and are written so they don't match
// this file; a path whose variable segment is an <angle-bracket placeholder> never matches. False positives go in
// tools/privacy-allow.txt ("<path glob> <rule id> <reason>"; generic rules only). Private rules live OUTSIDE the
// repo, one per line, '#' comments: "name" (case-insensitive substring), "w:name" (whole word), "re:regex"
// (case-insensitive). Source, first found: --deny-file, $FGP_PRIVACY_DENYLIST_FILE (a path), $FGP_PRIVACY_DENYLIST
// (the list itself, for CI secrets), $XDG_CONFIG_HOME/forever-gear-planner/privacy-denylist.txt (default
// ~/.config/…; %APPDATA%\forever-gear-planner\… on Windows). A missing list fails (exit 2) unless --no-private.
// Private hits print as "private rule #<line>", never with their pattern or text. Commit author and committer
// fields are not scanned (re-authoring is a separate step).
// Exit codes: 0 clean, 1 findings, 2 configuration error.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const GENERIC = [
  { id: "unix-home", re: /\/(?:hom[e]|User[s])\/[^/\s<>"'`]+\//gi },
  { id: "wsl-mount", re: /\/m[n]t\/[a-z]\//gi },
  { id: "wsl-unc", re: /\\\\ws[l](?:\.localhost|\$)\\/gi },
  { id: "win-user-path", re: /\b[a-z]:[\\/]+user[s][\\/]+[^\\/\s<>"'`]+/gi },
  { id: "wow-account", re: /W[T]F[\\/]Account[\\/][^\\/\s<>"'`]+/gi },
  { id: "account-path", re: /accoun[t][\\/][^\s<>\\/]+[\\/]savedvariable[s]/gi },
  { id: "account-number", re: /accoun[t][\\/][0-9]{4,}(?:#[0-9]+)?/gi },
  { id: "account-id", re: /\b\d{6,}#\d\b/g },
  { id: "battletag", re: /\b[A-Za-z][A-Za-z0-9]{2,11}#\d{4,5}\b/g },
  { id: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]*[a-z]{2,}/gi,
    except: /^(?:noreply@.*|[\w.+-]+@users\.noreply\.github\.com|[\w.+-]+@example\.(?:com|org)|git@github\.com)$/i },
];
const APP = "forever-gear-planner";
const ALLOW_FILE = "tools/privacy-allow.txt";

class ConfigError extends Error {}

// --- rules -----------------------------------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Parse a private list; rule numbers are line numbers. Throws ConfigError on a bad regex (without its text).
function parseDenylist(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let re;
    try {
      if (line.startsWith("re:")) re = new RegExp(line.slice(3), "giu");
      else if (line.startsWith("w:")) re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(line.slice(2))}(?![\\p{L}\\p{N}_])`, "giu");
      else re = new RegExp(escapeRe(line), "giu");
    } catch (e) { throw new ConfigError(`private rule #${i + 1}: invalid regular expression`); }
    if (re.test("")) throw new ConfigError(`private rule #${i + 1}: matches the empty string`);
    rules.push({ n: i + 1, re });
  });
  return rules;
}

// "<path glob> <rule id> <reason>" per line; '*' stays within a path segment, '**' crosses segments.
function parseAllow(text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [glob, rule, ...why] = line.split(/\s+/);
    if (!rule || !why.length) throw new ConfigError(`${ALLOW_FILE}:${i + 1}: expected "<path glob> <rule id> <reason>"`);
    if (!GENERIC.some((g) => g.id === rule)) throw new ConfigError(`${ALLOW_FILE}:${i + 1}: unknown generic rule ${rule}`);
    const re = new RegExp(`^${glob.split("**").map((p) => p.split("*").map((q) => escapeRe(q).replace(/\\\?/g, "[^/]")).join("[^/]*")).join(".*")}$`);
    out.push({ re, rule });
  });
  return out;
}

const lineOf = (text, idx) => { let n = 1; for (let i = text.indexOf("\n"); i >= 0 && i < idx; i = text.indexOf("\n", i + 1)) n++; return n; };

// Findings for one piece of content: [{where, line, rule, text, private?}]. `where` is a path or a label; the
// allowlist matches `allowPath` (the repo path where there is one).
function scanText(text, where, cfg, allowPath = where) {
  const out = [];
  const allowed = (rule) => (cfg.allow || []).some((a) => a.rule === rule && a.re.test(allowPath));
  for (const g of GENERIC) {
    if (allowed(g.id)) continue;
    for (const m of text.matchAll(g.re)) {
      if (g.except && g.except.test(m[0])) continue;
      out.push({ where, line: lineOf(text, m.index), rule: g.id, text: m[0] });
    }
  }
  for (const p of cfg.private || []) {
    for (const m of text.matchAll(p.re)) out.push({ where, line: lineOf(text, m.index), rule: p.n, private: true, text: m[0] });
  }
  return out;
}

// Text decoding: UTF-8 for text, Latin-1 (byte per char, so ASCII names still match) for binary content.
const decode = (buf) => buf.toString(buf.includes(0) ? "latin1" : "utf8");

// An item: {path?, label?, content?}. The path (or a content-less label such as a ref or tree name) is scanned as a
// name; the content is reported under the label (history: "<path> (blob <sha>)") or the path.
function scanItem(item, cfg) {
  const name = item.path !== undefined ? item.path : item.content === undefined ? item.label : null;
  const found = name !== null ? scanText(name, name, cfg).map((f) => ({ ...f, inPath: true })) : [];
  if (item.content !== undefined) found.push(...scanText(decode(item.content), item.label || item.path, cfg, item.path || item.label));
  return found;
}

// --- the private list ------------------------------------------------------------------------------------------

function defaultDenyPath(env) {
  if (process.platform === "win32" && env.APPDATA) return path.join(env.APPDATA, APP, "privacy-denylist.txt");
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), APP, "privacy-denylist.txt");
}

// Returns {source, text} or null; never returns the env var's text in an error.
function resolveDenylist(opts, env) {
  const file = (p, what) => {
    try { return { source: `${what} ${p}`, text: fs.readFileSync(p, "utf8") }; } catch (e) { throw new ConfigError(`cannot read the private denylist (${what} ${p})`); }
  };
  if (opts.denyFile) return file(opts.denyFile, "--deny-file");
  if (env.FGP_PRIVACY_DENYLIST_FILE) return file(env.FGP_PRIVACY_DENYLIST_FILE, "$FGP_PRIVACY_DENYLIST_FILE");
  if (env.FGP_PRIVACY_DENYLIST) return { source: "$FGP_PRIVACY_DENYLIST", text: env.FGP_PRIVACY_DENYLIST };
  const p = defaultDenyPath(env);
  return fs.existsSync(p) ? file(p, "default") : null;
}

// --- what to scan ----------------------------------------------------------------------------------------------

function git(args, cwd, input) {
  const r = spawnSync("git", args, { cwd, input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new ConfigError(`git ${args.join(" ")}: ${String(r.stderr).trim() || r.error}`);
  return r.stdout;
}
const lines0 = (buf) => buf.toString("utf8").split("\0").filter(Boolean);

// Blob contents by object name, read through one `git cat-file --batch` per chunk.
function readBlobs(shas, cwd) {
  const out = new Map();
  for (let i = 0; i < shas.length; i += 500) {
    const chunk = shas.slice(i, i + 500), buf = git(["cat-file", "--batch"], cwd, chunk.join("\n") + "\n");
    let pos = 0;
    for (const sha of chunk) {
      const nl = buf.indexOf(10, pos), head = buf.toString("utf8", pos, nl).split(" ");
      if (head[1] === "missing") { pos = nl + 1; continue; }
      const size = +head[2];
      out.set(sha, buf.subarray(nl + 1, nl + 1 + size));
      pos = nl + 1 + size + 1;
      if (head[0] !== sha && !head[0].startsWith(sha)) throw new ConfigError(`git cat-file: unexpected object ${head[0]}`);
    }
  }
  return out;
}

// Objects reachable from revs (rev-list arguments): blobs by object name with their first path, tree paths.
function objectsOf(revs, cwd) {
  const named = git(["rev-list", "--objects", ...revs], cwd).toString("utf8").split("\n").filter(Boolean)
    .map((l) => { const sp = l.indexOf(" "); return sp < 0 ? [l, null] : [l.slice(0, sp), l.slice(sp + 1)]; });
  const types = git(["cat-file", "--batch-check=%(objecttype)"], cwd, named.map((x) => x[0]).join("\n") + "\n").toString("utf8").split("\n");
  const blobs = new Map(), trees = new Set();
  named.forEach(([sha, p], i) => {
    if (types[i] === "blob" && !blobs.has(sha)) blobs.set(sha, p);
    else if (types[i] === "tree" && p) trees.add(p);
  });
  return { blobs, trees: [...trees] };
}

function messages(revs, cwd) {
  const text = git(["log", "--format=%H%x00%B%x00", ...revs], cwd).toString("utf8").split("\0");
  const out = [];
  for (let i = 0; i + 1 < text.length; i += 2) out.push({ kind: "commit message", label: `commit ${text[i].trim().slice(0, 10)} message`, content: Buffer.from(text[i + 1]) });
  return out;
}

function refItems(cwd) {
  const refs = git(["for-each-ref", "--format=%(refname)%00%(objecttype)%00%(objectname)"], cwd).toString("utf8").split("\n").filter(Boolean);
  const out = [];
  for (const r of refs) {
    const [name, type, sha] = r.split("\0");
    out.push({ kind: "ref name", label: `ref ${name}` });
    if (type === "tag") out.push({ kind: "tag message", label: `tag ${name.replace(/^refs\/tags\//, "")} message`, content: git(["cat-file", "tag", sha], cwd) });
  }
  return out;
}

function collect(mode, opts, cwd) {
  if (mode === "message") return [{ kind: "commit message", label: "commit message", content: fs.readFileSync(opts.message) }];
  if (mode === "worktree") {
    return lines0(git(["ls-files", "-co", "--exclude-standard", "-z"], cwd)).flatMap((p) => {
      const abs = path.join(cwd, p);
      let st;
      try { st = fs.lstatSync(abs); } catch (e) { return []; }
      if (st.isSymbolicLink()) return [{ kind: "file", path: p, content: Buffer.from(fs.readlinkSync(abs)) }];
      return st.isFile() ? [{ kind: "file", path: p, content: fs.readFileSync(abs) }] : [];
    });
  }
  if (mode === "staged") {
    const names = lines0(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], cwd));
    if (!names.length) return [];
    const shas = git(["rev-parse", ...names.map((p) => `:${p}`)], cwd).toString("utf8").trim().split("\n");
    const blobs = readBlobs(shas, cwd);
    return names.map((p, i) => ({ kind: "file", path: p, content: blobs.get(shas[i]) }));
  }
  const revs = mode === "history" ? ["--all"] : [opts.range];
  if (mode === "range" && !/^[^\s.][^\s]*\.\.[^\s.][^\s]*$/.test(opts.range)) throw new ConfigError(`--range expects A..B, got ${opts.range}`);
  const { blobs, trees } = objectsOf(revs, cwd);
  const data = readBlobs([...blobs.keys()], cwd);
  const items = [...blobs].map(([sha, p]) => ({ kind: "blob", path: p, label: `${p} (blob ${sha.slice(0, 10)})`, content: data.get(sha) }));
  return [...trees.map((t) => ({ kind: "directory name", label: t })), ...items, ...messages(revs, cwd), ...refItems(cwd)];
}

// --- main ------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { mode: "worktree" };
  const setMode = (m) => { if (o.mode !== "worktree") throw new ConfigError("give at most one of --staged, --message, --range, --history"); o.mode = m; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => { if (i + 1 >= argv.length) throw new ConfigError(`${a} needs a value`); return argv[++i]; };
    if (a === "--staged") setMode("staged");
    else if (a === "--history") setMode("history");
    else if (a === "--range") { setMode("range"); o.range = val(); }
    else if (a === "--message") { setMode("message"); o.message = val(); }
    else if (a === "--deny-file") o.denyFile = val();
    else if (a === "--no-private") o.noPrivate = true;
    else if (a === "--show-private") o.showPrivate = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new ConfigError(`unknown option: ${a}`);
  }
  if (o.noPrivate && o.denyFile) throw new ConfigError("--no-private and --deny-file exclude each other");
  return o;
}

// A location can itself hold a private name (a path, a ref): those parts print as [private #n] too.
function format(f, showPrivate, priv) {
  let where = f.where;
  if (!showPrivate) for (const p of priv) where = where.replace(p.re, `[private #${p.n}]`);
  const at = f.inPath ? `${where}: (path)` : `${where}:${f.line}`;
  if (f.private) return `${at}: private rule #${f.rule}${showPrivate ? `: ${JSON.stringify(f.text)}` : ""}`;
  return `${at}: rule ${f.rule}: ${JSON.stringify(f.text.length > 80 ? f.text.slice(0, 77) + "..." : f.text)}`;
}

// Returns the exit code; writes to out/err (functions taking a line).
function run(argv, { env = process.env, cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  try {
    const o = parseArgs(argv);
    if (o.help) { out(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 25).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }
    const top = git(["rev-parse", "--show-toplevel"], cwd).toString("utf8").trim();
    let priv = [];
    if (o.noPrivate) err("privacy-check: WARNING: --no-private: generic rules only, the private denylist is not checked");
    else {
      const list = resolveDenylist(o, env);
      if (!list) throw new ConfigError(`no private denylist (looked for --deny-file, $FGP_PRIVACY_DENYLIST_FILE, $FGP_PRIVACY_DENYLIST, ${defaultDenyPath(env)}); pass --no-private to run generic rules only`);
      priv = parseDenylist(list.text);
    }
    const allowPath = path.join(top, ALLOW_FILE);
    const allow = fs.existsSync(allowPath) ? parseAllow(fs.readFileSync(allowPath, "utf8")) : [];
    const items = collect(o.mode, o, top);
    const cfg = { private: priv, allow };
    const findings = items.flatMap((it) => scanItem(it, cfg));
    const seen = new Set(), lines = [];
    for (const f of findings) {
      const l = format(f, o.showPrivate, priv);
      if (!seen.has(l)) { seen.add(l); lines.push(l); }
    }
    const kinds = {};
    for (const it of items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    const what = `${o.mode}: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ") || "nothing to scan"}; ${GENERIC.length} generic rules, ${priv.length} private rules`;
    if (lines.length) {
      for (const l of lines) out(`privacy-check: ${l}`);
      err(`privacy-check: FAILED (${lines.length} finding${lines.length === 1 ? "" : "s"}; ${what})`);
      return 1;
    }
    out(`privacy-check: clean (${what})`);
    return 0;
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    err(`privacy-check: ${e.message}`);
    return 2;
  }
}

module.exports = { GENERIC, parseDenylist, parseAllow, scanText, scanItem, resolveDenylist, defaultDenyPath, run };

if (require.main === module) process.exitCode = run(process.argv.slice(2));
