/* nations.js — Phase A political geography: founding nations, growing their
 * borders across the map, seeding settlements with economies and notable
 * NPCs, and chartering the Adventurers' Guild. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, Names = ISE.Names, ItemData = ISE.ItemData;

  var GOVERNMENTS = [
    { id: 'kingdom', name: 'Kingdom', title: 'King', title2: 'Queen', stability: 8, mil: 1.0 },
    { id: 'empire', name: 'Empire', title: 'Emperor', title2: 'Empress', stability: 4, mil: 1.25 },
    { id: 'republic', name: 'Republic', title: 'Consul', title2: 'Consul', stability: 12, mil: 0.85 },
    { id: 'theocracy', name: 'Theocracy', title: 'Hierarch', title2: 'Hierarch', stability: 10, mil: 0.95 },
    { id: 'magocracy', name: 'Magocracy', title: 'Archmagus', title2: 'Archmagus', stability: 6, mil: 0.9 },
    { id: 'horde', name: 'Horde', title: 'Warchief', title2: 'Warchief', stability: -6, mil: 1.35 },
    { id: 'confederation', name: 'Confederation', title: 'High Speaker', title2: 'High Speaker', stability: 2, mil: 0.9 },
    { id: 'dominion', name: 'Dominion', title: 'Overlord', title2: 'Overlady', stability: 0, mil: 1.15 }
  ];

  var RACE_GOV_BIAS = {
    human: ['kingdom', 'empire', 'republic', 'theocracy'],
    elf: ['kingdom', 'magocracy', 'confederation', 'theocracy'],
    goblin: ['horde', 'dominion', 'confederation'],
    beastkin: ['confederation', 'horde', 'kingdom'],
    dragonkin: ['dominion', 'empire', 'kingdom'],
    undead: ['dominion', 'theocracy', 'empire'],
    spirit: ['theocracy', 'confederation', 'magocracy'],
    construct: ['dominion', 'magocracy', 'republic'],
    plantkin: ['confederation', 'theocracy', 'kingdom'],
    slime: ['confederation', 'republic', 'dominion']
  };

  var PALETTE = ['#c94f4f', '#4f7fc9', '#5fa85f', '#b98a3c', '#8f5fc9', '#c95f9c',
    '#3fa5a5', '#a5763f', '#7f8f3f', '#5f5fc9', '#c9743f', '#3f8f6f',
    '#a53f6f', '#6f9fc9', '#9f9f3f', '#c93f3f'];

  /* How much a race wants to live on a given biome. Higher = cheaper to
   * expand into, which is what shapes the borders. */
  function biomeAffinity(race, biomeId) {
    var b = T.BIOMES[biomeId];
    if (!b || !b.land) return -1;
    var pref = race.biomes.indexOf(biomeId) >= 0 ? 1.6 : 1.0;
    var fert = 0.4 + b.fertility;
    return pref * fert;
  }

  function foundNations(rng, params, geo, races) {
    var count = U.clamp(params.nationCount, 2, 16);
    var candidates = [];
    var i;

    // Capitals want fertile, low-danger, coastal-ish ground on big landmasses.
    for (i = 0; i < geo.landTiles.length; i++) {
      var ti = geo.landTiles[i];
      var b = T.BIOMES[geo.biome[ti]];
      if (!b.land) continue;
      var cont = geo.continents[geo.landmass[ti]];
      var score = b.fertility * 3 + (geo.river[ti] ? 1.2 : 0) - geo.mana[ti] * 1.5 -
        b.danger * 0.35 + Math.log(1 + cont.size) * 0.35;
      candidates.push({ tile: ti, score: score });
    }
    candidates.sort(function (a, b2) { return b2.score - a.score; });

    var chosen = [];
    var minSep = Math.max(6, Math.sqrt(geo.landTiles.length / count) * 0.85);
    for (i = 0; i < candidates.length && chosen.length < count; i++) {
      var c = candidates[i];
      var cx = c.tile % geo.w, cy = (c.tile / geo.w) | 0;
      var ok = true;
      for (var j = 0; j < chosen.length; j++) {
        var ox = chosen[j].tile % geo.w, oy = (chosen[j].tile / geo.w) | 0;
        if (U.dist(cx, cy, ox, oy) < minSep) { ok = false; break; }
      }
      if (ok) chosen.push(c);
    }
    // If separation was too strict, relax and top up.
    for (i = 0; i < candidates.length && chosen.length < count; i++) {
      if (chosen.indexOf(candidates[i]) < 0) chosen.push(candidates[i]);
    }

    var playableRaces = races.list.filter(function (r) { return r.playable; });
    var nations = [];
    for (i = 0; i < chosen.length; i++) {
      var tile = chosen[i].tile;
      var x = tile % geo.w, y = (tile / geo.w) | 0;
      var biomeId = geo.biome[tile];

      // Pick the race that fits this biome best, with variety enforced.
      var used = {};
      nations.forEach(function (nn) { used[nn.raceId] = (used[nn.raceId] || 0) + 1; });
      var scored = playableRaces.map(function (r) {
        var aff = r.biomes.indexOf(biomeId) >= 0 ? 3 : 1;
        return [r, aff / (1 + (used[r.id] || 0) * 2.6) * (r.unique ? 0.35 : 1)];
      });
      var race = rng.weighted(scored);

      var govPool = RACE_GOV_BIAS[race.id] || ['kingdom', 'republic', 'dominion', 'confederation'];
      var gov = GOVERNMENTS.filter(function (g) { return govPool.indexOf(g.id) >= 0; });
      if (!gov.length) gov = GOVERNMENTS;
      var government = rng.pick(gov);

      var rulerName = Names.person(rng, race.culture);
      var nation = {
        id: 'nation_' + i,
        index: i,
        name: Names.nation(rng, race.culture, rulerName, government.name),
        raceId: race.id,
        raceName: race.name,
        culture: race.culture,
        government: government.id,
        governmentName: government.name,
        color: PALETTE[i % PALETTE.length],
        capitalTile: tile,
        capital: null,
        tiles: [],
        settlements: [],
        dungeons: [],
        relics: [],
        ruler: {
          name: rulerName,
          title: rng.chance(0.5) ? government.title : government.title2,
          age: rng.int(24, 55),
          dynasty: Names.place(rng, race.culture),
          gen: 1,
          traits: rng.sample(['ambitious', 'cautious', 'pious', 'greedy', 'just',
            'cruel', 'scholarly', 'martial'], 2)
        },
        traits: {
          aggression: U.clamp01(rng.gauss(0.45 + params.warTendency * 0.3, 0.18)),
          greed: U.clamp01(rng.gauss(0.5, 0.2)),
          piety: U.clamp01(rng.gauss(0.45, 0.22)),
          industry: U.clamp01(rng.gauss(0.5, 0.18)),
          scholarship: U.clamp01(rng.gauss(0.45 + params.magicDensity * 0.25, 0.18))
        },
        military: Math.round(60 * government.mil * rng.range(0.75, 1.3)),
        economy: Math.round(60 * rng.range(0.75, 1.3)),
        stability: U.clamp(50 + government.stability + rng.int(-12, 12), 5, 95),
        population: 0,
        relations: {},
        wars: {},
        allies: {},
        grudges: [],
        legends: [],
        founded: 0,
        alive: true
      };
      nations.push(nation);
    }
    return nations;
  }

  /* Grow borders outward from each capital with a cost-based flood fill.
   * Cheaper tiles (fertile, preferred biome) get absorbed first, so borders
   * follow terrain the way real ones roughly do. */
  function growTerritory(rng, params, geo, races, nations) {
    var n = geo.w * geo.h;
    var owner = new Int16Array(n).fill(-1);
    var landCount = geo.landTiles.length;
    var perNation = Math.floor(landCount * 0.62 / Math.max(1, nations.length));
    var heap = new U.Heap(function (a, b) { return a.cost - b.cost; });

    nations.forEach(function (nat) {
      nat.budget = Math.max(6, Math.round(perNation * rng.range(0.65, 1.45)));
      heap.push({ tile: nat.capitalTile, cost: 0, nation: nat.index });
    });

    while (heap.size) {
      var cur = heap.pop();
      if (owner[cur.tile] >= 0) continue;
      var nat2 = nations[cur.nation];
      if (nat2.tiles.length >= nat2.budget) continue;
      if (!geo.land[cur.tile]) continue;
      owner[cur.tile] = cur.nation;
      nat2.tiles.push(cur.tile);

      var cx = cur.tile % geo.w, cy = (cur.tile / geo.w) | 0;
      var race = races.byId[nat2.raceId];
      for (var d = 0; d < U.NEIGHBORS4.length; d++) {
        var nx = cx + U.NEIGHBORS4[d][0], ny = cy + U.NEIGHBORS4[d][1];
        if (!U.inBounds(nx, ny, geo.w, geo.h)) continue;
        var ni = ny * geo.w + nx;
        if (owner[ni] >= 0 || !geo.land[ni]) continue;
        var aff = biomeAffinity(race, geo.biome[ni]);
        if (aff <= 0) continue;
        var step = (T.BIOMES[geo.biome[ni]].move || 1) / aff + geo.mana[ni] * 1.4;
        heap.push({ tile: ni, cost: cur.cost + step, nation: cur.nation });
      }
    }
    return owner;
  }

  /* ------------------------------------------------------------ settlements */
  var SIZE_TIERS = [
    { id: 'village', name: 'Village', pop: [120, 900], defense: 0.5, shops: 1, minDist: 3 },
    { id: 'town', name: 'Town', pop: [1200, 6000], defense: 1.0, shops: 2, minDist: 5 },
    { id: 'city', name: 'City', pop: [9000, 60000], defense: 2.0, shops: 3, minDist: 8 }
  ];

  var NPC_ROLES = [
    { id: 'questgiver', name: 'Guild Registrar', weight: 3 },
    { id: 'mentor', name: 'Mentor', weight: 2 },
    { id: 'rival', name: 'Rival Adventurer', weight: 2 },
    { id: 'merchant', name: 'Merchant', weight: 3 },
    { id: 'trainer', name: 'Skill Trainer', weight: 3 },
    { id: 'noble', name: 'Noble', weight: 2 },
    { id: 'smith', name: 'Smith', weight: 2 },
    { id: 'scholar', name: 'Scholar', weight: 2 },
    { id: 'priest', name: 'Priest', weight: 1 },
    { id: 'informant', name: 'Informant', weight: 1 }
  ];

  function makeNPC(rng, culture, settlement, role, races) {
    var flavors = { noble: 'cunning', priest: 'holy', scholar: 'wise', mentor: 'wise',
      rival: 'heroic', trainer: 'warlike', informant: 'cunning' };
    var npc = {
      id: settlement.id + '_npc_' + settlement.npcs.length,
      name: Names.person(rng, culture),
      role: role.id,
      roleName: role.name,
      settlementId: settlement.id,
      level: rng.int(3, 22),
      disposition: rng.int(-10, 25),
      culture: culture,
      alive: true,
      epithet: rng.chance(0.25) ? Names.epithet(rng, flavors[role.id] || 'cunning') : null,
      traits: rng.sample(['greedy', 'kind', 'proud', 'nervous', 'blunt', 'scheming',
        'generous', 'drunk', 'devout', 'bitter'], 2)
    };
    if (npc.epithet) npc.name = npc.name + ' ' + npc.epithet;
    return npc;
  }

  function economyFor(rng, geo, tile, tier, params) {
    var b = geo.biome[tile];
    var res = (ItemData.BIOME_RESOURCES[b] || ['grain']).slice();
    // Neighbouring biomes contribute secondary resources.
    var x = tile % geo.w, y = (tile / geo.w) | 0;
    U.neighbors(x, y, geo.w, geo.h, true).forEach(function (nb) {
      var nbi = nb[1] * geo.w + nb[0];
      var nres = ItemData.BIOME_RESOURCES[geo.biome[nbi]];
      if (nres && rng.chance(0.35)) res.push(rng.pick(nres));
    });
    res = U.unique(res).slice(0, 5);

    return {
      resources: res,
      wealth: U.round((0.6 + tier.defense * 0.35) * rng.range(0.8, 1.3), 2),
      priceMod: U.round(rng.range(0.85, 1.25) * (1 - params.magicDensity * 0.1), 3),
      stock: null,
      restockDay: 0
    };
  }

  function placeSettlements(rng, params, geo, nations, owner, races) {
    var all = [];
    var density = params.settlementDensity;
    var defense = params.defensibility;

    nations.forEach(function (nat) {
      var race = races.byId[nat.raceId];
      var scored = nat.tiles.map(function (ti) {
        var b = T.BIOMES[geo.biome[ti]];
        var s = b.fertility * 3 + (geo.river[ti] ? 1.5 : 0) - geo.mana[ti] * 1.2 - b.danger * 0.3;
        if (race.biomes.indexOf(geo.biome[ti]) >= 0) s += 1.0;
        return { tile: ti, score: s };
      });
      scored.sort(function (a, b) { return b.score - a.score; });

      var target = U.clamp(Math.round(nat.tiles.length * 0.045 * density), 1, 26);
      var placed = [];

      function tryPlace(tile, tierIdx) {
        var tier = SIZE_TIERS[tierIdx];
        var x = tile % geo.w, y = (tile / geo.w) | 0;
        for (var i = 0; i < placed.length; i++) {
          var px = placed[i].tile % geo.w, py = (placed[i].tile / geo.w) | 0;
          var need = Math.max(tier.minDist, SIZE_TIERS[placed[i].tierIdx].minDist) *
            (0.6 + 0.6 / density);
          if (U.dist(x, y, px, py) < need) return null;
        }
        var pop = Math.round(rng.range(tier.pop[0], tier.pop[1]) * (0.7 + density * 0.5));
        var st = {
          id: 'settle_' + all.length,
          name: Names.place(rng, nat.culture),
          tile: tile, x: x, y: y,
          tierIdx: tierIdx,
          size: tier.id,
          sizeName: tier.name,
          nationId: nat.id,
          ownerHistory: [{ year: 0, nationId: nat.id }],
          population: pop,
          basePopulation: pop,
          garrison: Math.round(pop * 0.03 * tier.defense * (0.5 + defense) *
            (0.7 + nat.traits.aggression * 0.6)),
          walls: U.round(tier.defense * (0.4 + defense * 0.9) * rng.range(0.8, 1.2), 2),
          biome: geo.biome[tile],
          economy: economyFor(rng, geo, tile, tier, params),
          npcs: [],
          guild: false,
          destroyed: false,
          raidsSurvived: 0,
          prosperity: U.round(rng.range(0.7, 1.2), 2)
        };
        st.defense = Math.round(st.garrison * (1 + st.walls * 0.6));
        placed.push(st);
        all.push(st);
        nat.settlements.push(st.id);
        return st;
      }

      // Capital first.
      var cap = tryPlace(nat.capitalTile, 2);
      if (!cap) {
        cap = {
          id: 'settle_' + all.length, name: Names.place(rng, nat.culture),
          tile: nat.capitalTile, x: nat.capitalTile % geo.w, y: (nat.capitalTile / geo.w) | 0,
          tierIdx: 2, size: 'city', sizeName: 'City', nationId: nat.id,
          ownerHistory: [{ year: 0, nationId: nat.id }],
          population: 12000, basePopulation: 12000, garrison: 400, walls: 2,
          biome: geo.biome[nat.capitalTile],
          economy: economyFor(rng, geo, nat.capitalTile, SIZE_TIERS[2], params),
          npcs: [], guild: false, destroyed: false, raidsSurvived: 0, prosperity: 1
        };
        cap.defense = Math.round(cap.garrison * (1 + cap.walls * 0.6));
        placed.push(cap); all.push(cap); nat.settlements.push(cap.id);
      }
      cap.isCapital = true;
      cap.name = cap.name;
      nat.capital = cap.id;

      var attempts = 0;
      while (placed.length < target && attempts < scored.length) {
        var cand = scored[attempts++];
        if (!cand) break;
        var tierIdx = rng.weighted([[0, 60], [1, 30], [2, 8]]);
        tryPlace(cand.tile, tierIdx);
      }

      // Notable NPCs scale with settlement size.
      placed.forEach(function (st) {
        var npcCount = 2 + st.tierIdx * 2 + rng.int(0, 2);
        for (var k = 0; k < npcCount; k++) {
          var role = rng.weighted(NPC_ROLES.map(function (r) { return [r, r.weight]; }));
          st.npcs.push(makeNPC(rng, nat.culture, st, role, races));
        }
      });
    });

    // Recompute nation populations.
    nations.forEach(function (nat) {
      nat.population = 0;
      nat.settlements.forEach(function (sid) {
        var st = all.filter(function (s) { return s.id === sid; })[0];
        if (st) nat.population += st.population;
      });
    });
    return all;
  }

  /* The Adventurers' Guild — a cross-border organisation that can own
   * dungeons and issue work. */
  function charterGuild(rng, settlements, nations) {
    var guild = {
      id: 'guild',
      name: 'The Adventurers\' Guild',
      branches: [],
      dungeons: [],
      reputationScale: ['Unregistered', 'Copper', 'Iron', 'Silver', 'Gold', 'Mythril', 'Adamant'],
      founded: 0
    };
    settlements.forEach(function (st) {
      if (st.tierIdx >= 2 || (st.tierIdx === 1 && rng.chance(0.55))) {
        st.guild = true;
        guild.branches.push(st.id);
      }
    });
    if (!guild.branches.length && settlements.length) {
      settlements[0].guild = true;
      guild.branches.push(settlements[0].id);
    }
    return guild;
  }

  /* Initial relation matrix: proximity breeds friction, shared race breeds
   * warmth, and the world's war tendency sets the baseline temperature. */
  function initRelations(rng, params, geo, nations, owner) {
    var borderCounts = {};
    for (var i = 0; i < owner.length; i++) {
      var o = owner[i];
      if (o < 0) continue;
      var x = i % geo.w, y = (i / geo.w) | 0;
      for (var d = 0; d < U.NEIGHBORS4.length; d++) {
        var nx = x + U.NEIGHBORS4[d][0], ny = y + U.NEIGHBORS4[d][1];
        if (!U.inBounds(nx, ny, geo.w, geo.h)) continue;
        var no = owner[ny * geo.w + nx];
        if (no >= 0 && no !== o) {
          var key = Math.min(o, no) + '|' + Math.max(o, no);
          borderCounts[key] = (borderCounts[key] || 0) + 1;
        }
      }
    }

    nations.forEach(function (a) {
      nations.forEach(function (b) {
        if (a.id === b.id) return;
        var key = Math.min(a.index, b.index) + '|' + Math.max(a.index, b.index);
        var border = borderCounts[key] || 0;
        var base = 10 - params.warTendency * 25;
        if (a.raceId === b.raceId) base += 18;
        if (a.government === b.government) base += 6;
        base -= Math.min(30, border * 0.6);
        base += rng.int(-14, 14);
        a.relations[b.id] = U.clamp(Math.round(base), -100, 100);
      });
    });
    return borderCounts;
  }

  ISE.NationGen = {
    foundNations: foundNations,
    growTerritory: growTerritory,
    placeSettlements: placeSettlements,
    charterGuild: charterGuild,
    initRelations: initRelations,
    GOVERNMENTS: GOVERNMENTS,
    SIZE_TIERS: SIZE_TIERS,
    NPC_ROLES: NPC_ROLES,
    makeNPC: makeNPC
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
