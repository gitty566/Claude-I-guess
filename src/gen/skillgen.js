/* skillgen.js — builds the world's skill catalogue by crossing archetypes
 * (what a skill does) with elements (what it does it with), then chaining
 * each pair upward through the rarity tiers so mastering a Common skill can
 * genuinely evolve it into an Epic one.
 *
 * Output is a plain catalogue object; nothing here mutates global state. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, SD = ISE.SkillData;

  /* Resolve an archetype's element list into concrete element ids. */
  function elementsFor(arch) {
    if (arch.elements === 'all') return T.CORE_ELEMENTS.slice();
    if (Array.isArray(arch.elements)) {
      return arch.elements.filter(function (e) { return T.ELEMENT[e]; });
    }
    return T.CORE_ELEMENTS.slice();
  }

  /* Build a skill name from element lexicon + archetype + rarity tier.
   * `variant` lets the caller retry on a collision. */
  function nameSkill(elem, arch, tier, variant) {
    var lex = SD.LEXICON[elem] || SD.LEXICON.physical;
    var tw = SD.TIER_WORDS[tier] || SD.TIER_WORDS[1];
    var v = variant || 0;
    var noun = lex.noun[(tier - 1 + v) % lex.noun.length];
    var adj = lex.adj[(tier - 1 + v) % lex.adj.length];
    var grand = lex.grand[(tier + v) % lex.grand.length];
    var pre = tw.pre[v % tw.pre.length];
    var an = arch.name;

    var patterns;
    if (tier <= 2) {
      patterns = [noun + ' ' + an, adj + ' ' + an, an + ' of ' + noun];
    } else if (tier <= 4) {
      patterns = [pre + adj + ' ' + an, pre + noun + ' ' + an, an + ' of the ' + noun,
        adj + ' ' + noun + ' ' + an];
    } else {
      patterns = [pre + grand, grand + ': ' + an, pre + adj + ' ' + an,
        an + ' of ' + grand, grand + ' ' + an];
    }
    return patterns[(v + tier) % patterns.length].trim();
  }

  function describe(arch, elem, rarity) {
    var lex = SD.LEXICON[elem] || SD.LEXICON.physical;
    var base = U.fill(arch.desc || '', { elem: T.ELEMENT[elem].name.toLowerCase() });
    return base + ' (' + rarity.name + ' ' + T.ELEMENT[elem].name + ')';
  }

  /* Numeric build-out for one rung of a chain. */
  function buildSkill(arch, elem, rarityTier, chainId, chainIndex, params, name) {
    var rarity = T.rarityByTier(rarityTier);
    var el = T.ELEMENT[elem];
    var tierScale = rarity.power;

    var skill = {
      id: arch.id + '__' + elem + '__t' + rarityTier,
      name: name,
      arch: arch.id,
      element: elem,
      elementName: el.name,
      rarity: rarity.id,
      rarityTier: rarityTier,
      category: arch.category,
      target: arch.target,
      school: arch.school || 'magic',
      chain: chainId,
      chainIndex: chainIndex,
      power: Math.round((arch.power || 0) * tierScale),
      mp: Math.round((arch.mp || 0) * (0.75 + 0.35 * (rarityTier - 1))),
      cooldown: (arch.cd || 0) + (rarityTier >= 5 && arch.cd > 0 ? 1 : 0),
      hits: arch.hits || 1,
      pierce: arch.pierce || 0,
      drain: arch.drain || 0,
      critBonus: arch.critBonus || 0,
      executeBonus: arch.executeBonus || 0,
      status: arch.status || null,
      statusChance: arch.status ? Math.min(0.98, (arch.statusChance || 0.5) + 0.05 * (rarityTier - 1)) : 0,
      statusTurns: arch.status ? 2 + Math.floor(rarityTier / 2) : 0,
      statusOnAlly: !!arch.statusOnAlly,
      passive: null,
      utility: arch.utility || null,
      desc: describe(arch, elem, rarity),
      acquisition: null,
      masteryRate: 1,
      scarcity: 1,
      evolvesTo: null,
      evolvesFrom: null,
      evolveReq: null,
      unique: false
    };

    if (arch.passive) {
      skill.passive = U.clone(arch.passive);
      // Passives scale their magnitude with rarity rather than "power".
      var pm = 0.65 + 0.35 * rarityTier;
      if (skill.passive.resist) skill.passive.resist = U.round(skill.passive.resist * pm, 3);
      if (skill.passive.elemPower) skill.passive.elemPower = U.round(skill.passive.elemPower * pm, 3);
      if (skill.passive.regen) skill.passive.regen = U.round(skill.passive.regen * pm, 4);
      if (skill.passive.evade) skill.passive.evade = U.round(skill.passive.evade * pm, 3);
      if (skill.passive.costCut) skill.passive.costCut = U.round(skill.passive.costCut * pm, 3);
      if (skill.passive.stats) {
        for (var k in skill.passive.stats) {
          skill.passive.stats[k] = U.round(skill.passive.stats[k] * pm, 3);
        }
      }
    }

    /* Magic density tunes how fast mastery accrues and how scarce the skill
     * is out in the world. A low-density world makes rare skills a slog. */
    var density = params.magicDensity;
    skill.masteryRate = U.round((1 / rarity.masteryCost) * (0.55 + density * 0.95), 3);
    skill.scarcity = U.round(Math.pow(rarityTier, 1.6) * (1.55 - density * 0.9), 2);

    var acq = rarity.acquisition;
    skill.acquisition = acq[(rarityTier + arch.id.length) % acq.length];
    return skill;
  }

  /* One chain = one (archetype, element) pair walked up the rarity ladder. */
  function buildChain(arch, elem, params, taken) {
    var chainId = arch.id + '__' + elem;
    var startTier = arch.baseTier || 1;
    var len = arch.chain || 1;

    /* Dense-magic worlds push lines one rung higher; sparse worlds cut the
     * top off, so a low-magic world genuinely has fewer high-tier options. */
    if (params.magicDensity >= 0.72) len += 1;
    else if (params.magicDensity <= 0.28 && len > 1) len -= 1;

    var out = [];
    for (var i = 0; i < len; i++) {
      var tier = startTier + i;
      if (tier > 6) break;
      // Mythical is reserved for world-unique skills.
      if (tier >= 6) break;
      var variant = 0, name = nameSkill(elem, arch, tier, 0);
      while (taken[name] && variant < 12) {
        variant++;
        name = nameSkill(elem, arch, tier, variant);
      }
      if (taken[name]) name = name + ' ' + U.roman(tier);
      taken[name] = true;
      out.push(buildSkill(arch, elem, tier, chainId, i, params, name));
    }

    for (var j = 0; j < out.length - 1; j++) {
      var lo = out[j], hi = out[j + 1];
      lo.evolvesTo = hi.id;
      hi.evolvesFrom = lo.id;
      hi.evolveReq = {
        mastery: 60 + 5 * lo.rarityTier,
        level: 4 + 6 * hi.rarityTier
      };
      // Higher rungs also want breadth in the same element.
      if (hi.rarityTier >= 4) {
        hi.evolveReq.elementSkills = { element: elem, n: 2, min: 40 };
      }
    }
    return out;
  }

  /* Apex skills: the forms in the race trees reference mythic shapes that
   * are not ordinary archetypes. Each referenced (shape, element) becomes a
   * Legendary skill granted by evolution. */
  function buildApexSkills(refs, params) {
    var out = [];
    var shapes = {};
    SD.MYTHIC_SHAPES.forEach(function (s) { shapes[s.id] = s; });

    refs.forEach(function (ref) {
      var shape = shapes[ref.arch];
      if (!shape) return;
      var elem = T.ELEMENT[ref.elem] ? ref.elem : 'unique';
      var id = 'apex__' + shape.id + '__' + elem;
      if (out.some(function (s) { return s.id === id; })) return;
      var lex = SD.LEXICON[elem] || SD.LEXICON.unique;
      var eff = shape.effect || {};
      out.push({
        id: id,
        name: shape.name + (elem === 'unique' ? '' : ' [' + T.ELEMENT[elem].name + ']'),
        arch: shape.id,
        element: elem,
        elementName: T.ELEMENT[elem].name,
        rarity: 'legendary',
        rarityTier: 5,
        category: shape.category,
        target: shape.target,
        school: 'magic',
        chain: 'apex__' + shape.id,
        chainIndex: 0,
        power: eff.power || 0,
        mp: shape.category === 'passive' ? 0 : 30,
        cooldown: shape.category === 'passive' ? 0 : 4,
        hits: 1,
        pierce: eff.pierce || 0,
        drain: eff.drain || 0,
        critBonus: eff.critBonus || 0,
        executeBonus: eff.executeBonus || 0,
        trueDamage: eff.trueDamage || 0,
        healPct: eff.healPct || 0,
        status: eff.status || null,
        statusChance: eff.statusChance || 0,
        statusTurns: 3,
        statusOnAlly: shape.target === 'all_allies' || shape.target === 'ally',
        passive: shape.category === 'passive' ? U.clone(eff) : null,
        utility: null,
        desc: shape.desc + ' Granted by attaining a rare form. It ' + lex.verb + ' what it touches.',
        acquisition: 'evolution',
        masteryRate: U.round(0.28 * (0.55 + params.magicDensity * 0.95), 3),
        scarcity: 40,
        evolvesTo: null, evolvesFrom: null, evolveReq: null,
        unique: false, apex: true
      });
    });
    return out;
  }

  /* World-unique Mythical skills. Called by the relic/legend generators so
   * each one is genuinely tied to something in the world's history. */
  function makeUniqueSkill(rng, opts) {
    var shape = rng.pick(SD.MYTHIC_SHAPES);
    var elem = opts.element || rng.pick(T.CORE_ELEMENTS);
    var eff = shape.effect || {};
    var lex = SD.LEXICON[elem] || SD.LEXICON.unique;
    var titles = [
      shape.name,
      lex.grand[rng.int(0, lex.grand.length - 1)],
      lex.adj[rng.int(0, lex.adj.length - 1)] + ' ' + shape.name
    ];
    var name = opts.name || rng.pick(titles);
    return {
      id: 'unique__' + (opts.idHint || shape.id) + '__' + Math.floor(rng.next() * 1e9).toString(36),
      name: name,
      arch: shape.id,
      element: elem,
      elementName: T.ELEMENT[elem].name,
      rarity: 'mythical',
      rarityTier: 6,
      category: shape.category,
      target: shape.target,
      school: 'magic',
      chain: null, chainIndex: 0,
      power: Math.round((eff.power || 0) * 1.35),
      mp: shape.category === 'passive' ? 0 : 45,
      cooldown: shape.category === 'passive' ? 0 : 5,
      hits: 1,
      pierce: eff.pierce || 0,
      drain: eff.drain || 0,
      critBonus: eff.critBonus || 0,
      executeBonus: eff.executeBonus || 0,
      trueDamage: eff.trueDamage || 0,
      healPct: eff.healPct || 0,
      status: eff.status || null,
      statusChance: eff.statusChance || 0,
      statusTurns: 4,
      statusOnAlly: shape.target === 'all_allies' || shape.target === 'ally',
      passive: shape.category === 'passive' ? U.clone(eff) : null,
      utility: null,
      desc: shape.desc,
      acquisition: 'unique_legend',
      masteryRate: 0.22,
      scarcity: 999,
      evolvesTo: null, evolvesFrom: null, evolveReq: null,
      unique: true,
      origin: opts.origin || null
    };
  }

  /* ------------------------------------------------------------- public */
  function generateCatalog(rng, params, apexRefs) {
    var taken = {};
    var list = [];
    var archRng = rng.fork('skills');

    SD.ARCHETYPES.forEach(function (arch) {
      var elems = elementsFor(arch);
      elems.forEach(function (elem) {
        var chain = buildChain(arch, elem, params, taken);
        for (var i = 0; i < chain.length; i++) list.push(chain[i]);
      });
    });

    var apex = buildApexSkills(apexRefs || [], params);
    for (var i = 0; i < apex.length; i++) list.push(apex[i]);

    var byId = {};
    var byElement = {};
    var byRarity = {};
    var byArch = {};
    list.forEach(function (s) {
      byId[s.id] = s;
      (byElement[s.element] = byElement[s.element] || []).push(s);
      (byRarity[s.rarity] = byRarity[s.rarity] || []).push(s);
      (byArch[s.arch] = byArch[s.arch] || []).push(s);
    });

    return {
      list: list,
      byId: byId,
      byElement: byElement,
      byRarity: byRarity,
      byArch: byArch,
      count: list.length,
      /* Look up the catalogue entry for an (archetype, element) at the
       * lowest available tier — how race innates get resolved. */
      find: function (archId, elem, minTier) {
        var pool = byArch[archId] || [];
        var best = null;
        for (var i = 0; i < pool.length; i++) {
          var s = pool[i];
          if (elem && s.element !== elem) continue;
          if (minTier && s.rarityTier < minTier) continue;
          if (!best || s.rarityTier < best.rarityTier) best = s;
        }
        if (!best && elem) return this.find(archId, null, minTier);
        return best;
      },
      addUnique: function (skill) {
        list.push(skill);
        byId[skill.id] = skill;
        (byElement[skill.element] = byElement[skill.element] || []).push(skill);
        (byRarity[skill.rarity] = byRarity[skill.rarity] || []).push(skill);
        (byArch[skill.arch] = byArch[skill.arch] || []).push(skill);
        this.count = list.length;
        return skill;
      },
      rngSeed: archRng.seed
    };
  }

  ISE.SkillGen = {
    generateCatalog: generateCatalog,
    makeUniqueSkill: makeUniqueSkill,
    nameSkill: nameSkill
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
