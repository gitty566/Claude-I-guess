/* itemgen.js — procedural equipment (base + material + affixes, tier-gated)
 * and the relic forge used by the history simulation.
 *
 * Ordinary gear is rolled. Relics are *not* rolled the same way: they are
 * one-of-a-kind, carry a fixed effect, and remember who made them and why. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, ID = ISE.ItemData, Names = ISE.Names;

  function materialsForTier(tier) {
    var out = ID.MATERIALS.filter(function (m) { return m.tier <= tier && m.tier >= tier - 1; });
    if (!out.length) out = ID.MATERIALS.filter(function (m) { return m.tier <= tier; });
    if (!out.length) out = [ID.MATERIALS[0]];
    return out;
  }

  /* Rarity determines how many affixes an item carries. */
  function affixCount(rarityTier) {
    return [0, 0, 1, 2, 3, 4, 5][rarityTier] || 0;
  }

  function scaleStats(stats, mult) {
    var out = {};
    for (var k in stats) {
      var v = stats[k] * mult;
      out[k] = Math.abs(v) < 1 ? Math.round(v * 10) / 10 : Math.round(v);
    }
    return out;
  }

  function mergeStats(target, add) {
    for (var k in add) target[k] = (target[k] || 0) + add[k];
    return target;
  }

  function rollItem(rng, opts) {
    opts = opts || {};
    var tier = U.clamp(opts.tier || 1, 1, 6);
    var rarityTier = opts.rarityTier || tier;
    var rarity = T.rarityByTier(rarityTier);

    var pool = ID.BASES;
    if (opts.slot) pool = pool.filter(function (b) { return b.slot === opts.slot; });
    if (opts.school) {
      var filtered = pool.filter(function (b) { return !b.school || b.school === opts.school; });
      if (filtered.length) pool = filtered;
    }
    if (!pool.length) pool = ID.BASES;
    var base = opts.base || rng.pick(pool);

    var mat = rng.pick(materialsForTier(tier));
    var quality = rng.range(0.85, 1.2);
    /* Tier and rarity both raise an item's numbers, and the material is
     * already chosen from the tier — folding all three in multiplicatively
     * made two tiers of gear worth more than twenty levels of character
     * growth. Material now colours the name and the price, not the stats. */
    var mult = (1 + (tier - 1) * 0.55) * (1 + (rarityTier - 1) * 0.4) * 1.15 * quality;

    var stats = scaleStats(base.stats, mult * (base.scale || 1));
    var extras = {};
    var affixNames = { pre: null, suf: null };
    var count = affixCount(rarityTier);

    var prefixes = ID.PREFIXES.filter(function (a) { return a.minTier <= tier; });
    var suffixes = ID.SUFFIXES.filter(function (a) { return a.minTier <= tier; });

    for (var i = 0; i < count; i++) {
      var usePrefix = (i % 2 === 0) ? !affixNames.pre : false;
      var affix;
      if (usePrefix && prefixes.length) {
        affix = rng.pick(prefixes);
        affixNames.pre = affix.name;
      } else if (suffixes.length) {
        affix = rng.pick(suffixes);
        if (!affixNames.suf) affixNames.suf = affix.name;
      } else continue;

      var am = (0.6 + tier * 0.35) * rng.range(0.8, 1.2);
      if (affix.stats) mergeStats(stats, scaleStats(affix.stats, am));
      if (affix.crit) extras.crit = U.round((extras.crit || 0) + affix.crit, 3);
      if (affix.lifesteal) extras.lifesteal = U.round((extras.lifesteal || 0) + affix.lifesteal, 3);
      if (affix.thorns) extras.thorns = U.round((extras.thorns || 0) + affix.thorns, 3);
      if (affix.pierce) extras.pierce = U.round((extras.pierce || 0) + affix.pierce, 3);
      if (affix.costCut) extras.costCut = U.round((extras.costCut || 0) + affix.costCut, 3);
      if (affix.elemPower && affix.element) {
        extras.elemPower = extras.elemPower || {};
        extras.elemPower[affix.element] =
          U.round((extras.elemPower[affix.element] || 0) + affix.elemPower * (0.6 + tier * 0.3), 3);
      }
    }

    var name = (affixNames.pre ? affixNames.pre + ' ' : '') + mat.name + ' ' + base.name +
      (affixNames.suf ? ' ' + affixNames.suf : '');

    var value = 0;
    for (var sk in stats) value += Math.abs(stats[sk]) * (sk === 'hp' || sk === 'mp' ? 1.1 : 5);
    value = Math.round(value * (0.7 + rarity.valueMult * 0.22) * mat.mult + tier * 40);

    return {
      id: 'item_' + Math.floor(rng.next() * 1e12).toString(36),
      kind: 'equipment',
      name: name,
      baseId: base.id,
      baseName: base.name,
      slot: base.slot,
      hands: base.hands || 1,
      school: base.school || null,
      material: mat.id,
      tier: tier,
      rarity: rarity.id,
      rarityTier: rarityTier,
      stats: stats,
      extras: extras,
      value: value,
      relic: false,
      desc: rarity.name + ' ' + base.name.toLowerCase() + ' of ' + mat.name.toLowerCase() + ' make.'
    };
  }

  function makeConsumable(rng, tier) {
    var pool = ID.CONSUMABLES.filter(function (c) { return c.tier <= Math.max(1, tier); });
    if (!pool.length) pool = [ID.CONSUMABLES[0]];
    var c = rng.pick(pool);
    return {
      id: 'cons_' + c.id + '_' + Math.floor(rng.next() * 1e9).toString(36),
      kind: 'consumable',
      consumableId: c.id,
      name: c.name,
      effect: c.kind,
      power: c.power || 0,
      status: c.status || null,
      value: c.price,
      tier: c.tier,
      rarity: T.rarityByTier(Math.min(6, c.tier)).id,
      stackable: true,
      desc: describeConsumable(c)
    };
  }

  function describeConsumable(c) {
    switch (c.kind) {
      case 'heal': return 'Restores ' + c.power + ' health.';
      case 'mp': return 'Restores ' + c.power + ' magicules.';
      case 'cleanse': return 'Clears afflictions.';
      case 'flee': return 'Guarantees escape from a fight.';
      case 'buff': return 'Applies ' + (T.STATUSES[c.status] ? T.STATUSES[c.status].name : c.status) + '.';
      case 'revive': return 'Revives a fallen ally at ' + Math.round(c.power * 100) + '% health.';
      default: return 'A useful thing.';
    }
  }

  function makeCatalyst(rng, id) {
    var RD = ISE.RaceData;
    var keys = Object.keys(RD.CATALYSTS);
    var key = id || rng.pick(keys);
    var c = RD.CATALYSTS[key];
    return {
      id: 'cat_' + key + '_' + Math.floor(rng.next() * 1e9).toString(36),
      kind: 'catalyst',
      catalyst: key,
      name: c.name,
      value: 400 * c.tier,
      tier: c.tier,
      rarity: T.rarityByTier(Math.min(6, c.tier + 1)).id,
      desc: c.desc + ' Consuming it can unlock an evolution.'
    };
  }

  function makeSkillOrb(rng, skill) {
    return {
      id: 'orb_' + skill.id + '_' + Math.floor(rng.next() * 1e9).toString(36),
      kind: 'skill_orb',
      skillId: skill.id,
      name: 'Skill Orb: ' + skill.name,
      value: Math.round(200 * Math.pow(skill.rarityTier, 2.1)),
      tier: skill.rarityTier,
      rarity: skill.rarity,
      desc: 'Consume to learn ' + skill.name + '. ' + skill.desc
    };
  }

  function makeMaterial(rng, name, tier) {
    return {
      id: 'mat_' + name.toLowerCase().replace(/\W+/g, '_') + '_' + Math.floor(rng.next() * 1e9).toString(36),
      kind: 'material',
      name: name,
      value: Math.round(20 * Math.pow(tier || 1, 1.8)),
      tier: tier || 1,
      rarity: T.rarityByTier(Math.min(6, tier || 1)).id,
      stackable: true,
      desc: 'Crafting material. Sells well in the right town.'
    };
  }

  /* ------------------------------------------------------------- relics */
  var RELIC_ORIGINS = [
    { id: 'war', tpl: 'Forged during {war} to break a siege that would not break.' },
    { id: 'grief', tpl: 'Made by {smith} in the year after {loss}. It was never meant to be used twice.' },
    { id: 'pact', tpl: 'Sealed as the physical half of a pact between {a} and something that did not sign.' },
    { id: 'hunt', tpl: 'Cut from the corpse of {monster} and cooled in the same river that carried it away.' },
    { id: 'ascension', tpl: 'The by-product of {hero}\'s evolution. What was shed did not stop being powerful.' },
    { id: 'accident', tpl: 'Nobody meant to make this. {smith} was trying to make something else.' },
    { id: 'tribute', tpl: 'Commissioned by {a} as tribute, and refused by the recipient for reasons nobody recorded.' },
    { id: 'prophecy', tpl: 'Made to satisfy a prophecy, which it did, in the worst available way.' }
  ];

  function forgeRelic(rng, opts) {
    var slotPool = ['weapon', 'armor', 'accessory', 'artifact'];
    var slotKind = opts.slotKind || rng.pick(slotPool);
    var slot = slotKind === 'armor' ? (rng.chance(0.5) ? 'body' : 'head')
      : slotKind === 'artifact' ? 'accessory' : slotKind;

    var tier = U.clamp(opts.tier || rng.int(3, 5), 2, 6);
    var effectDef = rng.pick(ID.RELIC_EFFECTS);
    var effect = effectDef.roll(tier);
    var element = opts.element || rng.pick(T.CORE_ELEMENTS);
    if (effect.needsElement) effect.element = element;

    var name = opts.name || Names.relic(rng, slotKind === 'armor' ? 'armor' : slotKind);
    var stats = {};
    var statPool = slotKind === 'weapon' ? ['atk', 'mag', 'spd', 'lck']
      : slotKind === 'armor' ? ['hp', 'def', 'res']
        : ['mp', 'mag', 'res', 'lck', 'spd'];
    var picks = rng.sample(statPool, Math.min(3, statPool.length));
    picks.forEach(function (s) {
      var mag = (s === 'hp') ? 45 * tier : (s === 'mp' ? 25 * tier : 7 * tier);
      stats[s] = Math.round(mag * rng.range(0.85, 1.3));
    });
    if (effect.allStats) {
      T.STAT_IDS.forEach(function (s) {
        if (s === 'hp' || s === 'mp') return;
        stats[s] = (stats[s] || 0) + Math.round(5 * tier * effect.allStats * 10) / 10;
      });
    }

    var originDef = rng.pick(RELIC_ORIGINS);
    var backstory = U.fill(originDef.tpl, opts.tokens || {});

    return {
      id: 'relic_' + Math.floor(rng.next() * 1e12).toString(36),
      kind: 'equipment',
      relic: true,
      name: name,
      slot: slot,
      slotKind: slotKind,
      baseName: U.capitalize(slotKind),
      tier: tier,
      rarity: tier >= 5 ? 'mythical' : 'legendary',
      rarityTier: tier >= 5 ? 6 : 5,
      stats: stats,
      extras: {},
      effect: effect,
      effectId: effectDef.id,
      effectName: effectDef.name,
      effectText: U.fill(effectDef.tpl, {
        v: describeMagnitude(effect),
        elem: T.ELEMENT[element] ? T.ELEMENT[element].name : 'elemental',
        skill: opts.grantedSkillName || 'a bound skill'
      }),
      element: element,
      forgedYear: opts.year || 0,
      forgedBy: opts.smith || 'unknown hands',
      origin: originDef.id,
      backstory: backstory,
      owner: null,
      ownerType: null,
      locationId: null,
      history: [],
      value: 5000 * tier,
      desc: backstory
    };
  }

  function describeMagnitude(effect) {
    if (effect.elemPower !== undefined) return U.pct(effect.elemPower);
    if (effect.reviveOnce !== undefined) return U.pct(effect.reviveOnce);
    if (effect.lifesteal !== undefined) return U.pct(effect.lifesteal);
    if (effect.damageTaken !== undefined) return U.pct(-effect.damageTaken);
    if (effect.allStats !== undefined) return U.pct(effect.allStats);
    if (effect.diplomacy !== undefined) return '+' + effect.diplomacy;
    if (effect.stats && effect.stats.spd !== undefined) return U.pct(effect.stats.spd);
    if (effect.costCut !== undefined) return U.pct(effect.costCut);
    if (effect.crit !== undefined) return U.pct(effect.crit);
    if (effect.armyPower !== undefined) return U.pct(effect.armyPower);
    if (effect.masteryRate !== undefined) return U.pct(effect.masteryRate);
    return 'a great deal';
  }

  /* Loot for clearing something. Returns {gold, items[]}. */
  function rollLoot(rng, catalog, opts) {
    var tier = U.clamp(opts.tier || 1, 1, 6);
    var luck = opts.luck || 0;
    var items = [];
    var count = opts.count !== undefined ? opts.count : (1 + rng.int(0, 1 + Math.floor(tier / 2)));

    for (var i = 0; i < count; i++) {
      var roll = rng.next() + luck * 0.001;
      if (roll < 0.42) {
        items.push(rollItem(rng, { tier: tier, rarityTier: U.clamp(tier + rng.int(-1, 0), 1, 6) }));
      } else if (roll < 0.66) {
        items.push(makeConsumable(rng, tier));
      } else if (roll < 0.80) {
        items.push(makeMaterial(rng, opts.partName || 'Monster Part', tier));
      } else if (roll < 0.93) {
        var pool = (catalog.byRarity[T.rarityByTier(U.clamp(tier, 1, 5)).id] || catalog.list)
          .filter(function (s) { return !s.unique && s.category !== 'passive'; });
        if (pool.length) items.push(makeSkillOrb(rng, rng.pick(pool)));
      } else {
        items.push(makeCatalyst(rng));
      }
    }
    var gold = Math.round((opts.gold || 40 * tier) * rng.range(0.7, 1.5));
    return { gold: gold, items: items };
  }

  ISE.ItemGen = {
    rollItem: rollItem,
    makeConsumable: makeConsumable,
    makeCatalyst: makeCatalyst,
    makeSkillOrb: makeSkillOrb,
    makeMaterial: makeMaterial,
    forgeRelic: forgeRelic,
    rollLoot: rollLoot,
    RELIC_ORIGINS: RELIC_ORIGINS
  };
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
