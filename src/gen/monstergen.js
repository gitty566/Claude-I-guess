/* monstergen.js — builds concrete monsters and named individuals from the
 * family tables. Every boss and mini-boss is an individual: its own name,
 * traits, and a skill loadout drawn from the world's catalogue. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, MD = ISE.MonsterData, Names = ISE.Names;

  /* Raw stat line for a monster of a given level and family tier.
   *
   * Tier deliberately buys much more health than it does offence. A higher
   * tier should mean "takes longer to put down and has a deeper skill list",
   * not "hits 2x harder as well" — double-scaling tier into every stat makes
   * any tier gap an instant loss regardless of level. */
  function statsFor(level, tierIdx, role) {
    var tmHp = 1 + tierIdx * 0.36;
    var tm = 1 + tierIdx * 0.18;
    return {
      hp: Math.round((28 + level * 8) * role.hp * tmHp),
      mp: Math.round((14 + level * 5) * role.mp * tm),
      atk: Math.round((7 + level * 2.05) * role.atk * tm),
      def: Math.round((6 + level * 1.8) * role.def * tm),
      mag: Math.round((6 + level * 1.95) * role.mag * tm),
      res: Math.round((6 + level * 1.75) * role.res * tm),
      spd: Math.round((8 + level * 1.3) * role.spd * (1 + tierIdx * 0.1)),
      lck: Math.round((5 + level * 0.9) * role.lck)
    };
  }

  function applyMods(stats, mods) {
    for (var k in mods) {
      if (stats[k] !== undefined) stats[k] = Math.round(stats[k] * (1 + mods[k]));
    }
    return stats;
  }

  /* Choose a skill loadout: the role's preferred archetypes, in the family's
   * elements, at a rarity the monster's tier can justify. */
  function pickSkills(rng, catalog, role, elements, tierIdx, count) {
    var maxTier = U.clamp(1 + Math.round(tierIdx * 1.2), 1, 5);
    var out = [];
    var seen = {};
    var prefs = role.prefers.slice();
    rng.shuffle(prefs);

    for (var i = 0; i < prefs.length && out.length < count; i++) {
      var pool = (catalog.byArch[prefs[i]] || []).filter(function (s) {
        return elements.indexOf(s.element) >= 0 && s.rarityTier <= maxTier &&
          s.category !== 'utility' && !seen[s.id];
      });
      if (!pool.length) continue;
      pool.sort(function (a, b) { return b.rarityTier - a.rarityTier; });
      var pick = pool[rng.int(0, Math.min(2, pool.length - 1))];
      seen[pick.id] = true;
      out.push(pick.id);
    }

    // Top up with anything element-appropriate.
    while (out.length < count) {
      var elem = rng.pick(elements);
      var epool = (catalog.byElement[elem] || []).filter(function (s) {
        return s.rarityTier <= maxTier && s.category !== 'utility' &&
          s.category !== 'passive' && !seen[s.id];
      });
      if (!epool.length) break;
      var p2 = rng.pick(epool);
      seen[p2.id] = true;
      out.push(p2.id);
    }
    return out;
  }

  /* An ordinary monster: a mook, generated from family + tier + level. */
  function makeMonster(rng, catalog, opts) {
    var fam = opts.family;
    var role = MD.ROLES[opts.role || fam.role];
    var tierIdx = U.clamp(opts.tier || 1, 1, 6) - 1;
    var level = Math.max(1, Math.round(opts.level || (5 + tierIdx * 8)));
    var elements = opts.elements || fam.elements;
    var element = opts.element || rng.pick(elements);
    var stats = statsFor(level, tierIdx, role);

    return {
      id: 'mon_' + fam.id + '_' + tierIdx + '_' + Math.floor(rng.next() * 1e6).toString(36),
      name: fam.ladder[tierIdx],
      familyId: fam.id,
      kind: fam.kind,
      role: opts.role || fam.role,
      roleName: role.name,
      tier: tierIdx + 1,
      level: level,
      element: element,
      elements: [element],
      stats: stats,
      skills: pickSkills(rng, catalog, role, [element].concat(elements), tierIdx, 2 + Math.min(3, tierIdx)),
      resist: {}, weak: {},
      traits: [],
      boss: false,
      xp: Math.round((12 + level * 9) * (1 + tierIdx * 0.5)),
      gold: Math.round((6 + level * 4.5) * (1 + tierIdx * 0.4) * rng.range(0.7, 1.4)),
      part: MD.MONSTER_PARTS[fam.kind] || 'Remains'
    };
  }

  /* A named individual — floor boss, mini-boss, or faction leader. */
  function makeNamed(rng, catalog, opts) {
    var fam = opts.family;
    var role = MD.ROLES[opts.role || fam.role];
    var tierIdx = U.clamp(opts.tier || 3, 1, 6) - 1;
    var level = Math.max(3, Math.round(opts.level || (10 + tierIdx * 10)));
    var elements = opts.elements || fam.elements;
    var element = opts.element || rng.pick(elements);

    /* A tier-1 floor boss should be a step up from a mook, not a wall; a
     * tier-6 one should be a wall. Both bulk and trait count follow tier. */
    var traitCount = opts.mini ? 1 + (tierIdx >= 3 ? 1 : 0)
      : U.clamp(1 + Math.floor(tierIdx / 2) + rng.int(0, 1), 1, 4);
    var traits = rng.sample(MD.BOSS_TRAITS, traitCount);

    var stats = statsFor(level, tierIdx, role);
    var bossMult = opts.mini
      ? { hp: 0.7 + tierIdx * 0.06, atk: 0.2, def: 0.15, mag: 0.2, res: 0.15, spd: 0.1, mp: 0.5 }
      : { hp: 1.05 + tierIdx * 0.14, atk: 0.3 + tierIdx * 0.05, def: 0.2 + tierIdx * 0.04,
        mag: 0.3 + tierIdx * 0.05, res: 0.2 + tierIdx * 0.04, spd: 0.2, mp: 1.0 };
    applyMods(stats, bossMult);
    traits.forEach(function (t) { if (t.mods) applyMods(stats, t.mods); });

    var title = rng.pick(MD.BOSS_TITLES);
    title = U.fill(title, { place: opts.placeName || 'the Deep' });
    var personal = Names.person(rng, opts.culture || (fam.kind === 'humanoid' ? 'orcish' : 'draconic'));
    var speciesName = fam.ladder[tierIdx];

    var passives = {};
    traits.forEach(function (t) {
      if (t.passive) U.assign(passives, t.passive);
    });

    return {
      id: 'named_' + fam.id + '_' + Math.floor(rng.next() * 1e9).toString(36),
      name: personal + ', ' + title,
      species: speciesName,
      familyId: fam.id,
      kind: fam.kind,
      role: opts.role || fam.role,
      roleName: role.name,
      tier: tierIdx + 1,
      level: level,
      element: element,
      elements: U.unique([element].concat(elements)).slice(0, 3),
      stats: stats,
      skills: pickSkills(rng, catalog, role, U.unique([element].concat(elements)),
        tierIdx + (opts.mini ? 0 : 1), opts.mini ? 3 : 5),
      traits: traits.map(function (t) { return { id: t.id, name: t.name, desc: t.desc }; }),
      passives: passives,
      resist: {}, weak: {},
      boss: !opts.mini,
      mini: !!opts.mini,
      named: !opts.mini,
      alive: true,
      bornYear: opts.year || 0,
      lastEvolvedYear: opts.year || 0,
      evolutions: 0,
      kills: 0,
      xp: Math.round((60 + level * 26) * (1 + tierIdx * 0.6) * (opts.mini ? 0.4 : 1)),
      gold: Math.round((60 + level * 22) * (1 + tierIdx * 0.5) * (opts.mini ? 0.35 : 1)),
      part: MD.MONSTER_PARTS[fam.kind] || 'Remains'
    };
  }

  /* World-sim hook: a boss left alone long enough climbs its family ladder. */
  function evolveNamed(rng, catalog, boss, params) {
    var fam = MD.FAMILY_BY_ID[boss.familyId];
    if (!fam) return null;
    var ceilingTier = U.clamp(Math.round(params.monsterCeiling * 0.62), 2, 6);
    if (boss.tier >= ceilingTier) return null;

    var oldName = boss.name;
    var oldSpecies = boss.species;
    boss.tier += 1;
    boss.evolutions += 1;
    boss.level = Math.round(boss.level * 1.35 + 6);
    boss.species = fam.ladder[boss.tier - 1];

    var role = MD.ROLES[boss.role];
    var stats = statsFor(boss.level, boss.tier - 1, role);
    var ti = boss.tier - 1;
    applyMods(stats, { hp: 1.05 + ti * 0.14, atk: 0.3 + ti * 0.05, def: 0.2 + ti * 0.04,
      mag: 0.3 + ti * 0.05, res: 0.2 + ti * 0.04, spd: 0.2, mp: 1.0 });
    boss.stats = stats;

    // Keep the personal name, update the epithet.
    var personal = oldName.split(',')[0];
    boss.name = personal + ', ' + U.fill(rng.pick(MD.BOSS_TITLES), { place: 'the Deep' });
    boss.skills = pickSkills(rng, catalog, role, boss.elements, boss.tier, 5 + Math.min(2, boss.evolutions));
    boss.xp = Math.round(boss.xp * 1.8);
    boss.gold = Math.round(boss.gold * 1.7);

    var newTrait = rng.pick(ISE.MonsterData.BOSS_TRAITS);
    if (!boss.traits.some(function (t) { return t.id === newTrait.id; })) {
      boss.traits.push({ id: newTrait.id, name: newTrait.name, desc: newTrait.desc });
      if (newTrait.mods) applyMods(boss.stats, newTrait.mods);
      if (newTrait.passive) U.assign(boss.passives, newTrait.passive);
    }

    return { from: oldSpecies, to: boss.species, name: boss.name, oldName: oldName };
  }

  /* Wild encounter table for a map tile. */
  function familiesForBiome(biomeId) {
    var out = MD.FAMILIES.filter(function (f) { return f.biomes.indexOf(biomeId) >= 0; });
    if (!out.length) out = MD.FAMILIES.filter(function (f) { return f.id === 'wolf' || f.id === 'insect'; });
    return out;
  }

  ISE.MonsterGen = {
    makeMonster: makeMonster,
    makeNamed: makeNamed,
    evolveNamed: evolveNamed,
    familiesForBiome: familiesForBiome,
    statsFor: statsFor,
    pickSkills: pickSkills
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
