/* dungeons.js — Phase A dungeon seeding and monster-faction placement.
 *
 * A dungeon is a named place with a danger tier, a floor stack, an ecology,
 * named bosses, and an *owner*. Ownership matters: wild dungeons can be
 * seized by monster factions, conquered by nations, or chartered to the
 * guild, and that changes hands during both history and play. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, MD = ISE.MonsterData, Names = ISE.Names,
    MonsterGen = ISE.MonsterGen;

  function themeForBiome(rng, biomeId, mana) {
    var pref = {
      forest: ['verdant', 'beast_den', 'goblin_warren'],
      deep_forest: ['verdant', 'beast_den', 'mixed_wild'],
      jungle: ['verdant', 'beast_den', 'drowned'],
      swamp: ['drowned', 'verdant', 'undead_crypt'],
      plains: ['beast_den', 'goblin_warren', 'undead_crypt'],
      grassland: ['beast_den', 'goblin_warren'],
      savanna: ['beast_den', 'skyward'],
      hills: ['goblin_warren', 'titan_hall', 'beast_den'],
      mountain: ['titan_hall', 'draconic', 'arcane_vault'],
      peak: ['skyward', 'draconic', 'titan_hall'],
      volcano: ['draconic', 'abyssal', 'titan_hall'],
      desert: ['undead_crypt', 'titan_hall', 'arcane_vault'],
      taiga: ['beast_den', 'mixed_wild'],
      tundra: ['undead_crypt', 'titan_hall'],
      glacier: ['titan_hall', 'skyward', 'undead_crypt'],
      wasteland: ['undead_crypt', 'abyssal', 'arcane_vault'],
      beach: ['drowned', 'mixed_wild'],
      coast: ['drowned', 'mixed_wild'],
      manawaste: ['abyssal', 'arcane_vault'],
      spiritwood: ['verdant', 'skyward', 'arcane_vault'],
      glassfield: ['arcane_vault', 'skyward'],
      bloomrot: ['verdant', 'abyssal']
    }[biomeId] || ['mixed_wild'];
    if (mana > 0.75 && rng.chance(0.4)) pref = ['abyssal', 'arcane_vault'];
    var id = rng.pick(pref);
    return MD.ECOLOGY_THEMES.filter(function (t) { return t.id === id; })[0] ||
      MD.ECOLOGY_THEMES[MD.ECOLOGY_THEMES.length - 1];
  }

  function buildFloors(rng, catalog, dungeon, params, geo) {
    var floors = [];
    var famPool = dungeon.families.map(function (fid) { return MD.FAMILY_BY_ID[fid]; })
      .filter(Boolean);
    if (!famPool.length) famPool = [MD.FAMILY_BY_ID.wolf];

    var ceilingTier = U.clamp(Math.round(params.monsterCeiling * 0.62), 1, 6);

    for (var f = 1; f <= dungeon.floors; f++) {
      var depth = f / dungeon.floors;
      var monTier = U.clamp(
        Math.round(1 + (dungeon.tier / 10) * 4.2 * (0.45 + depth * 0.85)),
        1, ceilingTier);
      var level = Math.max(1, Math.round(dungeon.tier * 3.4 + f * (1.0 + dungeon.tier * 0.15)));
      var floor = {
        n: f,
        monsterTier: monTier,
        level: level,
        families: rng.sample(famPool, Math.min(famPool.length, 2 + (f % 2))).map(function (x) { return x.id; }),
        nodes: 4 + rng.int(0, 3) + Math.floor(dungeon.tier / 4),
        miniBoss: null,
        cleared: false,
        lootTier: U.clamp(Math.ceil(monTier * 0.9), 1, 6)
      };
      // Mini-boss caps each cluster of three floors (but not the last floor,
      // which belongs to the floor boss).
      if (f % 3 === 0 && f !== dungeon.floors) {
        var fam = rng.pick(famPool);
        floor.miniBoss = MonsterGen.makeNamed(rng, catalog, {
          family: fam, tier: Math.min(6, monTier + 1), level: level + 4,
          mini: true, placeName: dungeon.name, year: 0
        });
      }
      floors.push(floor);
    }
    return floors;
  }

  function generateDungeons(rng, params, geo, nations, settlements, catalog) {
    var n = geo.w * geo.h;
    var densityFactor = 0.55 + params.magicDensity * 0.9;
    var count = U.clamp(Math.round((geo.landTiles.length / 68) * densityFactor), 5, 110);

    // Distance to nearest settlement, so we can prefer remote sites.
    var distToTown = new Float32Array(n).fill(999);
    settlements.forEach(function (st) {
      for (var i = 0; i < geo.landTiles.length; i++) {
        var ti = geo.landTiles[i];
        var d = U.dist(ti % geo.w, (ti / geo.w) | 0, st.x, st.y);
        if (d < distToTown[ti]) distToTown[ti] = d;
      }
    });

    // A dungeon mouth never opens in an occupied town square.
    var townTiles = {};
    settlements.forEach(function (st) { townTiles[st.tile] = true; });

    var scored = geo.landTiles.filter(function (ti) { return !townTiles[ti]; })
      .map(function (ti) {
        var s = geo.danger[ti] * 1.3 + geo.mana[ti] * 5 + Math.min(distToTown[ti], 14) * 0.35;
        return { tile: ti, score: s + rng.range(0, 3) };
      });
    scored.sort(function (a, b) { return b.score - a.score; });

    var dungeons = [];
    var minSep = Math.max(3, Math.sqrt(geo.landTiles.length / Math.max(1, count)) * 0.7);

    for (var i = 0; i < scored.length && dungeons.length < count; i++) {
      var tile = scored[i].tile;
      var x = tile % geo.w, y = (tile / geo.w) | 0;
      var ok = true;
      for (var j = 0; j < dungeons.length; j++) {
        if (U.dist(x, y, dungeons[j].x, dungeons[j].y) < minSep) { ok = false; break; }
      }
      if (!ok) continue;

      var biomeId = geo.biome[tile];
      var mana = geo.mana[tile];
      var theme = themeForBiome(rng, biomeId, mana);
      var region = geo.regionAt(tile);
      var culture = rng.pick(['common', 'undead', 'arcane', 'draconic', 'orcish', 'elven']);
      var named = Names.dungeon(rng, culture);

      // Danger tier 1..10, scaled hard by the world's monster power ceiling.
      var rawDanger = geo.danger[tile] + Math.min(distToTown[tile], 16) * 0.18;
      var tier = U.clamp(
        Math.round((rawDanger / 9) * params.monsterCeiling * rng.range(0.8, 1.25)),
        1, 10);

      var families = theme.families.filter(function (fid) {
        var fam = MD.FAMILY_BY_ID[fid];
        return fam && (fam.biomes.indexOf(biomeId) >= 0 || rng.chance(0.45));
      });
      if (families.length < 2) families = theme.families.slice(0, 3);

      var dungeon = {
        id: 'dungeon_' + dungeons.length,
        name: named.name,
        form: named.form,
        tile: tile, x: x, y: y,
        biome: biomeId,
        regionId: region ? region.id : -1,
        regionName: region ? region.name : 'the wilds',
        tier: tier,
        themeId: theme.id,
        themeName: theme.name,
        families: families,
        floors: U.clamp(3 + Math.round(tier * 1.9) + rng.int(0, 3), 3, 40),
        ownerType: 'wild',
        ownerId: null,
        ownerHistory: [],
        discovered: false,
        clearedFloors: 0,
        deepestClear: 0,
        cleared: false,
        clearedBy: null,
        delves: 0,
        relics: [],
        lastDelveYear: -99,
        boss: null,
        floorData: null,
        legends: []
      };

      dungeon.floorData = buildFloors(rng, catalog, dungeon, params, geo);

      var bossFam = MD.FAMILY_BY_ID[rng.pick(families)] || MD.FAMILY_BY_ID.wolf;
      var ceilingTier = U.clamp(Math.round(params.monsterCeiling * 0.62), 2, 6);
      dungeon.boss = MonsterGen.makeNamed(rng, catalog, {
        family: bossFam,
        tier: U.clamp(Math.round(1 + (tier / 10) * 5), 1, ceilingTier),
        level: Math.round(dungeon.tier * 5 + dungeon.floors * 1.2),
        placeName: dungeon.name,
        year: 0
      });
      dungeon.boss.dungeonId = dungeon.id;

      dungeons.push(dungeon);
    }

    // Dungeons deep inside a nation's territory start out claimed by it.
    var owner = geo.owner;
    dungeons.forEach(function (d) {
      if (owner && owner[d.tile] >= 0 && d.tier <= 6 && rng.chance(0.55)) {
        var nat = nations[owner[d.tile]];
        if (nat) {
          d.ownerType = 'nation';
          d.ownerId = nat.id;
          d.discovered = true;
          nat.dungeons.push(d.id);
        }
      }
    });

    return dungeons;
  }

  /* ------------------------------------------------------ monster factions */
  function generateFactions(rng, params, geo, nations, settlements, dungeons, catalog) {
    var count = U.clamp(
      Math.round((geo.landTiles.length / 420) * (0.6 + params.monsterCeiling / 9)),
      2, 20);
    var factions = [];

    // Wild, dangerous regions make the best faction homes.
    var regions = geo.regions.slice().filter(function (r) { return r.tiles.length > 4; });
    regions.sort(function (a, b) {
      return (b.mana * 4 + T.BIOMES[b.biome].danger) - (a.mana * 4 + T.BIOMES[a.biome].danger);
    });

    for (var i = 0; i < count && i < regions.length; i++) {
      var reg = regions[i];
      var kindPool = MD.FACTION_KINDS.filter(function (k) {
        return k.families.some(function (fid) {
          var fam = MD.FAMILY_BY_ID[fid];
          return fam && fam.biomes.indexOf(reg.biome) >= 0;
        });
      });
      if (!kindPool.length) kindPool = MD.FACTION_KINDS;
      var kind = rng.pick(kindPool);
      var famId = rng.pick(kind.families);
      var fam = MD.FAMILY_BY_ID[famId] || MD.FAMILY_BY_ID.wolf;

      var homeTile = reg.tiles[rng.int(0, reg.tiles.length - 1)];
      var ceilingTier = U.clamp(Math.round(params.monsterCeiling * 0.62), 2, 6);
      var leaderTier = U.clamp(rng.int(2, ceilingTier), 1, 6);

      var faction = {
        id: 'faction_' + i,
        name: Names.clan(rng) + ' ' + kind.name,
        kindId: kind.id,
        familyId: famId,
        element: rng.pick(fam.elements),
        regionId: reg.id,
        regionName: reg.name,
        homeTile: homeTile,
        x: homeTile % geo.w, y: (homeTile / geo.w) | 0,
        aggression: U.clamp01(kind.aggression + rng.range(-0.15, 0.15) + params.warTendency * 0.15),
        strength: Math.round((45 + rng.int(0, 60)) * (0.55 + params.monsterCeiling / 8)),
        population: rng.int(200, 3000),
        dungeons: [],
        raids: 0,
        alive: true,
        leader: null,
        legends: []
      };

      faction.leader = MonsterGen.makeNamed(rng, catalog, {
        family: fam, tier: leaderTier,
        level: Math.round(10 + leaderTier * 9),
        placeName: reg.name, year: 0
      });
      faction.leader.factionId = faction.id;

      factions.push(faction);
    }

    // Hand nearby wild dungeons to the factions that live around them.
    factions.forEach(function (fac) {
      dungeons.forEach(function (d) {
        if (d.ownerType !== 'wild') return;
        if (d.regionId === fac.regionId && rng.chance(0.65)) {
          d.ownerType = 'monster';
          d.ownerId = fac.id;
          fac.dungeons.push(d.id);
        }
      });
    });

    return factions;
  }

  ISE.DungeonGen = {
    generateDungeons: generateDungeons,
    generateFactions: generateFactions,
    buildFloors: buildFloors,
    themeForBiome: themeForBiome
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
