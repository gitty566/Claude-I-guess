/* history.js — Phase B. Simulates N years of off-screen history before the
 * player arrives, and provides the same year-step used by the live world
 * clock once play begins.
 *
 * Everything is abstract and numeric: nations are strength/economy/stability
 * numbers, battles are comparisons, delves are power checks. A thousand
 * years runs in well under a second, which is the whole point — the world
 * the player walks into has a past that was actually simulated, not authored.
 */
(function (ISE) {
  'use strict';

  var U = ISE.U, ED = ISE.EventData, Procs = ISE.Procs;
  var H = Procs.H, C = Procs.C, P = Procs.P;

  /* Normalised 0.25..1.75 multiplier for a world-gen parameter, so event
   * weights can be scaled by it with an exponent. */
  function paramValue(world, key) {
    var p = world.params;
    switch (key) {
      case 'warTendency': return 0.25 + p.warTendency * 1.5;
      case 'magicDensity': return 0.25 + p.magicDensity * 1.5;
      case 'monsterCeiling': return 0.25 + (p.monsterCeiling / 10) * 1.5;
      case 'relicAbundance': return 0.25 + p.relicAbundance * 1.5;
      case 'settlementDensity': return 0.35 + (p.settlementDensity / 2) * 1.4;
      default: return 1;
    }
  }

  function ruleWeight(world, rule) {
    var w = rule.weight;
    if (rule.mods) {
      for (var k in rule.mods) {
        w *= Math.pow(paramValue(world, k), rule.mods[k]);
      }
    }
    return w;
  }

  /* Pick the subject(s) a rule needs. Returns a context or null. */
  function makeContext(world, rng, rule) {
    var ctx = { world: world, rng: rng, rule: rule, args: rule.args || {} };
    var living = world.livingNations();

    switch (rule.scope) {
      case 'world':
        return ctx;

      case 'nation': {
        if (!living.length) return null;
        ctx.a = rng.weighted(living.map(function (n) {
          return [n, 1 + n.tiles.length * 0.02 + n.settlements.length];
        }));
        return ctx.a ? ctx : null;
      }

      case 'nation_pair': {
        if (living.length < 2) return null;
        ctx.a = rng.pick(living);
        // Prefer neighbours; a nation mostly fights and marries who it can reach.
        var others = living.filter(function (n) { return n.id !== ctx.a.id; });
        if (!others.length) return null;
        var scored = others.map(function (n) {
          return [n, 1 + H.borderStrength(world, ctx.a, n) * 0.5];
        });
        ctx.b = rng.weighted(scored);
        return ctx.b ? ctx : null;
      }

      case 'settlement': {
        var alive = world.settlements.filter(function (s) { return !s.destroyed; });
        if (!alive.length) return null;
        ctx.settlement = rng.pick(alive);
        return ctx;
      }

      case 'dungeon': {
        if (!world.dungeons.length) return null;
        ctx.dungeon = rng.pick(world.dungeons);
        return ctx;
      }

      case 'faction': {
        var fs = world.factions.filter(function (f) { return f.alive; });
        if (!fs.length) return null;
        ctx.faction = rng.weighted(fs.map(function (f) { return [f, 1 + f.strength * 0.01]; }));
        return ctx.faction ? ctx : null;
      }

      case 'hero': {
        var hs = world.livingHeroes();
        if (!hs.length) return null;
        ctx.hero = rng.pick(hs);
        return ctx;
      }
      default: return null;
    }
  }

  function conditionsPass(rule, ctx) {
    if (!rule.when || !rule.when.length) return true;
    for (var i = 0; i < rule.when.length; i++) {
      var clause = rule.when[i];
      for (var key in clause) {
        var check = C[key];
        if (!check) return false;
        if (!check(clause[key], ctx)) return false;
      }
    }
    return true;
  }

  /* Run one event. Returns the legend entry, or null if nothing happened. */
  function fireEvent(world, rng, rule, extraCtx) {
    var ctx = makeContext(world, rng, rule);
    if (!ctx) return null;
    if (extraCtx) U.assign(ctx, extraCtx);
    if (!conditionsPass(rule, ctx)) return null;

    var proc = P[rule.proc];
    if (!proc) return null;
    var tokens = proc(ctx);
    if (!tokens) return null;

    var text = U.fill(rule.legend, tokens);
    var entry = {
      year: world.year,
      ruleId: rule.id,
      name: rule.name,
      tags: rule.tags || [],
      text: text,
      tokens: tokens
    };
    H.log(world, entry);
    return entry;
  }

  /* ------------------------------------------------- per-year baselines */
  function advanceNations(world, rng) {
    var living = world.livingNations();
    living.forEach(function (n) {
      n.ruler.age += 1;

      /* Economy and military are logistic, not exponential: they chase a
       * target set by land and population. Otherwise a 500-year run ends
       * with absurd numbers and every conflict decided by compounding. */
      var warCount0 = Object.keys(n.wars).length;
      var ecoTarget = (n.tiles.length * 0.55 + n.population / 260) *
        (0.6 + n.traits.industry * 0.8) * (1 - warCount0 * 0.08);
      n.economy = Math.max(8, Math.round(
        n.economy + (ecoTarget - n.economy) * 0.09 + rng.range(-2, 2)));

      var milTarget = n.economy * (0.5 + n.traits.aggression * 0.85) *
        (1 + warCount0 * 0.25);
      n.military = Math.max(5, Math.round(n.military + (milTarget - n.military) * 0.14 +
        rng.range(-3, 3)));

      // Stability pulls toward a comfortable middle; war drags it down.
      var warCount = Object.keys(n.wars).length;
      var target = 58 - warCount * 12 + n.traits.industry * 10;
      n.stability = U.clamp(n.stability + (target - n.stability) * 0.15 + rng.range(-2, 2), 2, 98);

      // Population creep, capped by prosperity.
      var towns = H.settlementsOf(world, n);
      towns.forEach(function (s) {
        var cap = s.basePopulation * (1.6 + s.prosperity * 0.5);
        // Rebound is fast well below capacity — otherwise a sacked town can
        // never recover between raids and the map depopulates itself.
        var rate = 1 + 0.05 * s.prosperity * (1 - s.population / cap) - warCount * 0.004;
        s.population = U.clamp(Math.round(s.population * U.clamp(rate, 0.9, 1.07)),
          20, Math.round(cap * 1.05));
        s.garrison = Math.max(2, Math.round(s.garrison * U.clamp(rate, 0.96, 1.05)));
        H.recomputeSettlement(s);
      });

      /* A state that still holds land but has lost every town rebuilds one.
       * Nations are stubborn; they don't evaporate because a warband burned
       * their last village. */
      if (!towns.length && n.tiles.length) {
        var refounded = ISE.Procs.P.foundSettlement({
          world: world, rng: rng, a: n, args: {}
        });
        if (refounded) {
          H.log(world, {
            year: world.year, ruleId: 'refound', name: 'Refounding',
            tags: ['settlement'],
            text: 'What was left of ' + n.name + ' regathered and founded ' +
              refounded.settlement + '.',
            tokens: refounded
          });
        }
      }

      ISE.WorldGen.recomputeNation(world, n);
    });

    // Relations drift: pressure from borders, warmth from alliances.
    living.forEach(function (a) {
      living.forEach(function (b) {
        if (a.index >= b.index) return;
        var cur = H.relation(a, b);
        var pressure = -H.borderStrength(world, a, b) * 0.06 *
          (0.5 + world.params.warTendency);
        pressure += (a.traits.aggression + b.traits.aggression - 1) * -3;
        if (H.allied(a, b)) pressure += 3;
        if (H.atWar(a, b)) pressure -= 4;
        a.grudges.forEach(function (g) { if (g.against === b.id) pressure -= 0.6; });
        b.grudges.forEach(function (g) { if (g.against === a.id) pressure -= 0.6; });
        var drift = (cur > 0 ? -0.6 : 0.6);
        H.setRelation(a, b, cur + pressure + drift + rng.range(-2, 2));
      });
    });
  }

  function advanceFactions(world, rng) {
    world.factions.forEach(function (f) {
      if (!f.alive) return;
      var cap = H.factionCapacity(world, f);
      var pull = (cap - f.strength) * 0.035 * (0.6 + world.params.monsterCeiling / 10);
      f.strength = Math.max(5, Math.round(f.strength + pull + rng.range(-2, 2)));
      if (f.leader && !f.leader.alive) {
        // A leaderless faction fragments unless something replaces it.
        f.strength = Math.round(f.strength * 0.9);
        if (f.strength < 20) f.alive = false;
      }
    });
  }

  function advanceHeroes(world, rng) {
    world.heroes.forEach(function (h) {
      if (!h.alive) return;
      h.age += 1;
      // Heroes grind out levels off-screen.
      if (rng.chance(0.4)) h.level += 1;
      var mortal = 0.004 + Math.max(0, h.age - 45) * 0.012;
      if (h.named) mortal *= 0.35;
      if (rng.chance(mortal)) {
        h.alive = false;
        h.diedYear = world.year;
        h.deathCause = 'of age and accumulated wounds';
      }
    });
  }

  /* -------------------------------------------------------- year driver */
  function eventBudget(world, rng) {
    var n = world.livingNations().length;
    var base = 2 + n * 0.55 + world.factions.length * 0.18;
    base *= 0.75 + world.params.warTendency * 0.5;
    return Math.max(1, Math.round(base + rng.range(-1, 1.5)));
  }

  function simulateYear(world, rng, opts) {
    opts = opts || {};
    world.year += 1;

    if (world.borderDirty) H.computeBorders(world);
    advanceNations(world, rng);
    advanceFactions(world, rng);
    advanceHeroes(world, rng);

    var budget = opts.budget !== undefined ? opts.budget : eventBudget(world, rng);
    var pool = opts.rules || ED.EVENTS;
    var weights = pool.map(function (r) { return [r, ruleWeight(world, r)]; });
    var fired = [];

    var attempts = 0;
    while (fired.length < budget && attempts < budget * 6) {
      attempts++;
      var rule = rng.weighted(weights);
      if (!rule) break;
      var entry = fireEvent(world, rng, rule);
      if (entry) fired.push(entry);
    }

    // Nations with nothing left die quietly.
    world.livingNations().forEach(function (n) {
      if (!n.settlements.length && !n.tiles.length) {
        H.killNation(world, n, 'faded from the map');
        H.log(world, {
          year: world.year, ruleId: 'nation_fades', name: 'A Nation Ends',
          tags: ['politics'], text: n.name + ' ceased to exist.', tokens: {}
        });
      }
    });

    return fired;
  }

  /* Run `years` years. Chunkable so the UI can show progress without
   * freezing: call repeatedly with small counts. */
  function run(world, years, opts) {
    opts = opts || {};
    var rng = world._historyRng ||
      (world._historyRng = new ISE.RNG(world.seed + '::history'));
    for (var i = 0; i < years; i++) {
      simulateYear(world, rng, opts);
      if (opts.onYear) opts.onYear(world.year);
    }
    return world;
  }

  /* One-time Phase B setup: borders and a first generation of heroes so the
   * early years have someone to send into dungeons. Idempotent, so a UI that
   * drives the year loop itself can call it before its own chunked run. */
  function prepare(world) {
    if (world._historyPrepared) return world;
    var rng = world._historyRng ||
      (world._historyRng = new ISE.RNG(world.seed + '::history'));
    H.computeBorders(world);
    world.livingNations().forEach(function (n) {
      if (rng.chance(0.6)) H.makeHero(world, rng, n, {});
    });
    world._historyPrepared = true;
    return world;
  }

  /* Full Phase B pass. */
  function simulateHistory(world, opts) {
    opts = opts || {};
    var years = world.params.historyYears;
    prepare(world);
    var rng = world._historyRng;

    var chunk = opts.chunk || years;
    var done = 0;
    while (done < years) {
      var step = Math.min(chunk, years - done);
      for (var i = 0; i < step; i++) simulateYear(world, rng, opts);
      done += step;
      if (opts.onProgress) opts.onProgress(done / Math.max(1, years), world);
    }

    finalize(world);
    return world;
  }

  /* Post-history bookkeeping: everything the player-facing world needs to
   * be internally consistent on turn one. */
  function finalize(world) {
    H.computeBorders(world);
    world.livingNations().forEach(function (n) { ISE.WorldGen.recomputeNation(world, n); });

    // Dungeons that were never touched stay undiscovered; ones near towns
    // are common knowledge.
    world.dungeons.forEach(function (d) {
      if (d.discovered) return;
      var near = H.nearestSettlement(world, d.x, d.y);
      if (near && near.dist < 7) d.discovered = true;
    });

    // Relics with no owner end up somewhere findable.
    var rng = new ISE.RNG(world.seed + '::finalize');
    world.relics.forEach(function (r) {
      if (!r.ownerType) {
        if (world.dungeons.length) H.giveRelicTo(world, r, 'dungeon', rng.pick(world.dungeons).id, 'lost');
      }
      r.locationText = H.relicLocationText(world, r);
    });

    world.summary = buildSummary(world);
    return world;
  }

  function buildSummary(world) {
    var living = world.livingNations();
    var fallen = world.nations.filter(function (n) { return !n.alive; });
    var destroyedTowns = world.settlements.filter(function (s) { return s.destroyed; });
    var wars = 0, alliances = 0;
    living.forEach(function (n) {
      wars += Object.keys(n.wars).length;
      alliances += Object.keys(n.allies).length;
    });
    return {
      years: world.year,
      nations: living.length,
      fallenNations: fallen.length,
      settlements: world.settlements.filter(function (s) { return !s.destroyed; }).length,
      ruinedSettlements: destroyedTowns.length,
      dungeons: world.dungeons.length,
      clearedDungeons: world.dungeons.filter(function (d) { return d.cleared; }).length,
      factions: world.factions.filter(function (f) { return f.alive; }).length,
      relics: world.relics.length,
      heroes: world.heroes.length,
      livingHeroes: world.livingHeroes().length,
      namedHeroes: world.heroes.filter(function (h) { return h.named; }).length,
      legends: world.legends.length,
      activeWars: wars / 2,
      alliances: alliances / 2,
      skills: world.skills.count,
      population: living.reduce(function (a, n) { return a + n.population; }, 0)
    };
  }

  /* The per-year drift with no events attached — used by the live world
   * clock, which meters its own events out per day. */
  function simulateYearBaselinesOnly(world, rng) {
    advanceNations(world, rng);
    advanceFactions(world, rng);
    advanceHeroes(world, rng);
  }

  ISE.History = {
    simulateHistory: simulateHistory,
    prepare: prepare,
    simulateYearBaselinesOnly: simulateYearBaselinesOnly,
    advanceNations: advanceNations,
    advanceFactions: advanceFactions,
    advanceHeroes: advanceHeroes,
    simulateYear: simulateYear,
    run: run,
    fireEvent: fireEvent,
    finalize: finalize,
    buildSummary: buildSummary,
    ruleWeight: ruleWeight,
    makeContext: makeContext,
    conditionsPass: conditionsPass
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
