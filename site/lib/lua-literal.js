// Reader for WoW saved-variables files: `NAME = value` statements whose values are Lua literals
// (docs/pricing-import.md §1.3, §2.3). Works on bytes (Uint8Array) because the files hold raw binary strings.
// Strings come back as Uint8Array, tables as Map with string keys (numbers via String(k), byte keys as Latin-1).
// Classic script and CommonJS; no DOM.
(function (root) {
  "use strict";

  function LuaError(message, offset) {
    var e = new Error(message + " at byte " + offset);
    e.name = "LuaError";
    e.offset = offset;
    return e;
  }

  var ESC = { 110: 10, 114: 13, 116: 9, 97: 7, 98: 8, 102: 12, 118: 11, 92: 92, 34: 34, 39: 39, 10: 10, 13: 10 };

  function isDigit(c) { return c >= 48 && c <= 57; }
  function isNameStart(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; }
  function isName(c) { return isNameStart(c) || isDigit(c); }

  function latin1(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 8192)));
    return s;
  }

  function Parser(b, pos) { this.b = b; this.i = pos || 0; this.depth = 0; }

  Parser.prototype.ws = function () {
    var b = this.b, n = b.length;
    for (;;) {
      var c = b[this.i];
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) { this.i++; continue; }
      if (c === 45 && b[this.i + 1] === 45) {
        var j = this.i + 2;
        if (b[j] === 91) {
          var k = j + 1, level = 0;
          while (b[k] === 61) { level++; k++; }
          if (b[k] === 91) {
            var close = "]" + new Array(level + 1).join("=") + "]", start = this.i;
            k++;
            for (;;) {
              if (k >= n) throw LuaError("unfinished long comment", start);
              if (b[k] === 93) {
                var m = 0;
                while (m < close.length && b[k + m] === close.charCodeAt(m)) m++;
                if (m === close.length) { k += m; break; }
              }
              k++;
            }
            this.i = k;
            continue;
          }
        }
        while (this.i < n && b[this.i] !== 10) this.i++;
        continue;
      }
      return;
    }
  };

  Parser.prototype.name = function () {
    var b = this.b, s = this.i;
    if (!isNameStart(b[s])) return null;
    var e = s + 1;
    while (e < b.length && isName(b[e])) e++;
    this.i = e;
    return latin1(b.subarray(s, e));
  };

  Parser.prototype.string = function () {
    var b = this.b, q = b[this.i], start = this.i, n = b.length;
    var k = start + 1, len = 0;
    // First pass: find the end and the decoded length.
    for (;;) {
      if (k >= n) throw LuaError("unfinished string", start);
      var c = b[k];
      if (c === q) break;
      if (c === 10) throw LuaError("line break inside a string", k);
      if (c === 92) {
        var d = b[k + 1];
        if (isDigit(d)) { k += 2; for (var t = 0; t < 2 && isDigit(b[k]); t++) k++; len++; continue; }
        if (d === 13 && b[k + 2] === 10) { k += 3; len++; continue; }
        if (ESC[d] === undefined) throw LuaError("unsupported escape \\" + String.fromCharCode(d), k);
        k += 2; len++; continue;
      }
      k++; len++;
    }
    var out = new Uint8Array(len), o = 0, i = start + 1;
    while (i < k) {
      var ch = b[i];
      if (ch !== 92) { out[o++] = ch; i++; continue; }
      var e = b[i + 1];
      if (isDigit(e)) {
        var v = 0, j = i + 1;
        for (var u = 0; u < 3 && isDigit(b[j]); u++, j++) v = v * 10 + (b[j] - 48);
        if (v > 255) throw LuaError("escape \\" + v + " is larger than 255", i);
        out[o++] = v; i = j; continue;
      }
      if (e === 13 && b[i + 2] === 10) { out[o++] = 10; i += 3; continue; }
      out[o++] = ESC[e]; i += 2;
    }
    this.i = k + 1;
    return out;
  };

  Parser.prototype.number = function () {
    var b = this.b, s = this.i, i = s;
    if (b[i] === 45) i++;
    var text;
    if (b[i] === 48 && (b[i + 1] === 120 || b[i + 1] === 88)) {
      i += 2;
      var h = i;
      while (/[0-9a-fA-F]/.test(String.fromCharCode(b[i] || 0))) i++;
      if (i === h) throw LuaError("bad hex number", s);
      text = latin1(b.subarray(h, i));
      this.i = i;
      var hv = parseInt(text, 16);
      return b[s] === 45 ? -hv : hv;
    }
    var d0 = i;
    while (isDigit(b[i])) i++;
    if (b[i] === 46) { i++; while (isDigit(b[i])) i++; }
    if (i === d0 || (i === d0 + 1 && b[d0] === 46)) throw LuaError("bad number", s);
    if (b[i] === 101 || b[i] === 69) {
      i++;
      if (b[i] === 43 || b[i] === 45) i++;
      var e0 = i;
      while (isDigit(b[i])) i++;
      if (i === e0) throw LuaError("bad exponent", s);
    }
    this.i = i;
    return Number(latin1(b.subarray(s, i)));
  };

  Parser.prototype.value = function () {
    this.ws();
    var b = this.b, c = b[this.i];
    if (c === 34 || c === 39) return this.string();
    if (c === 123) return this.table();
    if (c === 45 || c === 46 || isDigit(c)) return this.number();
    if (c === 91 && (b[this.i + 1] === 91 || b[this.i + 1] === 61)) throw LuaError("long strings are not supported", this.i);
    var s = this.i, nm = this.name();
    if (nm === "true") return true;
    if (nm === "false") return false;
    if (nm === "nil") return null;
    if (this.i >= b.length) throw LuaError("unexpected end of file", s);
    throw LuaError("unexpected " + (nm ? "name " + nm : "byte 0x" + c.toString(16)), s);
  };

  function keyOf(v, at) {
    if (v instanceof Uint8Array) return latin1(v);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    throw LuaError("unsupported table key", at);
  }

  Parser.prototype.table = function () {
    var b = this.b, start = this.i;
    if (++this.depth > 64) throw LuaError("tables nested too deeply", start);
    this.i++;
    var t = new Map(), pos = 1;
    for (;;) {
      this.ws();
      if (b[this.i] === 125) { this.i++; break; }
      if (this.i >= b.length) throw LuaError("unfinished table", start);
      var at = this.i;
      if (b[this.i] === 91 && b[this.i + 1] !== 91 && b[this.i + 1] !== 61) {
        this.i++;
        var k = this.value();
        this.ws();
        if (b[this.i] !== 93) throw LuaError("expected ]", this.i);
        this.i++;
        this.ws();
        if (b[this.i] !== 61) throw LuaError("expected =", this.i);
        this.i++;
        t.set(keyOf(k, at), this.value());
      } else if (isNameStart(b[this.i])) {
        var save = this.i, nm = this.name();
        this.ws();
        if (b[this.i] === 61 && b[this.i + 1] !== 61 && nm !== "true" && nm !== "false" && nm !== "nil") {
          this.i++;
          t.set(nm, this.value());
        } else {
          this.i = save;
          t.set(String(pos++), this.value());
        }
      } else {
        t.set(String(pos++), this.value());
      }
      this.ws();
      if (b[this.i] === 44 || b[this.i] === 59) { this.i++; continue; }
      if (b[this.i] === 125) { this.i++; break; }
      throw LuaError("expected , or } in table", this.i);
    }
    this.depth--;
    return t;
  };

  // Parse a whole file into a Map of globals. opts.keep: names to keep (others are parsed and dropped).
  function parseFile(bytes, opts) {
    var p = new Parser(bytes, 0), out = new Map(), keep = opts && opts.keep;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) p.i = 3;
    for (;;) {
      p.ws();
      if (p.i >= bytes.length) return out;
      var at = p.i, nm = p.name();
      if (!nm) throw LuaError("expected a global name", at);
      p.ws();
      if (bytes[p.i] !== 61) throw LuaError("expected = after " + nm, p.i);
      p.i++;
      var v = p.value();
      if (!keep || keep.indexOf(nm) >= 0) out.set(nm, v);
    }
  }

  // One global, with the fallback of §2.3: when the whole file does not parse (an unrelated global with an
  // unexpected token), retry from the line that starts with `NAME = `. Returns {found, value, fallback}.
  function readGlobal(bytes, name) {
    try {
      var all = parseFile(bytes, { keep: [name] });
      return { found: all.has(name), value: all.has(name) ? all.get(name) : undefined, fallback: false };
    } catch (e) {
      var needle = name + " = ", first = e;
      for (var i = 0; i < bytes.length; i++) {
        if (i > 0 && bytes[i - 1] !== 10) continue;
        var ok = true;
        for (var j = 0; j < needle.length; j++) if (bytes[i + j] !== needle.charCodeAt(j)) { ok = false; break; }
        if (!ok) continue;
        var p = new Parser(bytes, i + needle.length);
        return { found: true, value: p.value(), fallback: true };
      }
      throw first;
    }
  }

  var api = { parseFile: parseFile, readGlobal: readGlobal, latin1: latin1, LuaError: LuaError };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.luaLiteral = api; }
})(this);
