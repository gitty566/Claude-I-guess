/* racegen.js — turns the base race templates into this world's race set.
 *
 * Three things happen here:
 *  1. Trees are pruned (or kept deep) according to the world's monster power
 *     ceiling. A low-ceiling world's goblins stop at Hobgoblin; a high one
 *     runs all the way to Goblin Emperor.
 *  2. Nodes flagged `elemental` fan out into one branch per element that
 *     actually exists in this world's geography — so a world with no volcano
 *     never grows Fire Slimes.
 *  3. Two or three races are invented from scratch, tied to the genesis
 *     event, with procedurally generated trees.
 */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, RD = ISE.RaceData, Names = ISE.Names;

  /* Evolution depth allowed by the world's monster power ceiling (1..10). */
  function maxTierFor(ceiling) {
    return U.clamp(Math.round(1.5 + ceiling * 0.5), 2, 6);
  }

  /* How many sibling branches survive at a given ceiling. */
  function branchBudget(ceiling, rng) {
    if (ceiling <= 2) return 1;
    if (ceiling <= 4) return rng.int(1, 2);
    if (ceiling <= 7) return rng.int(2, 3);
    return 3;
  }

  var ELEM_FORM_PREFIX = {
    fire: 'Ember', ice: 'Frost', lightning: 'Storm', earth: 'Stone', wind: 'Gale',
    water: 'Tide', light: 'Radiant', shadow: 'Umbral', physical: 'Iron',
    energy: 'Aether', psychic: 'Dream', biological: 'Verdant', chaos: 'Warped',
    order: 'Sigil'
  };

  /* Biomes whose element matches, used to gate elemental forms. */
  function biomesForElement(elem, availableBiomes) {
    var out = [];
    for (var b in T.BIOME_ELEMENT) {
      if (T.BIOME_ELEMENT[b] === elem && availableBiomes[b]) out.push(b);
    }
    return out;
  }

  /* Replace ELEM placeholders in an innate list. */
  function resolveInnate(list, elem) {
    if (!list) return [];
    return list.map(function (i) {
      return { arch: i.arch, elem: i.elem === 'ELEM' ? elem : i.elem };
    });
  }

  function cloneNode(node) {
    var n = {
      id: node.id, name: node.name, tier: node.tier,
      mult: node.mult || 1, req: node.req ? U.clone(node.req) : {},
      innate: node.innate ? U.clone(node.innate) : [],
      desc: node.desc || '', mythical: !!node.mythical,
      elemental: !!node.elemental,
      branches: []
    };
    return n;
  }

  /* Deep-copy a template subtree, applying pruning, elemental fan-out and
   * ELEM substitution. Returns an array because an elemental node expands
   * into several siblings. */
  function processNode(node, ctx, inheritedElem) {
    if (node.tier > ctx.maxTier) return [];

    if (node.elemental && !inheritedElem) {
      var elems = ctx.worldElements.slice();
      ctx.rng.shuffle(elems);
      var keep = U.clamp(ctx.ceiling >= 7 ? 5 : (ctx.ceiling >= 4 ? 3 : 2), 1, elems.length);
      var out = [];
      for (var i = 0; i < keep; i++) {
        var elem = elems[i];
        var variant = cloneNode(node);
        variant.id = node.id + '_' + elem;
        variant.name = (ELEM_FORM_PREFIX[elem] || U.capitalize(elem)) + ' ' +
          node.name.replace(/^Elemental\s+/, '').replace(/^Elemental$/, 'Elemental');
        variant.elementForm = elem;
        variant.innate = resolveInnate(node.innate, elem);
        var gate = biomesForElement(elem, ctx.availableBiomes);
        variant.req = U.assign({}, node.req);
        if (gate.length) variant.req.biome = gate;
        variant.desc = node.desc + ' Shaped by ' + T.ELEMENT[elem].name.toLowerCase() + '.';
        variant.branches = processChildren(node.branches, ctx, elem);
        out.push(variant);
      }
      return out;
    }

    var n = cloneNode(node);
    if (inheritedElem) {
      n.id = node.id + '_' + inheritedElem;
      n.elementForm = inheritedElem;
      n.innate = resolveInnate(node.innate, inheritedElem);
      if (node.name.indexOf('{ELEM}') >= 0) {
        n.name = node.name.replace('{ELEM}', ELEM_FORM_PREFIX[inheritedElem]);
      }
    }
    n.branches = processChildren(node.branches, ctx, inheritedElem);
    return [n];
  }

  function processChildren(branches, ctx, inheritedElem) {
    if (!branches || !branches.length) return [];
    var expanded = [];
    for (var i = 0; i < branches.length; i++) {
      var res = processNode(branches[i], ctx, inheritedElem);
      for (var j = 0; j < res.length; j++) expanded.push(res[j]);
    }
    if (!expanded.length) return [];
    var budget = branchBudget(ctx.ceiling, ctx.rng);
    if (expanded.length > budget) {
      // Keep the mythical paths preferentially, then trim at random.
      expanded.sort(function (a, b) { return (b.mythical ? 1 : 0) - (a.mythical ? 1 : 0); });
      var kept = expanded.slice(0, budget);
      expanded = kept;
    }
    return expanded;
  }

  /* ------------------------------------------------- procedural genesis race */
  var TIER_TITLES = {
    2: ['Awakened {N}', 'Risen {N}', 'Elder {N}', 'True {N}'],
    3: ['{N} Adept', '{N} Warden', '{N} Champion', '{N} Sage'],
    4: ['{N} Lord', '{N} Archon', 'Greater {N}', '{N} Tyrant'],
    5: ['{N} Sovereign', 'Primordial {N}', '{N} Paragon'],
    6: ['{N} Absolute', 'The First {N}', '{N} Apotheosis']
  };

  var ARCH_BY_ROLE = {
    aggressive: ['slash', 'crush', 'nova', 'execute', 'sweep'],
    arcane: ['bolt', 'storm', 'mastery', 'mind', 'ray'],
    resilient: ['ward', 'body', 'barrier', 'regeneration', 'shatter'],
    cunning: ['veil', 'venom', 'instinct', 'hex', 'drain']
  };

  function buildProceduralTree(rng, race, maxTier, elements) {
    var baseName = race.shortName || race.name;
    var root = {
      id: race.id, name: race.name, tier: 1, mult: 1, req: {}, innate: [],
      desc: race.desc, branches: []
    };

    function grow(parent, tier) {
      if (tier > maxTier) return;
      var count = tier === 2 ? rng.int(2, 3) : (tier >= 5 ? 1 : rng.int(1, 2));
      for (var i = 0; i < count; i++) {
        var role = rng.pick(Object.keys(ARCH_BY_ROLE));
        var elem = rng.pick(elements);
        var titlePool = TIER_TITLES[tier] || TIER_TITLES[6];
        var name = U.fill(rng.pick(titlePool), { N: baseName });
        var node = {
          id: race.id + '_t' + tier + '_' + i,
          name: name,
          tier: tier,
          mult: [1, 1, 1.55, 2.35, 3.25, 4.5, 6.3][tier] || 1,
          req: {
            level: 6 + 12 * (tier - 2) + rng.int(0, 4),
            kills: tier >= 3 ? 40 * (tier - 2) * (tier - 1) : 20
          },
          innate: [
            { arch: rng.pick(ARCH_BY_ROLE[role]), elem: elem },
            { arch: rng.pick(ARCH_BY_ROLE[role]), elem: rng.pick(elements) }
          ],
          desc: '',
          branches: []
        };
        if (tier >= 5) node.req.named = true;
        if (tier >= 4 && rng.chance(0.5)) node.req.catalyst = rng.pick(Object.keys(RD.CATALYSTS));
        if (tier === 3 && rng.chance(0.5)) {
          node.req.masteredCount = { n: 4 + tier, min: 40 + 5 * tier };
        }
        if (tier >= 6) node.mythical = true;
        node.desc = 'A form reached by ' + (role === 'aggressive' ? 'unrelenting violence'
          : role === 'arcane' ? 'deep study of ' + T.ELEMENT[elem].name.toLowerCase()
            : role === 'resilient' ? 'surviving what should have killed it'
              : 'patience and a great deal of lying') + '.';
        parent.branches.push(node);
        grow(node, tier + 1);
      }
    }

    grow(root, 2);
    return root;
  }

  function makeGenesisRaces(rng, params, genesis, availableBiomes) {
    var count = rng.int(2, 3);
    var templates = rng.sample(RD.GENESIS_RACE_TEMPLATES, count);
    var maxTier = maxTierFor(params.monsterCeiling);
    var out = [];

    for (var i = 0; i < templates.length; i++) {
      var tpl = templates[i];
      var elem = genesis.elements[i % genesis.elements.length];
      var kin = rng.pick(RD.KIN_WORDS);
      var name = U.fill(tpl.nameTpl, {
        Elem: (ELEM_FORM_PREFIX[elem] || U.capitalize(elem)),
        Kin: U.capitalize(kin)
      });
      var id = 'genesis_' + tpl.id + '_' + i;
      var biomes = tpl.biomes.filter(function (b) { return availableBiomes[b]; });
      if (!biomes.length) biomes = tpl.biomes.slice(0, 2);

      var race = {
        id: id,
        name: name,
        shortName: name.split(' ').pop(),
        culture: tpl.culture,
        playable: true,
        unique: true,
        biomes: biomes,
        stats: U.clone(tpl.stats),
        growth: U.clone(tpl.growth),
        affinity: [elem],
        resist: {}, weak: {},
        traits: tpl.traits.slice(),
        innate: [{ arch: 'bolt', elem: elem }, { arch: 'affinity', elem: elem }],
        learnRate: tpl.learnRate,
        desc: U.fill(tpl.originTpl, { event: genesis.name, elem: T.ELEMENT[elem].name.toLowerCase() }),
        origin: genesis.name
      };
      race.resist[elem] = 0.3;
      var opp = { fire: 'water', water: 'lightning', ice: 'fire', lightning: 'earth',
        earth: 'wind', wind: 'lightning', light: 'shadow', shadow: 'light',
        physical: 'energy', energy: 'physical', psychic: 'chaos', biological: 'fire',
        chaos: 'order', order: 'chaos' }[elem];
      if (opp) race.weak[opp] = 0.25;

      var elems = U.unique([elem, rng.pick(T.CORE_ELEMENTS), rng.pick(T.CORE_ELEMENTS)]);
      race.tree = buildProceduralTree(rng.fork('genesis_tree_' + i), race, maxTier, elems);
      out.push(race);
    }
    return out;
  }

  /* ------------------------------------------------------------- flatten */
  function flattenTree(root, raceId) {
    var byId = {};
    var list = [];
    (function walk(node, parent, depth) {
      node.raceId = raceId;
      node.parentId = parent ? parent.id : null;
      node.depth = depth;
      byId[node.id] = node;
      list.push(node);
      for (var i = 0; i < node.branches.length; i++) walk(node.branches[i], node, depth + 1);
    })(root, null, 0);
    return { byId: byId, list: list };
  }

  /* Walk every tree collecting innate refs whose archetype is a mythic
   * shape, so skillgen can mint the matching apex skills. */
  function collectApexRefs(races) {
    var SD = ISE.SkillData;
    var archIds = {};
    SD.ARCHETYPES.forEach(function (a) { archIds[a.id] = true; });
    var refs = [], seen = {};
    races.forEach(function (race) {
      race.nodes.list.forEach(function (node) {
        (node.innate || []).forEach(function (inn) {
          if (archIds[inn.arch]) return;
          var key = inn.arch + '|' + inn.elem;
          if (seen[key]) return;
          seen[key] = true;
          refs.push({ arch: inn.arch, elem: inn.elem });
        });
      });
      (race.innate || []).forEach(function (inn) {
        if (archIds[inn.arch]) return;
        var key = inn.arch + '|' + inn.elem;
        if (seen[key]) return;
        seen[key] = true;
        refs.push({ arch: inn.arch, elem: inn.elem });
      });
    });
    return refs;
  }

  function generateRaces(rng, params, genesis, availableBiomes) {
    var maxTier = maxTierFor(params.monsterCeiling);
    var worldElements = [];
    for (var b in availableBiomes) {
      if (availableBiomes[b] && T.BIOME_ELEMENT[b]) worldElements.push(T.BIOME_ELEMENT[b]);
    }
    worldElements = U.unique(worldElements);
    if (worldElements.length < 3) worldElements = ['fire', 'ice', 'earth', 'water'];

    var races = [];
    RD.BASE_RACES.forEach(function (base, idx) {
      var ctx = {
        rng: rng.fork('race_' + base.id),
        maxTier: maxTier,
        ceiling: params.monsterCeiling,
        worldElements: worldElements,
        availableBiomes: availableBiomes
      };
      var race = {
        id: base.id, name: base.name, culture: base.culture,
        playable: base.playable !== false,
        biomes: base.biomes.slice(),
        stats: U.clone(base.stats), growth: U.clone(base.growth),
        affinity: base.affinity.slice(),
        resist: U.clone(base.resist || {}), weak: U.clone(base.weak || {}),
        traits: base.traits.slice(),
        innate: U.clone(base.innate),
        learnRate: base.learnRate,
        desc: base.desc,
        unique: false
      };
      var processed = processNode(base.tree, ctx, null);
      race.tree = processed[0] || cloneNode(base.tree);
      race.nodes = flattenTree(race.tree, race.id);
      race.maxTier = U.maxBy(race.nodes.list, function (n) { return n.tier; }).tier;
      races.push(race);
    });

    var genRaces = makeGenesisRaces(rng.fork('genesis_races'), params, genesis, availableBiomes);
    genRaces.forEach(function (r) {
      r.nodes = flattenTree(r.tree, r.id);
      r.maxTier = U.maxBy(r.nodes.list, function (n) { return n.tier; }).tier;
      races.push(r);
    });

    var byId = {};
    races.forEach(function (r) { byId[r.id] = r; });

    return {
      list: races,
      byId: byId,
      maxTier: maxTier,
      apexRefs: collectApexRefs(races),
      /* Every evolution node in the world, for the codex screen. */
      allNodes: function () {
        var out = [];
        races.forEach(function (r) {
          r.nodes.list.forEach(function (n) { out.push(n); });
        });
        return out;
      }
    };
  }

  ISE.RaceGen = {
    generateRaces: generateRaces,
    maxTierFor: maxTierFor,
    ELEM_FORM_PREFIX: ELEM_FORM_PREFIX
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
