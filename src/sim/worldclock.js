/* worldclock.js — the world keeps running while the player plays.
 *
 * Same event table, same procedures as Phase B, just metered out per day
 * instead of per year, with two additions: events near the player generate
 * news, and a raid on a settlement the player is standing in becomes an
 * actual fight instead of a dice roll. */
(function (ISE) {
  'use strict';

  var U = ISE.U, ED = ISE.EventData, Procs = ISE.Procs, History = ISE.History;
  var H = Procs.H;

  var Clock = {};

  Clock.NEWS_RANGE = 22;

  function nearPlayer(world, player, x, y) {
    if (!player) return false;
    return U.dist(player.x, player.y, x, y) <= Clock.NEWS_RANGE;
  }

  /* Work out where an event happened, so we can tell if the player would
   * plausibly hear about it. */
  function eventLocation(world, entry) {
    var t = entry.tokens || {};
    if (t.settlementId) {
      var s = world.settlementById[t.settlementId];
      if (s) return { x: s.x, y: s.y };
    }
    if (t.factionId) {
      var f = world.factionById[t.factionId];
      if (f) return { x: f.x, y: f.y };
    }
    if (entry.ruleId === 'boss_evolution' || entry.ruleId === 'dungeon_emerges') {
      for (var i = 0; i < world.dungeons.length; i++) {
        if (world.dungeons[i].name === t.dungeon) {
          return { x: world.dungeons[i].x, y: world.dungeons[i].y };
        }
      }
    }
    return null;
  }

  Clock.pushNews = function (world, entry, importance) {
    world.news = world.news || [];
    world.news.push({
      day: world.day,
      year: world.year,
      text: entry.text,
      name: entry.name,
      tags: entry.tags || [],
      importance: importance || 1,
      ruleId: entry.ruleId,
      tokens: entry.tokens || {}
    });
    if (world.news.length > 150) world.news.splice(0, 50);
  };

  /* Advance `days`. Returns a report of anything the player should see. */
  Clock.advance = function (world, player, days, opts) {
    opts = opts || {};
    var rng = world._clockRng || (world._clockRng = new ISE.RNG(world.seed + '::clock'));
    var report = { news: [], interventions: [], levelledYears: 0 };

    for (var d = 0; d < days; d++) {
      world.day += 1;
      world.yearProgress = (world.yearProgress || 0) + 1 / U.DAYS_PER_YEAR;

      if (world.yearProgress >= 1) {
        world.yearProgress -= 1;
        world.year += 1;
        report.levelledYears += 1;
        if (world.borderDirty) H.computeBorders(world);
        Clock.yearlyBaselines(world, rng);
      }

      // Event rate: the same yearly budget, spread across the calendar.
      var perDay = Clock.eventRate(world);
      var n = Math.floor(perDay) + (rng.next() < (perDay % 1) ? 1 : 0);
      for (var e = 0; e < n; e++) {
        var entry = Clock.fireOne(world, player, rng, report);
        if (entry) report.news.push(entry);
      }
    }

    world.livingNations().forEach(function (nat) { ISE.WorldGen.recomputeNation(world, nat); });
    return report;
  };

  Clock.eventRate = function (world) {
    var n = world.livingNations().length;
    var perYear = 2 + n * 0.55 + world.factions.length * 0.18;
    perYear *= 0.75 + world.params.warTendency * 0.5;
    return perYear / U.DAYS_PER_YEAR;
  };

  Clock.yearlyBaselines = function (world, rng) {
    // Reuse the history module's per-year drift so live and past agree.
    ISE.History.simulateYearBaselinesOnly(world, rng);
  };

  /* Fire one event; convert it into news, or into a player-facing choice. */
  Clock.fireOne = function (world, player, rng, report) {
    var pool = ED.EVENTS;
    var weights = pool.map(function (r) { return [r, History.ruleWeight(world, r)]; });
    var rule = rng.weighted(weights);
    if (!rule) return null;

    /* A raid on the settlement the player is standing in is not resolved
     * behind their back — it becomes a fight they can join. */
    if (rule.id === 'raid' && player) {
      var ctx = History.makeContext(world, rng, rule);
      if (ctx && History.conditionsPass(rule, ctx)) {
        var target = ctx.targetSettlement;
        if (target && !target.destroyed && player.x === target.x && player.y === target.y) {
          report.interventions.push({
            kind: 'raid',
            factionId: ctx.faction.id,
            settlementId: target.id,
            faction: ctx.faction,
            settlement: target,
            attack: ctx.faction.strength,
            defense: H.settlementDefense(world, target)
          });
          return null;
        }
      }
      // Otherwise resolve normally, using a fresh context.
    }

    var entry = History.fireEvent(world, rng, rule);
    if (!entry) return null;

    var loc = eventLocation(world, entry);
    var important = entry.tags.indexOf('relic') >= 0 || entry.ruleId === 'calamity' ||
      entry.ruleId === 'declare_war' || entry.ruleId === 'annex' ||
      entry.ruleId === 'successor_state';
    if (important || (loc && nearPlayer(world, player, loc.x, loc.y))) {
      Clock.pushNews(world, entry, important ? 2 : 1);
      return entry;
    }
    return null;
  };

  /* Resolve a raid the player chose to fight in, after their battle. */
  Clock.resolveIntervention = function (world, player, intervention, playerPower) {
    var rng = world._clockRng || (world._clockRng = new ISE.RNG(world.seed + '::clock'));
    var rule = ED.EVENT_BY_ID.raid;
    var ctx = {
      world: world, rng: rng, rule: rule, args: {},
      faction: world.factionById[intervention.factionId],
      targetSettlement: world.settlementById[intervention.settlementId],
      interventionPower: playerPower || 0
    };
    if (!ctx.faction || !ctx.targetSettlement) return null;
    var tokens = Procs.P.raid(ctx);
    if (!tokens) return null;
    var entry = {
      year: world.year, ruleId: 'raid', name: 'Monster Raid',
      tags: ['monster', 'settlement', 'player'],
      text: U.fill(rule.legend, tokens), tokens: tokens
    };
    H.log(world, entry);
    Clock.pushNews(world, entry, 2);

    if (tokens.held) {
      player.deeds.raidsDefended += 1;
      player.fame += 15;
      var nat = world.nationById[ctx.targetSettlement.nationId];
      if (nat) ISE.Player.shiftReputation(player, nat.id, 8);
      ISE.Quests.notify(world, player, {
        type: 'raid_defended', settlementId: ctx.targetSettlement.id
      });
    } else {
      ISE.Quests.notify(world, player, {
        type: 'settlement_lost', settlementId: ctx.targetSettlement.id
      });
    }
    return { tokens: tokens, entry: entry };
  };

  /* Politically significant player actions feed straight back into the
   * relation matrix that the war events read. */
  Clock.playerAction = function (world, player, action) {
    var out = { text: '', changes: [] };
    switch (action.type) {
      case 'gift_relic': {
        var nation = world.nationById[action.nationId];
        var relic = action.relic;
        if (!nation || !relic) return out;
        ISE.Player.shiftReputation(player, nation.id, 30);
        nation.stability = U.clamp(nation.stability + 5, 0, 100);
        H.giveRelicTo(world, world.relicById[relic.id] || relic, 'nation', nation.id,
          'gifted by ' + player.name);
        // Rivals notice.
        world.livingNations().forEach(function (n) {
          if (n.id === nation.id) return;
          if (H.relation(nation, n) < 0) ISE.Player.shiftReputation(player, n.id, -8);
        });
        out.text = nation.name + ' accepts ' + relic.name + '. Word travels.';
        player.fame += 25;
        break;
      }
      case 'kill_noble': {
        var nat2 = world.nationById[action.nationId];
        if (!nat2) return out;
        ISE.Player.shiftReputation(player, nat2.id, -45);
        nat2.stability -= 8;
        player.infamy += 30;
        player.deeds.noblesKilled += 1;
        world.livingNations().forEach(function (n) {
          if (n.id === nat2.id) return;
          if (H.relation(nat2, n) < -20) ISE.Player.shiftReputation(player, n.id, 10);
          else ISE.Player.shiftReputation(player, n.id, -5);
        });
        H.log(world, {
          year: world.year, ruleId: 'player_kill_noble', name: 'A Killing',
          tags: ['politics', 'player'],
          text: player.name + ' killed a noble of ' + nat2.name + '. The court has not forgotten.',
          tokens: {}
        });
        out.text = 'A noble of ' + nat2.name + ' is dead. That will have consequences.';
        break;
      }
      case 'support_war': {
        var a = world.nationById[action.nationId];
        var b = world.nationById[action.againstId];
        if (!a || !b) return out;
        a.military = Math.round(a.military * 1.06);
        ISE.Player.shiftReputation(player, a.id, 15);
        ISE.Player.shiftReputation(player, b.id, -25);
        player.deeds.warsJoined += 1;
        out.text = 'You fight for ' + a.name + '. ' + b.name + ' will remember the face.';
        break;
      }
      case 'raze_fort': {
        var nat3 = world.nationById[action.nationId];
        if (!nat3) return out;
        nat3.military = Math.max(5, Math.round(nat3.military * 0.9));
        nat3.stability -= 6;
        ISE.Player.shiftReputation(player, nat3.id, -55);
        player.infamy += 40;
        out.text = 'The fort burns. ' + nat3.name + ' has posted a bounty.';
        break;
      }
    }
    return out;
  };

  ISE.WorldClock = Clock;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
