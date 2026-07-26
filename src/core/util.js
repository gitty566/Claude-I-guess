/* util.js — small shared helpers. No game logic lives here. */
(function (ISE) {
  'use strict';

  var U = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.clamp01 = function (v) { return U.clamp(v, 0, 1); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.invLerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  U.smoothstep = function (t) { return t * t * (3 - 2 * t); };
  U.round = function (v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; };

  /* Map a 0..1 value onto a discrete band list. */
  U.band = function (v, bands) {
    for (var i = 0; i < bands.length; i++) {
      if (v <= bands[i][0]) return bands[i][1];
    }
    return bands[bands.length - 1][1];
  };

  U.sum = function (arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i], i) : arr[i];
    return t;
  };

  U.maxBy = function (arr, fn) {
    var best = null, bv = -Infinity;
    for (var i = 0; i < arr.length; i++) {
      var v = fn(arr[i], i);
      if (v > bv) { bv = v; best = arr[i]; }
    }
    return best;
  };

  U.minBy = function (arr, fn) { return U.maxBy(arr, function (x, i) { return -fn(x, i); }); };

  U.groupBy = function (arr, fn) {
    var out = {};
    for (var i = 0; i < arr.length; i++) {
      var k = fn(arr[i], i);
      (out[k] = out[k] || []).push(arr[i]);
    }
    return out;
  };

  U.unique = function (arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = String(arr[i]);
      if (!seen[k]) { seen[k] = 1; out.push(arr[i]); }
    }
    return out;
  };

  U.remove = function (arr, item) {
    var i = arr.indexOf(item);
    if (i >= 0) arr.splice(i, 1);
    return arr;
  };

  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* Shallow merge of later objects into the first. */
  U.assign = function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  };

  U.capitalize = function (s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  };

  U.titleCase = function (s) {
    return String(s).replace(/\w\S*/g, function (t) {
      return t.charAt(0).toUpperCase() + t.substr(1);
    });
  };

  /* "12,345" */
  U.num = function (n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  U.pct = function (n, d) { return U.round(n * 100, d === undefined ? 0 : d) + '%'; };

  U.signed = function (n) { return (n >= 0 ? '+' : '') + U.round(n, 2); };

  /* Compact big numbers for tight UI slots. */
  U.short = function (n) {
    var a = Math.abs(n);
    if (a >= 1e9) return U.round(n / 1e9, 1) + 'B';
    if (a >= 1e6) return U.round(n / 1e6, 1) + 'M';
    if (a >= 1e4) return U.round(n / 1e3, 1) + 'k';
    return U.num(n);
  };

  /* Sequential ids, namespaced. World-gen determinism relies on these being
   * requested in a fixed order, which the generators guarantee. */
  function IdGen() { this.counters = {}; }
  IdGen.prototype.next = function (ns) {
    this.counters[ns] = (this.counters[ns] || 0) + 1;
    return ns + '_' + this.counters[ns];
  };
  U.IdGen = IdGen;

  /* Grid helpers — the world map is a flat array of W*H tiles. */
  U.idx = function (x, y, w) { return y * w + x; };
  U.inBounds = function (x, y, w, h) { return x >= 0 && y >= 0 && x < w && y < h; };

  U.NEIGHBORS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  U.NEIGHBORS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  U.neighbors = function (x, y, w, h, diag) {
    var dirs = diag ? U.NEIGHBORS8 : U.NEIGHBORS4;
    var out = [];
    for (var i = 0; i < dirs.length; i++) {
      var nx = x + dirs[i][0], ny = y + dirs[i][1];
      if (U.inBounds(nx, ny, w, h)) out.push([nx, ny]);
    }
    return out;
  };

  U.dist = function (x1, y1, x2, y2) {
    var dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  };

  U.dist2 = function (x1, y1, x2, y2) {
    var dx = x1 - x2, dy = y1 - y2;
    return dx * dx + dy * dy;
  };

  /* Simple binary min-heap, used by territory growth and pathing. */
  function Heap(cmp) { this.items = []; this.cmp = cmp || function (a, b) { return a - b; }; }
  Heap.prototype.push = function (item) {
    this.items.push(item);
    var i = this.items.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.cmp(this.items[i], this.items[p]) < 0) {
        var t = this.items[i]; this.items[i] = this.items[p]; this.items[p] = t;
        i = p;
      } else break;
    }
  };
  Heap.prototype.pop = function () {
    var top = this.items[0];
    var last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      var i = 0, n = this.items.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < n && this.cmp(this.items[l], this.items[s]) < 0) s = l;
        if (r < n && this.cmp(this.items[r], this.items[s]) < 0) s = r;
        if (s === i) break;
        var t = this.items[i]; this.items[i] = this.items[s]; this.items[s] = t;
        i = s;
      }
    }
    return top;
  };
  Object.defineProperty(Heap.prototype, 'size', {
    get: function () { return this.items.length; }
  });
  U.Heap = Heap;

  /* Template filler: "The {adj} {noun}" with {token} lookups. */
  U.fill = function (tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] !== undefined ? vars[k] : m;
    });
  };

  U.plural = function (n, one, many) {
    return n === 1 ? one : (many || one + 's');
  };

  /* Roman numerals for dynasties and evolution ranks. */
  U.roman = function (n) {
    var table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'],
      [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'],
      [5, 'V'], [4, 'IV'], [1, 'I']];
    var out = '';
    for (var i = 0; i < table.length; i++) {
      while (n >= table[i][0]) { out += table[i][1]; n -= table[i][0]; }
    }
    return out || 'I';
  };

  /* In-world calendar. 12 months x 30 days = 360-day year. */
  U.MONTHS = ['Frostwane', 'Thawtide', 'Seedfall', 'Greening', 'Highsun', 'Emberpeak',
    'Goldreap', 'Duskmoth', 'Rainveil', 'Leafrot', 'Longnight', 'Deepcold'];
  U.DAYS_PER_MONTH = 30;
  U.MONTHS_PER_YEAR = 12;
  U.DAYS_PER_YEAR = U.DAYS_PER_MONTH * U.MONTHS_PER_YEAR;

  U.dateOf = function (dayNumber) {
    var y = Math.floor(dayNumber / U.DAYS_PER_YEAR);
    var rem = dayNumber - y * U.DAYS_PER_YEAR;
    var m = Math.floor(rem / U.DAYS_PER_MONTH);
    var d = rem - m * U.DAYS_PER_MONTH;
    return { year: y, month: m, day: d + 1 };
  };

  U.formatDate = function (dayNumber) {
    var dt = U.dateOf(dayNumber);
    return dt.day + ' ' + U.MONTHS[dt.month] + ', Year ' + dt.year;
  };

  U.formatYear = function (year) { return 'Year ' + year; };

  ISE.U = U;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
