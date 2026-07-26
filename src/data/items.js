/* items.js — equipment bases, the procedural affix pool, consumables, and
 * the effect shapes relics are forged from during history. */
(function (ISE) {
  'use strict';

  var ID = {};

  ID.SLOTS = [
    { id: 'weapon', name: 'Weapon' },
    { id: 'offhand', name: 'Off-hand' },
    { id: 'head', name: 'Head' },
    { id: 'body', name: 'Body' },
    { id: 'accessory', name: 'Accessory', count: 2 }
  ];

  /* Base items. `stats` are at tier 1; the generator scales by tier and
   * rolls affixes on top. `scale` weights how much tier inflates them. */
  ID.BASES = [
    /* weapons */
    { id: 'sword', name: 'Sword', slot: 'weapon', stats: { atk: 6 }, scale: 1.0, school: 'physical', hands: 1 },
    { id: 'greatsword', name: 'Greatsword', slot: 'weapon', stats: { atk: 9, spd: -2 }, scale: 1.15, school: 'physical', hands: 2 },
    { id: 'dagger', name: 'Dagger', slot: 'weapon', stats: { atk: 4, spd: 3, lck: 2 }, scale: 0.9, school: 'physical', hands: 1 },
    { id: 'spear', name: 'Spear', slot: 'weapon', stats: { atk: 7, def: 1 }, scale: 1.05, school: 'physical', hands: 2 },
    { id: 'axe', name: 'Axe', slot: 'weapon', stats: { atk: 8, res: -1 }, scale: 1.1, school: 'physical', hands: 1 },
    { id: 'hammer', name: 'Warhammer', slot: 'weapon', stats: { atk: 10, spd: -3 }, scale: 1.2, school: 'physical', hands: 2 },
    { id: 'bow', name: 'Bow', slot: 'weapon', stats: { atk: 6, spd: 2 }, scale: 1.0, school: 'physical', hands: 2 },
    { id: 'claws', name: 'Claws', slot: 'weapon', stats: { atk: 5, spd: 3 }, scale: 0.95, school: 'physical', hands: 2 },
    { id: 'staff', name: 'Staff', slot: 'weapon', stats: { mag: 7, mp: 8 }, scale: 1.05, school: 'magic', hands: 2 },
    { id: 'wand', name: 'Wand', slot: 'weapon', stats: { mag: 5, spd: 1 }, scale: 0.95, school: 'magic', hands: 1 },
    { id: 'grimoire', name: 'Grimoire', slot: 'weapon', stats: { mag: 6, res: 2 }, scale: 1.0, school: 'magic', hands: 1 },
    { id: 'scythe', name: 'Scythe', slot: 'weapon', stats: { atk: 7, mag: 3 }, scale: 1.1, school: 'physical', hands: 2 },
    /* off-hand */
    { id: 'buckler', name: 'Buckler', slot: 'offhand', stats: { def: 3, spd: 1 }, scale: 0.9 },
    { id: 'kiteshield', name: 'Kite Shield', slot: 'offhand', stats: { def: 6, spd: -1 }, scale: 1.05 },
    { id: 'towershield', name: 'Tower Shield', slot: 'offhand', stats: { def: 9, res: 2, spd: -3 }, scale: 1.2 },
    { id: 'focus', name: 'Focus', slot: 'offhand', stats: { mag: 4, mp: 6 }, scale: 1.0 },
    { id: 'tome', name: 'Tome', slot: 'offhand', stats: { res: 4, mp: 4 }, scale: 1.0 },
    /* head */
    { id: 'cap', name: 'Cap', slot: 'head', stats: { def: 2, res: 1 }, scale: 0.85 },
    { id: 'helm', name: 'Helm', slot: 'head', stats: { def: 4, hp: 6 }, scale: 1.0 },
    { id: 'greathelm', name: 'Great Helm', slot: 'head', stats: { def: 6, hp: 10, spd: -1 }, scale: 1.1 },
    { id: 'circlet', name: 'Circlet', slot: 'head', stats: { mag: 3, res: 3, mp: 5 }, scale: 1.0 },
    { id: 'hood', name: 'Hood', slot: 'head', stats: { res: 2, spd: 2, lck: 1 }, scale: 0.9 },
    /* body */
    { id: 'robe', name: 'Robe', slot: 'body', stats: { res: 5, mag: 3, mp: 8 }, scale: 1.0 },
    { id: 'leather', name: 'Leathers', slot: 'body', stats: { def: 5, spd: 2 }, scale: 0.95 },
    { id: 'chain', name: 'Chainmail', slot: 'body', stats: { def: 8, hp: 8, spd: -1 }, scale: 1.05 },
    { id: 'plate', name: 'Plate', slot: 'body', stats: { def: 12, hp: 14, spd: -3 }, scale: 1.2 },
    { id: 'scalemail', name: 'Scale Mail', slot: 'body', stats: { def: 9, res: 4, spd: -2 }, scale: 1.1 },
    { id: 'carapace', name: 'Carapace', slot: 'body', stats: { def: 7, res: 5, hp: 10 }, scale: 1.1 },
    /* accessories */
    { id: 'ring', name: 'Ring', slot: 'accessory', stats: { lck: 3 }, scale: 0.9 },
    { id: 'amulet', name: 'Amulet', slot: 'accessory', stats: { res: 3, mp: 6 }, scale: 0.95 },
    { id: 'band', name: 'Band', slot: 'accessory', stats: { atk: 3, def: 2 }, scale: 0.9 },
    { id: 'charm', name: 'Charm', slot: 'accessory', stats: { spd: 3, lck: 2 }, scale: 0.9 },
    { id: 'sigilstone', name: 'Sigil Stone', slot: 'accessory', stats: { mag: 4, mp: 4 }, scale: 0.95 }
  ];

  /* Material words gate by tier and colour the item name. */
  ID.MATERIALS = [
    { id: 'copper', name: 'Copper', tier: 1, mult: 0.9 },
    { id: 'iron', name: 'Iron', tier: 1, mult: 1.0 },
    { id: 'steel', name: 'Steel', tier: 2, mult: 1.15 },
    { id: 'silvered', name: 'Silvered', tier: 2, mult: 1.2 },
    { id: 'darksteel', name: 'Darksteel', tier: 3, mult: 1.4 },
    { id: 'mythril', name: 'Mythril', tier: 3, mult: 1.5 },
    { id: 'orichalcum', name: 'Orichalcum', tier: 4, mult: 1.75 },
    { id: 'dragonbone', name: 'Dragonbone', tier: 4, mult: 1.8 },
    { id: 'adamant', name: 'Adamant', tier: 5, mult: 2.1 },
    { id: 'godsteel', name: 'Godsteel', tier: 5, mult: 2.2 },
    { id: 'primordial', name: 'Primordial', tier: 6, mult: 2.7 }
  ];

  /* Affixes. `stats` values are per affix-power point; the roller multiplies
   * by tier and a random quality factor. */
  ID.PREFIXES = [
    { id: 'sturdy', name: 'Sturdy', stats: { def: 2, hp: 4 }, minTier: 1 },
    { id: 'keen', name: 'Keen', stats: { atk: 2, lck: 1 }, minTier: 1 },
    { id: 'swift', name: 'Swift', stats: { spd: 3 }, minTier: 1 },
    { id: 'arcane', name: 'Arcane', stats: { mag: 2, mp: 5 }, minTier: 1 },
    { id: 'warded', name: 'Warded', stats: { res: 3 }, minTier: 1 },
    { id: 'brutal', name: 'Brutal', stats: { atk: 4 }, minTier: 2, crit: 0.03 },
    { id: 'vital', name: 'Vital', stats: { hp: 14 }, minTier: 2 },
    { id: 'lucky', name: 'Lucky', stats: { lck: 5 }, minTier: 2 },
    { id: 'runed', name: 'Runed', stats: { mag: 4, res: 2 }, minTier: 3 },
    { id: 'unyielding', name: 'Unyielding', stats: { def: 5, res: 3 }, minTier: 3 },
    { id: 'predatory', name: 'Predatory', stats: { atk: 4, spd: 2 }, minTier: 3, lifesteal: 0.05 },
    { id: 'starforged', name: 'Starforged', stats: { atk: 5, mag: 5 }, minTier: 4 },
    { id: 'sovereign', name: 'Sovereign', stats: { atk: 4, def: 4, mag: 4, res: 4 }, minTier: 5 }
  ];

  ID.SUFFIXES = [
    { id: 'of_the_bear', name: 'of the Bear', stats: { hp: 12, def: 2 }, minTier: 1 },
    { id: 'of_the_hawk', name: 'of the Hawk', stats: { spd: 2, lck: 2 }, minTier: 1 },
    { id: 'of_flame', name: 'of Flame', element: 'fire', elemPower: 0.08, minTier: 1 },
    { id: 'of_frost', name: 'of Frost', element: 'ice', elemPower: 0.08, minTier: 1 },
    { id: 'of_storms', name: 'of Storms', element: 'lightning', elemPower: 0.08, minTier: 1 },
    { id: 'of_stone', name: 'of Stone', element: 'earth', elemPower: 0.08, minTier: 1 },
    { id: 'of_tides', name: 'of Tides', element: 'water', elemPower: 0.08, minTier: 1 },
    { id: 'of_gales', name: 'of Gales', element: 'wind', elemPower: 0.08, minTier: 1 },
    { id: 'of_dawn', name: 'of Dawn', element: 'light', elemPower: 0.1, minTier: 2 },
    { id: 'of_dusk', name: 'of Dusk', element: 'shadow', elemPower: 0.1, minTier: 2 },
    { id: 'of_the_mind', name: 'of the Mind', element: 'psychic', elemPower: 0.1, minTier: 2 },
    { id: 'of_the_wild', name: 'of the Wild', element: 'biological', elemPower: 0.1, minTier: 2 },
    { id: 'of_ruin', name: 'of Ruin', element: 'chaos', elemPower: 0.12, minTier: 3 },
    { id: 'of_law', name: 'of Law', element: 'order', elemPower: 0.12, minTier: 3 },
    { id: 'of_leeching', name: 'of Leeching', lifesteal: 0.07, minTier: 3 },
    { id: 'of_the_duelist', name: 'of the Duelist', crit: 0.06, minTier: 3 },
    { id: 'of_thorns', name: 'of Thorns', thorns: 0.12, minTier: 3 },
    { id: 'of_the_wellspring', name: 'of the Wellspring', stats: { mp: 20 }, costCut: 0.08, minTier: 4 },
    { id: 'of_the_titan', name: 'of the Titan', stats: { hp: 40, def: 5 }, minTier: 4 },
    { id: 'of_annihilation', name: 'of Annihilation', pierce: 0.12, crit: 0.08, minTier: 5 }
  ];

  /* Consumables and materials. */
  ID.CONSUMABLES = [
    { id: 'potion_minor', name: 'Minor Healing Draught', kind: 'heal', power: 60, price: 25, tier: 1 },
    { id: 'potion', name: 'Healing Draught', kind: 'heal', power: 160, price: 70, tier: 2 },
    { id: 'potion_major', name: 'Greater Healing Draught', kind: 'heal', power: 420, price: 190, tier: 3 },
    { id: 'potion_supreme', name: 'Supreme Elixir', kind: 'heal', power: 1200, price: 600, tier: 4 },
    { id: 'ether_minor', name: 'Magicule Vial', kind: 'mp', power: 40, price: 40, tier: 1 },
    { id: 'ether', name: 'Magicule Flask', kind: 'mp', power: 110, price: 120, tier: 2 },
    { id: 'ether_major', name: 'Magicule Reservoir', kind: 'mp', power: 300, price: 340, tier: 3 },
    { id: 'antidote', name: 'Antidote', kind: 'cleanse', power: 1, price: 30, tier: 1 },
    { id: 'smoke', name: 'Escape Smoke', kind: 'flee', power: 1, price: 55, tier: 1 },
    { id: 'whetstone', name: 'Warding Whetstone', kind: 'buff', status: 'empower', price: 90, tier: 2 },
    { id: 'wardstone', name: 'Wardstone', kind: 'buff', status: 'barrier', price: 110, tier: 2 },
    { id: 'revive', name: 'Heart Ember', kind: 'revive', power: 0.5, price: 500, tier: 3 }
  ];

  /* Effects a forged relic can carry. History picks one and the generator
   * fills in the magnitude from the relic's tier. */
  ID.RELIC_EFFECTS = [
    { id: 'elem_lord', name: 'Elemental Authority',
      tpl: 'All {elem} damage the bearer deals is increased by {v}.',
      roll: function (t) { return { elemPower: 0.2 + 0.08 * t, needsElement: true }; } },
    { id: 'unkillable', name: 'Refusal',
      tpl: 'Once per battle, the bearer survives a killing blow at {v} health.',
      roll: function (t) { return { reviveOnce: 0.15 + 0.05 * t }; } },
    { id: 'devourer', name: 'Devourer',
      tpl: 'The bearer heals for {v} of all damage dealt.',
      roll: function (t) { return { lifesteal: 0.08 + 0.035 * t }; } },
    { id: 'aegis', name: 'Aegis',
      tpl: 'Incoming damage is reduced by {v}.',
      roll: function (t) { return { damageTaken: -(0.08 + 0.03 * t) }; } },
    { id: 'sovereign', name: 'Sovereign Presence',
      tpl: 'All of the bearer\'s attributes are raised by {v}.',
      roll: function (t) { return { allStats: 0.06 + 0.03 * t }; } },
    { id: 'kingmaker', name: 'Kingmaker',
      tpl: 'Nations treat the bearer as {v} more significant than they are.',
      roll: function (t) { return { diplomacy: 10 + 8 * t, fame: 5 * t }; } },
    { id: 'skillbound', name: 'Bound Skill',
      tpl: 'Grants the skill {skill} while carried.',
      roll: function (t) { return { grantsSkill: true, tier: t }; } },
    { id: 'hastener', name: 'Quickening',
      tpl: 'The bearer\'s Agility is raised by {v} and acts first more often.',
      roll: function (t) { return { stats: { spd: 0.15 + 0.06 * t } }; } },
    { id: 'mana_font', name: 'Mana Font',
      tpl: 'Skill costs are reduced by {v}.',
      roll: function (t) { return { costCut: 0.12 + 0.05 * t }; } },
    { id: 'executioner', name: 'Executioner',
      tpl: 'Critical strikes land {v} more often and hit harder.',
      roll: function (t) { return { crit: 0.1 + 0.04 * t, critDamage: 0.2 + 0.1 * t }; } },
    { id: 'warlord', name: 'Warlord\'s Burden',
      tpl: 'Armies led by the bearer fight at {v} increased strength.',
      roll: function (t) { return { armyPower: 0.1 + 0.06 * t }; } },
    { id: 'evolution_key', name: 'Chrysalis',
      tpl: 'Counts as a catalyst for evolution, and speeds mastery by {v}.',
      roll: function (t) { return { catalyst: 'any', masteryRate: 0.15 + 0.07 * t }; } }
  ];

  /* Where a relic can end up after it is forged. */
  ID.RELIC_LOCATIONS = ['nation_vault', 'dungeon_boss', 'lost_ruin', 'hero_lineage', 'monster_hoard'];

  /* Local resources by biome, used for shop stock and price modifiers. */
  ID.BIOME_RESOURCES = {
    plains: ['grain', 'livestock', 'leather'],
    grassland: ['grain', 'livestock', 'herbs'],
    forest: ['timber', 'game', 'herbs'],
    deep_forest: ['timber', 'rare_herbs', 'beast_parts'],
    jungle: ['rare_herbs', 'beast_parts', 'spice'],
    swamp: ['reagents', 'poison', 'peat'],
    desert: ['glass', 'spice', 'salt'],
    savanna: ['livestock', 'game', 'hide'],
    taiga: ['timber', 'furs', 'game'],
    tundra: ['furs', 'ivory'],
    glacier: ['ice_crystal', 'furs'],
    hills: ['ore', 'stone', 'livestock'],
    mountain: ['ore', 'gems', 'stone'],
    peak: ['gems', 'skyiron'],
    volcano: ['obsidian', 'fire_salt', 'ore'],
    wasteland: ['scrap', 'bone'],
    beach: ['fish', 'salt', 'pearl'],
    coast: ['fish', 'salt'],
    manawaste: ['raw_mana', 'chaos_shard'],
    spiritwood: ['spirit_wood', 'reagents'],
    glassfield: ['glass', 'order_shard'],
    bloomrot: ['spores', 'rare_herbs']
  };

  ID.RESOURCE_NAMES = {
    grain: 'Grain', livestock: 'Livestock', leather: 'Leather', herbs: 'Herbs',
    timber: 'Timber', game: 'Game', rare_herbs: 'Rare Herbs', beast_parts: 'Beast Parts',
    spice: 'Spice', reagents: 'Reagents', poison: 'Venoms', peat: 'Peat',
    glass: 'Glass', salt: 'Salt', hide: 'Hides', furs: 'Furs', ivory: 'Ivory',
    ice_crystal: 'Ice Crystal', ore: 'Ore', stone: 'Stone', gems: 'Gems',
    skyiron: 'Skyiron', obsidian: 'Obsidian', fire_salt: 'Fire Salt',
    scrap: 'Scrap', bone: 'Bone', fish: 'Fish', pearl: 'Pearl',
    raw_mana: 'Raw Mana', chaos_shard: 'Chaos Shard', spirit_wood: 'Spiritwood',
    order_shard: 'Order Shard', spores: 'Spores'
  };

  ISE.ItemData = ID;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
