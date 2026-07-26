/* evolution.js — checks race evolution requirements against a character's
 * lived record and applies the change of form.
 *
 * Requirement types are a registry, not a chain of ifs: races.js can add a
 * new gate by naming a checker that exists here. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T;

  var Evo = {};

  /* Each checker returns {met, text, progress} so the UI can show partial
   * progress rather than a bare "locked". */
  var CHECKS = {
    level: function (need, c) {
      return { met: c.level >= need, progress: c.level / need,
        text: 'Reach level ' + need + ' (' + c.level + ')' };
    },
    kills: function (need, c) {
      var v = c.deeds.kills || 0;
      return { met: v >= need, progress: v / need,
        text: 'Slay ' + U.num(need) + ' foes (' + U.num(v) + ')' };
    },
    killsElement: function (need, c) {
      var v = (c.deeds.killsByElement || {})[need.element] || 0;
      return { met: v >= need.n, progress: v / need.n,
        text: 'Slay ' + need.n + ' ' + T.ELEMENT[need.element].name + ' creatures (' + v + ')' };
    },
    bosses: function (need, c) {
      var v = c.deeds.bosses || 0;
      return { met: v >= need, progress: v / need,
        text: 'Kill ' + need + ' named bosses (' + v + ')' };
    },
    dungeons: function (need, c) {
      var v = c.deeds.dungeons || 0;
      return { met: v >= need, progress: v / need,
        text: 'Clear ' + need + ' dungeons (' + v + ')' };
    },
    biome: function (need, c) {
      var list = Array.isArray(need) ? need : [need];
      var met = list.some(function (b) { return (c.biomesVisited || {})[b]; });
      var names = list.map(function (b) {
        return T.BIOMES[b] ? T.BIOMES[b].name : b;
      });
      return { met: met, progress: met ? 1 : 0,
        text: 'Spend time in: ' + names.join(', ') };
    },
    masteredCount: function (need, c) {
      var v = c.skills.filter(function (s) { return s.mastery >= need.min; }).length;
      return { met: v >= need.n, progress: v / need.n,
        text: 'Master ' + need.n + ' skills to ' + need.min + '% (' + v + ')' };
    },
    masteredElement: function (need, c) {
      var v = c.skills.filter(function (s) {
        var def = c.catalog.byId[s.id];
        return def && def.element === need.element && s.mastery >= need.min;
      }).length;
      return { met: v >= need.n, progress: v / need.n,
        text: 'Master ' + need.n + ' ' + T.ELEMENT[need.element].name +
          ' skills to ' + need.min + '% (' + v + ')' };
    },
    catalyst: function (need, c) {
      var met = !!(c.catalysts || {})[need];
      var cat = ISE.RaceData.CATALYSTS[need];
      return { met: met, progress: met ? 1 : 0,
        text: 'Consume a ' + (cat ? cat.name : need) };
    },
    named: function (need, c) {
      return { met: !!c.named === !!need, progress: c.named ? 1 : 0,
        text: 'Be Named by a Named or Unique existence' };
    },
    relics: function (need, c) {
      var v = (c.relicsOwned || 0);
      return { met: v >= need, progress: v / need,
        text: 'Possess ' + need + ' relics (' + v + ')' };
    },
    mount: function (need, c) {
      var met = (c.companions || []).some(function (x) { return x.mount; });
      return { met: met, progress: met ? 1 : 0, text: 'Bond with a mount' };
    },
    fame: function (need, c) {
      var v = c.fame || 0;
      return { met: v >= need, progress: v / need,
        text: 'Reach ' + need + ' fame (' + Math.round(v) + ')' };
    },
    evolutions: function (need, c) {
      var v = (c.evolutionCount || 0);
      return { met: v >= need, progress: v / need,
        text: 'Evolve ' + need + ' times (' + v + ')' };
    }
  };
  Evo.CHECKS = CHECKS;

  /* Normalise a player record into the shape the checkers read. */
  function record(player, world) {
    return {
      level: player.level,
      deeds: player.deeds,
      biomesVisited: player.biomesVisited,
      skills: player.skills,
      catalog: world.skills,
      catalysts: player.catalysts,
      named: player.named,
      relicsOwned: player.relicsOwned || 0,
      companions: player.companions,
      fame: player.fame,
      evolutionCount: player.evolutionCount || 0
    };
  }

  Evo.checkNode = function (player, node, world) {
    var c = record(player, world);
    var reqs = [];
    var allMet = true;
    var req = node.req || {};
    for (var key in req) {
      var checker = CHECKS[key];
      if (!checker) continue;
      var res = checker(req[key], c);
      res.key = key;
      res.progress = U.clamp01(res.progress || 0);
      reqs.push(res);
      if (!res.met) allMet = false;
    }
    return { ok: allMet, reqs: reqs };
  };

  /* The forms directly reachable from where the character is now. */
  Evo.available = function (player, world) {
    var race = world.races.byId[player.raceId];
    if (!race) return [];
    var node = race.nodes.byId[player.nodeId];
    if (!node) return [];
    return (node.branches || []).map(function (branch) {
      var check = Evo.checkNode(player, branch, world);
      return { node: branch, ok: check.ok, reqs: check.reqs };
    });
  };

  /* Full path from the root form to the current one, for the UI. */
  Evo.path = function (player, world) {
    var race = world.races.byId[player.raceId];
    if (!race) return [];
    var out = [];
    var node = race.nodes.byId[player.nodeId];
    while (node) {
      out.unshift(node);
      node = node.parentId ? race.nodes.byId[node.parentId] : null;
    }
    return out;
  };

  Evo.evolve = function (player, nodeId, world) {
    var race = world.races.byId[player.raceId];
    if (!race) return { ok: false, reason: 'No such race.' };
    var node = race.nodes.byId[nodeId];
    if (!node) return { ok: false, reason: 'No such form.' };

    var cur = race.nodes.byId[player.nodeId];
    if (!cur || (cur.branches || []).indexOf(node) < 0) {
      return { ok: false, reason: 'That form does not follow from your current one.' };
    }
    var check = Evo.checkNode(player, node, world);
    if (!check.ok) return { ok: false, reason: 'Requirements not met.', reqs: check.reqs };

    var before = ISE.Player.effectiveStats(player);
    player.nodeId = node.id;
    player.formName = node.name;
    player.evolutionCount = (player.evolutionCount || 0) + 1;
    player.tier = node.tier;

    // Consume any catalyst the form demanded.
    if (node.req && node.req.catalyst) {
      player.catalysts[node.req.catalyst] = Math.max(0,
        (player.catalysts[node.req.catalyst] || 1) - 1) || undefined;
      if (!player.catalysts[node.req.catalyst]) delete player.catalysts[node.req.catalyst];
    }

    // Innate skills of the new form.
    var learned = [];
    (node.innate || []).forEach(function (inn) {
      var skill = world.skills.find(inn.arch, inn.elem);
      if (!skill) {
        var apex = world.skills.byId['apex__' + inn.arch + '__' + inn.elem] ||
          world.skills.byId['apex__' + inn.arch + '__unique'];
        skill = apex || null;
      }
      if (skill && ISE.Player.learnSkill(player, skill, world, 'evolution')) {
        learned.push(skill);
      }
    });

    if (node.elementForm) {
      if (player.affinity.indexOf(node.elementForm) < 0) player.affinity.push(node.elementForm);
      player.resist[node.elementForm] = Math.max(player.resist[node.elementForm] || 0, 0.3);
    }

    var after = ISE.Player.effectiveStats(player);
    // Evolving is a full restoration — it is supposed to feel like an event.
    player.hpCur = after.hp;
    player.mpCur = after.mp;

    return {
      ok: true, node: node, learned: learned,
      before: before, after: after,
      mythical: !!node.mythical
    };
  };

  /* Formatted requirement lines for a node the player has not reached yet. */
  Evo.describeNode = function (player, node, world) {
    var check = Evo.checkNode(player, node, world);
    return {
      name: node.name,
      tier: node.tier,
      desc: node.desc,
      mythical: !!node.mythical,
      mult: node.mult,
      reqs: check.reqs,
      ok: check.ok,
      innate: (node.innate || []).map(function (i) {
        var s = world.skills.find(i.arch, i.elem) ||
          world.skills.byId['apex__' + i.arch + '__' + i.elem];
        return s ? s.name : i.arch;
      })
    };
  };

  ISE.Evolution = Evo;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
