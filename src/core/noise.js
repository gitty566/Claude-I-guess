/* noise.js — seeded value noise + fBm, used to build heightmaps,
 * temperature/moisture fields and the mana field. */
(function (ISE) {
  'use strict';

  var U = ISE.U;

  function Noise(rng) {
    // 256-entry permutation of random gradients-as-values.
    this.p = new Float64Array(512);
    for (var i = 0; i < 512; i++) this.p[i] = rng.next();
    this.ox = rng.range(0, 1024);
    this.oy = rng.range(0, 1024);
  }

  Noise.prototype._hash = function (xi, yi) {
    // Cheap 2D hash into the permutation table.
    var h = (xi * 374761393 + yi * 668265263) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177) | 0;
    return this.p[(h ^ (h >>> 16)) & 511];
  };

  Noise.prototype.value2 = function (x, y) {
    x += this.ox; y += this.oy;
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = U.smoothstep(x - x0), fy = U.smoothstep(y - y0);
    var v00 = this._hash(x0, y0);
    var v10 = this._hash(x0 + 1, y0);
    var v01 = this._hash(x0, y0 + 1);
    var v11 = this._hash(x0 + 1, y0 + 1);
    var a = v00 + (v10 - v00) * fx;
    var b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
  };

  /* Fractal Brownian motion — sum of octaves. Returns roughly 0..1. */
  Noise.prototype.fbm = function (x, y, octaves, freq, persistence, lacunarity) {
    octaves = octaves || 4;
    freq = freq || 1;
    persistence = persistence === undefined ? 0.5 : persistence;
    lacunarity = lacunarity || 2;
    var amp = 1, total = 0, norm = 0;
    for (var o = 0; o < octaves; o++) {
      total += this.value2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return total / norm;
  };

  /* Ridged variant — gives mountain spines rather than rolling blobs. */
  Noise.prototype.ridged = function (x, y, octaves, freq) {
    octaves = octaves || 4;
    freq = freq || 1;
    var amp = 1, total = 0, norm = 0;
    for (var o = 0; o < octaves; o++) {
      var n = 1 - Math.abs(this.value2(x * freq, y * freq) * 2 - 1);
      total += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return total / norm;
  };

  ISE.Noise = Noise;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
