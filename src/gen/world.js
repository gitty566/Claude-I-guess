/* world.js — Phase A orchestration. Runs genesis in a fixed order so a seed
 * always reproduces the same world, then hands the result to the history
 * simulation (sim/history.js) for Phase B. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, Names = ISE.Names;

  var DEFAULT_PARAMS = {
    seed: 'Anthropos-0001',
    worldSize: 3,          // 1..5
    nationCount: 6,        // 2..16
    historyYears: 250,     // 0..1000
    magicDensity: 0.5,     // 0..1
    monsterCeiling: 6,     // 1..10
    relicAbundance: 0.5,   // 0..1
    warTendency: 0.5,      // 0..1
    settlementDensity: 1.0,// 0.4..2
    defensibility: 0.6     // 0..1.5
  };

  ISE.DEFAULT_PARAMS = DEFAULT_PARAMS;

  function normalizeParams(p) {
    var out = U.assign({}, DEFAULT_PARAMS, p || {});
    out.worldSize = U.clamp(Math.round(out.worldSize), 1, 5);
    out.nationCount = U.clamp(Math.round(out.nationCount), 2, 16);
    out.historyYears = U.clamp(Math.round(out.historyYears), 0, 1000);
    out.magicDensity = U.clamp01(out.magicDensity);
    out.monsterCeiling = U.clamp(Math.round(out.monsterCeiling), 1, 10);
    out.relicAbundance = U.clamp01(out.relicAbundance);
    out.warTendency = U.clamp01(out.warTendency);
    out.settlementDensity = U.clamp(out.settlementDensity, 0.4, 2);
    out.defensibility = U.clamp(out.defensibility, 0, 1.5);
    out.seed = String(out.seed || 'seed');
    return out;
  }

  /* Higher magic density is supposed to come with higher danger, so the two
   * are coupled here rather than left to the player to balance by hand. */
  function coupleParams(p) {
    var lift = (p.magicDensity - 0.5) * 3.2;
    p.effectiveCeiling = U.clamp(p.monsterCeiling + lift, 1, 12);
    p.monsterCeiling = U.clamp(Math.round(p.monsterCeiling + lift * 0.55), 1, 10);
    return p;
  }

  var GENESIS_EVENTS = [
    { name: 'the Sundering', elements: ['chaos', 'order'],
      text: 'The world was one piece and then it was not. Everything since has been ' +
        'an argument about the seam.' },
    { name: 'the Fall of the Second Sun', elements: ['fire', 'light'],
      text: 'There were two suns. One came down. The crater is still warm and still ' +
        'produces things that should not walk.' },
    { name: 'the Long Drowning', elements: ['water', 'ice'],
      text: 'The sea rose for eleven years without explanation, then stopped. It never ' +
        'gave the land back.' },
    { name: 'the Green Waking', elements: ['biological', 'earth'],
      text: 'Something under the soil opened its eyes. The forests have been slightly ' +
        'wrong ever since.' },
    { name: 'the Silence of the First Choir', elements: ['psychic', 'energy'],
      text: 'Every mind on the continent heard the same note held for a full day. Those ' +
        'who were listening closely never fully came back.' },
    { name: 'the Ashen Verdict', elements: ['shadow', 'fire'],
      text: 'A judgement was passed on a civilisation nobody can now name. The ash line ' +
        'is still visible from orbit, if anything up there is looking.' },
    { name: 'the Storm That Would Not End', elements: ['lightning', 'wind'],
      text: 'It rained lightning for a generation. The survivors learned to farm in it.' },
    { name: 'the Unmaking of the Loom', elements: ['chaos', 'psychic'],
      text: 'Something that decided what things were is broken now. Categories leak.' }
  ];

  function makeGenesis(rng, params) {
    var base = rng.pick(GENESIS_EVENTS);
    var year = -rng.int(400, 3000);
    return {
      name: base.name,
      elements: base.elements.slice(),
      text: base.text,
      year: year,
      manaLegacy: U.round(params.magicDensity, 2)
    };
  }

  function generate(paramsIn, onProgress) {
    var params = coupleParams(normalizeParams(paramsIn));
    var rng = new ISE.RNG(params.seed);
    var t0 = Date.now();

    function step(label, pct) { if (onProgress) onProgress(label, pct); }

    step('Shaping continents', 0.05);
    var geo = ISE.Geo.generate(rng.fork('geo'), params);

    step('Recording the genesis event', 0.18);
    var genesis = makeGenesis(rng.fork('genesis'), params);

    step('Seeding races and evolution trees', 0.22);
    var races = ISE.RaceGen.generateRaces(rng.fork('races'), params, genesis, geo.availableBiomes);

    step('Cataloguing skills', 0.32);
    var catalog = ISE.SkillGen.generateCatalog(rng.fork('skillcat'), params, races.apexRefs);

    step('Founding nations', 0.42);
    var nations = ISE.NationGen.foundNations(rng.fork('nations'), params, geo, races);
    var owner = ISE.NationGen.growTerritory(rng.fork('territory'), params, geo, races, nations);
    geo.owner = owner;

    step('Raising settlements', 0.55);
    var settlements = ISE.NationGen.placeSettlements(rng.fork('settle'), params, geo, nations, owner, races);
    var guild = ISE.NationGen.charterGuild(rng.fork('guild'), settlements, nations);
    ISE.NationGen.initRelations(rng.fork('relations'), params, geo, nations, owner);

    step('Digging dungeons', 0.68);
    var dungeons = ISE.DungeonGen.generateDungeons(rng.fork('dungeons'), params, geo,
      nations, settlements, catalog);

    step('Settling monster ecologies', 0.78);
    var factions = ISE.DungeonGen.generateFactions(rng.fork('factions'), params, geo,
      nations, settlements, dungeons, catalog);

    var world = {
      seed: params.seed,
      params: params,
      genesis: genesis,
      geo: geo,
      races: races,
      skills: catalog,
      nations: nations,
      owner: owner,
      settlements: settlements,
      guild: guild,
      dungeons: dungeons,
      factions: factions,
      relics: [],
      heroes: [],
      legends: [],
      year: 0,
      day: 0,
      genMs: 0,
      version: 1
    };

    reindex(world);
    step('World formed', 0.82);
    world.genMs = Date.now() - t0;
    return world;
  }

  /* Rebuild lookup tables. Called after generation and after loading a save. */
  function reindex(world) {
    world.nationById = {};
    world.nations.forEach(function (n) { world.nationById[n.id] = n; });
    world.settlementById = {};
    world.settlements.forEach(function (s) { world.settlementById[s.id] = s; });
    world.dungeonById = {};
    world.dungeons.forEach(function (d) { world.dungeonById[d.id] = d; });
    world.factionById = {};
    world.factions.forEach(function (f) { world.factionById[f.id] = f; });
    world.relicById = {};
    world.relics.forEach(function (r) { world.relicById[r.id] = r; });
    world.heroById = {};
    world.heroes.forEach(function (h) { world.heroById[h.id] = h; });

    world.settlementAt = function (x, y) {
      for (var i = 0; i < world.settlements.length; i++) {
        var s = world.settlements[i];
        if (!s.destroyed && s.x === x && s.y === y) return s;
      }
      return null;
    };
    world.dungeonAt = function (x, y) {
      for (var i = 0; i < world.dungeons.length; i++) {
        var d = world.dungeons[i];
        if (d.x === x && d.y === y) return d;
      }
      return null;
    };
    world.nationOfTile = function (tile) {
      var oi = world.owner[tile];
      return oi >= 0 ? world.nations[oi] : null;
    };
    world.livingNations = function () {
      return world.nations.filter(function (n) { return n.alive; });
    };
    world.livingHeroes = function () {
      return world.heroes.filter(function (h) { return h.alive; });
    };
    return world;
  }

  /* Recompute derived nation numbers after territory or settlements change. */
  function recomputeNation(world, nation) {
    var pop = 0, def = 0;
    nation.settlements.forEach(function (sid) {
      var s = world.settlementById[sid];
      if (s && !s.destroyed) { pop += s.population; def += s.defense; }
    });
    nation.population = pop;
    nation.defenseTotal = def;
    nation.strength = Math.round(nation.military * (0.7 + nation.economy / 150) *
      (0.6 + nation.stability / 120));
    return nation;
  }

  ISE.WorldGen = {
    generate: generate,
    reindex: reindex,
    recomputeNation: recomputeNation,
    normalizeParams: normalizeParams,
    coupleParams: coupleParams,
    GENESIS_EVENTS: GENESIS_EVENTS,
    DEFAULT_PARAMS: DEFAULT_PARAMS
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
