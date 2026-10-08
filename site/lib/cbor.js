// CBOR decoder for Auctionator's price blobs (RFC 8949 subset, docs/pricing-import.md §2.4): Blizzard's
// C_EncodingUtil.SerializeCBOR (byte strings, empty arrays) and LibCBOR (text strings, float64).
// Maps become Map with String(key) keys; byte strings become Latin-1 JS strings. Classic script and CommonJS.
(function (root) {
  "use strict";

  var MAX_DEPTH = 32;

  function CborError(message, offset) {
    var e = new Error(message + " at byte " + offset);
    e.name = "CborError";
    e.offset = offset;
    return e;
  }

  var utf8 = new TextDecoder("utf-8");

  function half(h) {
    var exp = (h >> 10) & 0x1f, mant = h & 0x3ff, v;
    if (exp === 0) v = mant * Math.pow(2, -24);
    else if (exp === 31) v = mant ? NaN : Infinity;
    else v = (mant + 1024) * Math.pow(2, exp - 25);
    return h & 0x8000 ? -v : v;
  }

  function decode(bytes) {
    var b = bytes, n = b.length, i = 0;
    var view = new DataView(b.buffer, b.byteOffset, b.byteLength);

    function need(k, at) { if (i + k > n) throw CborError("truncated", at); }

    function arg(ai, at) {
      if (ai < 24) return ai;
      if (ai === 24) { need(1, at); return b[i++]; }
      if (ai === 25) { need(2, at); var v2 = view.getUint16(i); i += 2; return v2; }
      if (ai === 26) { need(4, at); var v4 = view.getUint32(i); i += 4; return v4; }
      if (ai === 27) {
        need(8, at);
        var hi = view.getUint32(i), lo = view.getUint32(i + 4);
        i += 8;
        if (hi > 0x1fffff) throw CborError("integer above 2^53", at);
        return hi * 4294967296 + lo;
      }
      if (ai === 31) throw CborError("indefinite length not supported", at);
      throw CborError("reserved additional information " + ai, at);
    }

    function str(len, at) {
      need(len, at);
      var s = "";
      for (var k = i; k < i + len; k += 8192) s += String.fromCharCode.apply(null, b.subarray(k, Math.min(i + len, k + 8192)));
      i += len;
      return s;
    }

    function item(depth) {
      if (depth > MAX_DEPTH) throw CborError("nested deeper than " + MAX_DEPTH, i);
      var at = i;
      need(1, at);
      var ib = b[i++], mt = ib >> 5, ai = ib & 31, len, k, out;
      switch (mt) {
        case 0: return arg(ai, at);
        case 1: return -1 - arg(ai, at);
        case 2: return str(arg(ai, at), at);
        case 3:
          len = arg(ai, at);
          need(len, at);
          out = utf8.decode(b.subarray(i, i + len));
          i += len;
          return out;
        case 4:
          len = arg(ai, at);
          out = [];
          for (k = 0; k < len; k++) out.push(item(depth + 1));
          return out;
        case 5:
          len = arg(ai, at);
          out = new Map();
          for (k = 0; k < len; k++) {
            var key = item(depth + 1);
            out.set(String(key), item(depth + 1));
          }
          return out;
        case 6:
          arg(ai, at);
          return item(depth + 1);
        default:
          if (ai === 20) return false;
          if (ai === 21) return true;
          if (ai === 22 || ai === 23) return null;
          if (ai === 25) { need(2, at); var h = view.getUint16(i); i += 2; return half(h); }
          if (ai === 26) { need(4, at); var f = view.getFloat32(i); i += 4; return f; }
          if (ai === 27) { need(8, at); var d = view.getFloat64(i); i += 8; return d; }
          if (ai === 31) throw CborError("indefinite length not supported", at);
          throw CborError("unsupported simple value " + ai, at);
      }
    }

    var v = item(0);
    if (i !== n) throw CborError("trailing bytes after the root item", i);
    return v;
  }

  var api = { decode: decode, CborError: CborError, MAX_DEPTH: MAX_DEPTH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.cbor = api; }
})(this);
