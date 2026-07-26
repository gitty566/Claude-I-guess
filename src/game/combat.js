/* combat.js — deterministic turn-based combat.
 *
 * Nothing here is narrated by vibes: every number comes out of the stat
 * block, the skill row, the element matrix and a seeded RNG. Given the same
 * combat seed and the same inputs, the same fight plays out identically. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var Combat = {};

  /* Global damage/heal scaling. Tuned so an even fight runs five to eight
   * rounds at any level rather than twenty. */
  Combat.DAMAGE_DIVISOR = 45;
  Combat.HEAL_DIVISOR = 55;

  /* ------------------------------------------------------- actor building */
  function baseActor(o) {
    return U.assign({
      id: o.id,
      name: o.name,
      side: o.side,
      level: o.level || 1,
      stats: o.stats,
      hp: o.stats.hp, mp: o.stats.mp,
      statuses: [],
      cooldowns: {},
      skills: o.skills || [],
      passives: o.passives || {},
      resist: o.resist || {},
      weak: o.weak || {},
      elements: o.elements || [],
      extras: o.extras || {},
      mastery: o.mastery || {},
      alive: true,
      guarding: false,
      usedRevive: false,
      ref: o.ref || null,
      isPlayer: !!o.isPlayer,
      portrait: o.portrait || null
    }, o.extra || {});
  }

  Combat.actorFromMonster = function (monster, side) {
    var a = baseActor({
      id: monster.id, name: monster.name, side: side || 'enemy',
      level: monster.level, stats: U.clone(monster.stats),
      skills: monster.skills.slice(),
      passives: U.clone(monster.passives || {}),
      resist: U.clone(monster.resist || {}),
      weak: U.clone(monster.weak || {}),
      elements: (monster.elements || [monster.element]).slice(),
      ref: monster
    });
    a.species = monster.species || monster.name;
    a.boss = !!monster.boss;
    a.mini = !!monster.mini;
    a.traits = monster.traits || [];
    a.kind = monster.kind;
    return a;
  };

  Combat.actorFromPlayer = function (player) {
    var stats = ISE.Player.effectiveStats(player);
    var a = baseActor({
      id: 'player', name: player.name, side: 'party',
      level: player.level, stats: stats,
      skills: player.skills.map(function (s) { return s.id; }),
      passives: ISE.Player.passiveBundle(player),
      resist: U.clone(player.resist || {}),
      weak: U.clone(player.weak || {}),
      elements: (player.affinity || []).slice(),
      extras: ISE.Player.gearExtras(player),
      isPlayer: true,
      ref: player
    });
    a.hp = U.clamp(player.hpCur === undefined ? stats.hp : player.hpCur, 0, stats.hp);
    a.mp = U.clamp(player.mpCur === undefined ? stats.mp : player.mpCur, 0, stats.mp);
    player.skills.forEach(function (s) { a.mastery[s.id] = s.mastery; });
    return a;
  };

  Combat.actorFromCompanion = function (comp) {
    var a = baseActor({
      id: comp.id, name: comp.name, side: 'party',
      level: comp.level, stats: U.clone(comp.stats),
      skills: comp.skills.slice(),
      passives: U.clone(comp.passives || {}),
      resist: U.clone(comp.resist || {}),
      weak: U.clone(comp.weak || {}),
      elements: (comp.elements || []).slice(),
      ref: comp
    });
    a.hp = comp.hpCur === undefined ? a.stats.hp : U.clamp(comp.hpCur, 0, a.stats.hp);
    a.mp = comp.mpCur === undefined ? a.stats.mp : U.clamp(comp.mpCur, 0, a.stats.mp);
    a.companion = true;
    return a;
  };

  /* ------------------------------------------------------- stat modifiers */
  function statusMods(actor) {
    var mods = {};
    var takenMult = 1;
    var noMagic = false, skipTurn = false, fleeChance = 0;
    for (var i = 0; i < actor.statuses.length; i++) {
      var def = T.STATUSES[actor.statuses[i].id];
      if (!def) continue;
      if (def.mods) {
        for (var k in def.mods) mods[k] = (mods[k] || 0) + def.mods[k];
      }
      if (def.takenMult) takenMult *= def.takenMult;
      if (def.noMagic) noMagic = true;
      if (def.skipTurn) skipTurn = true;
      if (def.fleeChance) fleeChance = Math.max(fleeChance, def.fleeChance);
    }
    return { mods: mods, takenMult: takenMult, noMagic: noMagic,
      skipTurn: skipTurn, fleeChance: fleeChance };
  }

  function stat(actor, key) {
    var base = actor.stats[key] || 0;
    var sm = statusMods(actor);
    var mult = 1 + (sm.mods[key] || 0);
    if (actor.passives && actor.passives.stats && actor.passives.stats[key]) {
      mult += actor.passives.stats[key];
    }
    if (actor.guarding && (key === 'def' || key === 'res')) mult += 0.6;
    return Math.max(1, base * mult);
  }
  Combat.stat = stat;

  function elementMultiplier(element, defender) {
    var mult = 1;
    var row = T.ELEMENT_MATRIX[element] || {};
    for (var i = 0; i < defender.elements.length; i++) {
      var m = row[defender.elements[i]];
      if (m !== undefined) mult *= m;
    }
    if (defender.resist && defender.resist[element]) mult *= (1 - defender.resist[element]);
    if (defender.weak && defender.weak[element]) mult *= (1 + defender.weak[element]);
    if (defender.passives && defender.passives.resistByElement &&
      defender.passives.resistByElement[element]) {
      mult *= (1 - U.clamp(defender.passives.resistByElement[element], 0, 0.9));
    }
    return Math.max(0.05, mult);
  }
  Combat.elementMultiplier = elementMultiplier;

  function masteryMult(actor, skill) {
    var m = actor.mastery ? (actor.mastery[skill.id] || 0) : 0;
    return 1 + (m / 100) * 0.5;
  }

  function elemPowerBonus(actor, element) {
    var bonus = 0;
    if (actor.passives && actor.passives.elemPowerByElement &&
      actor.passives.elemPowerByElement[element]) {
      bonus += actor.passives.elemPowerByElement[element];
    }
    if (actor.extras && actor.extras.elemPower && actor.extras.elemPower[element]) {
      bonus += actor.extras.elemPower[element];
    }
    if (actor.extras && actor.extras.allElemPower) bonus += actor.extras.allElemPower;
    return bonus;
  }

  /* -------------------------------------------------------------- damage */
  function computeDamage(state, attacker, defender, skill) {
    var school = skill.school === 'physical' ? 'physical' : 'magic';
    var A = stat(attacker, school === 'physical' ? 'atk' : 'mag');
    var D = stat(defender, school === 'physical' ? 'def' : 'res');

    var pierce = (skill.pierce || 0) + (attacker.extras.pierce || 0);
    var effD = D * (1 - U.clamp01(pierce));

    var raw = (skill.power / Combat.DAMAGE_DIVISOR) * A * masteryMult(attacker, skill) *
      (1 + elemPowerBonus(attacker, skill.element));

    // Mitigation curve: defence matters, but never to the point of immunity.
    var mitigation = effD / (effD + 35 + attacker.level * 3.5);
    var dmg = raw * (1 - mitigation);

    dmg *= elementMultiplier(skill.element, defender);

    var dsm = statusMods(defender);
    dmg *= dsm.takenMult;
    if (defender.extras.damageTaken) dmg *= (1 + defender.extras.damageTaken);

    // Execute bonus scales as the target's health drops.
    if (skill.executeBonus) {
      var missing = 1 - defender.hp / defender.stats.hp;
      dmg *= 1 + skill.executeBonus * missing * missing;
    }

    var critChance = U.clamp01(0.04 + stat(attacker, 'lck') / (stat(attacker, 'lck') + 260) +
      (skill.critBonus || 0) + (attacker.extras.crit || 0));
    var crit = state.rng.next() < critChance;
    if (crit) dmg *= 1.65 + (attacker.extras.critDamage || 0);

    dmg *= state.rng.range(0.93, 1.07);

    var evadeChance = U.clamp((defender.passives.evade || 0) +
      (stat(defender, 'spd') - stat(attacker, 'spd')) / 900, 0, 0.35);
    var evaded = state.rng.next() < evadeChance;

    return {
      amount: Math.max(1, Math.round(dmg)),
      crit: crit,
      evaded: evaded,
      effectiveness: elementMultiplier(skill.element, defender)
    };
  }
  Combat.computeDamage = computeDamage;

  /* ------------------------------------------------------------ statuses */
  function applyStatus(state, target, statusId, turns, source) {
    var def = T.STATUSES[statusId];
    if (!def) return false;
    // Elemental immunity: nothing made of fire catches fire.
    if (def.element && target.resist && target.resist[def.element] >= 0.9) return false;
    var existing = null;
    for (var i = 0; i < target.statuses.length; i++) {
      if (target.statuses[i].id === statusId) { existing = target.statuses[i]; break; }
    }
    var t = turns || def.baseTurns || 2;
    if (existing) {
      existing.turns = Math.max(existing.turns, t);
    } else {
      target.statuses.push({ id: statusId, turns: t, source: source ? source.id : null });
    }
    return true;
  }
  Combat.applyStatus = applyStatus;

  function tickStatuses(state, actor) {
    var out = [];
    for (var i = actor.statuses.length - 1; i >= 0; i--) {
      var st = actor.statuses[i];
      var def = T.STATUSES[st.id];
      if (!def) { actor.statuses.splice(i, 1); continue; }
      if (def.kind === 'dot' && def.tickPct) {
        var dmg = Math.max(1, Math.round(actor.stats.hp * def.tickPct));
        actor.hp = Math.max(0, actor.hp - dmg);
        out.push({ type: 'dot', actor: actor.name, status: def.name, amount: dmg });
      } else if (def.kind === 'hot' && def.tickPct) {
        var heal = Math.max(1, Math.round(actor.stats.hp * def.tickPct));
        actor.hp = Math.min(actor.stats.hp, actor.hp + heal);
        out.push({ type: 'hot', actor: actor.name, status: def.name, amount: heal });
      }
      st.turns -= 1;
      if (st.turns <= 0) {
        actor.statuses.splice(i, 1);
        out.push({ type: 'status_end', actor: actor.name, status: def.name });
      }
    }
    // Passive regeneration from skills, gear and traits.
    var regen = (actor.passives.regen || 0) + (actor.extras.regen || 0);
    if (regen > 0 && actor.hp > 0) {
      var r = Math.max(1, Math.round(actor.stats.hp * regen));
      actor.hp = Math.min(actor.stats.hp, actor.hp + r);
      out.push({ type: 'regen', actor: actor.name, amount: r });
    }
    if (actor.hp <= 0) actor.alive = false;
    return out;
  }

  /* ---------------------------------------------------------- combat flow */
  Combat.start = function (world, partyActors, enemyActors, opts) {
    opts = opts || {};
    var state = {
      world: world,
      rng: new ISE.RNG((opts.seed || world.seed) + '::combat::' + (opts.tag || '') +
        '::' + (world.day || 0)),
      party: partyActors,
      enemies: enemyActors,
      actors: partyActors.concat(enemyActors),
      round: 0,
      log: [],
      over: false,
      result: null,
      turnIndex: 0,
      order: [],
      awaitingInput: false,
      current: null,
      canFlee: opts.canFlee !== false,
      context: opts.context || {},
      fled: false
    };
    state.actors.forEach(function (a) {
      a.hp = U.clamp(a.hp, 0, a.stats.hp);
      a.alive = a.hp > 0;
      // Traits that apply a status on every hit.
      if (a.passives && a.passives.onHitStatus) a.onHitStatus = a.passives.onHitStatus;
    });
    Combat.pushLog(state, 'header', opts.introText ||
      (enemyActors.length === 1 ? enemyActors[0].name + ' blocks the way.'
        : enemyActors.length + ' hostiles close in.'));
    nextRound(state);
    noteFirstStrike(state);
    advance(state);
    return state;
  };

  /* Anything faster than the whole party acts before the player's first
   * input. Say so up front — otherwise the combat screen simply opens with
   * health already missing and reads as a bug. */
  function noteFirstStrike(state) {
    var ahead = [];
    for (var i = 0; i < state.order.length; i++) {
      var a = actorById(state, state.order[i]);
      if (!a) continue;
      if (a.side === 'party') break;
      ahead.push(a.name);
    }
    if (!ahead.length) return;
    state.preempted = true;
    Combat.pushLog(state, 'preempt', (ahead.length === 1
      ? ahead[0] + ' is faster than you and moves first.'
      : ahead.join(' and ') + ' are faster than you and move first.'));
  }

  /* The round's turn order, for display. */
  Combat.turnOrder = function (state) {
    var out = [];
    for (var i = 0; i < state.order.length; i++) {
      var a = actorById(state, state.order[i]);
      if (!a) continue;
      out.push({
        id: a.id, name: a.name, side: a.side, alive: a.alive,
        spd: Math.round(stat(a, 'spd')),
        done: i < state.turnIndex,
        current: i === state.turnIndex
      });
    }
    return out;
  };

  Combat.pushLog = function (state, type, text, data) {
    state.log.push(U.assign({ type: type, text: text, round: state.round }, data || {}));
    if (state.log.length > 400) state.log.splice(0, 120);
  };

  function livingOf(state, side) {
    return state.actors.filter(function (a) { return a.side === side && a.alive; });
  }
  Combat.livingOf = livingOf;

  function nextRound(state) {
    state.round += 1;
    var living = state.actors.filter(function (a) { return a.alive; });
    /* Turn order by agility. On an exact tie the party moves first: the
     * fallback used to be an id comparison, and every monster id ('mon_…',
     * 'named_…') sorts ahead of 'player', so the player silently lost every
     * tied initiative in the game. Same-side ties still break by id so the
     * order stays deterministic. */
    living.sort(function (a, b) {
      var d = stat(b, 'spd') - stat(a, 'spd');
      if (Math.abs(d) > 0.001) return d;
      var pa = a.side === 'party' ? 0 : 1;
      var pb = b.side === 'party' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? -1 : 1;
    });
    state.order = living.map(function (a) { return a.id; });
    state.turnIndex = 0;
    state.actors.forEach(function (a) {
      a.guarding = false;
      for (var k in a.cooldowns) {
        if (a.cooldowns[k] > 0) a.cooldowns[k] -= 1;
      }
    });
  }

  function actorById(state, id) {
    for (var i = 0; i < state.actors.length; i++) {
      if (state.actors[i].id === id) return state.actors[i];
    }
    return null;
  }
  Combat.actorById = actorById;

  function checkEnd(state) {
    var partyAlive = livingOf(state, 'party').length;
    var enemyAlive = livingOf(state, 'enemy').length;
    if (!enemyAlive) {
      state.over = true;
      state.result = 'victory';
      Combat.pushLog(state, 'result', 'Victory.');
      return true;
    }
    if (!partyAlive) {
      state.over = true;
      state.result = 'defeat';
      Combat.pushLog(state, 'result', 'You have fallen.');
      return true;
    }
    return false;
  }

  /* Drive the fight forward until it either ends or needs player input. */
  function advance(state) {
    var guard = 0;
    while (!state.over && guard++ < 500) {
      if (state.turnIndex >= state.order.length) {
        // End of round: statuses tick for everyone still standing.
        state.actors.forEach(function (a) {
          if (!a.alive) return;
          var events = tickStatuses(state, a);
          events.forEach(function (e) {
            if (e.type === 'dot') {
              Combat.pushLog(state, 'dot', a.name + ' takes ' + e.amount + ' from ' + e.status + '.');
            } else if (e.type === 'hot' || e.type === 'regen') {
              Combat.pushLog(state, 'heal', a.name + ' recovers ' + e.amount + '.');
            }
          });
          if (!a.alive) Combat.pushLog(state, 'death', a.name + ' falls.');
        });
        if (checkEnd(state)) return state;
        nextRound(state);
        continue;
      }

      var actor = actorById(state, state.order[state.turnIndex]);
      if (!actor || !actor.alive) { state.turnIndex++; continue; }

      var sm = statusMods(actor);
      if (sm.skipTurn) {
        Combat.pushLog(state, 'skip', actor.name + ' cannot act.');
        state.turnIndex++;
        continue;
      }
      if (sm.fleeChance && state.rng.next() < sm.fleeChance) {
        Combat.pushLog(state, 'skip', actor.name + ' cowers.');
        state.turnIndex++;
        continue;
      }

      if (actor.isPlayer) {
        state.awaitingInput = true;
        state.current = actor.id;
        return state;
      }

      takeAITurn(state, actor);
      state.turnIndex++;
      if (checkEnd(state)) return state;
    }
    return state;
  }
  Combat.advance = advance;

  /* --------------------------------------------------------- skill lookup */
  function skillOf(state, id) {
    return state.world.skills.byId[id] || null;
  }
  Combat.skillOf = skillOf;

  function canUse(state, actor, skill) {
    if (!skill) return false;
    if (skill.category === 'passive' || skill.category === 'utility') return false;
    var sm = statusMods(actor);
    if (sm.noMagic && skill.school !== 'physical') return false;
    var cost = skillCost(actor, skill);
    if (actor.mp < cost) return false;
    if ((actor.cooldowns[skill.id] || 0) > 0) return false;
    return true;
  }
  Combat.canUse = canUse;

  function skillCost(actor, skill) {
    var cut = (actor.passives.costCut || 0) + (actor.extras.costCut || 0);
    return Math.max(0, Math.round(skill.mp * (1 - U.clamp(cut, 0, 0.8))));
  }
  Combat.skillCost = skillCost;

  Combat.availableSkills = function (state, actor) {
    var out = [];
    for (var i = 0; i < actor.skills.length; i++) {
      var s = skillOf(state, actor.skills[i]);
      if (!s || s.category === 'passive' || s.category === 'utility') continue;
      out.push({
        skill: s,
        usable: canUse(state, actor, s),
        cost: skillCost(actor, s),
        cooldown: actor.cooldowns[s.id] || 0
      });
    }
    return out;
  };

  /* ------------------------------------------------------------ resolving */
  function targetsFor(state, actor, skill, targetId) {
    var enemySide = actor.side === 'party' ? 'enemy' : 'party';
    switch (skill.target) {
      case 'all_enemies': return livingOf(state, enemySide);
      case 'all_allies': return livingOf(state, actor.side);
      case 'self': return [actor];
      case 'ally': {
        if (targetId) {
          var t = actorById(state, targetId);
          if (t && t.alive && t.side === actor.side) return [t];
        }
        var allies = livingOf(state, actor.side);
        // Default to the most wounded ally.
        return [U.minBy(allies, function (a) { return a.hp / a.stats.hp; }) || actor];
      }
      default: {
        if (targetId) {
          var e = actorById(state, targetId);
          if (e && e.alive && e.side === enemySide) return [e];
        }
        var pool = livingOf(state, enemySide);
        return pool.length ? [pool[0]] : [];
      }
    }
  }
  Combat.targetsFor = targetsFor;

  function resolveSkill(state, actor, skill, targetId) {
    var cost = skillCost(actor, skill);
    actor.mp = Math.max(0, actor.mp - cost);
    if (skill.cooldown) actor.cooldowns[skill.id] = skill.cooldown + 1;

    var targets = targetsFor(state, actor, skill, targetId);
    if (!targets.length) {
      Combat.pushLog(state, 'info', actor.name + ' finds no target.');
      return;
    }

    Combat.pushLog(state, 'use', actor.name + ' uses ' + skill.name + '.', {
      element: skill.element, rarity: skill.rarity, actorId: actor.id
    });

    var totalDealt = 0;

    for (var ti = 0; ti < targets.length; ti++) {
      var target = targets[ti];

      if (skill.category === 'heal') {
        var healBase = (skill.power / Combat.HEAL_DIVISOR) * stat(actor, 'mag') *
          masteryMult(actor, skill);
        var heal = Math.max(1, Math.round(healBase * state.rng.range(0.95, 1.1)));
        target.hp = Math.min(target.stats.hp, target.hp + heal);
        Combat.pushLog(state, 'heal', target.name + ' recovers ' + heal + ' health.');
        if (skill.status && skill.statusOnAlly) {
          applyStatus(state, target, skill.status, skill.statusTurns, actor);
        }
        continue;
      }

      if (skill.category === 'buff') {
        if (skill.status) {
          applyStatus(state, target, skill.status, skill.statusTurns, actor);
          Combat.pushLog(state, 'buff', target.name + ' gains ' +
            (T.STATUSES[skill.status] ? T.STATUSES[skill.status].name : skill.status) + '.');
        }
        if (skill.healPct) {
          var h2 = Math.round(target.stats.hp * skill.healPct);
          target.hp = Math.min(target.stats.hp, target.hp + h2);
          Combat.pushLog(state, 'heal', target.name + ' recovers ' + h2 + '.');
        }
        continue;
      }

      if (skill.category === 'debuff' && !skill.power) {
        if (skill.status && state.rng.next() < (skill.statusChance || 1)) {
          applyStatus(state, target, skill.status, skill.statusTurns, actor);
          Combat.pushLog(state, 'debuff', target.name + ' suffers ' +
            (T.STATUSES[skill.status] ? T.STATUSES[skill.status].name : skill.status) + '.');
        } else {
          Combat.pushLog(state, 'info', target.name + ' shrugs it off.');
        }
        continue;
      }

      // Damaging skills (attack, aoe, dot, drain, control-with-damage).
      var hits = skill.hits || 1;
      var dealt = 0;
      for (var h = 0; h < hits; h++) {
        if (!target.alive) break;
        var res = computeDamage(state, actor, target, skill);
        if (res.evaded) {
          Combat.pushLog(state, 'miss', target.name + ' evades.');
          continue;
        }
        var amount = res.amount;
        if (skill.trueDamage) amount += Math.round(target.stats.hp * skill.trueDamage);
        target.hp = Math.max(0, target.hp - amount);
        dealt += amount;
        var eff = res.effectiveness > 1.25 ? ' Effective!' :
          (res.effectiveness < 0.8 ? ' Resisted.' : '');
        Combat.pushLog(state, 'damage', target.name + ' takes ' + amount +
          (res.crit ? ' (critical!)' : '') + '.' + eff, {
          targetId: target.id, amount: amount, crit: res.crit
        });

        // Thorns and on-hit trait statuses.
        if (target.extras.thorns && skill.school === 'physical') {
          var back = Math.max(1, Math.round(amount * target.extras.thorns));
          actor.hp = Math.max(0, actor.hp - back);
          Combat.pushLog(state, 'damage', actor.name + ' takes ' + back + ' in return.');
        }
        if (actor.onHitStatus) applyStatus(state, target, actor.onHitStatus, 2, actor);
      }
      totalDealt += dealt;

      if (skill.status && dealt > 0 && state.rng.next() < (skill.statusChance || 0)) {
        if (applyStatus(state, target, skill.status, skill.statusTurns, actor)) {
          Combat.pushLog(state, 'debuff', target.name + ' suffers ' +
            (T.STATUSES[skill.status] ? T.STATUSES[skill.status].name : skill.status) + '.');
        }
      }

      if (!target.alive && target.hp <= 0) {
        target.alive = false;
        Combat.pushLog(state, 'death', target.name + ' falls.');
      } else if (target.hp <= 0) {
        // Relic/skill effects can refuse a killing blow, once.
        var revive = (target.extras.reviveOnce || 0) ||
          (target.passives.reviveOnce ? 0.25 : 0);
        if (revive && !target.usedRevive) {
          target.usedRevive = true;
          target.hp = Math.max(1, Math.round(target.stats.hp * revive));
          Combat.pushLog(state, 'revive', target.name + ' refuses to fall.');
        } else {
          target.alive = false;
          Combat.pushLog(state, 'death', target.name + ' falls.');
        }
      }
    }

    // Drain and lifesteal.
    var steal = (skill.drain || 0) + (actor.extras.lifesteal || 0);
    if (steal > 0 && totalDealt > 0) {
      var gain = Math.max(1, Math.round(totalDealt * steal));
      actor.hp = Math.min(actor.stats.hp, actor.hp + gain);
      Combat.pushLog(state, 'heal', actor.name + ' drains ' + gain + ' health.');
    }
  }
  Combat.resolveSkill = resolveSkill;

  /* ------------------------------------------------------------------- AI */
  function scoreSkill(state, actor, skill) {
    var enemySide = actor.side === 'party' ? 'enemy' : 'party';
    var foes = livingOf(state, enemySide);
    var allies = livingOf(state, actor.side);
    if (!foes.length) return -1;

    var hpFrac = actor.hp / actor.stats.hp;
    var score = 0;

    switch (skill.category) {
      case 'heal': {
        var worst = U.minBy(allies, function (a) { return a.hp / a.stats.hp; });
        var need = worst ? 1 - worst.hp / worst.stats.hp : 0;
        score = need * 140 - 10;
        break;
      }
      case 'buff':
        score = 30 - (actor.statuses.length * 12);
        if (skill.status && actor.statuses.some(function (s) { return s.id === skill.status; })) score -= 60;
        break;
      case 'debuff':
        score = 32;
        if (skill.status && foes[0].statuses.some(function (s) { return s.id === skill.status; })) score -= 55;
        break;
      case 'control':
        score = 48;
        break;
      case 'aoe':
        score = 34 * Math.min(foes.length, 3);
        break;
      case 'drain':
        score = 40 + (1 - hpFrac) * 45;
        break;
      default:
        score = 40;
    }

    if (skill.power) {
      // Estimate the damage this would actually do to the best target.
      var target = U.minBy(foes, function (f) { return f.hp; });
      var est = computeDamageEstimate(actor, target, skill);
      score += (est / Math.max(1, target.hp)) * 90;
      if (est >= target.hp) score += 60;
    }
    score -= skillCost(actor, skill) * 0.12;
    return score;
  }

  function computeDamageEstimate(attacker, defender, skill) {
    var school = skill.school === 'physical' ? 'physical' : 'magic';
    var A = stat(attacker, school === 'physical' ? 'atk' : 'mag');
    var D = stat(defender, school === 'physical' ? 'def' : 'res') * (1 - (skill.pierce || 0));
    var raw = (skill.power / Combat.DAMAGE_DIVISOR) * A * masteryMult(attacker, skill);
    var mitigation = D / (D + 35 + attacker.level * 3.5);
    return raw * (1 - mitigation) * elementMultiplier(skill.element, defender) * (skill.hits || 1);
  }
  Combat.estimate = computeDamageEstimate;

  function takeAITurn(state, actor) {
    var options = [];
    for (var i = 0; i < actor.skills.length; i++) {
      var s = skillOf(state, actor.skills[i]);
      if (!s || !canUse(state, actor, s)) continue;
      options.push({ skill: s, score: scoreSkill(state, actor, s) + state.rng.range(0, 8) });
    }
    if (!options.length) {
      // Basic strike when nothing is affordable.
      var enemySide = actor.side === 'party' ? 'enemy' : 'party';
      var foes = livingOf(state, enemySide);
      if (!foes.length) return;
      var target = foes[state.rng.int(0, foes.length - 1)];
      var basic = {
        id: '__basic', name: 'Strike', power: 26, school: 'physical',
        element: actor.elements[0] || 'physical', mp: 0, cooldown: 0,
        category: 'attack', target: 'enemy', hits: 1
      };
      Combat.pushLog(state, 'use', actor.name + ' strikes.', { actorId: actor.id });
      var res = computeDamage(state, actor, target, basic);
      if (res.evaded) {
        Combat.pushLog(state, 'miss', target.name + ' evades.');
      } else {
        target.hp = Math.max(0, target.hp - res.amount);
        Combat.pushLog(state, 'damage', target.name + ' takes ' + res.amount +
          (res.crit ? ' (critical!)' : '') + '.', { targetId: target.id });
        if (target.hp <= 0) { target.alive = false; Combat.pushLog(state, 'death', target.name + ' falls.'); }
      }
      return;
    }
    options.sort(function (a, b) { return b.score - a.score; });
    var chosen = options[0].skill;
    // Pick the weakest valid target for finishing potential.
    var side = actor.side === 'party' ? 'enemy' : 'party';
    var pool = chosen.target === 'ally' || chosen.target === 'all_allies' || chosen.target === 'self'
      ? livingOf(state, actor.side) : livingOf(state, side);
    var pick = U.minBy(pool, function (a) { return a.hp; });
    resolveSkill(state, actor, chosen, pick ? pick.id : null);
  }

  /* --------------------------------------------------------- player input */
  Combat.playerAction = function (state, action) {
    if (state.over || !state.awaitingInput) return state;
    var actor = actorById(state, state.current);
    if (!actor) return state;
    state.awaitingInput = false;

    if (action.type === 'skill') {
      var skill = skillOf(state, action.skillId);
      if (!skill || !canUse(state, actor, skill)) {
        state.awaitingInput = true;
        return state;
      }
      resolveSkill(state, actor, skill, action.targetId);
      if (actor.ref && ISE.Player.gainMastery) {
        ISE.Player.gainMastery(actor.ref, skill, state.world);
        actor.mastery[skill.id] = (actor.ref.skillById[skill.id] || {}).mastery || 0;
      }
    } else if (action.type === 'guard') {
      actor.guarding = true;
      actor.mp = Math.min(actor.stats.mp, actor.mp + Math.round(actor.stats.mp * 0.12));
      Combat.pushLog(state, 'info', actor.name + ' guards and recovers focus.');
    } else if (action.type === 'item') {
      applyItem(state, actor, action.itemId, action.targetId);
    } else if (action.type === 'flee') {
      var chance = U.clamp01(0.35 + (stat(actor, 'spd') -
        U.sum(livingOf(state, 'enemy'), function (e) { return stat(e, 'spd'); }) /
        Math.max(1, livingOf(state, 'enemy').length)) / 200);
      if (state.context.noFlee) chance = 0;
      if (state.rng.next() < chance) {
        state.over = true;
        state.result = 'fled';
        state.fled = true;
        Combat.pushLog(state, 'result', 'You break away.');
        return state;
      }
      Combat.pushLog(state, 'info', 'You fail to break away.');
    } else {
      state.awaitingInput = true;
      return state;
    }

    state.turnIndex++;
    if (!checkEnd(state)) advance(state);
    return state;
  };

  function applyItem(state, actor, itemId, targetId) {
    var player = actor.ref;
    if (!player || !player.inventory) return;
    var item = null, idx = -1;
    for (var i = 0; i < player.inventory.length; i++) {
      if (player.inventory[i].id === itemId) { item = player.inventory[i]; idx = i; break; }
    }
    if (!item || item.kind !== 'consumable') return;

    var target = targetId ? actorById(state, targetId) : actor;
    if (!target || target.side !== 'party') target = actor;

    switch (item.effect) {
      case 'heal':
        target.hp = Math.min(target.stats.hp, target.hp + item.power);
        Combat.pushLog(state, 'heal', target.name + ' drinks ' + item.name +
          ' and recovers ' + item.power + '.');
        break;
      case 'mp':
        target.mp = Math.min(target.stats.mp, target.mp + item.power);
        Combat.pushLog(state, 'heal', target.name + ' recovers ' + item.power + ' magicules.');
        break;
      case 'cleanse':
        target.statuses = target.statuses.filter(function (s) {
          var d = T.STATUSES[s.id];
          return d && (d.kind === 'buff' || d.kind === 'hot' || d.kind === 'shield');
        });
        Combat.pushLog(state, 'buff', target.name + ' is cleansed.');
        break;
      case 'buff':
        applyStatus(state, target, item.status, 3, actor);
        Combat.pushLog(state, 'buff', target.name + ' gains ' +
          (T.STATUSES[item.status] ? T.STATUSES[item.status].name : item.status) + '.');
        break;
      case 'flee':
        state.over = true;
        state.result = 'fled';
        state.fled = true;
        Combat.pushLog(state, 'result', 'Smoke fills the room. You are gone.');
        break;
      case 'revive': {
        var fallen = state.party.filter(function (p) { return !p.alive; })[0];
        if (fallen) {
          fallen.alive = true;
          fallen.hp = Math.round(fallen.stats.hp * item.power);
          Combat.pushLog(state, 'revive', fallen.name + ' gets back up.');
        }
        break;
      }
    }
    player.inventory.splice(idx, 1);
  }

  /* Sync combat results back onto the persistent records. */
  Combat.commit = function (state) {
    state.party.forEach(function (a) {
      if (!a.ref) return;
      if (a.isPlayer) {
        a.ref.hpCur = a.hp;
        a.ref.mpCur = a.mp;
      } else if (a.companion) {
        a.ref.hpCur = a.hp;
        a.ref.mpCur = a.mp;
        a.ref.down = !a.alive;
      }
    });
    return state;
  };

  ISE.Combat = Combat;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
