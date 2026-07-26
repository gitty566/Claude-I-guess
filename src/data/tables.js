/* tables.js — the shared vocabulary of the engine: rarity tiers, the 14
 * skill/damage types, the element interaction matrix, biomes, and status
 * effects. Everything else references these by id. */
(function (ISE) {
  'use strict';

  var T = {};

  /* ---------------------------------------------------------------- rarity */
  T.RARITIES = [
    {
      id: 'common', name: 'Common', tier: 1, color: '#b9c2cf',
      power: 1.00, valueMult: 1, masteryCost: 1.0,
      acquisition: ['trainer'],
      role: 'Foundational actions'
    },
    {
      id: 'uncommon', name: 'Uncommon', tier: 2, color: '#6ec06e',
      power: 1.35, valueMult: 3, masteryCost: 1.35,
      acquisition: ['trainer_adv', 'quest'],
      role: 'Reliable workhorse skills'
    },
    {
      id: 'rare', name: 'Rare', tier: 3, color: '#5aa9e6',
      power: 1.85, valueMult: 9, masteryCost: 1.9,
      acquisition: ['dungeon_drop', 'rare_trainer', 'skill_book'],
      role: 'Build-defining'
    },
    {
      id: 'epic', name: 'Epic', tier: 4, color: '#b57ae8',
      power: 2.55, valueMult: 28, masteryCost: 2.7,
      acquisition: ['boss_drop', 'faction_rep'],
      role: 'Strong specialization'
    },
    {
      id: 'legendary', name: 'Legendary', tier: 5, color: '#e8a33d',
      power: 3.6, valueMult: 90, masteryCost: 3.8,
      acquisition: ['world_event', 'deep_dungeon_clear'],
      role: 'Signature abilities'
    },
    {
      id: 'mythical', name: 'Mythical', tier: 6, color: '#ee5f6f',
      power: 5.2, valueMult: 320, masteryCost: 5.5,
      acquisition: ['unique_legend'],
      role: 'Reality-bending capstones'
    }
  ];

  T.RARITY = {};
  T.RARITIES.forEach(function (r) { T.RARITY[r.id] = r; });
  T.RARITY_IDS = T.RARITIES.map(function (r) { return r.id; });

  T.rarityTier = function (id) { return (T.RARITY[id] || T.RARITY.common).tier; };
  T.rarityByTier = function (tier) {
    return T.RARITIES[Math.max(0, Math.min(T.RARITIES.length - 1, tier - 1))];
  };

  /* --------------------------------------------------------------- elements
   * 14 real types + the "unique" bucket for one-off Named skills. */
  T.ELEMENTS = [
    { id: 'fire', name: 'Fire', color: '#ff6b3d', stat: 'mag', flavor: 'burn' },
    { id: 'ice', name: 'Ice', color: '#7fd7ff', stat: 'mag', flavor: 'freeze' },
    { id: 'lightning', name: 'Lightning', color: '#ffe066', stat: 'mag', flavor: 'shock' },
    { id: 'earth', name: 'Earth', color: '#c2914f', stat: 'mag', flavor: 'crush' },
    { id: 'wind', name: 'Wind', color: '#a8f0c6', stat: 'mag', flavor: 'cut' },
    { id: 'water', name: 'Water', color: '#4fa8ff', stat: 'mag', flavor: 'drown' },
    { id: 'light', name: 'Light', color: '#fff3c4', stat: 'mag', flavor: 'sear' },
    { id: 'shadow', name: 'Shadow', color: '#8e6bd6', stat: 'mag', flavor: 'blind' },
    { id: 'physical', name: 'Physical', color: '#d9d9d9', stat: 'atk', flavor: 'wound' },
    { id: 'energy', name: 'Energy', color: '#5ce1e6', stat: 'mag', flavor: 'overload' },
    { id: 'psychic', name: 'Psychic', color: '#f48fb1', stat: 'mag', flavor: 'unmake the mind' },
    { id: 'biological', name: 'Biological', color: '#8bc34a', stat: 'mag', flavor: 'infest' },
    { id: 'chaos', name: 'Chaos', color: '#e040fb', stat: 'mag', flavor: 'unravel' },
    { id: 'order', name: 'Order', color: '#cfd8dc', stat: 'mag', flavor: 'bind' },
    { id: 'unique', name: 'Unique', color: '#ff8fa3', stat: 'mag', flavor: 'defy' }
  ];

  T.ELEMENT = {};
  T.ELEMENTS.forEach(function (e) { T.ELEMENT[e.id] = e; });
  T.ELEMENT_IDS = T.ELEMENTS.map(function (e) { return e.id; });
  /* The 14 "real" types; 'unique' is excluded from ordinary generation. */
  T.CORE_ELEMENTS = T.ELEMENT_IDS.filter(function (id) { return id !== 'unique'; });

  /* Attacker -> defender multiplier. Anything unlisted is 1.0. */
  var M = {};
  function pair(a, b, mult) { (M[a] = M[a] || {})[b] = mult; }

  pair('fire', 'ice', 1.5); pair('fire', 'biological', 1.35); pair('fire', 'water', 0.6);
  pair('ice', 'biological', 1.35); pair('ice', 'water', 1.2); pair('ice', 'fire', 0.6);
  pair('lightning', 'water', 1.5); pair('lightning', 'wind', 1.25); pair('lightning', 'earth', 0.5);
  pair('earth', 'lightning', 1.5); pair('earth', 'fire', 1.2); pair('earth', 'wind', 0.6);
  pair('wind', 'earth', 1.4); pair('wind', 'physical', 1.1); pair('wind', 'lightning', 0.7);
  pair('water', 'fire', 1.5); pair('water', 'earth', 1.2); pair('water', 'lightning', 0.55);
  pair('light', 'shadow', 1.6); pair('light', 'chaos', 1.2); pair('light', 'light', 0.4);
  pair('shadow', 'light', 1.6); pair('shadow', 'psychic', 1.25); pair('shadow', 'shadow', 0.4);
  pair('physical', 'biological', 1.15); pair('physical', 'energy', 0.75);
  pair('energy', 'order', 1.3); pair('energy', 'physical', 1.2); pair('energy', 'energy', 0.5);
  pair('psychic', 'biological', 1.45); pair('psychic', 'order', 1.2); pair('psychic', 'chaos', 0.7);
  pair('biological', 'earth', 1.25); pair('biological', 'order', 1.15); pair('biological', 'fire', 0.6);
  pair('chaos', 'order', 1.7); pair('chaos', 'psychic', 1.2); pair('chaos', 'chaos', 0.5);
  pair('order', 'chaos', 1.7); pair('order', 'energy', 1.2); pair('order', 'order', 0.5);
  pair('unique', 'order', 1.15); pair('unique', 'chaos', 1.15);

  T.ELEMENT_MATRIX = M;

  T.elementMult = function (attackType, defenderAffinities) {
    if (!defenderAffinities) return 1;
    var mult = 1;
    var row = M[attackType] || {};
    for (var i = 0; i < defenderAffinities.length; i++) {
      var d = defenderAffinities[i];
      if (row[d] !== undefined) mult *= row[d];
    }
    // Explicit resist/weak lists layered on top of the type matrix.
    return mult;
  };

  /* ----------------------------------------------------------------- stats */
  T.STATS = [
    { id: 'hp', name: 'Vitality', short: 'HP', desc: 'Life. At zero you fall.' },
    { id: 'mp', name: 'Magicules', short: 'MP', desc: 'Fuel for skills.' },
    { id: 'atk', name: 'Strength', short: 'ATK', desc: 'Physical damage.' },
    { id: 'def', name: 'Endurance', short: 'DEF', desc: 'Physical mitigation.' },
    { id: 'mag', name: 'Aether', short: 'MAG', desc: 'Magical damage.' },
    { id: 'res', name: 'Resistance', short: 'RES', desc: 'Magical mitigation.' },
    { id: 'spd', name: 'Agility', short: 'SPD', desc: 'Turn order and evasion.' },
    { id: 'lck', name: 'Fortune', short: 'LCK', desc: 'Crits, drops, rare rolls.' }
  ];
  T.STAT_IDS = T.STATS.map(function (s) { return s.id; });

  /* ---------------------------------------------------------------- biomes */
  T.BIOMES = {
    ocean: { name: 'Ocean', color: '#16324f', land: false, fertility: 0.0, danger: 2, move: 99 },
    deep_ocean: { name: 'Deep Ocean', color: '#0d2038', land: false, fertility: 0.0, danger: 3, move: 99 },
    coast: { name: 'Coast', color: '#2a5f86', land: false, fertility: 0.2, danger: 1, move: 99 },
    beach: { name: 'Shore', color: '#d9cba3', land: true, fertility: 0.35, danger: 1, move: 1 },
    plains: { name: 'Plains', color: '#8fae5d', land: true, fertility: 0.9, danger: 1, move: 1 },
    grassland: { name: 'Grassland', color: '#a3bd6a', land: true, fertility: 0.8, danger: 1, move: 1 },
    forest: { name: 'Forest', color: '#3f7a45', land: true, fertility: 0.7, danger: 2, move: 2 },
    deep_forest: { name: 'Deep Forest', color: '#2c5c33', land: true, fertility: 0.55, danger: 3, move: 3 },
    jungle: { name: 'Jungle', color: '#2f7d4f', land: true, fertility: 0.65, danger: 4, move: 3 },
    swamp: { name: 'Swamp', color: '#4a5b3a', land: true, fertility: 0.4, danger: 4, move: 3 },
    desert: { name: 'Desert', color: '#dcc07a', land: true, fertility: 0.12, danger: 3, move: 2 },
    savanna: { name: 'Savanna', color: '#bfa85c', land: true, fertility: 0.5, danger: 2, move: 1 },
    taiga: { name: 'Taiga', color: '#4d6b57', land: true, fertility: 0.4, danger: 2, move: 2 },
    tundra: { name: 'Tundra', color: '#9fb3ad', land: true, fertility: 0.2, danger: 3, move: 2 },
    glacier: { name: 'Glacier', color: '#dbe9ef', land: true, fertility: 0.02, danger: 5, move: 3 },
    hills: { name: 'Hills', color: '#8d8a5c', land: true, fertility: 0.55, danger: 2, move: 2 },
    mountain: { name: 'Mountains', color: '#7b7269', land: true, fertility: 0.15, danger: 4, move: 4 },
    peak: { name: 'High Peaks', color: '#cfcfcf', land: true, fertility: 0.03, danger: 6, move: 6 },
    volcano: { name: 'Volcanic Waste', color: '#6b3226', land: true, fertility: 0.08, danger: 7, move: 4 },
    wasteland: { name: 'Wasteland', color: '#7a6b60', land: true, fertility: 0.1, danger: 5, move: 2 },
    /* mana-warped variants — appear where the mana field spikes */
    manawaste: { name: 'Mana Wastes', color: '#8a5fa8', land: true, fertility: 0.05, danger: 8, move: 3, warped: true },
    spiritwood: { name: 'Spiritwood', color: '#4f7f8f', land: true, fertility: 0.6, danger: 6, move: 3, warped: true },
    glassfield: { name: 'Glass Fields', color: '#b9d6e0', land: true, fertility: 0.05, danger: 7, move: 2, warped: true },
    bloomrot: { name: 'Bloomrot', color: '#7a4f7f', land: true, fertility: 0.45, danger: 7, move: 3, warped: true }
  };

  T.BIOME_IDS = Object.keys(T.BIOMES);
  T.LAND_BIOMES = T.BIOME_IDS.filter(function (b) { return T.BIOMES[b].land; });

  /* Which element a biome leans toward — drives monster ecology, skill
   * trainers and race evolution environment gates. */
  T.BIOME_ELEMENT = {
    ocean: 'water', deep_ocean: 'water', coast: 'water', beach: 'water',
    plains: 'earth', grassland: 'earth', forest: 'biological', deep_forest: 'biological',
    jungle: 'biological', swamp: 'biological', desert: 'fire', savanna: 'wind',
    taiga: 'ice', tundra: 'ice', glacier: 'ice', hills: 'earth',
    mountain: 'earth', peak: 'wind', volcano: 'fire', wasteland: 'shadow',
    manawaste: 'chaos', spiritwood: 'psychic', glassfield: 'order', bloomrot: 'biological'
  };

  /* -------------------------------------------------------------- statuses */
  T.STATUSES = {
    burn: {
      name: 'Burn', element: 'fire', kind: 'dot', color: '#ff6b3d',
      tickPct: 0.05, baseTurns: 3, desc: 'Loses 5% max HP each turn.'
    },
    poison: {
      name: 'Poison', element: 'biological', kind: 'dot', color: '#8bc34a',
      tickPct: 0.04, baseTurns: 4, desc: 'Loses 4% max HP each turn.'
    },
    bleed: {
      name: 'Bleed', element: 'physical', kind: 'dot', color: '#c94040',
      tickPct: 0.06, baseTurns: 2, desc: 'Loses 6% max HP each turn.'
    },
    frozen: {
      name: 'Frozen', element: 'ice', kind: 'control', color: '#7fd7ff',
      baseTurns: 1, skipTurn: true, desc: 'Cannot act.'
    },
    stun: {
      name: 'Stunned', element: 'physical', kind: 'control', color: '#ffe066',
      baseTurns: 1, skipTurn: true, desc: 'Cannot act.'
    },
    shock: {
      name: 'Shocked', element: 'lightning', kind: 'debuff', color: '#ffe066',
      baseTurns: 3, mods: { spd: -0.3 }, desc: 'Agility reduced 30%.'
    },
    slow: {
      name: 'Slowed', element: 'order', kind: 'debuff', color: '#9aa7b0',
      baseTurns: 3, mods: { spd: -0.25 }, desc: 'Agility reduced 25%.'
    },
    weaken: {
      name: 'Weakened', element: 'shadow', kind: 'debuff', color: '#8e6bd6',
      baseTurns: 3, mods: { atk: -0.25, mag: -0.25 }, desc: 'Damage reduced 25%.'
    },
    sunder: {
      name: 'Sundered', element: 'physical', kind: 'debuff', color: '#c2914f',
      baseTurns: 3, mods: { def: -0.3, res: -0.3 }, desc: 'Defences reduced 30%.'
    },
    silence: {
      name: 'Silenced', element: 'psychic', kind: 'control', color: '#f48fb1',
      baseTurns: 2, noMagic: true, desc: 'Cannot use magic skills.'
    },
    fear: {
      name: 'Feared', element: 'shadow', kind: 'control', color: '#6b5b95',
      baseTurns: 2, mods: { atk: -0.4 }, fleeChance: 0.25, desc: 'May cower; damage down 40%.'
    },
    curse: {
      name: 'Cursed', element: 'chaos', kind: 'debuff', color: '#e040fb',
      baseTurns: 4, mods: { lck: -0.5 }, takenMult: 1.2, desc: 'Takes 20% more damage.'
    },
    regen: {
      name: 'Regeneration', element: 'biological', kind: 'hot', color: '#7ddc9a',
      tickPct: 0.06, baseTurns: 4, desc: 'Recovers 6% max HP each turn.'
    },
    haste: {
      name: 'Hastened', element: 'wind', kind: 'buff', color: '#a8f0c6',
      baseTurns: 3, mods: { spd: 0.4 }, desc: 'Agility raised 40%.'
    },
    fortify: {
      name: 'Fortified', element: 'earth', kind: 'buff', color: '#c2914f',
      baseTurns: 3, mods: { def: 0.35, res: 0.35 }, desc: 'Defences raised 35%.'
    },
    empower: {
      name: 'Empowered', element: 'energy', kind: 'buff', color: '#5ce1e6',
      baseTurns: 3, mods: { atk: 0.3, mag: 0.3 }, desc: 'Damage raised 30%.'
    },
    barrier: {
      name: 'Barrier', element: 'order', kind: 'shield', color: '#cfd8dc',
      baseTurns: 3, takenMult: 0.6, desc: 'Takes 40% less damage.'
    },
    blessed: {
      name: 'Blessed', element: 'light', kind: 'buff', color: '#fff3c4',
      baseTurns: 3, mods: { lck: 0.5, res: 0.2 }, desc: 'Fortune and Resistance raised.'
    },
    marked: {
      name: 'Marked', element: 'unique', kind: 'debuff', color: '#ff8fa3',
      baseTurns: 3, takenMult: 1.35, desc: 'Takes 35% more damage.'
    }
  };
  T.STATUS_IDS = Object.keys(T.STATUSES);

  /* ------------------------------------------------------------ categories */
  T.SKILL_CATEGORIES = {
    attack: { name: 'Attack', desc: 'Deals damage.' },
    aoe: { name: 'Area Attack', desc: 'Damages every enemy.' },
    dot: { name: 'Affliction', desc: 'Damage plus a lingering status.' },
    buff: { name: 'Buff', desc: 'Strengthens the user or an ally.' },
    debuff: { name: 'Hex', desc: 'Weakens a target.' },
    heal: { name: 'Restoration', desc: 'Restores health.' },
    drain: { name: 'Drain', desc: 'Damages and heals the user.' },
    control: { name: 'Control', desc: 'Denies the target its turn.' },
    passive: { name: 'Passive', desc: 'Always active.' },
    utility: { name: 'Utility', desc: 'Works outside combat.' }
  };

  ISE.T = T;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
