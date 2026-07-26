/* dungeonrun.js — the dungeon crawl: floors made of nodes, monsters drawn
 * from the dungeon's ecology, mini-bosses at floor clusters, a named boss at
 * the bottom, and ownership consequences for clearing it. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, MD = ISE.MonsterData, MG = ISE.MonsterGen;

  var DR = {};

  var NODE_TYPES = {
    monster: { name: 'Hostiles', icon: '⚔', desc: 'Something is waiting.' },
    horde: { name: 'Swarm', icon: '⚔⚔', desc: 'Many somethings are waiting.' },
    elite: { name: 'Mini-Boss', icon: '☠', desc: 'A named thing holds this ground.' },
    treasure: { name: 'Cache', icon: '❖', desc: 'Something worth carrying out.' },
    trap: { name: 'Trap', icon: '✸', desc: 'The floor is a lie.' },
    shrine: { name: 'Shrine', icon: '✦', desc: 'Old power, still listening.' },
    empty: { name: 'Passage', icon: '·', desc: 'Nothing here.' },
    stairs: { name: 'Descent', icon: '▼', desc: 'The way down.' },
    boss: { name: 'The Master', icon: '☠☠', desc: 'The thing this place belongs to.' }
  };
  DR.NODE_TYPES = NODE_TYPES;

  function floorSeed(world, dungeon, floor, run) {
    return world.seed + '::delve::' + dungeon.id + '::' + floor + '::' + run.attempt;
  }

  /* Lay out one floor as a short branching path of nodes. */
  function buildFloor(world, player, dungeon, floorNum, run) {
    var data = dungeon.floorData[floorNum - 1];
    var rng = new ISE.RNG(floorSeed(world, dungeon, floorNum, run));
    var isLast = floorNum >= dungeon.floors;
    var count = data.nodes;

    var nodes = [];
    for (var i = 0; i < count; i++) {
      var type;
      var roll = rng.next();
      if (roll < 0.42) type = 'monster';
      else if (roll < 0.55) type = 'horde';
      else if (roll < 0.70) type = 'treasure';
      else if (roll < 0.80) type = 'trap';
      else if (roll < 0.88) type = 'shrine';
      else type = 'empty';
      nodes.push({ index: i, type: type, done: false });
    }
    if (data.miniBoss) {
      nodes[Math.max(0, count - 2)] = { index: count - 2, type: 'elite', done: false };
    }
    nodes.push({ index: nodes.length, type: isLast ? 'boss' : 'stairs', done: false });

    return {
      number: floorNum,
      data: data,
      nodes: nodes,
      position: -1,
      rng: rng
    };
  }

  function spawnMonsters(world, dungeon, floor, kind, rng) {
    var data = floor.data;
    var fams = data.families.map(function (f) { return MD.FAMILY_BY_ID[f]; }).filter(Boolean);
    if (!fams.length) fams = [MD.FAMILY_BY_ID.wolf];
    var out = [];

    if (kind === 'elite' && data.miniBoss) {
      out.push(data.miniBoss);
      var escort = rng.int(0, 2);
      for (var e = 0; e < escort; e++) {
        out.push(MG.makeMonster(rng, world.skills, {
          family: rng.pick(fams), tier: data.monsterTier, level: data.level - 1
        }));
      }
      return out;
    }
    if (kind === 'boss') {
      out.push(dungeon.boss);
      var guards = U.clamp(Math.round(dungeon.tier / 3), 0, 3);
      for (var g = 0; g < guards; g++) {
        out.push(MG.makeMonster(rng, world.skills, {
          family: rng.pick(fams), tier: Math.max(1, data.monsterTier),
          level: data.level
        }));
      }
      return out;
    }

    var fam = rng.pick(fams);
    var packRange = fam.pack || [1, 3];
    var n = kind === 'horde'
      ? rng.int(Math.max(2, packRange[0] + 1), packRange[1] + 2)
      : rng.int(packRange[0], Math.max(packRange[0], Math.min(packRange[1], 3)));
    // Deeper, more dangerous dungeons field bigger groups; shallow ones don't.
    n = U.clamp(n, 1, U.clamp(1 + Math.floor(dungeon.tier / 2), 2, 6));
    for (var i = 0; i < n; i++) {
      out.push(MG.makeMonster(rng, world.skills, {
        family: rng.chance(0.7) ? fam : rng.pick(fams),
        tier: data.monsterTier,
        level: data.level + rng.int(-1, 1)
      }));
    }
    return out;
  }

  DR.enter = function (world, player, dungeon) {
    dungeon.discovered = true;
    player.knownDungeons[dungeon.id] = true;
    var run = {
      dungeonId: dungeon.id,
      attempt: (dungeon.playerAttempts = (dungeon.playerAttempts || 0) + 1),
      floorNum: 1,
      floor: null,
      combat: null,
      log: [],
      loot: { gold: 0, items: [] },
      xp: 0,
      kills: 0,
      deepest: 0,
      over: false,
      outcome: null,
      startDay: world.day
    };
    run.floor = buildFloor(world, player, dungeon, 1, run);
    DR.log(run, 'You step into ' + dungeon.name + '. Floor 1 of ' + dungeon.floors + '.');
    return run;
  };

  DR.log = function (run, text, kind) {
    run.log.push({ text: text, kind: kind || 'info' });
    if (run.log.length > 300) run.log.splice(0, 100);
  };

  /* The next one to three nodes the player can move into. */
  DR.options = function (run, player, world) {
    var floor = run.floor;
    var next = floor.position + 1;
    if (next >= floor.nodes.length) return [];
    var opts = [];
    var span = Math.min(3, floor.nodes.length - next);
    // Sense-type utility skills reveal what is ahead.
    var canSense = player.skills.some(function (s) {
      var d = world.skills.byId[s.id];
      return d && d.utility === 'detect';
    });
    for (var i = 0; i < span; i++) {
      var node = floor.nodes[next + i];
      opts.push({
        index: next + i,
        type: node.type,
        revealed: canSense || node.type === 'stairs' || node.type === 'boss',
        label: (canSense || node.type === 'stairs' || node.type === 'boss')
          ? NODE_TYPES[node.type].name : 'Unknown passage',
        icon: (canSense || node.type === 'stairs' || node.type === 'boss')
          ? NODE_TYPES[node.type].icon : '?',
        distance: i
      });
    }
    return opts;
  };

  /* Move to a node and resolve whatever is there. May open a combat. */
  DR.choose = function (world, player, run, nodeIndex) {
    var dungeon = world.dungeonById[run.dungeonId];
    var floor = run.floor;
    if (run.over || run.combat) return run;
    if (nodeIndex <= floor.position || nodeIndex >= floor.nodes.length) return run;

    // Skipping nodes costs a little time and stamina.
    var skipped = nodeIndex - floor.position - 1;
    floor.position = nodeIndex;
    var node = floor.nodes[nodeIndex];
    node.done = true;
    if (skipped > 0) {
      DR.log(run, 'You push past ' + skipped + ' ' + U.plural(skipped, 'chamber') + '.');
      player.mpCur = Math.max(0, player.mpCur - skipped * 2);
    }

    var rng = floor.rng;
    switch (node.type) {
      case 'monster':
      case 'horde':
      case 'elite':
      case 'boss': {
        var monsters = spawnMonsters(world, dungeon, floor, node.type, rng);
        run.pendingNode = node;
        DR.startCombat(world, player, run, monsters, node.type);
        break;
      }
      case 'treasure': {
        var loot = ISE.ItemGen.rollLoot(rng, world.skills, {
          tier: floor.data.lootTier,
          luck: ISE.Player.effectiveStats(player).lck,
          gold: 30 * floor.data.lootTier + floor.number * 6,
          count: 1 + rng.int(0, 1)
        });
        run.loot.gold += loot.gold;
        loot.items.forEach(function (it) { run.loot.items.push(it); player.inventory.push(it); });
        player.gold += loot.gold;
        DR.log(run, 'A cache: ' + loot.gold + ' coin' +
          (loot.items.length ? ' and ' + loot.items.map(function (i) { return i.name; }).join(', ') : '') +
          '.', 'loot');
        break;
      }
      case 'trap': {
        var stats = ISE.Player.effectiveStats(player);
        var dodge = U.clamp01(0.2 + stats.spd / (stats.spd + 220) + stats.lck / 800);
        if (rng.next() < dodge) {
          DR.log(run, 'You spot the trap in time.', 'good');
        } else {
          var dmg = Math.round(stats.hp * U.clamp(0.06 + floor.data.monsterTier * 0.025, 0.05, 0.28));
          player.hpCur = Math.max(0, player.hpCur - dmg);
          DR.log(run, 'A trap catches you for ' + dmg + ' damage.', 'bad');
          if (player.hpCur <= 0) DR.fail(world, player, run, 'trap');
        }
        break;
      }
      case 'shrine': {
        var kind = rng.weighted([['heal', 4], ['mana', 3], ['blessing', 2], ['catalyst', 1], ['curse', 1]]);
        var st = ISE.Player.effectiveStats(player);
        if (kind === 'heal') {
          player.hpCur = st.hp;
          DR.log(run, 'The shrine closes your wounds entirely.', 'good');
        } else if (kind === 'mana') {
          player.mpCur = st.mp;
          DR.log(run, 'Magicules flood back into you.', 'good');
        } else if (kind === 'blessing') {
          run.blessing = true;
          DR.log(run, 'A blessing settles on you. It will hold for the next fight.', 'good');
        } else if (kind === 'catalyst') {
          var cat = ISE.ItemGen.makeCatalyst(rng);
          player.inventory.push(cat);
          DR.log(run, 'Set into the altar: ' + cat.name + '.', 'loot');
        } else {
          var loss = Math.round(st.hp * 0.12);
          player.hpCur = Math.max(1, player.hpCur - loss);
          DR.log(run, 'The shrine was not a shrine. It takes ' + loss + ' from you.', 'bad');
        }
        break;
      }
      case 'stairs':
        DR.log(run, 'Stairs down.', 'good');
        break;
      case 'empty':
        DR.log(run, 'Empty stone and old air.');
        break;
    }
    return run;
  };

  DR.startCombat = function (world, player, run, monsters, nodeType) {
    var dungeon = world.dungeonById[run.dungeonId];
    var party = [ISE.Combat.actorFromPlayer(player)];
    player.companions.forEach(function (c) {
      if (!c.down) party.push(ISE.Combat.actorFromCompanion(c));
    });
    var enemies = monsters.map(function (m) { return ISE.Combat.actorFromMonster(m, 'enemy'); });

    run.combat = ISE.Combat.start(world, party, enemies, {
      seed: world.seed + '::' + run.dungeonId + '::' + run.floorNum + '::' + run.attempt +
        '::' + run.floor.position,
      tag: nodeType,
      canFlee: nodeType !== 'boss',
      context: { noFlee: nodeType === 'boss' },
      introText: nodeType === 'boss'
        ? dungeon.boss.name + ' has been waiting. ' +
          (dungeon.boss.traits || []).map(function (t) { return t.name; }).join(', ') + '.'
        : nodeType === 'elite'
          ? monsters[0].name + ' bars the way.'
          : monsters.length + ' ' + U.plural(monsters.length, 'hostile') + ' close in.'
    });
    run.combatMonsters = monsters;
    run.combatNodeType = nodeType;

    if (run.blessing) {
      ISE.Combat.applyStatus(run.combat, run.combat.party[0], 'blessed', 4, null);
      ISE.Combat.applyStatus(run.combat, run.combat.party[0], 'empower', 4, null);
      run.blessing = false;
      DR.log(run, 'The blessing takes hold.', 'good');
    }
    return run.combat;
  };

  /* Called once a combat state reports itself over. */
  DR.resolveCombat = function (world, player, run) {
    var combat = run.combat;
    if (!combat || !combat.over) return run;
    ISE.Combat.commit(combat);
    var dungeon = world.dungeonById[run.dungeonId];
    var rng = run.floor.rng;

    if (combat.result === 'victory') {
      var xpTotal = 0, goldTotal = 0;
      var events = [];
      run.combatMonsters.forEach(function (m) {
        xpTotal += m.xp;
        goldTotal += m.gold;
        run.kills += 1;
        ISE.Player.recordKill(player, m);
        events.push({ type: 'kill', monster: m, factionId: dungeon.ownerType === 'monster' ? dungeon.ownerId : null });
        if (m.named || m.boss) {
          events.push({ type: 'named_killed', monsterId: m.id });
          m.alive = false;
        }
      });

      // Predation: consume the fallen and take a skill.
      var bundle = ISE.Player.passiveBundle(player);
      if (bundle.devour) {
        run.combatMonsters.forEach(function (m) {
          if (!rng.chance(0.22)) return;
          var pool = m.skills.filter(function (sid) {
            var d = world.skills.byId[sid];
            return d && !player.skillById[sid] && d.rarityTier <= 4;
          });
          if (!pool.length) return;
          var sk = world.skills.byId[rng.pick(pool)];
          if (sk && ISE.Player.learnSkill(player, sk, world, 'predation')) {
            DR.log(run, 'You consume ' + m.name + ' and acquire ' + sk.name + '.', 'skill');
          }
        });
      }

      var res = ISE.Player.gainXp(player, xpTotal, world);
      player.gold += goldTotal;
      run.xp += res.gained;
      run.loot.gold += goldTotal;
      DR.log(run, 'Cleared. ' + res.gained + ' experience, ' + goldTotal + ' coin.' +
        (res.levels ? ' Level ' + player.level + '!' : ''), 'good');

      var lootTier = run.combatNodeType === 'boss' ? Math.min(6, dungeon.tier)
        : run.combatNodeType === 'elite' ? run.floor.data.lootTier + 1 : run.floor.data.lootTier;
      if (run.combatNodeType === 'elite' || run.combatNodeType === 'boss' || rng.chance(0.45)) {
        var loot = ISE.ItemGen.rollLoot(rng, world.skills, {
          tier: U.clamp(lootTier, 1, 6),
          luck: ISE.Player.effectiveStats(player).lck,
          gold: 0,
          count: run.combatNodeType === 'boss' ? 3 + rng.int(0, 2) : 1 + rng.int(0, 1)
        });
        loot.items.forEach(function (it) {
          player.inventory.push(it);
          run.loot.items.push(it);
          DR.log(run, 'Recovered: ' + it.name, 'loot');
        });
      }

      if (run.combatNodeType === 'boss') {
        DR.clearDungeon(world, player, run, events);
      }

      events.forEach(function (ev) {
        var done = ISE.Quests.notify(world, player, ev);
        done.forEach(function (q) { DR.log(run, 'Contract complete: ' + q.title, 'quest'); });
      });

      run.combat = null;
      run.combatMonsters = null;
    } else if (combat.result === 'fled') {
      DR.log(run, 'You disengage and fall back up the passage.', 'bad');
      run.combat = null;
      run.floor.position = Math.max(-1, run.floor.position - 1);
    } else {
      DR.fail(world, player, run, 'combat');
      run.combat = null;
    }
    return run;
  };

  DR.clearDungeon = function (world, player, run, events) {
    var dungeon = world.dungeonById[run.dungeonId];
    dungeon.cleared = true;
    dungeon.clearedBy = 'player';
    dungeon.deepestClear = dungeon.floors;
    dungeon.boss.alive = false;
    dungeon.boss.killedYear = world.year;
    player.deeds.dungeons += 1;
    player.fame += 20 + dungeon.tier * 6;

    events.push({ type: 'boss_killed', dungeonId: dungeon.id });

    // Relics held by the boss come out with the player.
    dungeon.relics.slice().forEach(function (rid) {
      var relic = world.relicById[rid];
      if (!relic) return;
      ISE.Procs.H.giveRelicTo(world, relic, 'player', 'player', 'taken from ' + dungeon.name);
      var copy = U.assign({}, relic);
      player.inventory.push(copy);
      player.relicIds.push(relic.id);
      player.relicsOwned = ISE.Player.countRelics(player);
      player.deeds.relicsFound += 1;
      events.push({ type: 'relic_taken', relicId: relic.id });
      DR.log(run, 'You take ' + relic.name + '. ' + relic.effectText, 'relic');
      if (relic.grantsSkillId) {
        var sk = world.skills.byId[relic.grantsSkillId];
        if (sk && ISE.Player.learnSkill(player, sk, world, 'relic')) {
          DR.log(run, relic.name + ' teaches you ' + sk.name + '.', 'skill');
        }
      }
    });
    dungeon.relics = [];

    // Ownership changes hands — the world notices.
    var prevType = dungeon.ownerType, prevId = dungeon.ownerId;
    if (prevType === 'monster') {
      var fac = world.factionById[prevId];
      if (fac) {
        U.remove(fac.dungeons, dungeon.id);
        fac.strength = Math.round(fac.strength * 0.85);
      }
    } else if (prevType === 'nation') {
      var nat = world.nationById[prevId];
      if (nat) U.remove(nat.dungeons, dungeon.id);
    }
    dungeon.ownerHistory.push({ year: world.year, type: prevType, id: prevId });
    dungeon.ownerType = 'player';
    dungeon.ownerId = 'player';
    world.mapDirty = true;

    ISE.Procs.H.log(world, {
      year: world.year, ruleId: 'player_clear', name: 'Dungeon Conquered',
      tags: ['dungeon', 'player'],
      text: player.name + ' killed ' + dungeon.boss.name + ' and took ' + dungeon.name + '.',
      tokens: { dungeon: dungeon.name, player: player.name }
    });
    DR.log(run, dungeon.name + ' belongs to you now.', 'good');
  };

  DR.descend = function (world, player, run) {
    var dungeon = world.dungeonById[run.dungeonId];
    if (run.floorNum >= dungeon.floors) return run;
    dungeon.floorData[run.floorNum - 1].cleared = true;
    run.deepest = Math.max(run.deepest, run.floorNum);
    player.deeds.floors += 1;
    run.floorNum += 1;
    run.floor = buildFloor(world, player, dungeon, run.floorNum, run);
    dungeon.deepestClear = Math.max(dungeon.deepestClear, run.floorNum - 1);
    DR.log(run, 'You descend. Floor ' + run.floorNum + ' of ' + dungeon.floors + '.', 'good');
    var done = ISE.Quests.notify(world, player, {
      type: 'floor_reached', dungeonId: dungeon.id, floor: run.floorNum
    });
    done.forEach(function (q) { DR.log(run, 'Contract complete: ' + q.title, 'quest'); });
    return run;
  };

  DR.fail = function (world, player, run, cause) {
    run.over = true;
    run.outcome = 'defeat';
    run.cause = cause;
    // Falling in a dungeon costs coin and time, not the save file.
    var lost = Math.round(player.gold * 0.25);
    player.gold -= lost;
    player.hpCur = Math.max(1, Math.round(ISE.Player.effectiveStats(player).hp * 0.15));
    run.goldLost = lost;
    DR.log(run, 'You wake up outside, lighter by ' + lost + ' coin. Someone dragged you out.', 'bad');
    return run;
  };

  DR.leave = function (world, player, run) {
    run.over = true;
    if (!run.outcome) run.outcome = 'withdrew';
    var dungeon = world.dungeonById[run.dungeonId];
    dungeon.deepestClear = Math.max(dungeon.deepestClear, run.deepest);
    return run;
  };

  DR.atExit = function (run) {
    var f = run.floor;
    return f.position >= f.nodes.length - 1;
  };

  DR.currentNode = function (run) {
    var f = run.floor;
    return f.position >= 0 ? f.nodes[f.position] : null;
  };

  ISE.DungeonRun = DR;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
