/* rng.js — seedable deterministic pseudo-random number generation.
 *
 * Every generator in the engine draws from one of these. Nothing calls
 * Math.random(), so a seed string always reproduces the same world.
 */
(function (ISE) {
  'use strict';

  // xmur3: string -> 32-bit seed sequence. Used to turn seed strings
  // (and stream labels) into integer seeds for mulberry32.
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32: fast 32-bit PRNG, period 2^32. Plenty for world-gen.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = String(seed);
    var h = xmur3(this.seed);
    this._state = h();
    this._next = mulberry32(this._state);
    this.calls = 0;
  }

  RNG.prototype.next = function () {
    this.calls++;
    return this._next();
  };

  /* Float in [a, b). One arg means [0, a). */
  RNG.prototype.range = function (a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + this.next() * (b - a);
  };

  /* Integer in [a, b] inclusive. */
  RNG.prototype.int = function (a, b) {
    if (b === undefined) { b = a; a = 0; }
    if (b < a) { var t = a; a = b; b = t; }
    return a + Math.floor(this.next() * (b - a + 1));
  };

  RNG.prototype.chance = function (p) { return this.next() < p; };

  RNG.prototype.pick = function (arr) {
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  };

  /* Pick n distinct members (or fewer if the array is short). */
  RNG.prototype.sample = function (arr, n) {
    var copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  };

  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /* Weighted pick.
   * Accepts either [[value, weight], ...] or [{w: n, ...}, ...] or an
   * object map {key: weight}. Returns the chosen value / object / key. */
  RNG.prototype.weighted = function (entries, weightKey) {
    var list = [];
    var total = 0;
    var i;
    if (!Array.isArray(entries)) {
      for (var k in entries) {
        if (Object.prototype.hasOwnProperty.call(entries, k)) {
          var w0 = entries[k];
          if (w0 > 0) { list.push([k, w0]); total += w0; }
        }
      }
    } else {
      for (i = 0; i < entries.length; i++) {
        var e = entries[i];
        var val, w;
        if (Array.isArray(e)) { val = e[0]; w = e[1]; }
        else { val = e; w = e[weightKey || 'w']; }
        if (w === undefined) w = 1;
        if (w > 0) { list.push([val, w]); total += w; }
      }
    }
    if (!list.length || total <= 0) return undefined;
    var roll = this.next() * total;
    for (i = 0; i < list.length; i++) {
      roll -= list[i][1];
      if (roll <= 0) return list[i][0];
    }
    return list[list.length - 1][0];
  };

  /* Approximate normal via sum of uniforms (Irwin–Hall, n=4). */
  RNG.prototype.gauss = function (mean, sd) {
    var s = 0;
    for (var i = 0; i < 4; i++) s += this.next();
    return mean + ((s - 2) / 0.5773502691896257) * (sd || 1) * 0.5;
  };

  /* Random integer weighted toward the low end. bias > 1 skews lower. */
  RNG.prototype.skewedInt = function (a, b, bias) {
    var t = Math.pow(this.next(), bias || 2);
    return a + Math.floor(t * (b - a + 1));
  };

  /* Derive an independent, reproducible sub-stream. Forking by label keeps
   * subsystems from perturbing each other's sequences when one changes. */
  RNG.prototype.fork = function (label) {
    return new RNG(this.seed + '::' + label);
  };

  /* A throwaway stream keyed off arbitrary values — used for "what does
   * this specific entity roll" without disturbing the parent stream. */
  RNG.of = function () {
    return new RNG(Array.prototype.join.call(arguments, '|'));
  };

  RNG.hash = function (str) { return xmur3(String(str))(); };

  /* Human-friendly random seed for the "new seed" button. */
  RNG.randomSeed = function () {
    var syl = ['ka', 'zi', 'ru', 'mo', 'the', 'lyn', 'dra', 'sev', 'ith', 'ora',
      'gan', 'ves', 'tal', 'nim', 'qui', 'bro', 'xen', 'ael', 'per', 'sun'];
    var out = '';
    for (var i = 0; i < 3; i++) out += syl[Math.floor(Math.random() * syl.length)];
    return out.charAt(0).toUpperCase() + out.slice(1) + '-' +
      Math.floor(Math.random() * 9000 + 1000);
  };

  ISE.RNG = RNG;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
