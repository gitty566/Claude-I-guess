/* game.js — top-level game state and the actions the player can take:
 * travel, wild encounters, town services, dungeon entry, save/load.
 *
 * The UI calls into here and re-reads state; no rendering happens in this
 * file. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var Game = {};

  Game.state = {
    world: null,
    player: null,
    run: null,        // active dungeon run
    combat: null,     // active combat (wild encounter or defence)
    pendingIntervention: null,
    screen: 'title',
    messages: []
  };

  Game.SAVE_KEY = 'isekai_engine_save_v1';

  /* ------------------------------------------------------------- messages */
  Game.say = function (text, kind) {
    Game.state.messages.push({ text: text, kind: kind || 'info', day: Game.state.world ? Game.state.world.day : 0 });
    if (Game.state.messages.length > 200) Game.state.messages.splice(0, 60);
    return text;
  };

  /* ------------------------------------------------------------ new world */
  Game.generateWorld = function (params, onProgress) {
    var world = ISE.WorldGen.generate(params, onProgress);
    return world;
  };

  Game.runHistory = function (world, onProgress) {
    ISE.History.simulateHistory(world, { onProgress: onProgress });
    return world;
  };

  /* Pick a reasonable place for a new character to appear. */
  Game.startingSettlement = function (world, player) {
    var rng = new ISE.RNG(world.seed + '::start::' + player.name);
    var options = world.settlements.filter(function (s) { return !s.destroyed; });
    if (!options.length) return null;

    /* Start where the work is: a guild branch is the player's entire
     * on-ramp (contracts, rank, rumours), so prefer those outright and only
     * fall back to an ordinary town if the world has no chapters left. */
    var withGuild = options.filter(function (s) { return s.guild; });
    var pool = withGuild.length ? withGuild : options;

    var race = world.races.byId[player.raceId];
    var scored = pool.map(function (s) {
      var nat = world.nationById[s.nationId];
      var score = 1 + s.tierIdx * 2;
      if (nat && nat.raceId === player.raceId) score += 4;
      if (race && race.biomes.indexOf(s.biome) >= 0) score += 2;
      return [s, score];
    });
    return rng.weighted(scored) || pool[0];
  };

  Game.startGame = function (world, playerOpts) {
    ISE.Player._world = world;
    var player = ISE.Player.create(world, playerOpts);
    var start = Game.startingSettlement(world, player);
    if (start) ISE.Player.place(player, world, start);

    world.news = world.news || [];
    world.day = world.year * U.DAYS_PER_YEAR;
    world.yearProgress = 0;

    Game.state.world = world;
    Game.state.player = player;
    Game.state.run = null;
    Game.state.combat = null;
    Game.state.screen = 'map';
    Game.state.messages = [];

    Game.say('You arrive at ' + (start ? start.name : 'nowhere in particular') + '. ' +
      ISE.Player.ORIGINS.filter(function (o) { return o.id === player.originId; })[0].name +
      '. Year ' + world.year + '.', 'good');
    return Game.state;
  };

  /* ---------------------------------------------------------------- travel */
  function moveCost(world, tile) {
    var b = T.BIOMES[world.geo.biome[tile]];
    return b && b.land ? b.move : 99;
  }

  /* A* across land tiles. Returns {path, cost} or null. */
  Game.findPath = function (world, sx, sy, tx, ty) {
    var geo = world.geo, w = geo.w, h = geo.h;
    var start = sy * w + sx, goal = ty * w + tx;
    if (start === goal) return { path: [start], cost: 0 };
    if (!geo.land[goal]) return null;

    var open = new U.Heap(function (a, b) { return a.f - b.f; });
    var gScore = {}, cameFrom = {};
    gScore[start] = 0;
    open.push({ tile: start, f: U.dist(sx, sy, tx, ty) });

    var visited = {};
    var guard = 0;
    while (open.size && guard++ < 60000) {
      var cur = open.pop();
      if (visited[cur.tile]) continue;
      visited[cur.tile] = true;
      if (cur.tile === goal) break;

      var cx = cur.tile % w, cy = (cur.tile / w) | 0;
      for (var d = 0; d < U.NEIGHBORS8.length; d++) {
        var nx = cx + U.NEIGHBORS8[d][0], ny = cy + U.NEIGHBORS8[d][1];
        if (!U.inBounds(nx, ny, w, h)) continue;
        var ni = ny * w + nx;
        if (!geo.land[ni]) continue;
        var diag = U.NEIGHBORS8[d][0] !== 0 && U.NEIGHBORS8[d][1] !== 0;
        var step = moveCost(world, ni) * (diag ? 1.41 : 1);
        var tentative = gScore[cur.tile] + step;
        if (gScore[ni] === undefined || tentative < gScore[ni]) {
          gScore[ni] = tentative;
          cameFrom[ni] = cur.tile;
          open.push({ tile: ni, f: tentative + U.dist(nx, ny, tx, ty) });
        }
      }
    }
    if (gScore[goal] === undefined) return null;
    var path = [goal], node = goal;
    while (cameFrom[node] !== undefined) { node = cameFrom[node]; path.unshift(node); }
    return { path: path, cost: gScore[goal] };
  };

  Game.travelSpeed = function (player, world) {
    var stats = ISE.Player.effectiveStats(player);
    var speed = 5 + stats.spd * 0.05;
    // Travel-type utility skills genuinely shorten journeys.
    player.skills.forEach(function (s) {
      var def = world.skills.byId[s.id];
      if (def && def.utility === 'travel') speed *= 1.35;
    });
    player.companions.forEach(function (c) { if (c.mount) speed *= 1.25; });
    return speed;
  };

  Game.travelEstimate = function (world, player, tx, ty) {
    var res = Game.findPath(world, player.x, player.y, tx, ty);
    if (!res) return null;
    var days = Math.max(1, Math.ceil(res.cost / Game.travelSpeed(player, world)));
    var danger = 0;
    res.path.forEach(function (ti) { danger += world.geo.danger[ti]; });
    danger /= Math.max(1, res.path.length);
    return { days: days, cost: res.cost, path: res.path, danger: danger };
  };

  /* Travel, day by day, rolling for wild encounters on the way. */
  Game.travelTo = function (tx, ty) {
    var world = Game.state.world, player = Game.state.player;
    if (Game.state.combat || Game.state.run) return { ok: false, reason: 'Not while you are busy.' };
    var est = Game.travelEstimate(world, player, tx, ty);
    if (!est) return { ok: false, reason: 'No route over land.' };

    var rng = new ISE.RNG(world.seed + '::travel::' + world.day + '::' + tx + ',' + ty);
    var interrupted = false;

    for (var day = 0; day < est.days; day++) {
      // Move the marker proportionally so an interrupted trip leaves the
      // player where the interruption happened.
      var frac = (day + 1) / est.days;
      var idx = Math.min(est.path.length - 1, Math.floor(frac * (est.path.length - 1)));
      var tile = est.path[idx];
      player.x = tile % world.geo.w;
      player.y = (tile / world.geo.w) | 0;

      var biome = world.geo.biome[tile];
      player.biomesVisited[biome] = (player.biomesVisited[biome] || 0) + 1;

      var report = ISE.WorldClock.advance(world, player, 1);
      Game.handleReport(report);

      var encounterChance = U.clamp01(0.06 + world.geo.danger[tile] * 0.022);
      player.skills.forEach(function (s) {
        var def = world.skills.byId[s.id];
        if (def && def.utility === 'stealth') encounterChance *= 0.6;
      });
      if (rng.next() < encounterChance) {
        Game.startWildEncounter(tile, rng);
        interrupted = true;
        break;
      }
    }

    if (!interrupted) {
      player.x = tx; player.y = ty;
      var settlement = world.settlementAt(tx, ty);
      if (settlement) {
        player.knownSettlements[settlement.id] = true;
        player.locationId = settlement.id;
        var done = ISE.Quests.notify(world, player, { type: 'arrive', settlementId: settlement.id });
        done.forEach(function (q) { Game.say('Contract complete: ' + q.title, 'quest'); });
        Game.say('You reach ' + settlement.name + '.');
      } else {
        var dungeon = world.dungeonAt(tx, ty);
        player.locationId = null;
        if (dungeon) {
          dungeon.discovered = true;
          player.knownDungeons[dungeon.id] = true;
          Game.say('You stand at the mouth of ' + dungeon.name + '. Danger tier ' + dungeon.tier + '.');
        } else {
          Game.say('You make camp in the ' + T.BIOMES[world.geo.biome[ty * world.geo.w + tx]].name.toLowerCase() + '.');
        }
      }
      // Discover what is nearby.
      world.settlements.forEach(function (s) {
        if (!s.destroyed && U.dist(s.x, s.y, tx, ty) <= 6) player.knownSettlements[s.id] = true;
      });
      world.dungeons.forEach(function (dg) {
        if (U.dist(dg.x, dg.y, tx, ty) <= 4) {
          player.knownDungeons[dg.id] = true;
          dg.discovered = true;
        }
      });
    }

    return { ok: true, days: est.days, interrupted: interrupted };
  };

  /* --------------------------------------------------------- encounters */
  Game.startWildEncounter = function (tile, rng) {
    var world = Game.state.world, player = Game.state.player;
    var biome = world.geo.biome[tile];
    var fams = ISE.MonsterGen.familiesForBiome(biome);
    var danger = world.geo.danger[tile];
    /* Wilderness scales with the land's danger but is capped against the
     * player's level: the overworld should be crossable, and the genuinely
     * lethal tiers live in dungeons the player chooses to enter. */
    var tier = U.clamp(Math.round(1 + danger / 3.2), 1,
      Math.min(
        U.clamp(Math.round(world.params.monsterCeiling * 0.62), 1, 6),
        2 + Math.floor(player.level / 9)
      ));
    var level = Math.max(1, Math.round(player.level * rng.range(0.75, 1.2) + danger));

    var fam = rng.pick(fams);
    /* Group size grows with the player. One character against a five-wolf
     * pack at level 1 is not a fight, it's arithmetic. */
    var maxGroup = U.clamp(1 + Math.floor(player.level / 7) + player.companions.length, 1, 5);
    var count = U.clamp(rng.int(fam.pack[0], fam.pack[1]), 1, maxGroup);
    var monsters = [];
    for (var i = 0; i < count; i++) {
      monsters.push(ISE.MonsterGen.makeMonster(rng, world.skills, {
        family: rng.chance(0.75) ? fam : rng.pick(fams),
        tier: tier, level: level + rng.int(-1, 1)
      }));
    }

    var party = [ISE.Combat.actorFromPlayer(player)];
    player.companions.forEach(function (c) {
      if (!c.down) party.push(ISE.Combat.actorFromCompanion(c));
    });
    Game.state.combat = ISE.Combat.start(world,
      party,
      monsters.map(function (m) { return ISE.Combat.actorFromMonster(m, 'enemy'); }),
      {
        seed: world.seed + '::wild::' + world.day + '::' + tile,
        tag: 'wild',
        introText: 'Ambush in the ' + T.BIOMES[biome].name.toLowerCase() + '.'
      });
    Game.state.combatMonsters = monsters;
    Game.state.combatKind = 'wild';
    Game.say('Ambushed by ' + count + ' ' + (count === 1 ? monsters[0].name : monsters[0].name + 's') + '.', 'bad');
    return Game.state.combat;
  };

  /* Defending a settlement the player happens to be standing in. */
  Game.startDefence = function (intervention) {
    var world = Game.state.world, player = Game.state.player;
    var rng = new ISE.RNG(world.seed + '::defend::' + world.day);
    var faction = intervention.faction;
    var fam = ISE.MonsterData.FAMILY_BY_ID[faction.familyId] || ISE.MonsterData.FAMILY_BY_ID.wolf;
    var tier = U.clamp(Math.round(faction.strength / 60) + 1, 1, 6);
    var monsters = [];
    var count = U.clamp(2 + Math.round(faction.strength / 90), 2, 5);
    for (var i = 0; i < count - 1; i++) {
      monsters.push(ISE.MonsterGen.makeMonster(rng, world.skills, {
        family: fam, tier: tier, level: Math.round(player.level * 1.05 + 2)
      }));
    }
    // The faction's leader shows up if it is a serious attack.
    if (faction.leader && faction.leader.alive && faction.strength > 120) {
      monsters.push(faction.leader);
    } else {
      monsters.push(ISE.MonsterGen.makeNamed(rng, world.skills, {
        family: fam, tier: tier, mini: true,
        level: Math.round(player.level * 1.1 + 3), placeName: faction.regionName
      }));
    }

    var party = [ISE.Combat.actorFromPlayer(player)];
    player.companions.forEach(function (c) { if (!c.down) party.push(ISE.Combat.actorFromCompanion(c)); });
    Game.state.combat = ISE.Combat.start(world, party,
      monsters.map(function (m) { return ISE.Combat.actorFromMonster(m, 'enemy'); }),
      {
        seed: world.seed + '::defence::' + world.day,
        tag: 'defence',
        canFlee: true,
        introText: 'The ' + faction.name + ' is at the walls of ' + intervention.settlement.name + '.'
      });
    Game.state.combatMonsters = monsters;
    Game.state.combatKind = 'defence';
    Game.state.pendingIntervention = intervention;
    return Game.state.combat;
  };

  /* Resolve a finished combat that is not part of a dungeon run. */
  Game.resolveCombat = function () {
    var st = Game.state, world = st.world, player = st.player;
    var combat = st.combat;
    if (!combat || !combat.over) return null;
    ISE.Combat.commit(combat);
    var rng = new ISE.RNG(world.seed + '::loot::' + world.day);
    var out = { result: combat.result, xp: 0, gold: 0, items: [] };

    if (combat.result === 'victory') {
      var xp = 0, gold = 0;
      st.combatMonsters.forEach(function (m) {
        xp += m.xp; gold += m.gold;
        ISE.Player.recordKill(player, m);
        if (m.named || m.boss) {
          m.alive = false;
          ISE.Quests.notify(world, player, { type: 'named_killed', monsterId: m.id });
        }
        var facId = null;
        world.factions.forEach(function (f) {
          if (f.familyId === m.familyId && U.dist(f.x, f.y, player.x, player.y) < 25) facId = f.id;
        });
        ISE.Quests.notify(world, player, { type: 'kill', monster: m, factionId: facId });
      });
      var res = ISE.Player.gainXp(player, xp, world);
      player.gold += gold;
      out.xp = res.gained; out.gold = gold; out.levels = res.levels;
      if (rng.chance(0.5)) {
        var loot = ISE.ItemGen.rollLoot(rng, world.skills, {
          tier: U.clamp(st.combatMonsters[0].tier, 1, 6),
          luck: ISE.Player.effectiveStats(player).lck, gold: 0, count: 1
        });
        loot.items.forEach(function (i) { player.inventory.push(i); out.items.push(i); });
      }
      Game.say('Victory. ' + out.xp + ' experience, ' + gold + ' coin.' +
        (res.levels ? ' Level ' + player.level + '!' : ''), 'good');
    } else if (combat.result === 'fled') {
      Game.say('You get away.', 'info');
    } else {
      var lost = Math.round(player.gold * 0.2);
      player.gold -= lost;
      player.hpCur = Math.max(1, Math.round(ISE.Player.effectiveStats(player).hp * 0.2));
      Game.say('You lose the fight and wake up somewhere else, ' + lost + ' coin lighter.', 'bad');
      out.goldLost = lost;
    }

    // If this was a settlement defence, feed the result back into the world.
    if (st.combatKind === 'defence' && st.pendingIntervention) {
      var power = combat.result === 'victory'
        ? ISE.Player.effectiveStats(player).atk * 3 + player.level * 12
        : 0;
      var r = ISE.WorldClock.resolveIntervention(world, player, st.pendingIntervention, power);
      if (r) Game.say(r.tokens.result, r.tokens.held ? 'good' : 'bad');
      st.pendingIntervention = null;
    }

    st.combat = null;
    st.combatMonsters = null;
    st.combatKind = null;
    return out;
  };

  /* ------------------------------------------------------------- dungeons */
  Game.enterDungeon = function (dungeonId) {
    var st = Game.state;
    var dungeon = st.world.dungeonById[dungeonId];
    if (!dungeon) return { ok: false, reason: 'No such place.' };
    if (dungeon.x !== st.player.x || dungeon.y !== st.player.y) {
      return { ok: false, reason: 'You are not there.' };
    }
    st.run = ISE.DungeonRun.enter(st.world, st.player, dungeon);
    st.screen = 'dungeon';
    return { ok: true, run: st.run };
  };

  Game.leaveDungeon = function () {
    var st = Game.state;
    if (!st.run) return;
    ISE.DungeonRun.leave(st.world, st.player, st.run);
    var report = ISE.WorldClock.advance(st.world, st.player,
      Math.max(1, Math.round(st.run.deepest * 0.6 + 1)));
    Game.handleReport(report);
    Game.say('You climb back out. Deepest floor reached: ' + Math.max(1, st.run.deepest) + '.');
    st.run = null;
    st.screen = 'map';
  };

  /* ---------------------------------------------------------- town actions */
  Game.rest = function (nights) {
    var st = Game.state;
    var settlement = st.world.settlementAt(st.player.x, st.player.y);
    nights = nights || 1;
    if (settlement) {
      var price = ISE.Economy.innPrice(settlement) * nights;
      if (st.player.gold < price) return { ok: false, reason: 'You cannot afford the room (' + price + ').' };
      st.player.gold -= price;
      ISE.Player.rest(st.player, 1);
      Game.say('You sleep ' + nights + ' ' + U.plural(nights, 'night') + ' at an inn in ' +
        settlement.name + ' for ' + price + ' coin.');
    } else {
      ISE.Player.rest(st.player, 0.45);
      Game.say('You make camp. Rough sleep, partial recovery.');
    }
    var report = ISE.WorldClock.advance(st.world, st.player, nights);
    Game.handleReport(report);
    return { ok: true };
  };

  Game.wait = function (days) {
    var st = Game.state;
    var report = ISE.WorldClock.advance(st.world, st.player, days);
    Game.handleReport(report);
    ISE.Player.rest(st.player, 0.15 * days);
    return { ok: true };
  };

  /* Turn world-clock output into player-facing messages and interventions. */
  Game.handleReport = function (report) {
    if (!report) return;
    report.news.forEach(function (entry) {
      Game.say(entry.text, entry.tags.indexOf('war') >= 0 ? 'war' : 'news');
    });
    if (report.interventions && report.interventions.length) {
      Game.state.pendingIntervention = report.interventions[0];
      Game.say('The ' + report.interventions[0].faction.name + ' is attacking ' +
        report.interventions[0].settlement.name + ' — you are here for it.', 'bad');
    }
  };

  /* Decline to fight a raid you are standing in the middle of. */
  Game.ignoreIntervention = function () {
    var st = Game.state;
    if (!st.pendingIntervention) return;
    var r = ISE.WorldClock.resolveIntervention(st.world, st.player, st.pendingIntervention, 0);
    if (r) Game.say(r.tokens.result, r.tokens.held ? 'info' : 'bad');
    st.pendingIntervention = null;
  };

  /* --------------------------------------------------------------- naming */
  /* Who in reach can grant the player a true Name. */
  Game.namers = function () {
    var st = Game.state, world = st.world, player = st.player;
    var out = [];
    world.heroes.forEach(function (h) {
      if (!h.alive || !h.named) return;
      var s = world.settlementById[h.homeSettlement];
      if (!s || s.destroyed) return;
      if (U.dist(s.x, s.y, player.x, player.y) > 0) return;
      out.push({ kind: 'hero', id: h.id, name: h.name, where: s.name,
        need: 'Reputation 40 with ' + (world.nationById[h.nationId] || {}).name });
    });
    player.companions.forEach(function (c) {
      if (c.canName) out.push({ kind: 'companion', id: c.id, name: c.name, where: 'at your side', need: '' });
    });
    return out;
  };

  Game.requestName = function (namerId) {
    var st = Game.state, world = st.world, player = st.player;
    if (player.named) return { ok: false, reason: 'You already carry a Name.' };
    var hero = world.heroById[namerId];
    var namer = null;
    if (hero && hero.named && hero.alive) {
      var nat = world.nationById[hero.nationId];
      if (nat && ISE.Player.reputationWith(player, nat.id) < 40) {
        return { ok: false, reason: hero.name + ' does not know you well enough yet.' };
      }
      namer = hero.name;
    } else {
      var comp = player.companions.filter(function (c) { return c.id === namerId && c.canName; })[0];
      if (comp) namer = comp.name;
    }
    if (!namer) return { ok: false, reason: 'Nobody here can do that.' };
    ISE.Player.receiveName(player, namer);
    ISE.Procs.H.log(world, {
      year: world.year, ruleId: 'player_named', name: 'A Naming',
      tags: ['legend', 'player'],
      text: namer + ' gave ' + player.name + ' a true Name.', tokens: {}
    });
    Game.say(namer + ' names you. Something settles into place.', 'good');
    return { ok: true, namer: namer };
  };

  /* -------------------------------------------------------------- persist */
  Game.serialize = function () {
    var st = Game.state;
    if (!st.world || !st.player) return null;
    var world = st.world;
    // Typed arrays and functions do not survive JSON; store what regenerates
    // cheaply as plain arrays and rebuild the rest on load.
    var save = {
      version: 1,
      params: world.params,
      seed: world.seed,
      day: world.day,
      year: world.year,
      yearProgress: world.yearProgress || 0,
      owner: Array.prototype.slice.call(world.owner),
      nations: world.nations,
      settlements: world.settlements,
      ruins: world.ruins || [],
      dungeons: world.dungeons,
      factions: world.factions,
      relics: world.relics,
      heroes: world.heroes,
      guild: world.guild,
      legends: world.legends.slice(-1200),
      news: world.news || [],
      prophecies: world.prophecies || [],
      genesis: world.genesis,
      uniqueSkills: world.skills.list.filter(function (s) { return s.unique; }),
      player: st.player,
      summary: world.summary
    };
    return JSON.stringify(save);
  };

  Game.save = function () {
    try {
      var data = Game.serialize();
      if (!data) return { ok: false, reason: 'Nothing to save.' };
      if (typeof localStorage === 'undefined') return { ok: false, reason: 'No storage available.' };
      localStorage.setItem(Game.SAVE_KEY, data);
      return { ok: true, bytes: data.length };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  };

  Game.hasSave = function () {
    try {
      return typeof localStorage !== 'undefined' && !!localStorage.getItem(Game.SAVE_KEY);
    } catch (e) { return false; }
  };

  Game.deleteSave = function () {
    try { localStorage.removeItem(Game.SAVE_KEY); } catch (e) { /* ignore */ }
  };

  /* Rebuild a world from a save: regenerate everything deterministic from
   * the seed, then overlay the mutable state that was actually stored. */
  Game.load = function (json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data) return { ok: false, reason: 'Empty save.' };
    var world = ISE.WorldGen.generate(data.params);

    world.genesis = data.genesis || world.genesis;
    world.nations = data.nations;
    world.settlements = data.settlements;
    world.ruins = data.ruins || [];
    world.dungeons = data.dungeons;
    world.factions = data.factions;
    world.relics = data.relics;
    world.heroes = data.heroes;
    world.guild = data.guild;
    world.legends = data.legends || [];
    world.news = data.news || [];
    world.prophecies = data.prophecies || [];
    world.year = data.year;
    world.day = data.day;
    world.yearProgress = data.yearProgress || 0;
    world.summary = data.summary;

    for (var i = 0; i < data.owner.length && i < world.owner.length; i++) {
      world.owner[i] = data.owner[i];
    }
    (data.uniqueSkills || []).forEach(function (s) {
      if (!world.skills.byId[s.id]) world.skills.addUnique(s);
    });

    ISE.WorldGen.reindex(world);
    // Ruins are indexed too, so legends can still name them.
    world.ruins.forEach(function (r) { world.settlementById[r.id] = r; });
    ISE.Procs.H.computeBorders(world);
    ISE.Player._world = world;

    var player = data.player;
    // skillById is a lookup, not data; rebuild it.
    player.skillById = {};
    player.skills.forEach(function (s) { player.skillById[s.id] = s; });

    Game.state.world = world;
    Game.state.player = player;
    Game.state.run = null;
    Game.state.combat = null;
    Game.state.pendingIntervention = null;
    Game.state.screen = 'map';
    Game.state.messages = [];
    Game.say('Loaded. Year ' + world.year + ', ' + U.formatDate(world.day) + '.');
    return { ok: true, state: Game.state };
  };

  Game.loadFromStorage = function () {
    try {
      var raw = localStorage.getItem(Game.SAVE_KEY);
      if (!raw) return { ok: false, reason: 'No save found.' };
      return Game.load(raw);
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  };

  ISE.Game = Game;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
