"use strict";
// tools/privacy-check.js (docs/release-maintenance.md §10): generic rules, the placeholder exemption, the
// account-path rule, a synthetic private denylist, list resolution, and the modes on a throwaway git repo.
// Every suspicious sample is assembled at runtime so this file never matches the check itself.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const pc = require("../../tools/privacy-check");

const BS = "\\";
const cat = (...p) => p.join("");
const ruleIds = (text, cfg = {}) => pc.scanText(text, "x", cfg).map((f) => f.rule);

test("generic rules catch the shapes of private data", () => {
  const samples = {
    "unix-home": cat("/ho", "me/someone/notes.txt"),
    "wsl-mount": cat("/m", "nt/c/Games"),
    "wsl-unc": cat(BS, BS, "ws", "l.localhost", BS, "Ubuntu"),
    "win-user-path": cat("C:", BS, "Us", "ers", BS, "someone", BS, "Documents"),
    "wow-account": cat("W", "TF", BS, "Account", BS, "SOMEACCOUNT"),
    "account-path": cat("Acc", "ount", BS, "SOMEACCOUNT", BS, "Saved", "Variables"),
    "account-number": cat("acc", "ount/", "1234", "5678#1"),
    "account-id": cat("98765", "43#1"),
    battletag: cat("Some", "body#", "12345"),
    email: cat("some.one", "@", "mail.example.net"),
  };
  assert.deepStrictEqual(Object.keys(samples).sort(), pc.GENERIC.map((g) => g.id).sort(), "one sample per rule");
  for (const [id, s] of Object.entries(samples)) assert.ok(ruleIds(s).includes(id), `${id}: ${s}`);
});

test("placeholder exemption: an <angle-bracket> segment never matches; the bare folder names pass", () => {
  for (const s of [
    cat("W", "TF", BS, "Account", BS, "<ACCOUNT>", BS, "Saved", "Variables", BS, "Auctionator.lua"),
    cat("_classic_beta_/W", "TF/Account/<your account folder>/Saved", "Variables/Auctionator.lua"),
    cat("C:", BS, "Us", "ers", BS, "<you>", BS, "Downloads"),
    cat("/ho", "me/<you>/.config/forever-gear-planner/privacy-denylist.txt"),
    cat("Saved", "Variables"), "WTF", "Account",
  ]) assert.deepStrictEqual(ruleIds(s), [], s);
});

test("account-path rule needs a concrete account segment", () => {
  const sv = cat("Saved", "Variables");
  assert.deepStrictEqual(ruleIds(cat("Acc", "ount/", "SOMEONE/", sv)), ["account-path"]);
  assert.deepStrictEqual(ruleIds(cat("acc", "ount", BS, "<ACCOUNT>", BS, sv)), []);
  assert.deepStrictEqual(ruleIds(cat("the ", sv, " folder of your account")), []);
});

test("e-mail rule exempts noreply, GitHub noreply, example domains and the SSH host", () => {
  for (const s of [cat("noreply", "@anthropic.com"), cat("123+Someone", "@users.noreply.github.com"), cat("a", "@example.com"), cat("git", "@github.com")]) {
    assert.deepStrictEqual(ruleIds(s), [], s);
  }
});

test("allowlist: glob plus rule id silences a generic rule for matching paths only", () => {
  const allow = pc.parseAllow("# comment\ndocs/**/*.md battletag issue references in the docs\n");
  const s = cat("Some", "body#", "12345");
  assert.deepStrictEqual(pc.scanText(s, "docs/a/b.md", { allow }).length, 0);
  assert.deepStrictEqual(pc.scanText(s, "site/app/x.js", { allow }).map((f) => f.rule), ["battletag"]);
  assert.throws(() => pc.parseAllow("docs/*.md nonsense-rule why"), /unknown generic rule/);
  assert.throws(() => pc.parseAllow("docs/*.md battletag"), /expected/);
});

test("private denylist: plain, w: and re: rules, numbered by line, case-insensitive", () => {
  const rules = pc.parseDenylist(["# synthetic list", "", "Zorbulon", "w:Kip", "re:\\bqx[a-z]+(?!dera)\\b", "Ümlautname"].join("\n"));
  assert.deepStrictEqual(rules.map((r) => r.n), [3, 4, 5, 6]);
  const hits = (t) => pc.scanText(t, "f", { private: rules }).map((f) => f.rule);
  assert.deepStrictEqual(hits("meet ZORBULON today"), [3]);
  assert.deepStrictEqual(hits("Kip and kip"), [4, 4]);
  assert.deepStrictEqual(hits("skipping kipper"), [], "w: matches whole words only");
  assert.deepStrictEqual(hits("qxalpha"), [5]);
  assert.deepStrictEqual(hits("ümlautname"), [6]);
  assert.throws(() => pc.parseDenylist("ok\nre:(unclosed"), (e) => /private rule #2: invalid/.test(e.message) && !e.message.includes("unclosed"));
  assert.throws(() => pc.parseDenylist("re:x*"), /empty string/);
});

test("denylist source order: --deny-file, then the env path, then the env content, then the config dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fgp-deny-"));
  const a = path.join(dir, "a.txt"), b = path.join(dir, "b.txt");
  fs.writeFileSync(a, "alpha\n"); fs.writeFileSync(b, "beta\n");
  fs.mkdirSync(path.join(dir, "forever-gear-planner"));
  fs.writeFileSync(path.join(dir, "forever-gear-planner", "privacy-denylist.txt"), "gamma\n");
  const env = { FGP_PRIVACY_DENYLIST_FILE: b, FGP_PRIVACY_DENYLIST: "delta\n", XDG_CONFIG_HOME: dir };
  assert.strictEqual(pc.resolveDenylist({ denyFile: a }, env).text, "alpha\n");
  assert.strictEqual(pc.resolveDenylist({}, env).text, "beta\n");
  assert.strictEqual(pc.resolveDenylist({}, { ...env, FGP_PRIVACY_DENYLIST_FILE: "" }).text, "delta\n");
  assert.strictEqual(pc.resolveDenylist({}, { XDG_CONFIG_HOME: dir }).text, "gamma\n");
  assert.strictEqual(pc.resolveDenylist({}, { XDG_CONFIG_HOME: path.join(dir, "none") }), null);
});

// A throwaway repo: a private name lands in a file that a later commit deletes, in a commit message, a tag
// message and a branch name. The working tree ends clean; history and range modes find each one.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fgp-privacy-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test"); git("config", "user.email", "test@example.com"); git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false"); git("config", "core.hooksPath", "/dev/null");
  fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
  git("add", "."); git("commit", "-q", "-m", "first");
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "notes.txt"), "line one\nmy alt Zorbulon\n");
  git("add", "."); git("commit", "-q", "-m", "notes");
  git("rm", "-q", "notes.txt"); git("commit", "-q", "-m", "drop notes for Zorbulon");
  git("tag", "-a", "v9", "-m", "release by Zorbulon");
  git("branch", "zorbulon-fixes");
  return { dir, git, base };
}
function runIn(dir, argv, env) {
  const out = [], err = [];
  const code = pc.run(argv, { cwd: dir, env, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("modes on a throwaway repo: worktree clean, history finds blob, messages, tag and ref; output redacted", () => {
  const { dir, base } = repo();
  const env = { FGP_PRIVACY_DENYLIST: "# synthetic\nzorbulon\n" };
  assert.strictEqual(runIn(dir, [], env).code, 0);
  const h = runIn(dir, ["--history"], env);
  assert.strictEqual(h.code, 1);
  assert.match(h.out, /notes\.txt \(blob [0-9a-f]{10}\):2: private rule #2/);
  assert.match(h.out, /commit [0-9a-f]{10} message:1: private rule #2/);
  assert.match(h.out, /tag v9 message:\d+: private rule #2/);
  assert.match(h.out, /ref refs\/heads\/\[private #2\]-fixes: \(path\): private rule #2/);
  assert.doesNotMatch(h.out + h.err, /zorbulon/i, "private matches are never printed");
  assert.match(runIn(dir, ["--history", "--show-private"], env).out, /"Zorbulon"/);
  const r = runIn(dir, ["--range", `${base}..main`], env);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /notes\.txt \(blob/);
  assert.strictEqual(runIn(dir, ["--range", "main..main"], env).out.includes("notes.txt"), false);
});

test("staged and message modes; exit codes and the --no-private warning", () => {
  const { dir, git } = repo();
  const env = { FGP_PRIVACY_DENYLIST: "zorbulon\n" };
  fs.writeFileSync(path.join(dir, "b.txt"), cat("path ", "/ho", "me/someone/x\n"));
  git("add", "b.txt");
  const s = runIn(dir, ["--staged"], env);
  assert.strictEqual(s.code, 1);
  assert.match(s.out, /b\.txt:1: rule unix-home/);
  const msg = path.join(dir, ".git", "MSG");
  fs.writeFileSync(msg, "fix for Zorbulon\n");
  assert.strictEqual(runIn(dir, ["--message", msg], env).code, 1);
  fs.writeFileSync(msg, "a clean message\n");
  assert.strictEqual(runIn(dir, ["--message", msg], env).code, 0);
  const none = runIn(dir, [], { XDG_CONFIG_HOME: path.join(dir, "nowhere") });
  assert.strictEqual(none.code, 2);
  assert.match(none.err, /--no-private/);
  const generic = runIn(dir, ["--no-private"], { XDG_CONFIG_HOME: path.join(dir, "nowhere") });
  assert.strictEqual(generic.code, 1, "the staged home path is in the working tree too");
  assert.match(generic.err, /WARNING: --no-private/);
  assert.strictEqual(runIn(dir, ["--bogus"], env).code, 2);
  assert.strictEqual(runIn(dir, ["--staged", "--history"], env).code, 2);
  assert.strictEqual(runIn(dir, ["--range", "nonsense"], env).code, 2);
});
