/* ui/map.js — canvas world map. Draws biomes, nation borders, settlements,
 * dungeons, monster factions and the player, and handles click/hover. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var MapView = {
    canvas: null, ctx: null,
    terrainCache: null,
    zoom: 1, offsetX: 0, offsetY: 0,
    hover: null,
    mode: 'political',
    onSelect: null,
    _dirty: true
  };

  MapView.MODES = [
    { id: 'political', name: 'Political' },
    { id: 'terrain', name: 'Terrain' },
    { id: 'danger', name: 'Danger' },
    { id: 'mana', name: 'Mana' }
  ];

  MapView.init = function (canvas, onSelect) {
    MapView.canvas = canvas;
    MapView.ctx = canvas.getContext('2d');
    MapView.onSelect = onSelect;

    canvas.addEventListener('mousemove', function (e) {
      var t = MapView.tileAt(e);
      if (!t) { MapView.hover = null; return; }
      if (!MapView.hover || MapView.hover.x !== t.x || MapView.hover.y !== t.y) {
        MapView.hover = t;
        MapView.draw();
      }
    });
    canvas.addEventListener('mouseleave', function () {
      MapView.hover = null;
      MapView.draw();
    });
    canvas.addEventListener('click', function (e) {
      var t = MapView.tileAt(e);
      if (t && MapView.onSelect) MapView.onSelect(t.x, t.y);
    });
  };

  MapView.tileSize = function (world) {
    if (!MapView.canvas) return 6;
    var c = MapView.canvas;
    return Math.max(2, Math.min(c.width / world.geo.w, c.height / world.geo.h));
  };

  MapView.tileAt = function (e) {
    var world = ISE.Game.state.world;
    if (!world || !MapView.canvas) return null;
    var rect = MapView.canvas.getBoundingClientRect();
    var scaleX = MapView.canvas.width / rect.width;
    var scaleY = MapView.canvas.height / rect.height;
    var px = (e.clientX - rect.left) * scaleX;
    var py = (e.clientY - rect.top) * scaleY;
    var ts = MapView.tileSize(world);
    var ox = (MapView.canvas.width - world.geo.w * ts) / 2;
    var oy = (MapView.canvas.height - world.geo.h * ts) / 2;
    var x = Math.floor((px - ox) / ts);
    var y = Math.floor((py - oy) / ts);
    if (!U.inBounds(x, y, world.geo.w, world.geo.h)) return null;
    return { x: x, y: y, tile: y * world.geo.w + x };
  };

  MapView.invalidate = function () {
    MapView.terrainCache = null;
    MapView._dirty = true;
  };

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = U.clamp(((n >> 16) & 255) + amount, 0, 255);
    var g = U.clamp(((n >> 8) & 255) + amount, 0, 255);
    var b = U.clamp((n & 255) + amount, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* Terrain is expensive and rarely changes — render once to an offscreen
   * canvas and blit it, then draw the volatile overlays on top. */
  function renderTerrain(world) {
    var geo = world.geo;
    var ts = MapView.tileSize(world);
    var off = document.createElement('canvas');
    off.width = Math.ceil(geo.w * ts);
    off.height = Math.ceil(geo.h * ts);
    var c = off.getContext('2d');

    for (var y = 0; y < geo.h; y++) {
      for (var x = 0; x < geo.w; x++) {
        var i = y * geo.w + x;
        var color;
        if (MapView.mode === 'danger') {
          if (!geo.land[i]) color = '#0d1a26';
          else {
            var d = U.clamp01(geo.danger[i] / 14);
            color = 'rgb(' + Math.round(40 + d * 200) + ',' + Math.round(90 - d * 70) +
              ',' + Math.round(70 - d * 45) + ')';
          }
        } else if (MapView.mode === 'mana') {
          if (!geo.land[i]) color = '#0d1a26';
          else {
            var m = geo.mana[i];
            color = 'rgb(' + Math.round(30 + m * 130) + ',' + Math.round(20 + m * 60) +
              ',' + Math.round(60 + m * 180) + ')';
          }
        } else {
          var b = T.BIOMES[geo.biome[i]];
          color = b ? b.color : '#000';
          if (geo.land[i]) {
            // Fake relief from the height field.
            var lift = Math.round((geo.height[i] - geo.seaLevel) * 60 - 12);
            color = shade(b.color, lift);
          }
          if (geo.river[i] && geo.land[i]) color = '#3f7fbf';
        }
        c.fillStyle = color;
        c.fillRect(Math.floor(x * ts), Math.floor(y * ts), Math.ceil(ts), Math.ceil(ts));
      }
    }
    return off;
  }

  MapView.draw = function () {
    var state = ISE.Game.state;
    var world = state.world, player = state.player;
    if (!world || !MapView.ctx) return;
    var geo = world.geo;
    var ctx = MapView.ctx;
    var ts = MapView.tileSize(world);
    var ox = (MapView.canvas.width - geo.w * ts) / 2;
    var oy = (MapView.canvas.height - geo.h * ts) / 2;

    if (!MapView.terrainCache) MapView.terrainCache = renderTerrain(world);

    ctx.fillStyle = '#070b10';
    ctx.fillRect(0, 0, MapView.canvas.width, MapView.canvas.height);
    ctx.drawImage(MapView.terrainCache, ox, oy);

    // Nation tint + borders.
    if (MapView.mode === 'political') {
      ctx.save();
      ctx.globalAlpha = 0.32;
      for (var i = 0; i < world.owner.length; i++) {
        var o = world.owner[i];
        if (o < 0) continue;
        var nat = world.nations[o];
        if (!nat || !nat.alive) continue;
        var x = i % geo.w, y = (i / geo.w) | 0;
        ctx.fillStyle = nat.color;
        ctx.fillRect(ox + x * ts, oy + y * ts, ts, ts);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(1, ts * 0.14);
      for (var j = 0; j < world.owner.length; j++) {
        var oo = world.owner[j];
        if (oo < 0) continue;
        var nat2 = world.nations[oo];
        if (!nat2 || !nat2.alive) continue;
        var jx = j % geo.w, jy = (j / geo.w) | 0;
        ctx.strokeStyle = nat2.color;
        for (var d = 0; d < U.NEIGHBORS4.length; d++) {
          var nx = jx + U.NEIGHBORS4[d][0], ny = jy + U.NEIGHBORS4[d][1];
          var inb = U.inBounds(nx, ny, geo.w, geo.h);
          var no = inb ? world.owner[ny * geo.w + nx] : -1;
          if (no === oo) continue;
          if (inb && !geo.land[ny * geo.w + nx] && no < 0) continue;
          ctx.beginPath();
          if (U.NEIGHBORS4[d][0] === 1) {
            ctx.moveTo(ox + (jx + 1) * ts, oy + jy * ts);
            ctx.lineTo(ox + (jx + 1) * ts, oy + (jy + 1) * ts);
          } else if (U.NEIGHBORS4[d][0] === -1) {
            ctx.moveTo(ox + jx * ts, oy + jy * ts);
            ctx.lineTo(ox + jx * ts, oy + (jy + 1) * ts);
          } else if (U.NEIGHBORS4[d][1] === 1) {
            ctx.moveTo(ox + jx * ts, oy + (jy + 1) * ts);
            ctx.lineTo(ox + (jx + 1) * ts, oy + (jy + 1) * ts);
          } else {
            ctx.moveTo(ox + jx * ts, oy + jy * ts);
            ctx.lineTo(ox + (jx + 1) * ts, oy + jy * ts);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Monster faction territory markers.
    world.factions.forEach(function (f) {
      if (!f.alive) return;
      var fx = ox + f.x * ts + ts / 2, fy = oy + f.y * ts + ts / 2;
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = f.calamity ? '#ff3b3b' : '#a03030';
      ctx.beginPath();
      ctx.moveTo(fx, fy - ts * 0.9);
      ctx.lineTo(fx + ts * 0.8, fy + ts * 0.7);
      ctx.lineTo(fx - ts * 0.8, fy + ts * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Dungeons the player knows about.
    world.dungeons.forEach(function (d) {
      if (!player.knownDungeons[d.id] && !d.discovered) return;
      var known = !!player.knownDungeons[d.id];
      var dx = ox + d.x * ts + ts / 2, dy = oy + d.y * ts + ts / 2;
      var r = Math.max(2.5, ts * 0.42);
      ctx.save();
      ctx.globalAlpha = known ? 1 : 0.45;
      ctx.fillStyle = d.cleared ? '#6f7f8f' : (d.ownerType === 'player' ? '#ffd166' : '#1a1016');
      ctx.strokeStyle = d.tier >= 8 ? '#ff4d4d' : (d.tier >= 5 ? '#ff9f43' : '#c9a227');
      ctx.lineWidth = Math.max(1, ts * 0.13);
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Settlements.
    world.settlements.forEach(function (s) {
      if (s.destroyed) return;
      var known = !!player.knownSettlements[s.id];
      var sx = ox + s.x * ts + ts / 2, sy = oy + s.y * ts + ts / 2;
      var size = Math.max(2, ts * (0.3 + s.tierIdx * 0.16));
      var nat = world.nationById[s.nationId];
      ctx.save();
      ctx.globalAlpha = known ? 1 : 0.35;
      ctx.fillStyle = nat ? nat.color : '#888';
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = Math.max(0.8, ts * 0.08);
      ctx.beginPath();
      ctx.rect(sx - size, sy - size, size * 2, size * 2);
      ctx.fill();
      ctx.stroke();
      if (s.guild) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(sx + size, sy - size, Math.max(1, ts * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Ruins.
    (world.ruins || []).forEach(function (s) {
      if (!player.knownSettlements[s.id]) return;
      var sx = ox + s.x * ts + ts / 2, sy = oy + s.y * ts + ts / 2;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = Math.max(1, ts * 0.1);
      var q = Math.max(1.5, ts * 0.3);
      ctx.beginPath();
      ctx.moveTo(sx - q, sy - q); ctx.lineTo(sx + q, sy + q);
      ctx.moveTo(sx + q, sy - q); ctx.lineTo(sx - q, sy + q);
      ctx.stroke();
      ctx.restore();
    });

    // Player marker.
    var px = ox + player.x * ts + ts / 2, py = oy + player.y * ts + ts / 2;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, ts * 0.16);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(4, ts * 0.75), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#7ee0ff';
    ctx.lineWidth = Math.max(1, ts * 0.1);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(6.5, ts * 1.15), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Hover highlight.
    if (MapView.hover) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + MapView.hover.x * ts, oy + MapView.hover.y * ts, ts, ts);
      ctx.restore();
    }
  };

  /* Text describing whatever is on a tile — used by the hover panel. */
  MapView.describeTile = function (world, player, x, y) {
    var geo = world.geo;
    var i = y * geo.w + x;
    var out = { title: '', lines: [], settlement: null, dungeon: null };
    var biome = T.BIOMES[geo.biome[i]];
    out.title = biome ? biome.name : 'Unknown';

    var region = geo.regionAt(i);
    if (region) out.lines.push(region.name);

    var nat = world.nationOfTile(i);
    if (nat && nat.alive) out.lines.push(nat.name + ' territory');
    else if (geo.land[i]) out.lines.push('Unclaimed');

    out.lines.push('Danger ' + U.round(geo.danger[i], 1) + '  ·  Mana ' + U.pct(geo.mana[i]));

    var s = world.settlementAt(x, y);
    if (s) {
      out.settlement = s;
      out.title = s.name;
      out.lines.unshift(s.sizeName + (s.isCapital ? ' (capital)' : '') +
        ' · pop ' + U.short(s.population) + ' · garrison ' + U.short(s.garrison) +
        (s.guild ? ' · guild branch' : ''));
    }
    var d = world.dungeonAt(x, y);
    if (d && (player.knownDungeons[d.id] || d.discovered)) {
      out.dungeon = d;
      out.lines.push(d.name + ' — tier ' + d.tier + ', ' + d.floors + ' floors, ' +
        MapView.ownerLabel(world, d));
    }
    var fac = null;
    world.factions.forEach(function (f) {
      if (f.alive && f.x === x && f.y === y) fac = f;
    });
    if (fac) out.lines.push('Lair of the ' + fac.name + ' (strength ' + U.short(fac.strength) + ')');
    return out;
  };

  MapView.ownerLabel = function (world, dungeon) {
    switch (dungeon.ownerType) {
      case 'nation': {
        var n = world.nationById[dungeon.ownerId];
        return n ? 'held by ' + n.name : 'held by a dead state';
      }
      case 'monster': {
        var f = world.factionById[dungeon.ownerId];
        return f ? 'held by the ' + f.name : 'held by monsters';
      }
      case 'guild': return 'guild-chartered';
      case 'player': return 'YOURS';
      default: return 'unclaimed';
    }
  };

  ISE.MapView = MapView;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
