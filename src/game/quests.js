/* quests.js — guild work, generated from live world state rather than a
 * fixed list. A bounty exists because that monster faction exists; a
 * subjugation contract exists because that dungeon is currently held by
 * something the guild would rather it wasn't. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var Q = {};

  var TYPES = {
    subjugate: {
      name: 'Subjugation',
      title: 'Subjugate {target}',
      desc: 'Kill the master of {target} and put the place out of business.',
      rankMin: 0
    },
    delve: {
      name: 'Survey',
      title: 'Survey {target} to floor {n}',
      desc: 'The guild wants floor {n} of {target} mapped. Get that deep and come back alive.',
      rankMin: 0
    },
    bounty: {
      name: 'Bounty',
      title: 'Bounty: {target}',
      desc: '{target} leads the {faction}. The bounty is posted whole; nobody expects change.',
      rankMin: 1
    },
    cull: {
      name: 'Culling',
      title: 'Cull the {faction}',
      desc: 'Thin out the {faction} in {place}. {n} confirmed kills and the contract closes.',
      rankMin: 0
    },
    escort: {
      name: 'Courier',
      title: 'Carry word to {target}',
      desc: 'Something that cannot go by road needs to reach {target}. Take it there.',
      rankMin: 0
    },
    defend: {
      name: 'Defence',
      title: 'Hold {target}',
      desc: '{target} expects an attack. Be standing on the wall when it comes.',
      rankMin: 1
    },
    retrieve: {
      name: 'Retrieval',
      title: 'Recover {relic}',
      desc: '{relic} is in {target}. The guild has a client who wants it back.',
      rankMin: 3
    }
  };
  Q.TYPES = TYPES;

  function rewardFor(world, player, difficulty, rng) {
    var gold = Math.round((60 + difficulty * 55) * rng.range(0.85, 1.25));
    var xp = Math.round((45 + difficulty * 42) * rng.range(0.9, 1.2));
    var reward = { gold: gold, xp: xp, rep: 4 + Math.round(difficulty * 1.6), items: [] };
    if (rng.chance(0.35 + difficulty * 0.03)) {
      var pool = world.skills.list.filter(function (s) {
        return !s.unique && !s.apex && s.rarityTier <= U.clamp(Math.ceil(difficulty / 2), 1, 5);
      });
      if (pool.length) reward.items.push(ISE.ItemGen.makeSkillOrb(rng, rng.pick(pool)));
    }
    if (rng.chance(0.25)) {
      reward.items.push(ISE.ItemGen.rollItem(rng, {
        tier: U.clamp(Math.ceil(difficulty / 2), 1, 6),
        rarityTier: U.clamp(Math.ceil(difficulty / 2) + 1, 1, 6)
      }));
    }
    if (difficulty >= 7 && rng.chance(0.3)) reward.items.push(ISE.ItemGen.makeCatalyst(rng));
    return reward;
  }

  /* Build the board for a settlement. Deterministic per settlement/window. */
  Q.board = function (world, player, settlement) {
    var window = Math.floor(world.day / 10);
    if (settlement._questBoard && settlement._questWindow === window) {
      return settlement._questBoard.filter(function (q) { return !q.taken; });
    }
    var rng = new ISE.RNG(world.seed + '::quests::' + settlement.id + '::' + window);
    var out = [];
    var count = 3 + settlement.tierIdx + rng.int(0, 2);

    // Candidate dungeons: reachable and appropriately dangerous.
    var dungeons = world.dungeons.filter(function (d) {
      return U.dist(d.x, d.y, settlement.x, settlement.y) < 26 && !d.cleared;
    });
    var factions = world.factions.filter(function (f) {
      return f.alive && U.dist(f.x, f.y, settlement.x, settlement.y) < 30;
    });
    var towns = world.settlements.filter(function (s) {
      return !s.destroyed && s.id !== settlement.id &&
        U.dist(s.x, s.y, settlement.x, settlement.y) < 30;
    });

    for (var i = 0; i < count; i++) {
      var kinds = [];
      if (dungeons.length) kinds.push(['subjugate', 3], ['delve', 4]);
      if (factions.length) kinds.push(['cull', 3], ['bounty', 2]);
      if (towns.length) kinds.push(['escort', 2]);
      if (towns.length && rng.chance(0.4)) kinds.push(['defend', 1]);
      var withRelics = dungeons.filter(function (d) { return d.relics.length; });
      if (withRelics.length) kinds.push(['retrieve', 1]);
      if (!kinds.length) break;

      var type = rng.weighted(kinds);
      var quest = Q.make(world, player, settlement, type, rng, {
        dungeons: dungeons, factions: factions, towns: towns, withRelics: withRelics
      });
      if (quest) out.push(quest);
    }

    /* A board made entirely of rank-gated work leaves an unranked newcomer
     * with nothing to do, so top up with contracts they can actually take. */
    var pools = { dungeons: dungeons, factions: factions, towns: towns, withRelics: withRelics };
    var openTypes = Object.keys(TYPES).filter(function (t) {
      return TYPES[t].rankMin <= player.guildRank;
    });
    var guard = 0;
    while (guard++ < 20 &&
      out.filter(function (q) { return q.rankMin <= player.guildRank; }).length < 2) {
      var t = rng.pick(openTypes);
      var extra = Q.make(world, player, settlement, t, rng, pools);
      if (extra) out.push(extra);
    }

    settlement._questBoard = out;
    settlement._questWindow = window;
    return out;
  };

  Q.make = function (world, player, settlement, type, rng, pools) {
    var def = TYPES[type];
    if (!def) return null;
    var id = 'quest_' + settlement.id + '_' + type + '_' + Math.floor(rng.next() * 1e9).toString(36);
    var giver = settlement.npcs.length
      ? rng.pick(settlement.npcs.filter(function (n) {
        return n.role === 'questgiver' || n.role === 'noble' || n.role === 'merchant';
      }) || settlement.npcs)
      : null;
    var q = {
      id: id, type: type, typeName: def.name,
      settlementId: settlement.id,
      giver: giver ? giver.name : 'the guild registrar',
      taken: false, done: false, failed: false,
      progress: 0, need: 1,
      postedDay: world.day,
      rankMin: def.rankMin
    };

    switch (type) {
      case 'subjugate': {
        var d = rng.pick(pools.dungeons);
        if (!d || !d.boss || !d.boss.alive) return null;
        q.targetId = d.id;
        q.difficulty = d.tier;
        q.title = U.fill(def.title, { target: d.name });
        q.desc = U.fill(def.desc, { target: d.name }) + ' Its master is ' + d.boss.name + '.';
        break;
      }
      case 'delve': {
        var d2 = rng.pick(pools.dungeons);
        if (!d2) return null;
        var n = U.clamp(Math.round(d2.floors * rng.range(0.3, 0.8)), 1, d2.floors);
        q.targetId = d2.id;
        q.need = n;
        q.difficulty = Math.max(1, Math.round(d2.tier * (n / d2.floors)));
        q.title = U.fill(def.title, { target: d2.name, n: n });
        q.desc = U.fill(def.desc, { target: d2.name, n: n });
        break;
      }
      case 'bounty': {
        var f = rng.pick(pools.factions);
        if (!f || !f.leader || !f.leader.alive) return null;
        q.targetId = f.leader.id;
        q.factionId = f.id;
        q.difficulty = f.leader.tier * 2;
        q.title = U.fill(def.title, { target: f.leader.name });
        q.desc = U.fill(def.desc, { target: f.leader.name, faction: f.name });
        break;
      }
      case 'cull': {
        var f2 = rng.pick(pools.factions);
        if (!f2) return null;
        q.targetId = f2.id;
        q.need = 4 + rng.int(0, 6);
        q.difficulty = Math.max(1, Math.round(f2.strength / 40));
        q.title = U.fill(def.title, { faction: f2.name });
        q.desc = U.fill(def.desc, { faction: f2.name, place: f2.regionName, n: q.need });
        break;
      }
      case 'escort': {
        var t = rng.pick(pools.towns);
        if (!t) return null;
        q.targetId = t.id;
        q.difficulty = Math.max(1, Math.round(U.dist(t.x, t.y, settlement.x, settlement.y) / 4));
        q.title = U.fill(def.title, { target: t.name });
        q.desc = U.fill(def.desc, { target: t.name });
        break;
      }
      case 'defend': {
        var t2 = rng.chance(0.5) ? settlement : rng.pick(pools.towns);
        if (!t2) return null;
        q.targetId = t2.id;
        q.difficulty = Math.max(2, Math.round(t2.tierIdx * 3 + 3));
        q.title = U.fill(def.title, { target: t2.name });
        q.desc = U.fill(def.desc, { target: t2.name });
        break;
      }
      case 'retrieve': {
        var d3 = rng.pick(pools.withRelics);
        if (!d3 || !d3.relics.length) return null;
        var relic = world.relicById[d3.relics[0]];
        if (!relic) return null;
        q.targetId = d3.id;
        q.relicId = relic.id;
        q.difficulty = d3.tier + 3;
        q.title = U.fill(def.title, { relic: relic.name });
        q.desc = U.fill(def.desc, { relic: relic.name, target: d3.name });
        break;
      }
      default: return null;
    }

    q.reward = rewardFor(world, player, q.difficulty, rng);
    return q;
  };

  Q.accept = function (player, world, quest) {
    if (player.questsActive.length >= 5) return { ok: false, reason: 'You are carrying too much work already.' };
    if (player.guildRank < quest.rankMin) {
      return { ok: false, reason: 'Requires guild rank ' +
        ISE.Player.GUILD_RANKS[quest.rankMin] + '.' };
    }
    quest.taken = true;
    quest.acceptedDay = world.day;
    player.questsActive.push(quest);
    return { ok: true };
  };

  Q.abandon = function (player, quest) {
    U.remove(player.questsActive, quest);
    quest.taken = false;
    return true;
  };

  /* World events feed progress. Called from the game loop. */
  Q.notify = function (world, player, event) {
    var completed = [];
    player.questsActive.forEach(function (q) {
      if (q.done) return;
      switch (q.type) {
        case 'subjugate':
          if (event.type === 'boss_killed' && event.dungeonId === q.targetId) q.progress = 1;
          break;
        case 'delve':
          if (event.type === 'floor_reached' && event.dungeonId === q.targetId) {
            q.progress = Math.max(q.progress, event.floor);
          }
          break;
        case 'bounty':
          if (event.type === 'named_killed' && event.monsterId === q.targetId) q.progress = 1;
          break;
        case 'cull':
          if (event.type === 'kill' && event.factionId === q.targetId) q.progress += 1;
          break;
        case 'escort':
          if (event.type === 'arrive' && event.settlementId === q.targetId) q.progress = 1;
          break;
        case 'defend':
          if (event.type === 'raid_defended' && event.settlementId === q.targetId) q.progress = 1;
          if (event.type === 'settlement_lost' && event.settlementId === q.targetId) q.failed = true;
          break;
        case 'retrieve':
          if (event.type === 'relic_taken' && event.relicId === q.relicId) q.progress = 1;
          break;
      }
      if (!q.failed && q.progress >= q.need) {
        q.done = true;
        completed.push(q);
      }
    });
    return completed;
  };

  /* Turning in has to happen at a guild branch. */
  Q.turnIn = function (player, world, quest) {
    if (!quest.done) return { ok: false, reason: 'Not finished.' };
    if (quest.claimed) return { ok: false, reason: 'Already claimed.' };
    quest.claimed = true;
    player.gold += quest.reward.gold;
    var xp = ISE.Player.gainXp(player, quest.reward.xp, world);
    quest.reward.items.forEach(function (i) { player.inventory.push(i); });

    var settlement = world.settlementById[quest.settlementId];
    if (settlement) {
      var nat = world.nationById[settlement.nationId];
      if (nat) ISE.Player.shiftReputation(player, nat.id, quest.reward.rep);
    }
    player.fame += 3 + quest.difficulty;
    player.guildPoints = (player.guildPoints || 0) + 1 + Math.round(quest.difficulty / 3);

    var ranked = false;
    var need = [0, 3, 9, 20, 40, 75, 130];
    while (player.guildRank < 6 && player.guildPoints >= need[player.guildRank + 1]) {
      player.guildRank += 1;
      ranked = true;
    }

    U.remove(player.questsActive, quest);
    player.questsDone.push({ id: quest.id, title: quest.title, day: world.day });
    return { ok: true, xp: xp, ranked: ranked };
  };

  ISE.Quests = Q;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
