/* player.js — the player character: creation (including isekai origins),
 * derived stats, skill learning and mastery, equipment, and the deed record
 * that evolution requirements read from. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var Player = {};

  /* How much of a race-form's raw stat multiplier actually applies. Level
   * growth, form and equipment all multiply, so the raw tree values would
   * make a late form dwarf everything the world can field. */
  Player.FORM_DAMPING = 0.45;

  /* Player characters carry more health than their raw race line implies.
   * They fight outnumbered constantly; without this, every group encounter
   * is decided by how many attacks land before the player acts twice. */
  Player.HP_SCALE = 1.6;

  /* ---------------------------------------------------- isekai origins */
  Player.ORIGINS = [
    {
      id: 'reincarnated', name: 'Reincarnated',
      desc: 'You died somewhere else and woke up here as something new, with ' +
        'your old memories intact and completely useless.',
      raceRoll: 'monster',
      perks: [
        { id: 'otherworlder', name: 'Otherworlder', text: 'Skill mastery accrues 45% faster.',
          mods: { masteryRate: 0.45 } },
        { id: 'past_life', name: 'Past-Life Knowledge', text: 'Start knowing one extra Uncommon skill.',
          grantSkillTier: 2 }
      ],
      quirks: [
        { id: 'no_status', name: 'Nobody', text: 'No nation trusts you at first. Reputation starts low.',
          mods: { startRep: -15 } }
      ]
    },
    {
      id: 'summoned', name: 'Summoned Hero',
      desc: 'A circle, a chant, and a room full of nobles who expected someone ' +
        'taller. You arrived with a contract you did not sign.',
      raceRoll: 'humanoid',
      perks: [
        { id: 'blessing', name: 'Summoning Blessing', text: 'All attributes +12%.',
          mods: { allStats: 0.12 } },
        { id: 'patron', name: 'Royal Patron', text: 'Start allied to a nation with standing and coin.',
          mods: { startRep: 40, startGold: 600 } }
      ],
      quirks: [
        { id: 'obligation', name: 'Obligation', text: 'Your patron expects results. Other nations are wary.',
          mods: { rivalRep: -20 } }
      ]
    },
    {
      id: 'transmigrated', name: 'Transmigrated',
      desc: 'You woke up in a body that was already here, already had a name, ' +
        'and had apparently already made enemies.',
      raceRoll: 'civilised',
      perks: [
        { id: 'local', name: 'Borrowed Life', text: 'You start with local knowledge: all settlements ' +
            'within range are already known, and gear from the previous occupant.',
          mods: { startGear: 2, revealNearby: true } },
        { id: 'adaptable', name: 'Two Sets of Instincts', text: 'Experience gain +15%.',
          mods: { xpRate: 0.15 } }
      ],
      quirks: [
        { id: 'debts', name: 'Inherited Debts', text: 'Someone is looking for this body. Start with less coin.',
          mods: { startGold: -150 } }
      ]
    },
    {
      id: 'fell_through', name: 'Fell Through',
      desc: 'No ritual, no god, no explanation. A gap opened where a floor ' +
        'should have been and here you are.',
      raceRoll: 'any',
      perks: [
        { id: 'unwritten', name: 'Unwritten', text: 'You are not in anyone\'s prophecy. ' +
            'Evolution requirements that demand fame are reduced by a third.',
          mods: { fameReq: -0.33 } },
        { id: 'lucky', name: 'Statistically Impossible', text: 'Fortune +30%.',
          mods: { lck: 0.3 } }
      ],
      quirks: [
        { id: 'no_gear', name: 'Came As You Were', text: 'You start with nothing but what you had on you.',
          mods: { startGold: -100 } }
      ]
    },
    {
      id: 'devoured', name: 'Reborn From The Kill',
      desc: 'Something ate you on the way in. What stood up afterwards was ' +
        'neither of you, exactly.',
      raceRoll: 'monster',
      perks: [
        { id: 'predator', name: 'Predator\'s Start', text: 'Begin with a Predation passive and ' +
            'gain 25% more experience from kills.',
          mods: { xpRate: 0.25 }, grantArch: 'predation' },
        { id: 'tough', name: 'Something Else\'s Body', text: 'Vitality +20%.',
          mods: { hp: 0.2 } }
      ],
      quirks: [
        { id: 'monstrous', name: 'Visibly Wrong', text: 'Settlements are hostile until you prove otherwise.',
          mods: { startRep: -35 } }
      ]
    },
    {
      id: 'native', name: 'Native-Born',
      desc: 'No other world. You were born here, and you are going to have ' +
        'to earn everything the ordinary way.',
      raceRoll: 'choose',
      perks: [
        { id: 'roots', name: 'Roots', text: 'Start with standing in your home nation and knowledge ' +
            'of its territory.',
          mods: { startRep: 25, revealNearby: true } },
        { id: 'trained', name: 'Trained', text: 'Start with two extra Common skills of your choosing ' +
            'from your race\'s affinities.', grantSkillTier: 1, grantCount: 2 }
      ],
      quirks: [
        { id: 'mortal', name: 'No Cheat', text: 'No otherworldly bonus to mastery.', mods: {} }
      ]
    }
  ];

  /* Which races an origin's roll table can produce. */
  Player.originRaceTable = function (origin, world) {
    var races = world.races.list.filter(function (r) { return r.playable; });
    switch (origin.raceRoll) {
      case 'monster':
        return races.filter(function (r) {
          return ['slime', 'goblin', 'undead', 'dragonkin', 'plantkin', 'spirit'].indexOf(r.id) >= 0 ||
            r.unique;
        });
      case 'humanoid':
        return races.filter(function (r) { return ['human', 'elf', 'beastkin'].indexOf(r.id) >= 0; });
      case 'civilised':
        return races.filter(function (r) {
          return ['human', 'elf', 'beastkin', 'construct', 'dragonkin'].indexOf(r.id) >= 0 || r.unique;
        });
      default:
        return races;
    }
  };

  Player.rollOriginRace = function (rng, origin, world) {
    var pool = Player.originRaceTable(origin, world);
    if (!pool.length) pool = world.races.list.filter(function (r) { return r.playable; });
    // Weight toward the strange for reincarnation-style origins.
    return rng.weighted(pool.map(function (r) {
      var w = 10;
      if (origin.raceRoll === 'monster' && (r.id === 'slime' || r.id === 'goblin')) w = 22;
      if (r.unique) w = 6;
      return [r, w];
    }));
  };

  /* -------------------------------------------------------------- create */
  Player.create = function (world, opts) {
    var rng = new ISE.RNG(world.seed + '::player::' + (opts.name || 'anon'));
    var race = world.races.byId[opts.raceId] || world.races.list[0];
    var origin = null;
    for (var i = 0; i < Player.ORIGINS.length; i++) {
      if (Player.ORIGINS[i].id === opts.originId) origin = Player.ORIGINS[i];
    }
    if (!origin) origin = Player.ORIGINS[Player.ORIGINS.length - 1];

    var rootNode = race.tree;
    var player = {
      name: opts.name || 'Wanderer',
      raceId: race.id,
      raceName: race.name,
      nodeId: rootNode.id,
      formName: rootNode.name,
      tier: rootNode.tier,
      originId: origin.id,
      originName: origin.name,
      classId: opts.classId || null,
      className: opts.className || null,

      level: 1,
      xp: 0,
      evolutionCount: 0,

      skills: [],
      skillById: {},
      equipment: { weapon: null, offhand: null, head: null, body: null, accessory: [null, null] },
      inventory: [],
      gold: 250,

      affinity: race.affinity.slice(),
      resist: U.clone(race.resist || {}),
      weak: U.clone(race.weak || {}),
      learnRate: race.learnRate || 1,

      deeds: { kills: 0, killsByElement: {}, bosses: 0, dungeons: 0, floors: 0,
        raidsDefended: 0, noblesKilled: 0, warsJoined: 0, relicsFound: 0 },
      biomesVisited: {},
      catalysts: {},
      named: false,
      namedBy: null,
      relicsOwned: 0,
      fame: 0,
      infamy: 0,
      reputation: {},
      guildRank: 0,
      companions: [],

      x: 0, y: 0,
      hpCur: 0, mpCur: 0,
      mods: {},
      perks: [],
      quirks: [],
      log: [],
      questsActive: [],
      questsDone: [],
      relicIds: [],
      knownDungeons: {},
      knownSettlements: {},
      created: true
    };

    // Fold origin perks/quirks into a single modifier bag.
    origin.perks.concat(origin.quirks).forEach(function (p) {
      (p.mods ? Object.keys(p.mods) : []).forEach(function (k) {
        player.mods[k] = (player.mods[k] || 0) + p.mods[k];
      });
      if (p.id) (origin.perks.indexOf(p) >= 0 ? player.perks : player.quirks).push({
        id: p.id, name: p.name, text: p.text
      });
    });

    player.gold = Math.max(0, 250 + (player.mods.startGold || 0));

    // Innate race skills.
    (race.innate || []).forEach(function (inn) {
      var s = world.skills.find(inn.arch, inn.elem);
      if (s) Player.learnSkill(player, s, world, 'innate');
    });
    // Root-form innates too, if the tree defines any.
    (rootNode.innate || []).forEach(function (inn) {
      var s = world.skills.find(inn.arch, inn.elem);
      if (s) Player.learnSkill(player, s, world, 'innate');
    });

    // Origin skill grants.
    origin.perks.forEach(function (p) {
      if (p.grantArch) {
        var s = world.skills.find(p.grantArch, race.affinity[0] || 'chaos');
        if (s) Player.learnSkill(player, s, world, 'innate');
      }
      if (p.grantSkillTier) {
        var count = p.grantCount || 1;
        var pool = world.skills.list.filter(function (sk) {
          return sk.rarityTier === p.grantSkillTier && sk.category !== 'utility' &&
            (race.affinity.indexOf(sk.element) >= 0 || sk.element === 'physical');
        });
        if (!pool.length) {
          pool = world.skills.list.filter(function (sk) { return sk.rarityTier === p.grantSkillTier; });
        }
        for (var g = 0; g < count && pool.length; g++) {
          Player.learnSkill(player, rng.pick(pool), world, 'innate');
        }
      }
    });

    // Starting gear.
    var gearCount = 1 + (player.mods.startGear || 0);
    for (var gi = 0; gi < gearCount; gi++) {
      var item = ISE.ItemGen.rollItem(rng, { tier: 1, rarityTier: gi === 0 ? 1 : 2 });
      player.inventory.push(item);
      Player.equip(player, item);
    }
    player.inventory.push(ISE.ItemGen.makeConsumable(rng, 1));
    player.inventory.push(ISE.ItemGen.makeConsumable(rng, 1));

    // Reputation baseline with every living nation.
    world.livingNations().forEach(function (n) {
      player.reputation[n.id] = Math.round(player.mods.startRep || 0);
    });

    var stats = Player.effectiveStats(player);
    player.hpCur = stats.hp;
    player.mpCur = stats.mp;
    return player;
  };

  /* Place the character somewhere sensible and mark what they know. */
  Player.place = function (player, world, settlement) {
    player.x = settlement.x;
    player.y = settlement.y;
    player.locationId = settlement.id;
    player.homeSettlementId = settlement.id;
    player.knownSettlements[settlement.id] = true;
    var biome = world.geo.biome[world.geo.idx(player.x, player.y)];
    player.biomesVisited[biome] = (player.biomesVisited[biome] || 0) + 1;

    if (player.mods.revealNearby) {
      world.settlements.forEach(function (s) {
        if (U.dist(s.x, s.y, settlement.x, settlement.y) < 18) player.knownSettlements[s.id] = true;
      });
      world.dungeons.forEach(function (d) {
        if (d.discovered && U.dist(d.x, d.y, settlement.x, settlement.y) < 14) {
          player.knownDungeons[d.id] = true;
        }
      });
    } else {
      world.settlements.forEach(function (s) {
        if (U.dist(s.x, s.y, settlement.x, settlement.y) < 8) player.knownSettlements[s.id] = true;
      });
    }
    var nat = world.nationById[settlement.nationId];
    if (nat && player.mods.startRep) {
      player.reputation[nat.id] = Math.round((player.reputation[nat.id] || 0) +
        Math.abs(player.mods.startRep) * (player.mods.startRep > 0 ? 1 : 0));
    }
    return player;
  };

  /* --------------------------------------------------------------- stats */
  Player.raceNode = function (player, world) {
    var race = world.races.byId[player.raceId];
    return race ? race.nodes.byId[player.nodeId] : null;
  };

  Player.baseStats = function (player, world) {
    var race = (world || Player._world) ? (world || Player._world).races.byId[player.raceId] : null;
    if (!race) return { hp: 50, mp: 30, atk: 10, def: 10, mag: 10, res: 10, spd: 10, lck: 10 };
    var node = race.nodes.byId[player.nodeId] || race.tree;
    /* Form multipliers are dampened: level growth, form, and equipment all
     * multiply, so applying the raw tree value makes late forms absurd. */
    var mult = 1 + ((node.mult || 1) - 1) * Player.FORM_DAMPING;
    var out = {};
    T.STAT_IDS.forEach(function (k) {
      out[k] = (race.stats[k] + race.growth[k] * (player.level - 1)) * mult;
    });
    return out;
  };

  /* Base + form + gear + passive skills + origin mods. This is the number
   * combat actually uses. */
  Player.effectiveStats = function (player) {
    var world = Player._world;
    var base = Player.baseStats(player, world);
    var out = {};
    T.STAT_IDS.forEach(function (k) { out[k] = base[k]; });

    // Equipment flat bonuses.
    Player.equippedItems(player).forEach(function (item) {
      for (var k in item.stats) {
        if (out[k] !== undefined) out[k] += item.stats[k];
      }
      if (item.relic && item.effect) {
        if (item.effect.stats) {
          for (var k2 in item.effect.stats) {
            if (out[k2] !== undefined) out[k2] *= (1 + item.effect.stats[k2]);
          }
        }
        if (item.effect.allStats) {
          T.STAT_IDS.forEach(function (k3) { out[k3] *= (1 + item.effect.allStats); });
        }
      }
    });

    // Passive skills.
    var bundle = Player.passiveBundle(player);
    if (bundle.stats) {
      for (var pk in bundle.stats) {
        if (out[pk] !== undefined) out[pk] *= (1 + bundle.stats[pk]);
      }
    }

    // Origin modifiers.
    if (player.mods.allStats) {
      T.STAT_IDS.forEach(function (k4) { out[k4] *= (1 + player.mods.allStats); });
    }
    T.STAT_IDS.forEach(function (k5) {
      if (player.mods[k5]) out[k5] *= (1 + player.mods[k5]);
    });

    out.hp *= Player.HP_SCALE;

    T.STAT_IDS.forEach(function (k6) { out[k6] = Math.max(1, Math.round(out[k6])); });
    return out;
  };

  Player.equippedItems = function (player) {
    var out = [];
    var e = player.equipment;
    ['weapon', 'offhand', 'head', 'body'].forEach(function (slot) {
      if (e[slot]) out.push(e[slot]);
    });
    (e.accessory || []).forEach(function (a) { if (a) out.push(a); });
    return out;
  };

  /* Non-stat effects from gear and relics, read by combat. */
  Player.gearExtras = function (player) {
    var extras = { elemPower: {} };
    Player.equippedItems(player).forEach(function (item) {
      var ex = item.extras || {};
      ['crit', 'lifesteal', 'thorns', 'pierce', 'costCut', 'critDamage'].forEach(function (k) {
        if (ex[k]) extras[k] = (extras[k] || 0) + ex[k];
      });
      if (ex.elemPower) {
        for (var el in ex.elemPower) {
          extras.elemPower[el] = (extras.elemPower[el] || 0) + ex.elemPower[el];
        }
      }
      if (item.relic && item.effect) {
        var ef = item.effect;
        if (ef.lifesteal) extras.lifesteal = (extras.lifesteal || 0) + ef.lifesteal;
        if (ef.crit) extras.crit = (extras.crit || 0) + ef.crit;
        if (ef.critDamage) extras.critDamage = (extras.critDamage || 0) + ef.critDamage;
        if (ef.costCut) extras.costCut = (extras.costCut || 0) + ef.costCut;
        if (ef.damageTaken) extras.damageTaken = (extras.damageTaken || 0) + ef.damageTaken;
        if (ef.reviveOnce) extras.reviveOnce = Math.max(extras.reviveOnce || 0, ef.reviveOnce);
        if (ef.elemPower && ef.element) {
          extras.elemPower[ef.element] = (extras.elemPower[ef.element] || 0) + ef.elemPower;
        }
      }
    });
    return extras;
  };

  /* Aggregate every passive skill the character knows. */
  Player.passiveBundle = function (player) {
    var world = Player._world;
    var bundle = { stats: {}, elemPowerByElement: {}, resistByElement: {},
      regen: 0, evade: 0, costCut: 0, devour: false, reviveOnce: false };
    if (!world) return bundle;
    player.skills.forEach(function (entry) {
      var def = world.skills.byId[entry.id];
      if (!def || !def.passive) return;
      var p = def.passive;
      var scale = 1 + (entry.mastery / 100) * 0.5;
      if (p.stats) {
        for (var k in p.stats) {
          bundle.stats[k] = (bundle.stats[k] || 0) + p.stats[k] * scale;
        }
      }
      if (p.resist) {
        bundle.resistByElement[def.element] =
          (bundle.resistByElement[def.element] || 0) + p.resist * scale;
      }
      if (p.elemPower) {
        bundle.elemPowerByElement[def.element] =
          (bundle.elemPowerByElement[def.element] || 0) + p.elemPower * scale;
      }
      if (p.regen) bundle.regen += p.regen * scale;
      if (p.evade) bundle.evade += p.evade * scale;
      if (p.costCut) bundle.costCut += p.costCut * scale;
      if (p.devour) bundle.devour = true;
      if (p.reviveOnce) bundle.reviveOnce = true;
      if (p.extraTurn) bundle.extraTurn = (bundle.extraTurn || 0) + p.extraTurn;
    });
    return bundle;
  };

  /* -------------------------------------------------------------- skills */
  Player.knowsSkill = function (player, skillId) { return !!player.skillById[skillId]; };

  Player.learnSkill = function (player, skill, world, how) {
    if (!skill) return false;
    if (player.skillById[skill.id]) return false;
    var entry = {
      id: skill.id,
      mastery: 0,
      uses: 0,
      learnedHow: how || 'trainer',
      learnedDay: world ? world.day : 0
    };
    player.skills.push(entry);
    player.skillById[skill.id] = entry;
    return true;
  };

  Player.forgetSkill = function (player, skillId) {
    var e = player.skillById[skillId];
    if (!e) return false;
    U.remove(player.skills, e);
    delete player.skillById[skillId];
    return true;
  };

  /* Mastery grows with use, tuned by the world's magic density (via the
   * skill's own masteryRate), the race's learn rate, and origin perks. */
  Player.gainMastery = function (player, skill, world, amount) {
    var entry = player.skillById[skill.id];
    if (!entry) return 0;
    if (entry.mastery >= 100) return 0;
    var rate = (amount !== undefined ? amount : 2.2) * skill.masteryRate *
      (player.learnRate || 1) * (1 + (player.mods.masteryRate || 0));
    Player.equippedItems(player).forEach(function (item) {
      if (item.relic && item.effect && item.effect.masteryRate) rate *= (1 + item.effect.masteryRate);
    });
    entry.uses += 1;
    var before = entry.mastery;
    entry.mastery = U.clamp(U.round(entry.mastery + rate, 2), 0, 100);
    return entry.mastery - before;
  };

  /* Can this known skill be upgraded to the next rung of its chain? */
  Player.skillEvolutions = function (player, world) {
    var out = [];
    player.skills.forEach(function (entry) {
      var def = world.skills.byId[entry.id];
      if (!def || !def.evolvesTo) return;
      var next = world.skills.byId[def.evolvesTo];
      if (!next || player.skillById[next.id]) return;
      var req = next.evolveReq || { mastery: 70, level: 10 };
      var reqs = [];
      var ok = true;
      reqs.push({ text: 'Mastery ' + req.mastery + '% (' + U.round(entry.mastery, 1) + '%)',
        met: entry.mastery >= req.mastery, progress: entry.mastery / req.mastery });
      if (entry.mastery < req.mastery) ok = false;
      if (req.level) {
        reqs.push({ text: 'Level ' + req.level + ' (' + player.level + ')',
          met: player.level >= req.level, progress: player.level / req.level });
        if (player.level < req.level) ok = false;
      }
      if (req.elementSkills) {
        var n = player.skills.filter(function (s) {
          var d = world.skills.byId[s.id];
          return d && d.element === req.elementSkills.element && s.mastery >= req.elementSkills.min;
        }).length;
        reqs.push({
          text: n + '/' + req.elementSkills.n + ' ' + T.ELEMENT[req.elementSkills.element].name +
            ' skills at ' + req.elementSkills.min + '%',
          met: n >= req.elementSkills.n, progress: n / req.elementSkills.n
        });
        if (n < req.elementSkills.n) ok = false;
      }
      out.push({ from: def, to: next, ok: ok, reqs: reqs, mastery: entry.mastery });
    });
    return out;
  };

  Player.evolveSkill = function (player, fromId, world) {
    var options = Player.skillEvolutions(player, world);
    for (var i = 0; i < options.length; i++) {
      if (options[i].from.id !== fromId) continue;
      if (!options[i].ok) return { ok: false, reason: 'Requirements not met.' };
      // The old skill is consumed; the new one starts with carried-over feel.
      var carried = Math.min(30, (player.skillById[fromId].mastery - 60) * 0.5);
      Player.forgetSkill(player, fromId);
      Player.learnSkill(player, options[i].to, world, 'evolution');
      var entry = player.skillById[options[i].to.id];
      if (entry) entry.mastery = Math.max(0, U.round(carried, 1));
      return { ok: true, skill: options[i].to, from: options[i].from };
    }
    return { ok: false, reason: 'That skill cannot evolve.' };
  };

  /* ---------------------------------------------------------- progression */
  Player.xpToNext = function (level) { return Math.round(42 * Math.pow(level, 1.62)); };

  Player.gainXp = function (player, amount, world) {
    var gained = Math.round(amount * (1 + (player.mods.xpRate || 0)));
    player.xp += gained;
    var levels = 0;
    while (player.xp >= Player.xpToNext(player.level)) {
      player.xp -= Player.xpToNext(player.level);
      player.level += 1;
      levels += 1;
      if (player.level > 200) break;
    }
    if (levels) {
      var stats = Player.effectiveStats(player);
      player.hpCur = stats.hp;
      player.mpCur = stats.mp;
    }
    return { gained: gained, levels: levels };
  };

  Player.recordKill = function (player, monster) {
    player.deeds.kills += 1;
    var el = monster.element || 'physical';
    player.deeds.killsByElement[el] = (player.deeds.killsByElement[el] || 0) + 1;
    if (monster.boss) player.deeds.bosses += 1;
    player.fame += monster.boss ? 12 + monster.tier * 4 : 0.25;
  };

  /* ----------------------------------------------------------- equipment */
  Player.equip = function (player, item) {
    if (!item || item.kind !== 'equipment') return false;
    var e = player.equipment;
    if (item.slot === 'accessory') {
      var idx = e.accessory[0] ? (e.accessory[1] ? 0 : 1) : 0;
      var prev = e.accessory[idx];
      e.accessory[idx] = item;
      if (prev) player.inventory.push(prev);
    } else {
      var old = e[item.slot];
      e[item.slot] = item;
      if (old) player.inventory.push(old);
      // Two-handed weapons clear the off-hand.
      if (item.slot === 'weapon' && item.hands === 2 && e.offhand) {
        player.inventory.push(e.offhand);
        e.offhand = null;
      }
      if (item.slot === 'offhand' && e.weapon && e.weapon.hands === 2) {
        player.inventory.push(e.weapon);
        e.weapon = null;
      }
    }
    U.remove(player.inventory, item);
    if (item.relic) {
      player.relicsOwned = Player.countRelics(player);
      if (item.grantsSkillId && ISE.Player._world) {
        var granted = ISE.Player._world.skills.byId[item.grantsSkillId];
        if (granted) Player.learnSkill(player, granted, ISE.Player._world, 'relic');
      }
    }
    Player.clampVitals(player);
    return true;
  };

  Player.unequip = function (player, slot, index) {
    var e = player.equipment;
    var item;
    if (slot === 'accessory') {
      item = e.accessory[index || 0];
      e.accessory[index || 0] = null;
    } else {
      item = e[slot];
      e[slot] = null;
    }
    if (item) {
      player.inventory.push(item);
      if (item.relic) player.relicsOwned = Player.countRelics(player);
    }
    Player.clampVitals(player);
    return item;
  };

  Player.countRelics = function (player) {
    var n = 0;
    Player.equippedItems(player).forEach(function (i) { if (i.relic) n++; });
    player.inventory.forEach(function (i) { if (i.relic) n++; });
    return n;
  };

  Player.clampVitals = function (player) {
    var s = Player.effectiveStats(player);
    player.hpCur = U.clamp(player.hpCur, 0, s.hp);
    player.mpCur = U.clamp(player.mpCur, 0, s.mp);
    return player;
  };

  Player.rest = function (player, fraction) {
    var s = Player.effectiveStats(player);
    player.hpCur = U.clamp(player.hpCur + Math.round(s.hp * (fraction || 1)), 0, s.hp);
    player.mpCur = U.clamp(player.mpCur + Math.round(s.mp * (fraction || 1)), 0, s.mp);
    player.companions.forEach(function (c) {
      c.hpCur = U.clamp((c.hpCur || 0) + Math.round(c.stats.hp * (fraction || 1)), 0, c.stats.hp);
      c.mpCur = U.clamp((c.mpCur || 0) + Math.round(c.stats.mp * (fraction || 1)), 0, c.stats.mp);
      if (c.hpCur > 0) c.down = false;
    });
    return player;
  };

  /* ---------------------------------------------------------- companions */
  Player.addCompanion = function (player, comp) {
    if (player.companions.length >= 3) return false;
    player.companions.push(comp);
    return true;
  };

  /* Naming a companion is the Tensura move: it costs a large slice of the
   * namer's magicules and permanently strengthens the named. */
  Player.nameCompanion = function (player, comp, name, world) {
    var stats = Player.effectiveStats(player);
    var cost = Math.round(stats.mp * 0.6);
    if (player.mpCur < cost) return { ok: false, reason: 'Not enough magicules (' + cost + ' needed).' };
    if (comp.named) return { ok: false, reason: comp.name + ' already has a Name.' };
    player.mpCur -= cost;
    comp.named = true;
    comp.name = name;
    comp.level = Math.round(comp.level * 1.3 + 3);
    T.STAT_IDS.forEach(function (k) { comp.stats[k] = Math.round(comp.stats[k] * 1.45); });
    comp.hpCur = comp.stats.hp;
    comp.mpCur = comp.stats.mp;
    // A Named being can grant Names in turn.
    comp.canName = true;
    return { ok: true, cost: cost };
  };

  /* Being Named by a qualifying existence — the gate on tier-5+ evolutions. */
  Player.receiveName = function (player, namerName, newName) {
    if (player.named) return { ok: false, reason: 'You already carry a Name.' };
    player.named = true;
    player.namedBy = namerName;
    if (newName) player.name = newName;
    player.fame += 100;
    return { ok: true };
  };

  Player.reputationWith = function (player, nationId) {
    return player.reputation[nationId] || 0;
  };

  Player.shiftReputation = function (player, nationId, delta) {
    player.reputation[nationId] = U.clamp((player.reputation[nationId] || 0) + delta, -100, 100);
    return player.reputation[nationId];
  };

  Player.repLabel = function (v) {
    if (v <= -60) return 'Hunted';
    if (v <= -25) return 'Hostile';
    if (v < 10) return 'Unknown';
    if (v < 35) return 'Recognised';
    if (v < 65) return 'Trusted';
    if (v < 90) return 'Honoured';
    return 'Champion';
  };

  Player.GUILD_RANKS = ['Unregistered', 'Copper', 'Iron', 'Silver', 'Gold', 'Mythril', 'Adamant'];

  Player.guildRankName = function (player) {
    return Player.GUILD_RANKS[U.clamp(player.guildRank, 0, Player.GUILD_RANKS.length - 1)];
  };

  ISE.Player = Player;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
