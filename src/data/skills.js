/* skills.js — the raw material the skill generator combines into a world's
 * catalogue. An archetype is "what the skill does" (shape, numbers, status);
 * an element is "what it does it with". Cross them and you get hundreds of
 * skills whose names and mechanics both stay coherent. */
(function (ISE) {
  'use strict';

  var SD = {};

  /* Element -> word banks used for naming. Keeping naming data next to the
   * archetypes means a new element only needs one entry added here. */
  SD.LEXICON = {
    fire: {
      noun: ['Flame', 'Ember', 'Cinder', 'Pyre', 'Blaze', 'Inferno'],
      adj: ['Blazing', 'Scorching', 'Smouldering', 'Ashen', 'Molten', 'Searing'],
      grand: ['Conflagration', 'Sunfire', 'Wildfire'],
      verb: 'burns'
    },
    ice: {
      noun: ['Frost', 'Rime', 'Glacier', 'Hail', 'Icicle', 'Winter'],
      adj: ['Freezing', 'Glacial', 'Hoarfrost', 'Biting', 'Crystalline', 'Numbing'],
      grand: ['Everwinter', 'Absolute Zero', 'Permafrost'],
      verb: 'freezes'
    },
    lightning: {
      noun: ['Spark', 'Bolt', 'Thunder', 'Arc', 'Storm', 'Voltage'],
      adj: ['Crackling', 'Static', 'Thundering', 'Forked', 'Galvanic', 'Roaring'],
      grand: ['Skyfall', 'Godspark', 'Tempest Crown'],
      verb: 'shocks'
    },
    earth: {
      noun: ['Stone', 'Granite', 'Boulder', 'Quake', 'Iron', 'Mountain'],
      adj: ['Grinding', 'Unyielding', 'Stonebound', 'Heavy', 'Tectonic', 'Buried'],
      grand: ['Continent', 'World-Root', 'Bedrock'],
      verb: 'crushes'
    },
    wind: {
      noun: ['Gale', 'Zephyr', 'Cyclone', 'Gust', 'Squall', 'Sky'],
      adj: ['Howling', 'Whirling', 'Keen', 'Racing', 'Screaming', 'Sundering'],
      grand: ['Hurricane', 'Stratosphere', 'Skysunder'],
      verb: 'cuts'
    },
    water: {
      noun: ['Tide', 'Wave', 'Torrent', 'Current', 'Deluge', 'Abyss'],
      adj: ['Surging', 'Drowning', 'Churning', 'Rolling', 'Undertow', 'Fathomless'],
      grand: ['Maelstrom', 'Leviathan Tide', 'Worldsea'],
      verb: 'drowns'
    },
    light: {
      noun: ['Radiance', 'Dawn', 'Halo', 'Lumen', 'Beacon', 'Sun'],
      adj: ['Gleaming', 'Holy', 'Blinding', 'Golden', 'Sanctified', 'Purifying'],
      grand: ['Apotheosis', 'Judgement', 'Heavenscale'],
      verb: 'sears'
    },
    shadow: {
      noun: ['Umbra', 'Gloom', 'Night', 'Eclipse', 'Void', 'Dusk'],
      adj: ['Creeping', 'Starless', 'Whispering', 'Lightless', 'Devouring', 'Unseen'],
      grand: ['Endless Night', 'Black Sun', 'Umbral Throne'],
      verb: 'smothers'
    },
    physical: {
      noun: ['Steel', 'Fist', 'Blade', 'Bone', 'Sinew', 'War'],
      adj: ['Brutal', 'Savage', 'Precise', 'Crushing', 'Relentless', 'Perfect'],
      grand: ['Massacre', 'Peerless Form', 'Deathblow'],
      verb: 'wounds'
    },
    energy: {
      noun: ['Aether', 'Pulse', 'Beam', 'Flux', 'Charge', 'Nova'],
      adj: ['Humming', 'Overloading', 'Kinetic', 'Resonant', 'Focused', 'Unbound'],
      grand: ['Annihilation', 'Singularity', 'Zero Point'],
      verb: 'overloads'
    },
    psychic: {
      noun: ['Mind', 'Thought', 'Dream', 'Psyche', 'Will', 'Memory'],
      adj: ['Piercing', 'Intrusive', 'Silent', 'Fracturing', 'Lucid', 'Overwhelming'],
      grand: ['Godmind', 'Total Recall', 'Ego Death'],
      verb: 'unravels the mind of'
    },
    biological: {
      noun: ['Spore', 'Vine', 'Blood', 'Venom', 'Bloom', 'Growth'],
      adj: ['Festering', 'Writhing', 'Verdant', 'Parasitic', 'Teeming', 'Ravenous'],
      grand: ['Biomass', 'Worldbloom', 'Great Contagion'],
      verb: 'infests'
    },
    chaos: {
      noun: ['Entropy', 'Rift', 'Discord', 'Warp', 'Fracture', 'Unmaking'],
      adj: ['Writhing', 'Impossible', 'Shrieking', 'Twisting', 'Formless', 'Unwritten'],
      grand: ['Ruin Absolute', 'The Unmaking', 'Final Discord'],
      verb: 'unravels'
    },
    order: {
      noun: ['Law', 'Sigil', 'Chain', 'Decree', 'Lattice', 'Axiom'],
      adj: ['Binding', 'Absolute', 'Immutable', 'Sealed', 'Geometric', 'Sovereign'],
      grand: ['Final Verdict', 'Perfect Order', 'World Edict'],
      verb: 'binds'
    },
    unique: {
      noun: ['Concept', 'Truth', 'Name', 'Authority', 'Rule'],
      adj: ['Nameless', 'Singular', 'Impossible', 'Absolute'],
      grand: ['Authority', 'Dominion', 'Ultimate Skill'],
      verb: 'defies'
    }
  };

  /* Escalating name furniture per rarity tier (1..6). */
  SD.TIER_WORDS = {
    1: { pre: ['', 'Lesser ', 'Minor '], post: ['', ''] },
    2: { pre: ['', 'Honed ', 'Steady '], post: ['', ''] },
    3: { pre: ['Greater ', 'True ', 'Deep '], post: ['', ''] },
    4: { pre: ['Grand ', 'Sovereign ', 'Elder '], post: ['', ''] },
    5: { pre: ['Supreme ', 'Ultimate ', 'Primordial '], post: ['', ''] },
    6: { pre: ['', 'Absolute ', 'Genesis '], post: ['', ''] }
  };

  /* ------------------------------------------------------------ archetypes
   * power   : damage/heal coefficient at rarity tier 1 (scaled by rarity)
   * chain   : how many rarity steps this archetype's line spans
   * baseTier: rarity tier the line starts at
   * elements: 'all' | array of element ids | {not: [...]}
   */
  SD.ARCHETYPES = [
    /* --- single-target attacks --- */
    { id: 'bolt', name: 'Bolt', category: 'attack', target: 'enemy', school: 'magic',
      power: 34, mp: 6, cd: 0, chain: 4, baseTier: 1, elements: 'all',
      desc: 'A focused burst of {elem} at one foe.' },
    { id: 'lance', name: 'Lance', category: 'attack', target: 'enemy', school: 'magic',
      power: 44, mp: 11, cd: 1, chain: 3, baseTier: 2, elements: 'all',
      pierce: 0.25, desc: 'A driven spear of {elem} that ignores part of defence.' },
    { id: 'slash', name: 'Slash', category: 'attack', target: 'enemy', school: 'physical',
      power: 36, mp: 4, cd: 0, chain: 4, baseTier: 1,
      elements: ['physical', 'wind', 'shadow', 'ice', 'light', 'chaos', 'order', 'energy'],
      desc: 'A cutting strike edged with {elem}.' },
    { id: 'smite', name: 'Smite', category: 'attack', target: 'enemy', school: 'physical',
      power: 52, mp: 14, cd: 2, chain: 3, baseTier: 2,
      elements: ['physical', 'light', 'earth', 'fire', 'order', 'lightning'],
      critBonus: 0.15, desc: 'A heavy overhead blow charged with {elem}.' },
    { id: 'fang', name: 'Fang', category: 'attack', target: 'enemy', school: 'physical',
      power: 30, mp: 3, cd: 0, chain: 3, baseTier: 1,
      elements: ['physical', 'biological', 'shadow', 'ice', 'fire'],
      hits: 2, desc: 'Two quick rending bites laced with {elem}.' },
    { id: 'ray', name: 'Ray', category: 'attack', target: 'enemy', school: 'magic',
      power: 40, mp: 9, cd: 0, chain: 3, baseTier: 2,
      elements: ['light', 'shadow', 'energy', 'psychic', 'fire', 'order', 'chaos'],
      pierce: 0.15, desc: 'A lanced beam of concentrated {elem}.' },
    { id: 'shard', name: 'Shard', category: 'attack', target: 'enemy', school: 'magic',
      power: 22, mp: 8, cd: 0, chain: 3, baseTier: 1,
      elements: ['ice', 'earth', 'order', 'water', 'chaos', 'light'],
      hits: 3, desc: 'A volley of {elem} splinters.' },
    { id: 'crush', name: 'Crush', category: 'attack', target: 'enemy', school: 'physical',
      power: 58, mp: 16, cd: 2, chain: 3, baseTier: 2,
      elements: ['earth', 'physical', 'water', 'order', 'biological'],
      status: 'sunder', statusChance: 0.35, desc: 'A weight of {elem} that cracks armour.' },
    { id: 'execute', name: 'Execution', category: 'attack', target: 'enemy', school: 'physical',
      power: 46, mp: 20, cd: 3, chain: 2, baseTier: 3,
      elements: ['physical', 'shadow', 'order', 'chaos', 'light'],
      executeBonus: 1.6, desc: 'Strikes far harder against the badly wounded.' },

    /* --- area attacks --- */
    { id: 'nova', name: 'Nova', category: 'aoe', target: 'all_enemies', school: 'magic',
      power: 30, mp: 18, cd: 2, chain: 4, baseTier: 2, elements: 'all',
      desc: 'A detonation of {elem} that engulfs every foe.' },
    { id: 'storm', name: 'Storm', category: 'aoe', target: 'all_enemies', school: 'magic',
      power: 24, mp: 22, cd: 3, chain: 3, baseTier: 3, elements: 'all',
      hits: 2, desc: 'A sustained squall of {elem}.' },
    { id: 'wave', name: 'Wave', category: 'aoe', target: 'all_enemies', school: 'magic',
      power: 27, mp: 16, cd: 2, chain: 3, baseTier: 2,
      elements: ['water', 'wind', 'fire', 'ice', 'energy', 'shadow', 'light', 'biological'],
      desc: 'A rolling front of {elem}.' },
    { id: 'cataclysm', name: 'Cataclysm', category: 'aoe', target: 'all_enemies', school: 'magic',
      power: 52, mp: 45, cd: 5, chain: 2, baseTier: 4, elements: 'all',
      desc: 'A world-scarring release of {elem}.' },
    { id: 'sweep', name: 'Sweep', category: 'aoe', target: 'all_enemies', school: 'physical',
      power: 26, mp: 12, cd: 1, chain: 3, baseTier: 2,
      elements: ['physical', 'wind', 'earth', 'fire', 'shadow'],
      desc: 'A wide arc that catches everything in reach.' },

    /* --- affliction / damage-over-time --- */
    { id: 'brand', name: 'Brand', category: 'dot', target: 'enemy', school: 'magic',
      power: 20, mp: 10, cd: 1, chain: 3, baseTier: 1,
      elements: ['fire', 'light', 'shadow', 'chaos', 'order', 'energy'],
      status: 'burn', statusChance: 0.85, desc: 'Marks the target and sets it alight with {elem}.' },
    { id: 'venom', name: 'Venom', category: 'dot', target: 'enemy', school: 'magic',
      power: 16, mp: 9, cd: 1, chain: 3, baseTier: 1,
      elements: ['biological', 'water', 'shadow', 'chaos'],
      status: 'poison', statusChance: 0.9, desc: 'A creeping {elem} toxin.' },
    { id: 'rend', name: 'Rend', category: 'dot', target: 'enemy', school: 'physical',
      power: 24, mp: 8, cd: 1, chain: 3, baseTier: 1,
      elements: ['physical', 'wind', 'ice', 'biological'],
      status: 'bleed', statusChance: 0.8, desc: 'Opens a wound that will not close.' },
    { id: 'plague', name: 'Plague', category: 'dot', target: 'all_enemies', school: 'magic',
      power: 14, mp: 24, cd: 3, chain: 2, baseTier: 3,
      elements: ['biological', 'shadow', 'chaos', 'water'],
      status: 'poison', statusChance: 0.75, desc: 'A contagion of {elem} that spreads to all foes.' },

    /* --- control --- */
    { id: 'bind', name: 'Bind', category: 'control', target: 'enemy', school: 'magic',
      power: 8, mp: 14, cd: 3, chain: 3, baseTier: 2,
      elements: ['order', 'earth', 'shadow', 'biological', 'ice', 'psychic'],
      status: 'stun', statusChance: 0.45, desc: 'Locks the target in place with {elem}.' },
    { id: 'freeze', name: 'Entombment', category: 'control', target: 'enemy', school: 'magic',
      power: 18, mp: 18, cd: 3, chain: 2, baseTier: 3,
      elements: ['ice', 'earth', 'order', 'water'],
      status: 'frozen', statusChance: 0.5, desc: 'Encases the target in {elem}.' },
    { id: 'hush', name: 'Hush', category: 'control', target: 'enemy', school: 'magic',
      power: 6, mp: 12, cd: 3, chain: 2, baseTier: 2,
      elements: ['psychic', 'shadow', 'order', 'chaos'],
      status: 'silence', statusChance: 0.7, desc: 'Severs the target from its magic.' },
    { id: 'terror', name: 'Terror', category: 'control', target: 'all_enemies', school: 'magic',
      power: 10, mp: 20, cd: 4, chain: 2, baseTier: 3,
      elements: ['shadow', 'psychic', 'chaos', 'unique'],
      status: 'fear', statusChance: 0.5, desc: 'Floods every enemy with unreasoning dread.' },
    { id: 'dominate', name: 'Dominion', category: 'control', target: 'enemy', school: 'magic',
      power: 14, mp: 34, cd: 5, chain: 2, baseTier: 4,
      elements: ['psychic', 'order', 'shadow', 'unique'],
      status: 'stun', statusChance: 0.75, desc: 'Overrides the target\'s will outright.' },

    /* --- hexes --- */
    { id: 'hex', name: 'Hex', category: 'debuff', target: 'enemy', school: 'magic',
      power: 0, mp: 10, cd: 1, chain: 3, baseTier: 1,
      elements: ['shadow', 'chaos', 'psychic', 'biological', 'order'],
      status: 'curse', statusChance: 1, desc: 'A malediction of {elem}.' },
    { id: 'sap', name: 'Sap', category: 'debuff', target: 'enemy', school: 'magic',
      power: 0, mp: 9, cd: 1, chain: 3, baseTier: 1,
      elements: ['shadow', 'water', 'psychic', 'biological', 'ice'],
      status: 'weaken', statusChance: 1, desc: 'Drains the strength from a foe.' },
    { id: 'shatter', name: 'Shatter', category: 'debuff', target: 'enemy', school: 'magic',
      power: 12, mp: 12, cd: 2, chain: 3, baseTier: 2,
      elements: ['earth', 'physical', 'ice', 'order', 'energy'],
      status: 'sunder', statusChance: 1, desc: 'Breaks the target\'s guard apart.' },
    { id: 'mire', name: 'Mire', category: 'debuff', target: 'all_enemies', school: 'magic',
      power: 0, mp: 16, cd: 3, chain: 2, baseTier: 2,
      elements: ['earth', 'water', 'biological', 'order', 'ice'],
      status: 'slow', statusChance: 0.9, desc: 'Bogs down every foe.' },
    { id: 'mark', name: 'Mark', category: 'debuff', target: 'enemy', school: 'magic',
      power: 0, mp: 14, cd: 3, chain: 2, baseTier: 3,
      elements: ['unique', 'light', 'shadow', 'order', 'psychic'],
      status: 'marked', statusChance: 1, desc: 'Paints the target for annihilation.' },

    /* --- buffs --- */
    { id: 'aura', name: 'Aura', category: 'buff', target: 'self', school: 'magic',
      power: 0, mp: 10, cd: 2, chain: 3, baseTier: 1, elements: 'all',
      status: 'empower', statusChance: 1, desc: 'Wreathes the user in empowering {elem}.' },
    { id: 'ward', name: 'Ward', category: 'buff', target: 'self', school: 'magic',
      power: 0, mp: 12, cd: 2, chain: 3, baseTier: 1,
      elements: ['order', 'light', 'earth', 'energy', 'water', 'ice'],
      status: 'fortify', statusChance: 1, desc: 'Raises a bulwark of {elem}.' },
    { id: 'haste', name: 'Quickening', category: 'buff', target: 'self', school: 'magic',
      power: 0, mp: 12, cd: 3, chain: 3, baseTier: 2,
      elements: ['wind', 'lightning', 'energy', 'psychic', 'chaos'],
      status: 'haste', statusChance: 1, desc: 'Accelerates the user past normal time.' },
    { id: 'barrier', name: 'Barrier', category: 'buff', target: 'all_allies', school: 'magic',
      power: 0, mp: 22, cd: 4, chain: 2, baseTier: 3,
      elements: ['order', 'light', 'energy', 'earth', 'water'],
      status: 'barrier', statusChance: 1, desc: 'Shields the whole party in {elem}.' },
    { id: 'blessing', name: 'Blessing', category: 'buff', target: 'all_allies', school: 'magic',
      power: 0, mp: 20, cd: 4, chain: 2, baseTier: 3,
      elements: ['light', 'order', 'energy', 'psychic', 'unique'],
      status: 'blessed', statusChance: 1, desc: 'Sanctifies allies with {elem}.' },

    /* --- restoration --- */
    { id: 'mend', name: 'Mend', category: 'heal', target: 'ally', school: 'magic',
      power: 40, mp: 12, cd: 0, chain: 4, baseTier: 1,
      elements: ['light', 'water', 'biological', 'order', 'energy', 'earth'],
      desc: 'Knits wounds closed with {elem}.' },
    { id: 'bloom', name: 'Bloom', category: 'heal', target: 'all_allies', school: 'magic',
      power: 26, mp: 26, cd: 3, chain: 3, baseTier: 2,
      elements: ['biological', 'light', 'water', 'order'],
      desc: 'Restores the whole party.' },
    { id: 'regrowth', name: 'Regrowth', category: 'heal', target: 'ally', school: 'magic',
      power: 16, mp: 14, cd: 2, chain: 2, baseTier: 2,
      elements: ['biological', 'water', 'light', 'earth'],
      status: 'regen', statusChance: 1, statusOnAlly: true,
      desc: 'Sets flesh knitting itself over several turns.' },

    /* --- drains --- */
    { id: 'drain', name: 'Drain', category: 'drain', target: 'enemy', school: 'magic',
      power: 30, mp: 14, cd: 1, chain: 3, baseTier: 2,
      elements: ['shadow', 'biological', 'chaos', 'psychic', 'water', 'unique'],
      drain: 0.5, desc: 'Tears vitality out of the target and takes it.' },
    { id: 'feast', name: 'Feast', category: 'drain', target: 'enemy', school: 'physical',
      power: 42, mp: 22, cd: 3, chain: 2, baseTier: 3,
      elements: ['biological', 'shadow', 'chaos', 'physical'],
      drain: 0.7, desc: 'Devours the target to sustain the user.' },
    { id: 'siphon', name: 'Siphon', category: 'drain', target: 'all_enemies', school: 'magic',
      power: 20, mp: 30, cd: 4, chain: 2, baseTier: 4,
      elements: ['shadow', 'chaos', 'psychic', 'energy'],
      drain: 0.35, desc: 'Bleeds every foe and feeds on the wound.' },

    /* --- passives --- */
    { id: 'affinity', name: 'Affinity', category: 'passive', target: 'self', school: 'magic',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 1, elements: 'all',
      passive: { resist: 0.2 }, desc: 'Reduces incoming {elem} damage.' },
    { id: 'mastery', name: 'Mastery', category: 'passive', target: 'self', school: 'magic',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 2, elements: 'all',
      passive: { elemPower: 0.15 }, desc: 'Increases the user\'s {elem} damage.' },
    { id: 'body', name: 'Body', category: 'passive', target: 'self', school: 'physical',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 1,
      elements: ['physical', 'earth', 'biological', 'fire', 'ice', 'order'],
      passive: { stats: { hp: 0.1, def: 0.08 } }, desc: 'Hardens the user\'s frame.' },
    { id: 'instinct', name: 'Instinct', category: 'passive', target: 'self', school: 'physical',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 2,
      elements: ['wind', 'physical', 'psychic', 'shadow', 'lightning'],
      passive: { stats: { spd: 0.12, lck: 0.1 }, evade: 0.05 }, desc: 'Sharpens reflexes past thought.' },
    { id: 'mind', name: 'Mind', category: 'passive', target: 'self', school: 'magic',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 2,
      elements: ['psychic', 'order', 'energy', 'light', 'chaos'],
      passive: { stats: { mp: 0.15, mag: 0.1 }, costCut: 0.1 }, desc: 'Deepens the user\'s magicule reserve.' },
    { id: 'regeneration', name: 'Regeneration', category: 'passive', target: 'self', school: 'magic',
      power: 0, mp: 0, cd: 0, chain: 3, baseTier: 2,
      elements: ['biological', 'water', 'light', 'chaos'],
      passive: { regen: 0.03 }, desc: 'Closes wounds continuously.' },
    { id: 'predation', name: 'Predation', category: 'passive', target: 'self', school: 'magic',
      power: 0, mp: 0, cd: 0, chain: 2, baseTier: 4,
      elements: ['chaos', 'shadow', 'biological', 'unique'],
      passive: { devour: true, stats: { atk: 0.1, mag: 0.1 } },
      desc: 'Lets the user consume the fallen and take what they were.' },

    /* --- utility (used on the world map, not in combat) --- */
    { id: 'sense', name: 'Sense', category: 'utility', target: 'self', school: 'magic',
      power: 0, mp: 5, cd: 0, chain: 2, baseTier: 1, elements: 'all',
      utility: 'detect', desc: 'Reveals nearby threats and hidden things.' },
    { id: 'step', name: 'Step', category: 'utility', target: 'self', school: 'magic',
      power: 0, mp: 8, cd: 0, chain: 2, baseTier: 2,
      elements: ['wind', 'shadow', 'energy', 'chaos', 'order'],
      utility: 'travel', desc: 'Shortens long journeys.' },
    { id: 'veil', name: 'Veil', category: 'utility', target: 'self', school: 'magic',
      power: 0, mp: 10, cd: 0, chain: 2, baseTier: 2,
      elements: ['shadow', 'psychic', 'wind', 'water', 'chaos'],
      utility: 'stealth', desc: 'Hides the user from hostile eyes.' },
    { id: 'analyze', name: 'Analysis', category: 'utility', target: 'self', school: 'magic',
      power: 0, mp: 6, cd: 0, chain: 2, baseTier: 2,
      elements: ['psychic', 'order', 'energy', 'unique'],
      utility: 'appraise', desc: 'Lays bare a target\'s nature and weaknesses.' },
    { id: 'forge', name: 'Forging', category: 'utility', target: 'self', school: 'magic',
      power: 0, mp: 12, cd: 0, chain: 2, baseTier: 2,
      elements: ['fire', 'earth', 'order', 'energy'],
      utility: 'craft', desc: 'Reshapes materials into gear.' }
  ];

  /* Skills the world's uniquely-generated legends carry. The generator fills
   * in the numbers; these are the shapes a Mythical skill can take. */
  SD.MYTHIC_SHAPES = [
    { id: 'devour', name: 'Predator', category: 'passive', target: 'self',
      desc: 'Consume the slain and acquire their skills.',
      effect: { devour: true, stats: { atk: 0.2, mag: 0.2, hp: 0.2 } } },
    { id: 'thoughtaccel', name: 'Thought Acceleration', category: 'passive', target: 'self',
      desc: 'Perceive a thousand times faster than the world moves.',
      effect: { stats: { spd: 0.5 }, extraTurn: 0.2 } },
    { id: 'infinite', name: 'Infinite Regeneration', category: 'passive', target: 'self',
      desc: 'Refuse to stay wounded.', effect: { regen: 0.12, reviveOnce: true } },
    { id: 'severance', name: 'Severance', category: 'attack', target: 'enemy',
      desc: 'Cut the concept of the target, not merely its body.',
      effect: { power: 180, pierce: 0.9, trueDamage: 0.35 } },
    { id: 'tyranny', name: 'Tyrant\'s Decree', category: 'control', target: 'all_enemies',
      desc: 'Command the battlefield to stop.',
      effect: { power: 40, status: 'stun', statusChance: 0.85 } },
    { id: 'worldeater', name: 'World-Eater', category: 'aoe', target: 'all_enemies',
      desc: 'Erase everything in a radius that never asked to be erased.',
      effect: { power: 150, drain: 0.4 } },
    { id: 'creation', name: 'Creation', category: 'buff', target: 'all_allies',
      desc: 'Impose a better reality on your allies for a while.',
      effect: { status: 'blessed', statusChance: 1, extra: { empower: true, barrier: true } } },
    { id: 'anti', name: 'Anti-Skill', category: 'debuff', target: 'all_enemies',
      desc: 'Forbid the use of magic itself.',
      effect: { status: 'silence', statusChance: 0.9, power: 30 } },
    { id: 'fate', name: 'Fatecutter', category: 'attack', target: 'enemy',
      desc: 'Strike at what the target was going to become.',
      effect: { power: 120, executeBonus: 2.5, critBonus: 0.4 } },
    { id: 'sanctuary', name: 'Absolute Sanctuary', category: 'buff', target: 'all_allies',
      desc: 'Nothing enters. Nothing leaves.',
      effect: { status: 'barrier', statusChance: 1, healPct: 0.3 } }
  ];

  /* How each acquisition method reads in the UI. */
  SD.ACQUISITION = {
    trainer: { name: 'Trainer', desc: 'Taught by any competent instructor.' },
    trainer_adv: { name: 'Advanced Trainer', desc: 'Taught by specialists, with prerequisites.' },
    quest: { name: 'Quest Reward', desc: 'Granted for completing guild or story work.' },
    dungeon_drop: { name: 'Dungeon Drop', desc: 'Found on dungeon floors as a skill orb.' },
    rare_trainer: { name: 'Rare Trainer', desc: 'Only a handful of masters teach this.' },
    skill_book: { name: 'Skill Book', desc: 'Learned from a rare tome.' },
    boss_drop: { name: 'Boss Drop', desc: 'Torn from a slain floor boss.' },
    faction_rep: { name: 'Faction Unlock', desc: 'Earned through standing with a nation or guild.' },
    world_event: { name: 'World Event', desc: 'Awarded by history-shaping deeds.' },
    deep_dungeon_clear: { name: 'Deep Clear', desc: 'Granted for conquering a high-tier dungeon.' },
    unique_legend: { name: 'Unique', desc: 'One-of-a-kind. Tied to a legend or relic.' },
    evolution: { name: 'Evolution', desc: 'Gained by evolving into a new form.' },
    innate: { name: 'Innate', desc: 'Born with it.' }
  };

  ISE.SkillData = SD;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
