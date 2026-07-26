/* procs.js — the procedures the event table points at, plus the condition
 * checkers its `when` clauses use.
 *
 * These are shared by Phase B (fast abstract history) and the live world
 * clock, which is the point: a war resolved 300 years before the player
 * arrived uses exactly the same maths as one resolved on turn 40.
 *
 * Every proc returns a token object used to fill its legend template, or
 * null if the event turned out not to apply after all. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, Names = ISE.Names, ED = ISE.EventData,
    MG = ISE.MonsterGen, IG = ISE.ItemGen, MD = ISE.MonsterData;

  var H = {};   // helpers
  var C = {};   // condition checkers
  var P = {};   // procedures

  /* ------------------------------------------------------------ helpers */
  H.relation = function (a, b) {
    var v = a.relations[b.id];
    return v === undefined ? 0 : v;
  };

  H.setRelation = function (a, b, v) {
    v = U.clamp(Math.round(v), -100, 100);
    a.relations[b.id] = v;
    b.relations[a.id] = v;
    return v;
  };

  H.shiftRelation = function (a, b, delta) {
    return H.setRelation(a, b, H.relation(a, b) + delta);
  };

  H.atWar = function (a, b) { return !!a.wars[b.id]; };
  H.allied = function (a, b) { return !!a.allies[b.id]; };

  H.strength = function (world, nation) {
    var relicBonus = 0;
    nation.relics.forEach(function (rid) {
      var r = world.relicById[rid];
      if (r && r.effect && r.effect.armyPower) relicBonus += r.effect.armyPower;
    });
    return nation.military * (1 + relicBonus) *
      (0.65 + nation.economy / 160) * (0.55 + nation.stability / 110);
  };

  /* Cached border adjacency between nations; invalidated on territory change. */
  H.computeBorders = function (world) {
    var geo = world.geo, owner = world.owner;
    var map = {};
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
          map[key] = (map[key] || 0) + 1;
        }
      }
    }
    world.borderMap = map;
    world.borderDirty = false;
    return map;
  };

  /* Deliberately tolerates a stale map inside a simulated year — the
   * history loop refreshes it once per year, which keeps a 1000-year run
   * from re-scanning the whole map after every skirmish. */
  H.borderStrength = function (world, a, b) {
    if (!world.borderMap) H.computeBorders(world);
    var key = Math.min(a.index, b.index) + '|' + Math.max(a.index, b.index);
    return world.borderMap[key] || 0;
  };

  /* Move contested tiles from loser to winner along their shared frontier. */
  H.transferTiles = function (world, winner, loser, count) {
    var geo = world.geo, owner = world.owner;
    var moved = 0;
    var frontier = [];
    for (var i = 0; i < loser.tiles.length; i++) {
      var ti = loser.tiles[i];
      var x = ti % geo.w, y = (ti / geo.w) | 0;
      for (var d = 0; d < U.NEIGHBORS4.length; d++) {
        var nx = x + U.NEIGHBORS4[d][0], ny = y + U.NEIGHBORS4[d][1];
        if (!U.inBounds(nx, ny, geo.w, geo.h)) continue;
        if (owner[ny * geo.w + nx] === winner.index) { frontier.push(ti); break; }
      }
    }
    for (var k = 0; k < frontier.length && moved < count; k++) {
      var tile = frontier[k];
      owner[tile] = winner.index;
      U.remove(loser.tiles, tile);
      winner.tiles.push(tile);
      moved++;
      // Any settlement on a transferred tile changes hands with it.
      var st = world.settlementAt(tile % geo.w, (tile / geo.w) | 0);
      if (st && st.nationId === loser.id) H.transferSettlement(world, st, winner);
    }
    if (moved) world.borderDirty = true;
    return moved;
  };

  H.transferSettlement = function (world, settlement, toNation) {
    var from = world.nationById[settlement.nationId];
    if (from) U.remove(from.settlements, settlement.id);
    settlement.nationId = toNation ? toNation.id : null;
    if (toNation) toNation.settlements.push(settlement.id);
    settlement.ownerHistory.push({ year: world.year, nationId: settlement.nationId });
    if (from) ISE.WorldGen.recomputeNation(world, from);
    if (toNation) ISE.WorldGen.recomputeNation(world, toNation);
    world.mapDirty = true;
    return settlement;
  };

  H.destroySettlement = function (world, settlement, byWhat) {
    settlement.destroyed = true;
    settlement.destroyedBy = byWhat || null;
    settlement.destroyedYear = world.year;
    settlement.population = 0;
    settlement.garrison = 0;
    settlement.defense = 0;

    /* Ruins move out of the live settlement list. Over a long history the
     * dead vastly outnumber the living, and every proximity check would
     * otherwise walk thousands of corpses. */
    U.remove(world.settlements, settlement);
    world.ruins = world.ruins || [];
    world.ruins.push(settlement);
    while (world.ruins.length > 120) {
      var old = world.ruins.shift();
      delete world.settlementById[old.id];
    }

    var nat = world.nationById[settlement.nationId];
    if (nat) {
      U.remove(nat.settlements, settlement.id);
      ISE.WorldGen.recomputeNation(world, nat);
      // A state with land left can rebuild; only a landless one is finished.
      if (!nat.settlements.length && !nat.tiles.length) {
        H.killNation(world, nat, 'lost its last holding');
      }
    }
    world.mapDirty = true;
    return settlement;
  };

  H.killNation = function (world, nation, why) {
    if (!nation.alive) return nation;
    nation.alive = false;
    nation.fellYear = world.year;
    nation.fellReason = why;
    // Release its land.
    for (var i = 0; i < nation.tiles.length; i++) world.owner[nation.tiles[i]] = -1;
    nation.tiles = [];
    world.nations.forEach(function (o) {
      delete o.wars[nation.id];
      delete o.allies[nation.id];
    });
    nation.dungeons.forEach(function (did) {
      var d = world.dungeonById[did];
      if (d && d.ownerId === nation.id) { d.ownerType = 'wild'; d.ownerId = null; }
    });
    world.borderDirty = true;
    world.mapDirty = true;
    return nation;
  };

  /* Garrisons have a floor: even a village keeps a militia, otherwise the
   * first passing warband erases it and the map empties out over a long
   * history run. */
  H.recomputeSettlement = function (settlement) {
    var floor = 14 + settlement.tierIdx * 38;
    settlement.garrison = Math.max(floor, Math.round(settlement.garrison));
    settlement.defense = Math.round(settlement.garrison * (1 + settlement.walls * 0.6));
    return settlement;
  };

  /* Monster factions grow toward a carrying capacity set by the size of the
   * wild region they hold, not exponentially forever. */
  H.factionCapacity = function (world, faction) {
    var region = world.geo.regions[faction.regionId];
    var tiles = region ? region.tiles.length : 20;
    var base = 45 + tiles * 3.2;
    return Math.round(base * (0.55 + world.params.monsterCeiling / 8) *
      (faction.calamity ? 1.8 : 1) * (1 + faction.dungeons.length * 0.08));
  };

  H.settlementsOf = function (world, nation) {
    return nation.settlements.map(function (s) { return world.settlementById[s]; })
      .filter(function (s) { return s && !s.destroyed; });
  };

  /* A settlement's real defensive weight: its own garrison plus whatever
   * its state can put in the field for it. */
  H.settlementDefense = function (world, settlement) {
    var nat = world.nationById[settlement.nationId];
    var backing = nat && nat.alive ? H.strength(world, nat) * 0.3 : 0;
    return settlement.defense + backing;
  };

  H.nearestSettlement = function (world, x, y, filter) {
    var best = null, bd = Infinity;
    for (var i = 0; i < world.settlements.length; i++) {
      var s = world.settlements[i];
      if (s.destroyed) continue;
      if (filter && !filter(s)) continue;
      var d = U.dist(x, y, s.x, s.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { settlement: best, dist: bd } : null;
  };

  H.placeName = function (world, rng, hint) {
    if (hint && hint.regionName) return hint.regionName;
    var reg = world.geo.regions[rng.int(0, world.geo.regions.length - 1)];
    return reg ? reg.name : 'the frontier';
  };

  H.makeHero = function (world, rng, nation, opts) {
    opts = opts || {};
    var race = world.races.byId[nation ? nation.raceId : 'human'] || world.races.list[0];
    var flavor = rng.pick(['heroic', 'wise', 'warlike', 'cunning', 'holy', 'dark']);
    var hero = {
      id: 'hero_' + world.heroes.length,
      name: Names.person(rng, race.culture),
      epithet: null,
      raceId: race.id,
      raceName: race.name,
      nationId: nation ? nation.id : null,
      homeSettlement: opts.settlementId || (nation ? nation.capital : null),
      level: opts.level || rng.int(8, 22),
      born: world.year,
      age: rng.int(18, 34),
      alive: true,
      named: false,
      fame: rng.int(20, 90),
      deeds: { bosses: 0, dungeons: 0, wars: 0, relics: 0 },
      relics: [],
      skills: [],
      flavor: flavor,
      role: rng.pick(['blade', 'mage', 'ranger', 'priest', 'beastmaster', 'assassin'])
    };
    // A handful of catalogue skills so heroes are mechanically real.
    var pool = world.skills.list.filter(function (s) {
      return s.rarityTier <= 3 && s.category !== 'utility';
    });
    for (var i = 0; i < 4 && pool.length; i++) hero.skills.push(rng.pick(pool).id);
    world.heroes.push(hero);
    world.heroById[hero.id] = hero;
    return hero;
  };

  H.heroPower = function (world, hero) {
    var p = hero.level * 12 + hero.fame * 0.4;
    hero.relics.forEach(function (rid) {
      var r = world.relicById[rid];
      if (r) p += 40 * r.tier;
    });
    if (hero.named) p *= 1.5;
    return p;
  };

  H.dungeonPower = function (world, dungeon, floor) {
    var f = floor === undefined ? dungeon.floors : floor;
    return dungeon.tier * 24 + f * 7 +
      (dungeon.boss && dungeon.boss.alive ? dungeon.boss.level * 6 : 0);
  };

  H.log = function (world, entry) {
    entry.id = 'legend_' + world.legends.length;
    world.legends.push(entry);
    if (world.legends.length > 4000) world.legends.splice(0, 500);
    return entry;
  };

  H.giveRelicTo = function (world, relic, ownerType, ownerId, note) {
    // Detach from previous holder.
    if (relic.ownerType === 'nation') {
      var prev = world.nationById[relic.owner];
      if (prev) U.remove(prev.relics, relic.id);
    } else if (relic.ownerType === 'dungeon') {
      var pd = world.dungeonById[relic.owner];
      if (pd) U.remove(pd.relics, relic.id);
    } else if (relic.ownerType === 'hero') {
      var ph = world.heroById[relic.owner];
      if (ph) U.remove(ph.relics, relic.id);
    }
    relic.ownerType = ownerType;
    relic.owner = ownerId;
    relic.history.push({ year: world.year, ownerType: ownerType, ownerId: ownerId, note: note || '' });

    if (ownerType === 'nation') {
      var nat = world.nationById[ownerId];
      if (nat) nat.relics.push(relic.id);
    } else if (ownerType === 'dungeon') {
      var d = world.dungeonById[ownerId];
      if (d) d.relics.push(relic.id);
    } else if (ownerType === 'hero') {
      var h = world.heroById[ownerId];
      if (h) { h.relics.push(relic.id); h.deeds.relics++; }
    }
    return relic;
  };

  H.relicLocationText = function (world, relic) {
    switch (relic.ownerType) {
      case 'nation': {
        var n = world.nationById[relic.owner];
        return n ? 'held in the vaults of ' + n.name : 'held by a fallen state';
      }
      case 'dungeon': {
        var d = world.dungeonById[relic.owner];
        return d ? 'in ' + d.name + (d.boss && d.boss.alive ? ', guarded by ' + d.boss.name : '')
          : 'lost underground';
      }
      case 'hero': {
        var h = world.heroById[relic.owner];
        return h ? 'carried by ' + h.name + (h.alive ? '' : ' (deceased; whereabouts unknown)')
          : 'in unknown hands';
      }
      case 'faction': {
        var f = world.factionById[relic.owner];
        return f ? 'in the hoard of the ' + f.name : 'in a monster hoard';
      }
      case 'player': return 'carried by you';
      default: return 'lost';
    }
  };

  /* ------------------------------------------------------- conditions */
  C.relationBelow = function (v, ctx) { return H.relation(ctx.a, ctx.b) < v; };
  C.relationAbove = function (v, ctx) { return H.relation(ctx.a, ctx.b) > v; };
  C.atWar = function (v, ctx) { return H.atWar(ctx.a, ctx.b) === v; };
  C.allied = function (v, ctx) { return H.allied(ctx.a, ctx.b) === v; };
  C.sharesBorder = function (v, ctx) {
    return (H.borderStrength(ctx.world, ctx.a, ctx.b) > 0) === v;
  };
  C.warYears = function (v, ctx) {
    var w = ctx.a.wars[ctx.b.id];
    return w && (ctx.world.year - w.since) >= v;
  };
  C.strengthRatio = function (v, ctx) {
    return H.strength(ctx.world, ctx.a) >= H.strength(ctx.world, ctx.b) * v;
  };
  C.stabilityAbove = function (v, ctx) { return ctx.a.stability > v; };
  C.stabilityBelow = function (v, ctx) { return ctx.a.stability < v; };
  C.rulerAgeAbove = function (v, ctx) { return ctx.a.ruler.age > v; };
  C.militaryAbove = function (v, ctx) { return ctx.a.military > v; };
  C.hasCity = function (v, ctx) {
    return H.settlementsOf(ctx.world, ctx.a).some(function (s) { return s.tierIdx >= 2; }) === v;
  };
  C.noGuildBranch = function (v, ctx) {
    var has = H.settlementsOf(ctx.world, ctx.a).some(function (s) { return s.guild; });
    return has === !v;
  };
  /* A faction can only raid what it can reach. Once the nearby villages are
   * gone it has to grow before it can threaten anything else. */
  C.factionStrengthRatio = function (v, ctx) {
    var f = ctx.faction;
    var reach = 9 + f.aggression * 8 + (f.calamity ? 8 : 0);
    var near = H.nearestSettlement(ctx.world, f.x, f.y);
    if (!near || near.dist > reach) return false;
    ctx.targetSettlement = near.settlement;
    return f.strength >= Math.max(1, H.settlementDefense(ctx.world, near.settlement)) * v;
  };
  C.calamitiesBelow = function (v, ctx) {
    var n = 0;
    ctx.world.factions.forEach(function (f) { if (f.calamity && f.alive) n++; });
    return n < v;
  };
  C.factionsBelow = function (v, ctx) { return ctx.world.factions.length < v; };
  C.dungeonsBelow = function (v, ctx) { return ctx.world.dungeons.length < v; };
  C.settlementsAbove = function (v, ctx) {
    return H.settlementsOf(ctx.world, ctx.a).length > v;
  };
  C.factionInRange = function (v, ctx) {
    var cap = ctx.world.settlementById[ctx.a.capital];
    if (!cap) return false;
    var best = null, bd = Infinity;
    ctx.world.factions.forEach(function (f) {
      if (!f.alive) return;
      var d = U.dist(cap.x, cap.y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    });
    if (!best || bd > v) return false;
    ctx.faction = best;
    return true;
  };
  C.factionStrengthAbove = function (v, ctx) { return ctx.faction.strength > v; };
  C.bossAlive = function (v, ctx) {
    return !!(ctx.dungeon.boss && ctx.dungeon.boss.alive) === v;
  };
  C.clearedYearsAgo = function (v, ctx) {
    var d = ctx.dungeon;
    if (!d.ownerHistory.length && !d.lastDelveYear) return true;
    var last = Math.max(d.lastDelveYear || 0,
      d.boss && d.boss.killedYear ? d.boss.killedYear : 0);
    return (ctx.world.year - last) >= v;
  };
  C.bossAgeAbove = function (v, ctx) {
    var b = ctx.dungeon.boss;
    return b && (ctx.world.year - (b.lastEvolvedYear || 0)) >= v;
  };
  C.yearAbove = function (v, ctx) { return ctx.world.year > v; };
  C.hasLivingHeroes = function (v, ctx) { return (ctx.world.livingHeroes().length > 0) === v; };
  C.relicsExist = function (v, ctx) { return (ctx.world.relics.length > 0) === v; };
  C.heroAgeAbove = function (v, ctx) { return ctx.hero && ctx.hero.age >= v; };
  C.heroLevelAbove = function (v, ctx) { return ctx.hero && ctx.hero.level >= v; };
  C.heroNotNamed = function (v, ctx) { return ctx.hero && ctx.hero.named === !v; };

  /* ------------------------------------------------------- procedures */
  P.declareWar = function (ctx) {
    var a = ctx.a, b = ctx.b, world = ctx.world;
    if (H.atWar(a, b)) return null;
    a.wars[b.id] = { since: world.year, battles: 0 };
    b.wars[a.id] = { since: world.year, battles: 0 };
    delete a.allies[b.id]; delete b.allies[a.id];
    H.setRelation(a, b, -70);
    a.stability -= 4; b.stability -= 6;
    var cause = U.fill(ctx.rng.pick(ED.WAR_CAUSES), {
      place: H.placeName(world, ctx.rng),
      dungeon: world.dungeons.length ? ctx.rng.pick(world.dungeons).name : 'a ruin',
      a: a.name
    });
    b.grudges.push({ against: a.id, year: world.year, why: 'war declared' });
    return { a: a.name, b: b.name, cause: cause };
  };

  P.battle = function (ctx) {
    var a = ctx.a, b = ctx.b, world = ctx.world, rng = ctx.rng;
    var sa = H.strength(world, a) * rng.range(0.7, 1.35);
    var sb = H.strength(world, b) * rng.range(0.7, 1.35);
    a.wars[b.id].battles++;
    b.wars[a.id].battles++;
    var place = H.placeName(world, rng);
    var margin = sa / Math.max(1, sb);
    var tokens = { a: a.name, b: b.name, place: 'at ' + place };

    if (margin > 1.15 || margin < 0.87) {
      var winner = margin > 1 ? a : b;
      var loser = margin > 1 ? b : a;
      var lossPct = U.clamp(0.08 + Math.abs(Math.log(margin)) * 0.22, 0.06, 0.4);
      loser.military = Math.max(5, Math.round(loser.military * (1 - lossPct)));
      winner.military = Math.max(5, Math.round(winner.military * (1 - lossPct * 0.35)));
      loser.stability -= 3;
      winner.stability += 1;
      var moved = H.transferTiles(world, winner, loser,
        Math.max(1, Math.min(Math.round(lossPct * 22), Math.ceil(loser.tiles.length * 0.05))));
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.battleWin), {
        winner: winner.name, loser: loser.name
      });
      if (moved) tokens.result += ' ' + moved + ' ' + U.plural(moved, 'holding', 'holdings') +
        ' changed hands.';
      tokens.winnerId = winner.id;
    } else {
      a.military = Math.max(5, Math.round(a.military * 0.9));
      b.military = Math.max(5, Math.round(b.military * 0.9));
      tokens.result = rng.pick(ED.FRAGMENTS.battleDraw);
    }
    return tokens;
  };

  P.siege = function (ctx) {
    var a = ctx.a, b = ctx.b, world = ctx.world, rng = ctx.rng;
    var targets = H.settlementsOf(world, b);
    if (!targets.length) return null;
    // Prefer a settlement near the aggressor's territory.
    var cap = world.settlementById[a.capital];
    targets.sort(function (s1, s2) {
      if (!cap) return 0;
      return U.dist(s1.x, s1.y, cap.x, cap.y) - U.dist(s2.x, s2.y, cap.x, cap.y);
    });
    var target = targets[Math.min(targets.length - 1, rng.skewedInt(0, targets.length - 1, 2))];
    var attack = H.strength(world, a) * rng.range(0.6, 1.2);
    var defend = (target.defense * 0.75 + H.strength(world, b) * 0.35) * rng.range(0.75, 1.25);
    var months = rng.int(2, 14);
    var tokens = {
      a: a.name, b: b.name, settlement: target.name,
      duration: months + ' ' + U.plural(months, 'month')
    };

    if (attack > defend) {
      target.population = Math.round(target.population * rng.range(0.75, 0.92));
      target.garrison = Math.round(target.garrison * 0.5);
      H.recomputeSettlement(target);
      H.transferSettlement(world, target, a);
      // The land under it goes too.
      var tile = target.tile;
      if (world.owner[tile] !== a.index) {
        var old = world.nations[world.owner[tile]];
        if (old) U.remove(old.tiles, tile);
        world.owner[tile] = a.index;
        a.tiles.push(tile);
        world.borderDirty = true;
      }
      a.military = Math.max(5, Math.round(a.military * 0.88));
      b.stability -= 8;
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.siegeTaken), tokens);
      tokens.captured = true;
    } else {
      a.military = Math.max(5, Math.round(a.military * 0.75));
      target.raidsSurvived++;
      b.stability += 3;
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.siegeHeld), tokens);
    }
    return tokens;
  };

  P.makePeace = function (ctx) {
    var a = ctx.a, b = ctx.b, world = ctx.world;
    var w = a.wars[b.id];
    if (!w) return null;
    var years = world.year - w.since;
    delete a.wars[b.id];
    delete b.wars[a.id];
    H.setRelation(a, b, -10);
    a.stability += 5; b.stability += 5;
    return {
      a: a.name, b: b.name, place: H.placeName(world, ctx.rng),
      duration: Math.max(1, years) + ' ' + U.plural(Math.max(1, years), 'year')
    };
  };

  P.annex = function (ctx) {
    var a = ctx.a, b = ctx.b, world = ctx.world;
    if (!H.atWar(a, b)) return null;
    var taken = H.settlementsOf(world, b);
    taken.forEach(function (s) { H.transferSettlement(world, s, a); });
    var tiles = b.tiles.slice();
    tiles.forEach(function (ti) {
      world.owner[ti] = a.index;
      a.tiles.push(ti);
    });
    b.tiles = [];
    b.relics.slice().forEach(function (rid) {
      var r = world.relicById[rid];
      if (r) H.giveRelicTo(world, r, 'nation', a.id, 'taken as spoils');
    });
    a.military = Math.round(a.military * 1.15);
    a.economy = Math.round(a.economy + b.economy * 0.5);
    H.killNation(world, b, 'annexed by ' + a.name);
    world.borderDirty = true;
    return { a: a.name, b: b.name, place: b.name };
  };

  P.alliance = function (ctx) {
    var a = ctx.a, b = ctx.b;
    if (H.atWar(a, b)) return null;
    a.allies[b.id] = { since: ctx.world.year };
    b.allies[a.id] = { since: ctx.world.year };
    H.shiftRelation(a, b, 20);
    return { a: a.name, b: b.name, place: H.placeName(ctx.world, ctx.rng) };
  };

  P.marriage = function (ctx) {
    var a = ctx.a, b = ctx.b;
    H.shiftRelation(a, b, 18);
    a.stability += 2; b.stability += 2;
    return { a: a.name, b: b.name };
  };

  P.tradePact = function (ctx) {
    var a = ctx.a, b = ctx.b;
    a.economy = Math.round(a.economy * 1.08);
    b.economy = Math.round(b.economy * 1.08);
    H.shiftRelation(a, b, 10);
    return { a: a.name, b: b.name, place: H.placeName(ctx.world, ctx.rng) };
  };

  P.betrayal = function (ctx) {
    var a = ctx.a, b = ctx.b;
    if (!H.allied(a, b)) return null;
    delete a.allies[b.id];
    delete b.allies[a.id];
    H.setRelation(a, b, -60);
    b.grudges.push({ against: a.id, year: ctx.world.year, why: 'betrayal' });
    a.stability -= 5;
    return { a: a.name, b: b.name, place: H.placeName(ctx.world, ctx.rng) };
  };

  P.relationShift = function (ctx) {
    H.shiftRelation(ctx.a, ctx.b, ctx.args.delta);
    return { a: ctx.a.name, b: ctx.b.name, place: H.placeName(ctx.world, ctx.rng) };
  };

  P.goldenAge = function (ctx) {
    var a = ctx.a;
    a.economy = Math.round(a.economy * 1.25);
    a.stability = U.clamp(a.stability + 8, 0, 100);
    H.settlementsOf(ctx.world, a).forEach(function (s) {
      s.population = Math.round(s.population * 1.12);
      s.prosperity = U.round(U.clamp(s.prosperity * 1.1, 0.4, 2.0), 2);
    });
    ISE.WorldGen.recomputeNation(ctx.world, a);
    return { a: a.name, ruler: a.ruler.title + ' ' + a.ruler.name };
  };

  P.famine = function (ctx) {
    var a = ctx.a, rng = ctx.rng;
    var lost = 0;
    H.settlementsOf(ctx.world, a).forEach(function (s) {
      var before = s.population;
      s.population = Math.round(s.population * rng.range(0.9, 0.98));
      lost += before - s.population;
    });
    a.economy = Math.round(a.economy * 0.88);
    a.stability -= 7;
    ISE.WorldGen.recomputeNation(ctx.world, a);
    return { a: a.name, detail: U.num(lost) + ' did not see the spring.' };
  };

  P.plague = function (ctx) {
    var a = ctx.a, rng = ctx.rng;
    var lost = 0;
    H.settlementsOf(ctx.world, a).forEach(function (s) {
      var before = s.population;
      s.population = Math.round(s.population * rng.range(0.85, 0.96));
      s.garrison = Math.round(s.garrison * 0.85);
      s.defense = Math.round(s.garrison * (1 + s.walls * 0.6));
      lost += before - s.population;
    });
    a.military = Math.round(a.military * 0.9);
    a.stability -= 5;
    ISE.WorldGen.recomputeNation(ctx.world, a);
    return { a: a.name, detail: U.num(lost) + ' people' };
  };

  P.rebellion = function (ctx) {
    var a = ctx.a, world = ctx.world, rng = ctx.rng;
    var success = rng.next() < (0.5 - a.stability / 200);
    if (success) {
      var pool = H.settlementsOf(world, a).filter(function (s) { return !s.isCapital; });
      if (pool.length) {
        var lost = rng.pick(pool);
        // Rebels either join a neighbour or the settlement goes independent.
        var neighbours = world.livingNations().filter(function (n) {
          return n.id !== a.id && H.borderStrength(world, a, n) > 0;
        });
        if (neighbours.length && rng.chance(0.6)) {
          var to = rng.pick(neighbours);
          H.transferSettlement(world, lost, to);
          a.stability -= 10;
          return { a: a.name, result: lost.name + ' threw out its garrison and swore to ' + to.name + '.' };
        }
        H.destroySettlement(world, lost, 'rebellion');
        a.stability -= 8;
        return { a: a.name, result: lost.name + ' burned in the fighting and was not rebuilt.' };
      }
    }
    a.stability = U.clamp(a.stability + 6, 0, 100);
    a.military = Math.round(a.military * 0.92);
    return { a: a.name, result: 'The rising was put down, expensively.' };
  };

  /* A large, unstable state sheds a successor state instead of merely
   * losing a town. This is what keeps a thousand-year map from collapsing
   * into one hegemon and staying there. */
  P.successorState = function (ctx) {
    var a = ctx.a, world = ctx.world, rng = ctx.rng;
    var towns = H.settlementsOf(world, a);
    if (towns.length < 6) return null;
    // Don't shatter the world into confetti; cap how fragmented it gets.
    if (world.livingNations().length >= world.params.nationCount * 2 + 2) return null;

    var cap = world.settlementById[a.capital];
    if (!cap) return null;
    // The breakaway forms around the town furthest from the capital.
    towns.sort(function (s1, s2) {
      return U.dist(s2.x, s2.y, cap.x, cap.y) - U.dist(s1.x, s1.y, cap.x, cap.y);
    });
    var seat = towns[0];
    if (U.dist(seat.x, seat.y, cap.x, cap.y) < 6) return null;

    var race = world.races.byId[a.raceId] || world.races.list[0];
    var gov = rng.pick(ISE.NationGen.GOVERNMENTS);
    var rulerName = Names.person(rng, race.culture);
    var index = world.nations.length;
    var nation = {
      id: 'nation_' + index, index: index,
      name: Names.nation(rng, race.culture, rulerName, gov.name),
      raceId: a.raceId, raceName: a.raceName, culture: a.culture,
      government: gov.id, governmentName: gov.name,
      color: ['#c94f4f', '#4f7fc9', '#5fa85f', '#b98a3c', '#8f5fc9', '#c95f9c',
        '#3fa5a5', '#a5763f', '#7f8f3f', '#5f5fc9', '#c9743f', '#3f8f6f',
        '#a53f6f', '#6f9fc9', '#9f9f3f', '#c93f3f'][index % 16],
      capitalTile: seat.tile, capital: seat.id,
      tiles: [], settlements: [], dungeons: [], relics: [],
      ruler: {
        name: rulerName, title: rng.chance(0.5) ? gov.title : gov.title2,
        age: rng.int(22, 48), dynasty: Names.place(rng, race.culture), gen: 1,
        traits: rng.sample(['ambitious', 'cruel', 'just', 'martial', 'scheming'], 2)
      },
      traits: {
        aggression: U.clamp01(a.traits.aggression + rng.range(-0.1, 0.25)),
        greed: a.traits.greed, piety: a.traits.piety,
        industry: a.traits.industry, scholarship: a.traits.scholarship
      },
      military: Math.max(10, Math.round(a.military * 0.3)),
      economy: Math.max(10, Math.round(a.economy * 0.28)),
      stability: 45,
      population: 0, relations: {}, wars: {}, allies: {}, grudges: [],
      legends: [], founded: world.year, alive: true,
      successorOf: a.id
    };

    // Take the seat plus any of the parent's towns closer to it than to
    // the old capital, and the land under them.
    var taken = towns.filter(function (s) {
      return U.dist(s.x, s.y, seat.x, seat.y) < U.dist(s.x, s.y, cap.x, cap.y);
    });
    if (!taken.length) taken = [seat];

    world.nations.push(nation);
    world.nationById[nation.id] = nation;

    taken.forEach(function (s) { H.transferSettlement(world, s, nation); });

    var geo = world.geo;
    a.tiles.slice().forEach(function (ti) {
      var tx = ti % geo.w, ty = (ti / geo.w) | 0;
      if (U.dist(tx, ty, seat.x, seat.y) < U.dist(tx, ty, cap.x, cap.y)) {
        U.remove(a.tiles, ti);
        nation.tiles.push(ti);
        world.owner[ti] = nation.index;
      }
    });

    a.military = Math.max(5, Math.round(a.military * 0.72));
    a.economy = Math.max(8, Math.round(a.economy * 0.75));
    a.stability = U.clamp(a.stability - 12, 2, 98);

    // Everyone else has an opinion about the new state.
    world.livingNations().forEach(function (other) {
      if (other.id === nation.id) return;
      var v = other.id === a.id ? -55 : rng.int(-20, 15);
      H.setRelation(nation, other, v);
    });
    nation.grudges.push({ against: a.id, year: world.year, why: 'independence' });

    ISE.WorldGen.recomputeNation(world, a);
    ISE.WorldGen.recomputeNation(world, nation);
    world.borderDirty = true;
    world.mapDirty = true;

    return {
      a: a.name, newNation: nation.name, settlement: seat.name,
      count: taken.length, nationId: nation.id
    };
  };

  P.succession = function (ctx) {
    var a = ctx.a, rng = ctx.rng;
    var race = ctx.world.races.byId[a.raceId];
    var heir = Names.person(rng, race ? race.culture : 'common');
    var old = a.ruler.title + ' ' + a.ruler.name;
    var gov = ISE.NationGen.GOVERNMENTS.filter(function (g) { return g.id === a.government; })[0];
    a.ruler = {
      name: heir,
      title: rng.chance(0.5) && gov ? gov.title : (gov ? gov.title2 : 'Ruler'),
      age: rng.int(16, 42),
      dynasty: a.ruler.dynasty,
      gen: a.ruler.gen + 1,
      traits: rng.sample(['ambitious', 'cautious', 'pious', 'greedy', 'just',
        'cruel', 'scholarly', 'martial'], 2)
    };
    // A new ruler shifts the nation's temperament.
    a.traits.aggression = U.clamp01(a.traits.aggression + rng.range(-0.2, 0.2));
    a.stability += rng.int(-10, 6);
    return { a: a.name, ruler: old, heir: a.ruler.title + ' ' + a.ruler.name };
  };

  P.expand = function (ctx) {
    var a = ctx.a, world = ctx.world, geo = world.geo, rng = ctx.rng;
    var gained = 0;
    var candidates = [];
    for (var i = 0; i < a.tiles.length; i++) {
      var ti = a.tiles[i];
      var x = ti % geo.w, y = (ti / geo.w) | 0;
      for (var d = 0; d < U.NEIGHBORS4.length; d++) {
        var nx = x + U.NEIGHBORS4[d][0], ny = y + U.NEIGHBORS4[d][1];
        if (!U.inBounds(nx, ny, geo.w, geo.h)) continue;
        var ni = ny * geo.w + nx;
        if (geo.land[ni] && world.owner[ni] < 0) candidates.push(ni);
      }
    }
    if (!candidates.length) return null;
    rng.shuffle(candidates);
    var take = Math.min(candidates.length, rng.int(2, 8));
    for (var k = 0; k < take; k++) {
      world.owner[candidates[k]] = a.index;
      a.tiles.push(candidates[k]);
      gained++;
    }
    if (gained) { world.borderDirty = true; world.mapDirty = true; }
    a.economy = Math.round(a.economy * 1.03);
    return { a: a.name, place: H.placeName(world, rng, geo.regionAt(candidates[0])) };
  };

  P.foundSettlement = function (ctx) {
    var a = ctx.a, world = ctx.world, geo = world.geo, rng = ctx.rng;
    var options = a.tiles.filter(function (ti) {
      if (world.settlementAt(ti % geo.w, (ti / geo.w) | 0)) return false;
      var b = T.BIOMES[geo.biome[ti]];
      return b.land && b.fertility > 0.25;
    });
    if (!options.length) return null;
    // Keep new towns away from existing ones.
    rng.shuffle(options);
    var tile = null;
    for (var i = 0; i < options.length; i++) {
      var x = options[i] % geo.w, y = (options[i] / geo.w) | 0;
      var near = H.nearestSettlement(world, x, y);
      if (!near || near.dist > 4) { tile = options[i]; break; }
    }
    if (tile === null) return null;

    var tierIdx = rng.weighted([[0, 70], [1, 25], [2, 5]]);
    var tier = ISE.NationGen.SIZE_TIERS[tierIdx];
    var pop = Math.round(rng.range(tier.pop[0], tier.pop[1]) * 0.6);
    var st = {
      id: 'settle_' + world.settlements.length,
      name: Names.place(rng, a.culture),
      tile: tile, x: tile % geo.w, y: (tile / geo.w) | 0,
      tierIdx: tierIdx, size: tier.id, sizeName: tier.name,
      nationId: a.id,
      ownerHistory: [{ year: world.year, nationId: a.id }],
      population: pop, basePopulation: pop,
      garrison: Math.round(pop * 0.03 * tier.defense * (0.5 + world.params.defensibility)),
      walls: U.round(tier.defense * (0.3 + world.params.defensibility * 0.8), 2),
      biome: geo.biome[tile],
      economy: { resources: (ISE.ItemData.BIOME_RESOURCES[geo.biome[tile]] || ['grain']).slice(),
        wealth: 0.8, priceMod: 1, stock: null, restockDay: 0 },
      npcs: [], guild: false, destroyed: false, raidsSurvived: 0, prosperity: 0.9,
      foundedYear: world.year
    };
    st.defense = Math.round(st.garrison * (1 + st.walls * 0.6));
    for (var k = 0; k < 2 + tierIdx * 2; k++) {
      var role = rng.weighted(ISE.NationGen.NPC_ROLES.map(function (r) { return [r, r.weight]; }));
      st.npcs.push(ISE.NationGen.makeNPC(rng, a.culture, st, role, world.races));
    }
    world.settlements.push(st);
    world.settlementById[st.id] = st;
    a.settlements.push(st.id);
    ISE.WorldGen.recomputeNation(world, a);
    world.mapDirty = true;
    return { a: a.name, settlement: st.name, place: H.placeName(world, rng, geo.regionAt(tile)) };
  };

  P.guildCharter = function (ctx) {
    var a = ctx.a, world = ctx.world;
    var options = H.settlementsOf(world, a).filter(function (s) { return !s.guild; });
    if (!options.length) return null;
    options.sort(function (s1, s2) { return s2.tierIdx - s1.tierIdx; });
    var st = options[0];
    st.guild = true;
    world.guild.branches.push(st.id);
    return { a: a.name, settlement: st.name };
  };

  P.factionGrowth = function (ctx) {
    var f = ctx.faction, rng = ctx.rng;
    var cap = H.factionCapacity(ctx.world, f);
    if (f.strength >= cap * 0.92) return null;
    f.strength = Math.round(f.strength + (cap - f.strength) * rng.range(0.18, 0.4));
    f.population = Math.round(f.population * rng.range(1.05, 1.2));
    return { faction: f.name, place: f.regionName };
  };

  P.raid = function (ctx) {
    var f = ctx.faction, world = ctx.world, rng = ctx.rng;
    var target = ctx.targetSettlement;
    if (!target) {
      var near = H.nearestSettlement(world, f.x, f.y);
      if (!near) return null;
      target = near.settlement;
    }
    if (target.destroyed) return null;

    var attack = f.strength * rng.range(0.75, 1.3) * (0.7 + f.aggression * 0.6);
    var defend = H.settlementDefense(world, target) * rng.range(0.8, 1.3);
    var nat = world.nationById[target.nationId];
    // Player intervention is applied by the caller before resolution.
    if (ctx.interventionPower) defend += ctx.interventionPower;

    f.raids++;
    var tokens = { faction: f.name, settlement: target.name, place: f.regionName };

    if (attack > defend) {
      var severity = attack / Math.max(1, defend);
      target.population = Math.round(target.population * U.clamp(1 - severity * 0.12, 0.45, 0.94));
      target.garrison = Math.round(target.garrison * 0.5);
      H.recomputeSettlement(target);
      // Even a won raid costs the attackers.
      f.strength = Math.round(f.strength * rng.range(0.78, 0.9));
      if (severity > 3.2 || target.population < 25) {
        H.destroySettlement(world, target, f.name);
        tokens.result = U.fill(rng.pick(ED.FRAGMENTS.raidLoss), tokens);
        tokens.destroyed = true;
      } else {
        tokens.result = target.name + ' was sacked but not emptied. ' +
          U.num(target.population) + ' remain.';
        tokens.sacked = true;
      }
      if (nat) { nat.stability -= 5; ISE.WorldGen.recomputeNation(world, nat); }
    } else {
      f.strength = Math.round(f.strength * rng.range(0.55, 0.78));
      target.raidsSurvived++;
      target.garrison = Math.round(target.garrison * 0.92);
      H.recomputeSettlement(target);
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.raidWin), tokens);
      tokens.held = true;
    }
    tokens.settlementId = target.id;
    tokens.factionId = f.id;
    return tokens;
  };

  /* Civilisation's answer to the monster factions. Without this the wild
   * only ever grows and a long history ends with an empty map. */
  P.punitiveExpedition = function (ctx) {
    var a = ctx.a, f = ctx.faction, world = ctx.world, rng = ctx.rng;
    if (!f || !f.alive) return null;
    var force = H.strength(world, a) * rng.range(0.5, 0.95);
    var resist = f.strength * rng.range(0.8, 1.35) *
      (f.leader && f.leader.alive ? 1.25 : 1);
    var tokens = { a: a.name, faction: f.name, place: f.regionName };

    if (force > resist) {
      f.strength = Math.round(f.strength * rng.range(0.35, 0.6));
      a.military = Math.max(5, Math.round(a.military * 0.93));
      a.stability += 3;
      if (f.strength < 25) {
        f.alive = false;
        f.dungeons.slice().forEach(function (did) {
          var d = world.dungeonById[did];
          if (d) { d.ownerType = 'wild'; d.ownerId = null; }
        });
        f.dungeons = [];
        world.mapDirty = true;
        tokens.result = 'The ' + f.name + ' was broken up entirely.';
      } else {
        tokens.result = 'The ' + f.name + ' was scattered back into the hills.';
      }
      if (f.leader && f.leader.alive && rng.chance(0.4)) {
        f.leader.alive = false;
        tokens.result += ' ' + f.leader.name + ' was killed in the rout.';
      }
    } else {
      a.military = Math.max(5, Math.round(a.military * rng.range(0.72, 0.88)));
      a.stability -= 4;
      f.strength = Math.round(f.strength * 0.9);
      tokens.result = 'The column did not come back.';
    }
    return tokens;
  };

  P.bossEvolve = function (ctx) {
    var d = ctx.dungeon, world = ctx.world;
    if (!d.boss || !d.boss.alive) return null;
    var res = MG.evolveNamed(ctx.rng, world.skills, d.boss, world.params);
    if (!res) return null;
    d.boss.lastEvolvedYear = world.year;
    d.tier = U.clamp(d.tier + 1, 1, 10);
    return { dungeon: d.name, boss: res.oldName, newForm: res.to + ' (' + res.name + ')' };
  };

  /* A cleared dungeon does not stay cleared. The ecology that produced the
   * last master is still there, and something eventually walks in and takes
   * the throne room. This is what keeps a long history from leaving the
   * world an empty museum. */
  P.repopulateDungeon = function (ctx) {
    var d = ctx.dungeon, world = ctx.world, rng = ctx.rng;
    if (d.boss && d.boss.alive) return null;

    var fam = MD.FAMILY_BY_ID[rng.pick(d.families)] || MD.FAMILY_BY_ID.wolf;
    var ceilingTier = U.clamp(Math.round(world.params.monsterCeiling * 0.62), 2, 6);
    var oldName = d.boss ? d.boss.name : 'the last master';

    // High-mana ground breeds something worse than what was killed there.
    var mana = world.geo.mana[d.tile] || 0;
    var tierBump = mana > 0.7 && rng.chance(0.4) ? 1 : 0;

    d.boss = MG.makeNamed(rng, world.skills, {
      family: fam,
      tier: U.clamp(Math.round(1 + (d.tier / 10) * 5) + tierBump, 1, ceilingTier),
      level: Math.round(d.tier * 5 + d.floors * 1.2),
      placeName: d.name,
      year: world.year
    });
    d.boss.dungeonId = d.id;
    d.cleared = false;
    d.clearedBy = null;
    d.deepestClear = 0;
    d.floorData.forEach(function (f) { f.cleared = false; });

    /* Whoever held it while it was empty loses it — a wild dungeon with a
     * new master reverts to the wild, or to the monster power nearby. */
    var prevType = d.ownerType, prevId = d.ownerId;
    if (prevType === 'guild') U.remove(world.guild.dungeons, d.id);
    else if (prevType === 'nation') {
      var nat = world.nationById[prevId];
      if (nat) U.remove(nat.dungeons, d.id);
    } else if (prevType === 'player') {
      // The player's claim is contested, not silently erased.
      d.contested = true;
    }
    d.ownerHistory.push({ year: world.year, type: prevType, id: prevId });

    var localFaction = null;
    world.factions.forEach(function (f) {
      if (f.alive && f.regionId === d.regionId) localFaction = f;
    });
    if (localFaction && rng.chance(0.5)) {
      d.ownerType = 'monster';
      d.ownerId = localFaction.id;
      localFaction.dungeons.push(d.id);
    } else {
      d.ownerType = 'wild';
      d.ownerId = null;
    }
    world.mapDirty = true;

    return {
      dungeon: d.name, boss: d.boss.name, oldBoss: oldName,
      species: d.boss.species, dungeonId: d.id
    };
  };

  P.newDungeon = function (ctx) {
    var world = ctx.world, geo = world.geo, rng = ctx.rng;
    // Open where mana is high and no dungeon exists yet.
    var candidates = geo.landTiles.filter(function (ti) {
      var x = ti % geo.w, y = (ti / geo.w) | 0;
      return geo.mana[ti] > 0.6 && !world.dungeonAt(x, y) && !world.settlementAt(x, y);
    });
    if (!candidates.length) return null;
    var tile = rng.pick(candidates);
    var region = geo.regionAt(tile);
    var named = Names.dungeon(rng, rng.pick(['common', 'arcane', 'undead', 'draconic']));
    var theme = ISE.DungeonGen.themeForBiome(rng, geo.biome[tile], geo.mana[tile]);
    var tier = U.clamp(Math.round((geo.danger[tile] / 9) * world.params.monsterCeiling *
      rng.range(0.9, 1.4)), 1, 10);

    var d = {
      id: 'dungeon_' + world.dungeons.length,
      name: named.name, form: named.form,
      tile: tile, x: tile % geo.w, y: (tile / geo.w) | 0,
      biome: geo.biome[tile],
      regionId: region ? region.id : -1,
      regionName: region ? region.name : 'the wilds',
      tier: tier, themeId: theme.id, themeName: theme.name,
      families: theme.families.slice(),
      floors: U.clamp(3 + Math.round(tier * 1.9) + rng.int(0, 3), 3, 40),
      ownerType: 'wild', ownerId: null, ownerHistory: [],
      discovered: false, clearedFloors: 0, deepestClear: 0, cleared: false,
      clearedBy: null, delves: 0, relics: [], lastDelveYear: -99,
      boss: null, floorData: null, legends: [], appearedYear: world.year
    };
    d.floorData = ISE.DungeonGen.buildFloors(rng, world.skills, d, world.params, geo);
    var fam = MD.FAMILY_BY_ID[rng.pick(d.families)] || MD.FAMILY_BY_ID.wolf;
    var ceilingTier = U.clamp(Math.round(world.params.monsterCeiling * 0.62), 2, 6);
    d.boss = MG.makeNamed(rng, world.skills, {
      family: fam, tier: U.clamp(Math.round(1 + (tier / 10) * 5), 1, ceilingTier),
      level: Math.round(tier * 5 + d.floors * 1.2), placeName: d.name, year: world.year
    });
    d.boss.dungeonId = d.id;
    world.dungeons.push(d);
    world.dungeonById[d.id] = d;
    world.mapDirty = true;
    return { dungeon: d.name, place: region ? region.name : 'the wilds' };
  };

  P.factionSeizeDungeon = function (ctx) {
    var f = ctx.faction, world = ctx.world, rng = ctx.rng;
    var options = world.dungeons.filter(function (d) {
      return d.ownerId !== f.id && (d.regionId === f.regionId ||
        U.dist(d.x, d.y, f.x, f.y) < 12);
    });
    if (!options.length) return null;
    var d = rng.pick(options);
    var prevType = d.ownerType, prevId = d.ownerId;
    if (prevType === 'nation') {
      var nat = world.nationById[prevId];
      if (nat) {
        U.remove(nat.dungeons, d.id);
        // Taking a dungeon off a nation costs the faction and the nation both.
        if (H.strength(world, nat) > f.strength * 1.4) {
          f.strength = Math.round(f.strength * 0.8);
          return null;
        }
        nat.stability -= 3;
      }
    } else if (prevType === 'monster') {
      var of = world.factionById[prevId];
      if (of) U.remove(of.dungeons, d.id);
    } else if (prevType === 'guild') {
      U.remove(world.guild.dungeons, d.id);
    }
    d.ownerHistory.push({ year: world.year, type: prevType, id: prevId });
    d.ownerType = 'monster';
    d.ownerId = f.id;
    f.dungeons.push(d.id);
    f.strength = Math.round(f.strength * 1.08);
    world.mapDirty = true;
    return { faction: f.name, dungeon: d.name };
  };

  P.calamity = function (ctx) {
    var world = ctx.world, rng = ctx.rng;
    var region = rng.pick(world.geo.regions);
    if (!region || !region.tiles.length) return null;
    var famPool = ['drake', 'aberration', 'giant', 'demon', 'wormkind', 'undead'];
    var fam = MD.FAMILY_BY_ID[rng.pick(famPool)];
    var tier = U.clamp(Math.round(world.params.monsterCeiling * 0.62), 3, 6);
    var monster = MG.makeNamed(rng, world.skills, {
      family: fam, tier: tier, level: 30 + tier * 12,
      placeName: region.name, year: world.year
    });
    monster.calamity = true;

    // It carves out a faction of its own and mauls the nearest settlement.
    var tile = region.tiles[rng.int(0, region.tiles.length - 1)];
    var faction = {
      id: 'faction_' + world.factions.length,
      name: monster.name.split(',')[0] + '\'s ' + rng.pick(['Brood', 'Court', 'Host', 'Ruin']),
      kindId: 'covenant', familyId: fam.id, element: monster.element,
      regionId: region.id, regionName: region.name,
      homeTile: tile, x: tile % world.geo.w, y: (tile / world.geo.w) | 0,
      aggression: 0.95,
      strength: Math.round(180 * (0.6 + world.params.monsterCeiling / 8)),
      population: rng.int(500, 4000),
      dungeons: [], raids: 0, alive: true, leader: monster, legends: [],
      calamity: true, bornYear: world.year
    };
    monster.factionId = faction.id;
    world.factions.push(faction);
    world.factionById[faction.id] = faction;

    var near = H.nearestSettlement(world, faction.x, faction.y);
    var result = 'Nothing has been able to move it since.';
    if (near && near.dist < 25) {
      var st = near.settlement;
      st.population = Math.round(st.population * 0.5);
      st.garrison = Math.round(st.garrison * 0.4);
      st.defense = Math.round(st.garrison * (1 + st.walls * 0.6));
      var nat = world.nationById[st.nationId];
      if (nat) { nat.stability -= 10; ISE.WorldGen.recomputeNation(world, nat); }
      result = st.name + ' lost half its people in the first month.';
    }
    world.mapDirty = true;
    return { monster: monster.name, place: region.name, result: result };
  };

  P.heroRises = function (ctx) {
    var hero = H.makeHero(ctx.world, ctx.rng, ctx.a, {});
    return { hero: hero.name, race: hero.raceName, a: ctx.a.name, heroId: hero.id };
  };

  P.delve = function (ctx) {
    var world = ctx.world, rng = ctx.rng, d = ctx.dungeon;
    var heroes = world.livingHeroes();
    if (!heroes.length) return null;
    var hero = rng.pick(heroes);
    var partySize = rng.int(2, 6);
    var power = H.heroPower(world, hero) * (0.6 + partySize * 0.16) * rng.range(0.75, 1.3);

    d.delves++;
    d.lastDelveYear = world.year;
    d.discovered = true;

    var reached = 0;
    for (var f = 1; f <= d.floors; f++) {
      if (power < H.dungeonPower(world, d, f) * 0.55) break;
      reached = f;
    }
    var tokens = { hero: hero.name, dungeon: d.name, floor: Math.max(1, reached),
      boss: d.boss ? d.boss.name : 'the thing below' };

    /* Killing a dungeon's master is supposed to be rare. A party has to
     * reach the bottom *and* decisively outclass what is down there —
     * otherwise a couple of centuries of history empties every dungeon in
     * the world and the player inherits a museum. */
    if (reached >= d.floors && d.boss && d.boss.alive &&
      power > H.dungeonPower(world, d) * rng.range(1.25, 1.9)) {
      // Boss killed: dungeon changes hands and its relics come out.
      d.boss.alive = false;
      d.boss.killedBy = hero.id;
      d.boss.killedYear = world.year;
      d.cleared = true;
      d.clearedBy = hero.id;
      d.deepestClear = d.floors;
      hero.level += rng.int(3, 7);
      hero.fame += 60 + d.tier * 12;
      hero.deeds.bosses++;
      hero.deeds.dungeons++;

      var lootText = 'coin and old steel';
      d.relics.slice().forEach(function (rid) {
        var relic = world.relicById[rid];
        if (relic) {
          H.giveRelicTo(world, relic, 'hero', hero.id, 'recovered from ' + d.name);
          lootText = relic.name;
        }
      });
      var prevType = d.ownerType;
      if (prevType === 'monster') {
        var fac = world.factionById[d.ownerId];
        if (fac) { U.remove(fac.dungeons, d.id); fac.strength = Math.round(fac.strength * 0.85); }
      }
      d.ownerHistory.push({ year: world.year, type: prevType, id: d.ownerId });
      d.ownerType = 'guild';
      d.ownerId = world.guild.id;
      world.guild.dungeons.push(d.id);
      world.mapDirty = true;
      tokens.loot = lootText;
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.delveWin), tokens);
      tokens.cleared = true;
    } else if (reached === 0 || rng.next() < 0.28) {
      hero.alive = false;
      hero.diedYear = world.year;
      hero.deathCause = 'in ' + d.name;
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.delveLoss), tokens);
      tokens.died = true;
    } else {
      hero.level += rng.int(1, 3);
      hero.fame += 10 + reached * 2;
      d.deepestClear = Math.max(d.deepestClear, reached);
      tokens.loot = 'coin and old steel';
      tokens.result = U.fill(rng.pick(ED.FRAGMENTS.delveWin), tokens);
    }
    return tokens;
  };

  P.nationClearsDungeon = function (ctx) {
    var a = ctx.a, world = ctx.world, rng = ctx.rng;
    var options = world.dungeons.filter(function (d) {
      return d.ownerType !== 'nation' && world.owner[d.tile] === a.index;
    });
    if (!options.length) {
      options = world.dungeons.filter(function (d) {
        var cap = world.settlementById[a.capital];
        return d.ownerType === 'wild' && cap && U.dist(d.x, d.y, cap.x, cap.y) < 18;
      });
    }
    if (!options.length) return null;
    var d = rng.pick(options);
    var force = H.strength(world, a) * rng.range(0.7, 1.25);
    var resist = H.dungeonPower(world, d) * 1.4;
    var tokens = { a: a.name, dungeon: d.name };

    if (force > resist) {
      if (d.boss && d.boss.alive) { d.boss.alive = false; d.boss.killedYear = world.year; }
      if (d.ownerType === 'monster') {
        var fac = world.factionById[d.ownerId];
        if (fac) { U.remove(fac.dungeons, d.id); fac.strength = Math.round(fac.strength * 0.8); }
      }
      d.ownerHistory.push({ year: world.year, type: d.ownerType, id: d.ownerId });
      d.ownerType = 'nation';
      d.ownerId = a.id;
      d.cleared = true;
      d.discovered = true;
      a.dungeons.push(d.id);
      a.economy = Math.round(a.economy * 1.06);
      a.military = Math.max(5, Math.round(a.military * 0.94));
      world.mapDirty = true;
      tokens.result = 'The dungeon is a state asset now, worked under guard.';
    } else {
      a.military = Math.max(5, Math.round(a.military * 0.85));
      tokens.result = 'The army came back thinner and without the dungeon.';
    }
    return tokens;
  };

  P.forgeRelic = function (ctx) {
    var a = ctx.a, world = ctx.world, rng = ctx.rng;
    // Relic abundance directly gates how many exist at all.
    var cap = Math.round(3 + world.params.relicAbundance * 34);
    if (world.relics.length >= cap) return null;

    var race = world.races.byId[a.raceId];
    var smith = Names.person(rng, race ? race.culture : 'common');
    var tier = U.clamp(3 + (rng.chance(world.params.relicAbundance * 0.5) ? 1 : 0) +
      (rng.chance(0.25) ? 1 : 0), 2, 6);

    var relic = IG.forgeRelic(rng, {
      tier: tier,
      year: world.year,
      smith: smith,
      element: rng.pick(T.CORE_ELEMENTS),
      tokens: {
        war: 'the war between ' + a.name + ' and its neighbours',
        smith: smith,
        loss: 'the loss of ' + (world.settlements.length ? rng.pick(world.settlements).name : 'a border town'),
        a: a.name,
        monster: world.factions.length ? rng.pick(world.factions).leader.name : 'a great beast',
        hero: world.heroes.length ? rng.pick(world.heroes).name : smith
      }
    });

    // Skill-bound relics mint a genuinely unique Mythical skill.
    if (relic.effect.grantsSkill) {
      var uniq = ISE.SkillGen.makeUniqueSkill(rng, {
        element: relic.element,
        idHint: relic.effectId,
        origin: 'Bound into ' + relic.name + ', forged by ' + smith + '.'
      });
      world.skills.addUnique(uniq);
      relic.grantsSkillId = uniq.id;
      relic.effectText = 'Grants the skill ' + uniq.name + ' while carried.';
    }

    world.relics.push(relic);
    world.relicById[relic.id] = relic;
    H.giveRelicTo(world, relic, 'nation', a.id, 'newly forged');
    return {
      a: a.name, smith: smith, relic: relic.name,
      detail: relic.effectText, relicId: relic.id
    };
  };

  P.relicMoves = function (ctx) {
    var world = ctx.world, rng = ctx.rng;
    if (!world.relics.length) return null;
    var relic = rng.pick(world.relics);
    var oldOwner = H.relicLocationText(world, relic);
    var roll = rng.next();
    var detail;

    if (roll < 0.3 && world.dungeons.length) {
      var d = rng.pick(world.dungeons);
      H.giveRelicTo(world, relic, 'dungeon', d.id, 'lost underground');
      detail = U.fill(rng.pick(ED.FRAGMENTS.relicMove), { dungeon: d.name, newOwner: d.name,
        monster: d.boss ? d.boss.name : 'something' });
    } else if (roll < 0.6 && world.livingNations().length) {
      var n = rng.pick(world.livingNations());
      H.giveRelicTo(world, relic, 'nation', n.id, 'changed hands');
      detail = U.fill(rng.pick(ED.FRAGMENTS.relicMove), { newOwner: n.name,
        dungeon: world.dungeons.length ? rng.pick(world.dungeons).name : 'a ruin',
        monster: 'a great beast' });
    } else if (roll < 0.8 && world.factions.length) {
      var f = rng.pick(world.factions);
      H.giveRelicTo(world, relic, 'faction', f.id, 'taken as plunder');
      detail = 'It went into the hoard of the ' + f.name + '.';
    } else {
      var heroes = world.livingHeroes();
      if (heroes.length) {
        var hero = rng.pick(heroes);
        H.giveRelicTo(world, relic, 'hero', hero.id, 'claimed');
        detail = hero.name + ' carries it now.';
      } else return null;
    }
    return { relic: relic.name, oldOwner: oldOwner, detail: detail, relicId: relic.id };
  };

  P.heroFalls = function (ctx) {
    var hero = ctx.hero, world = ctx.world, rng = ctx.rng;
    if (!hero || !hero.alive) return null;
    hero.alive = false;
    hero.diedYear = world.year;
    var nat = world.nationById[hero.nationId];
    var detail = U.fill(rng.pick(ED.FRAGMENTS.heroDeath), {
      settlement: world.settlements.length ? rng.pick(world.settlements).name : 'a border town',
      dungeon: world.dungeons.length ? rng.pick(world.dungeons).name : 'a ruin',
      floor: rng.int(2, 20),
      faction: world.factions.length ? rng.pick(world.factions).name : 'wild things',
      a: nat ? nat.name : 'their homeland',
      b: world.livingNations().length ? rng.pick(world.livingNations()).name : 'a rival'
    });
    hero.deathCause = detail;
    // Their relics scatter.
    hero.relics.slice().forEach(function (rid) {
      var relic = world.relicById[rid];
      if (!relic) return;
      if (nat && rng.chance(0.5)) H.giveRelicTo(world, relic, 'nation', nat.id, 'returned home');
      else if (world.dungeons.length) {
        H.giveRelicTo(world, relic, 'dungeon', rng.pick(world.dungeons).id, 'lost with its bearer');
      }
    });
    return { hero: hero.name, detail: detail };
  };

  P.heroNamed = function (ctx) {
    var hero = ctx.hero, world = ctx.world, rng = ctx.rng;
    if (!hero || hero.named) return null;
    hero.named = true;
    hero.level += rng.int(4, 10);
    hero.fame += 120;
    hero.epithet = Names.epithet(rng, hero.flavor);
    hero.name = hero.name + ' ' + hero.epithet;

    // Whoever did the Naming has to be something that can.
    var namerPool = [];
    world.factions.forEach(function (f) {
      if (f.leader && f.leader.tier >= 4) namerPool.push(f.leader.name);
    });
    world.dungeons.forEach(function (d) {
      if (d.boss && d.boss.alive && d.boss.tier >= 5) namerPool.push(d.boss.name);
    });
    world.heroes.forEach(function (h) {
      if (h.named && h.alive && h.id !== hero.id) namerPool.push(h.name);
    });
    var namer = namerPool.length ? rng.pick(namerPool) : 'Something without a face';
    return { hero: hero.name, namer: namer, heroId: hero.id };
  };

  P.prophecy = function (ctx) {
    var world = ctx.world, rng = ctx.rng;
    var text = U.fill(rng.pick(ED.PROPHECY_LINES), {
      adj: rng.pick(['nameless', 'twice-born', 'unwelcome', 'quiet', 'foreign']),
      place: H.placeName(world, rng),
      monster: world.factions.length ? rng.pick(world.factions).leader.species : 'the deep thing',
      a: world.livingNations().length ? rng.pick(world.livingNations()).name : 'the last kingdom',
      relic: world.relics.length ? rng.pick(world.relics).name : 'the unforged blade',
      faction: world.factions.length ? rng.pick(world.factions).name : 'the horde'
    });
    world.prophecies = world.prophecies || [];
    world.prophecies.push({ year: world.year, text: text });
    return { place: H.placeName(world, rng), text: text };
  };

  P.schism = function (ctx) {
    var a = ctx.a, rng = ctx.rng;
    a.stability -= rng.int(4, 14);
    a.traits.piety = U.clamp01(a.traits.piety + rng.range(-0.3, 0.3));
    return { a: a.name, detail: rng.pick([
      'Two hierarchies now claim the same god.',
      'The old rites were banned and the new ones are worse.',
      'Half the temples emptied in a season.'
    ]) };
  };

  P.tournament = function (ctx) {
    var a = ctx.a, world = ctx.world, rng = ctx.rng;
    var cities = H.settlementsOf(world, a).filter(function (s) { return s.tierIdx >= 1; });
    if (!cities.length) return null;
    var st = rng.pick(cities);
    var heroes = world.livingHeroes();
    var hero;
    if (heroes.length && rng.chance(0.7)) {
      hero = rng.pick(heroes);
      hero.fame += 25;
      hero.level += 1;
    } else {
      hero = H.makeHero(world, rng, a, { settlementId: st.id, level: rng.int(10, 20) });
    }
    a.stability += 3;
    st.prosperity = U.round(U.clamp(st.prosperity * 1.05, 0.4, 2.0), 2);
    return { a: a.name, settlement: st.name, hero: hero.name };
  };

  ISE.Procs = { H: H, C: C, P: P };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
