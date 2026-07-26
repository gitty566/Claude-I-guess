/* geo.js — Phase A geography. Heightmap, climate, the mana field, biomes,
 * continents, rivers and named regions. All of it is a pure function of the
 * seed and the world-gen parameters. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, Names = ISE.Names;

  var SIZES = [
    null,
    { w: 48, h: 32, name: 'Tiny' },
    { w: 64, h: 42, name: 'Small' },
    { w: 84, h: 54, name: 'Medium' },
    { w: 104, h: 66, name: 'Large' },
    { w: 128, h: 80, name: 'Vast' }
  ];

  function pickBiome(h, temp, moist, seaLevel) {
    if (h < seaLevel - 0.12) return 'deep_ocean';
    if (h < seaLevel - 0.03) return 'ocean';
    if (h < seaLevel) return 'coast';
    if (h < seaLevel + 0.02) return 'beach';
    if (h > 0.86) return 'peak';
    if (h > 0.74) return 'mountain';

    if (temp < 0.16) return h > 0.6 ? 'glacier' : (moist > 0.5 ? 'glacier' : 'tundra');
    if (temp < 0.3) return moist > 0.45 ? 'taiga' : 'tundra';

    if (h > 0.6) return 'hills';

    if (temp > 0.78) {
      if (moist < 0.22) return 'desert';
      if (moist < 0.45) return 'savanna';
      if (moist < 0.72) return 'forest';
      return 'jungle';
    }
    if (temp > 0.5) {
      if (moist < 0.2) return 'desert';
      if (moist < 0.4) return 'grassland';
      if (moist < 0.62) return 'plains';
      if (moist < 0.82) return 'forest';
      return 'swamp';
    }
    if (moist < 0.25) return 'grassland';
    if (moist < 0.5) return 'plains';
    if (moist < 0.75) return 'forest';
    return 'deep_forest';
  }

  /* Where the mana field spikes, ordinary terrain gets replaced by a warped
   * variant — this is what makes a high magic-density world visibly stranger
   * on the map, not just numerically richer. */
  function warp(biome, mana, temp, moist) {
    if (biome === 'ocean' || biome === 'deep_ocean' || biome === 'coast') return biome;
    if (mana < 0.86) return biome;
    if (biome === 'forest' || biome === 'deep_forest' || biome === 'taiga') return 'spiritwood';
    if (biome === 'jungle' || biome === 'swamp') return 'bloomrot';
    if (biome === 'desert' || biome === 'beach') return 'glassfield';
    if (biome === 'wasteland' || biome === 'tundra' || biome === 'plains' ||
      biome === 'grassland' || biome === 'savanna') return 'manawaste';
    if (biome === 'mountain' || biome === 'hills') return mana > 0.93 ? 'manawaste' : biome;
    return biome;
  }

  function generate(rng, params) {
    var size = SIZES[U.clamp(params.worldSize, 1, 5)];
    var w = size.w, h = size.h;
    var n = w * h;

    var nHeight = new ISE.Noise(rng.fork('height'));
    var nHeight2 = new ISE.Noise(rng.fork('height2'));
    var nTemp = new ISE.Noise(rng.fork('temp'));
    var nMoist = new ISE.Noise(rng.fork('moist'));
    var nMana = new ISE.Noise(rng.fork('mana'));
    var plateRng = rng.fork('plates');

    var height = new Float32Array(n);
    var temp = new Float32Array(n);
    var moist = new Float32Array(n);
    var mana = new Float32Array(n);
    var biome = new Array(n);
    var land = new Uint8Array(n);
    var river = new Uint8Array(n);

    /* Continent seeds: a few blobs of raised ground so the map isn't one
     * uniform noise field. Count scales with world size. */
    var plateCount = U.clamp(2 + Math.round(params.worldSize * 0.9), 2, 7);
    var plates = [];
    for (var p = 0; p < plateCount; p++) {
      plates.push({
        x: plateRng.range(w * 0.12, w * 0.88),
        y: plateRng.range(h * 0.12, h * 0.88),
        r: plateRng.range(Math.min(w, h) * 0.16, Math.min(w, h) * 0.34),
        s: plateRng.range(0.55, 1.0)
      });
    }

    var scale = 0.055 * (64 / Math.max(w, 48));
    var i, x, y;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        var base = nHeight.fbm(x * scale, y * scale, 5, 1, 0.52, 2.05);
        var ridge = nHeight2.ridged(x * scale * 1.7, y * scale * 1.7, 4, 1);

        var plateBoost = 0;
        for (var q = 0; q < plates.length; q++) {
          var d = U.dist(x, y, plates[q].x, plates[q].y) / plates[q].r;
          if (d < 1) plateBoost = Math.max(plateBoost, (1 - d * d) * plates[q].s);
        }

        // Push the map edges under water so continents have coasts.
        var ex = Math.min(x, w - 1 - x) / (w * 0.5);
        var ey = Math.min(y, h - 1 - y) / (h * 0.5);
        var edge = U.clamp01(Math.min(ex, ey) * 2.2);

        // Land forms mostly on the plates; open noise alone rarely clears
        // sea level, which keeps separate landmasses separate.
        var hv = (base * 0.34 + ridge * 0.2 + plateBoost * 0.78) * (0.3 + 0.7 * edge);
        height[i] = U.clamp01(hv);
      }
    }

    /* Normalise so sea level always yields a sane land fraction. */
    var sorted = Array.prototype.slice.call(height).sort(function (a, b) { return a - b; });
    var landFraction = 0.34 + rng.range(-0.05, 0.08);
    var seaLevel = sorted[Math.floor(sorted.length * (1 - landFraction))];

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        // Latitude band: cold poles, hot equator, wobbled by noise.
        var lat = Math.abs((y / (h - 1)) - 0.5) * 2;
        var tv = 1 - lat;
        tv = tv * 0.82 + nTemp.fbm(x * scale * 0.8, y * scale * 0.8, 3, 1, 0.5, 2) * 0.3;
        tv -= Math.max(0, height[i] - seaLevel) * 0.75;
        temp[i] = U.clamp01(tv);

        var mv = nMoist.fbm(x * scale * 1.15 + 40, y * scale * 1.15 - 25, 4, 1, 0.5, 2);
        mv = mv * 0.85 + (1 - Math.abs(height[i] - seaLevel) * 1.6) * 0.25;
        moist[i] = U.clamp01(mv);

        var mn = nMana.fbm(x * scale * 0.9 - 70, y * scale * 0.9 + 60, 4, 1, 0.55, 2.2);
        // magicDensity lifts the whole field and sharpens its peaks.
        mn = Math.pow(mn, 1.7 - params.magicDensity) * (0.45 + params.magicDensity * 1.05);
        mana[i] = U.clamp01(mn);

        var b = pickBiome(height[i], temp[i], moist[i], seaLevel);
        if (T.BIOMES[b].land && height[i] > seaLevel + 0.3 && moist[i] < 0.18 && temp[i] > 0.6) {
          b = 'wasteland';
        }
        // Hot, high, dry ground near strong mana turns volcanic.
        if ((b === 'mountain' || b === 'peak') && temp[i] > 0.55 && mana[i] > 0.6) b = 'volcano';
        b = warp(b, mana[i], temp[i], moist[i]);
        biome[i] = b;
        land[i] = T.BIOMES[b].land ? 1 : 0;
      }
    }

    /* --------------------------------------------------------- landmasses */
    var landmass = new Int16Array(n).fill(-1);
    var continents = [];
    var stack = [];
    for (i = 0; i < n; i++) {
      if (!land[i] || landmass[i] >= 0) continue;
      var id = continents.length;
      var tiles = [];
      stack.length = 0;
      stack.push(i);
      landmass[i] = id;
      while (stack.length) {
        var cur = stack.pop();
        tiles.push(cur);
        var cx = cur % w, cy = (cur / w) | 0;
        for (var d2 = 0; d2 < U.NEIGHBORS4.length; d2++) {
          var nx = cx + U.NEIGHBORS4[d2][0], ny = cy + U.NEIGHBORS4[d2][1];
          if (!U.inBounds(nx, ny, w, h)) continue;
          var ni = ny * w + nx;
          if (land[ni] && landmass[ni] < 0) { landmass[ni] = id; stack.push(ni); }
        }
      }
      continents.push({ id: id, tiles: tiles, size: tiles.length, name: null });
    }
    continents.sort(function (a, b) { return b.size - a.size; });
    var nameRng = rng.fork('geo_names');
    continents.forEach(function (c, idx) {
      c.rank = idx;
      c.name = c.size < 12 ? Names.place(nameRng, 'common') + ' Isle'
        : Names.continent(nameRng, nameRng.pick(['common', 'elven', 'draconic', 'arcane']));
      // Re-key landmass ids to the sorted order.
      for (var k = 0; k < c.tiles.length; k++) landmass[c.tiles[k]] = idx;
      c.id = idx;
    });

    /* ------------------------------------------------------------- rivers */
    var riverRng = rng.fork('rivers');
    var riverCount = Math.round(n / 420 * (0.6 + rng.next() * 0.8));
    for (var r = 0; r < riverCount; r++) {
      var start = -1, tries = 0;
      while (tries++ < 60) {
        var ci = riverRng.int(0, n - 1);
        if (land[ci] && height[ci] > seaLevel + 0.22) { start = ci; break; }
      }
      if (start < 0) continue;
      var cur2 = start, steps = 0;
      while (steps++ < 200) {
        river[cur2] = 1;
        var bx = cur2 % w, by = (cur2 / w) | 0;
        var best = -1, bestH = height[cur2];
        for (var d3 = 0; d3 < U.NEIGHBORS8.length; d3++) {
          var rx = bx + U.NEIGHBORS8[d3][0], ry = by + U.NEIGHBORS8[d3][1];
          if (!U.inBounds(rx, ry, w, h)) continue;
          var ri = ry * w + rx;
          if (height[ri] < bestH) { bestH = height[ri]; best = ri; }
        }
        if (best < 0 || !land[best]) break;
        cur2 = best;
      }
    }

    /* ------------------------------------------------------------ regions */
    var regionCount = U.clamp(Math.round(n / 320), 6, 40);
    var regionRng = rng.fork('regions');
    var seeds = [];
    var landTiles = [];
    for (i = 0; i < n; i++) if (land[i]) landTiles.push(i);
    for (var s = 0; s < regionCount && landTiles.length; s++) {
      seeds.push(landTiles[regionRng.int(0, landTiles.length - 1)]);
    }
    var regionOf = new Int16Array(n).fill(-1);
    var regions = seeds.map(function (si, ri) {
      return { id: ri, seed: si, tiles: [], name: null, biome: null, mana: 0, danger: 0 };
    });
    for (var li = 0; li < landTiles.length; li++) {
      var ti = landTiles[li];
      var tx = ti % w, ty = (ti / w) | 0;
      var bestR = 0, bestD = Infinity;
      for (var si2 = 0; si2 < seeds.length; si2++) {
        var sx = seeds[si2] % w, sy = (seeds[si2] / w) | 0;
        var dd = U.dist2(tx, ty, sx, sy);
        if (dd < bestD) { bestD = dd; bestR = si2; }
      }
      regionOf[ti] = bestR;
      regions[bestR].tiles.push(ti);
    }
    regions.forEach(function (reg) {
      if (!reg.tiles.length) { reg.name = 'The Empty Quarter'; reg.biome = 'plains'; return; }
      var counts = {}, manaSum = 0;
      reg.tiles.forEach(function (ti2) {
        counts[biome[ti2]] = (counts[biome[ti2]] || 0) + 1;
        manaSum += mana[ti2];
      });
      var dom = null, domN = -1;
      for (var b2 in counts) if (counts[b2] > domN) { domN = counts[b2]; dom = b2; }
      reg.biome = dom;
      reg.mana = manaSum / reg.tiles.length;
      reg.name = Names.region(regionRng, T.BIOMES[dom].name);
      reg.danger = T.BIOMES[dom].danger;
    });

    /* --------------------------------------------------------- base danger */
    var danger = new Float32Array(n);
    for (i = 0; i < n; i++) {
      if (!land[i]) { danger[i] = 0; continue; }
      var bd = T.BIOMES[biome[i]].danger;
      danger[i] = bd + mana[i] * 4 * (0.5 + params.monsterCeiling / 12);
    }

    var availableBiomes = {};
    for (i = 0; i < n; i++) availableBiomes[biome[i]] = true;

    return {
      w: w, h: h, size: size.name, seaLevel: seaLevel,
      height: height, temp: temp, moist: moist, mana: mana,
      biome: biome, land: land, river: river, danger: danger,
      landmass: landmass, continents: continents,
      regionOf: regionOf, regions: regions,
      landTiles: landTiles,
      availableBiomes: availableBiomes,
      idx: function (x, y) { return y * w + x; },
      xy: function (i2) { return { x: i2 % w, y: (i2 / w) | 0 }; },
      biomeAt: function (x, y) { return biome[y * w + x]; },
      isLand: function (x, y) { return U.inBounds(x, y, w, h) && !!land[y * w + x]; },
      regionAt: function (i2) { return regions[regionOf[i2]] || null; }
    };
  }

  ISE.Geo = { generate: generate, SIZES: SIZES, pickBiome: pickBiome };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
