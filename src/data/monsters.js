/* monsters.js — monster families. Each family is an ecology entry: where it
 * lives, what element it leans on, and a six-rung naming ladder so the same
 * family can appear as vermin on floor 1 and as a legend at tier 6.
 * Bosses are rolled from these and then given individual skill loadouts. */
(function (ISE) {
  'use strict';

  var MD = {};

  /* Role modifies the stat profile. All values are multipliers. */
  MD.ROLES = {
    brute: { hp: 1.35, mp: 0.6, atk: 1.3, def: 1.1, mag: 0.5, res: 0.8, spd: 0.75, lck: 0.9,
      name: 'Brute', prefers: ['crush', 'smite', 'sweep', 'fang'] },
    skirmisher: { hp: 0.85, mp: 0.9, atk: 1.1, def: 0.85, mag: 0.8, res: 0.9, spd: 1.45, lck: 1.15,
      name: 'Skirmisher', prefers: ['fang', 'slash', 'rend', 'haste', 'instinct'] },
    tank: { hp: 1.55, mp: 0.7, atk: 0.85, def: 1.55, mag: 0.7, res: 1.3, spd: 0.65, lck: 0.85,
      name: 'Bulwark', prefers: ['ward', 'crush', 'body', 'barrier'] },
    caster: { hp: 0.75, mp: 1.6, atk: 0.6, def: 0.75, mag: 1.5, res: 1.2, spd: 1.0, lck: 1.0,
      name: 'Caster', prefers: ['bolt', 'nova', 'hex', 'brand', 'ray', 'storm'] },
    assassin: { hp: 0.7, mp: 0.9, atk: 1.35, def: 0.7, mag: 0.9, res: 0.8, spd: 1.55, lck: 1.4,
      name: 'Stalker', prefers: ['execute', 'rend', 'veil', 'venom', 'slash'] },
    swarm: { hp: 0.5, mp: 0.5, atk: 0.8, def: 0.7, mag: 0.6, res: 0.6, spd: 1.2, lck: 1.0,
      name: 'Swarmer', prefers: ['fang', 'venom', 'shard'] },
    warden: { hp: 1.2, mp: 1.2, atk: 1.0, def: 1.15, mag: 1.15, res: 1.15, spd: 0.9, lck: 1.0,
      name: 'Warden', prefers: ['bind', 'ward', 'mend', 'shatter', 'barrier'] },
    horror: { hp: 1.15, mp: 1.3, atk: 1.15, def: 0.9, mag: 1.3, res: 1.0, spd: 1.0, lck: 0.9,
      name: 'Horror', prefers: ['terror', 'drain', 'plague', 'hex', 'siphon'] }
  };

  /* ladder[0..5] = the family's name at monster tiers 1..6. */
  MD.FAMILIES = [
    { id: 'wolf', kind: 'beast', role: 'skirmisher', element: 'physical',
      biomes: ['forest', 'taiga', 'tundra', 'plains', 'hills', 'deep_forest'],
      ladder: ['Grey Wolf', 'Dire Wolf', 'Winter Wolf', 'Shadow Fang', 'Fenrir-Kin', 'Fenrir'],
      pack: [2, 5], elements: ['physical', 'ice', 'shadow', 'wind'] },
    { id: 'goblinoid', kind: 'humanoid', role: 'swarm', element: 'physical',
      biomes: ['forest', 'hills', 'swamp', 'wasteland', 'mountain'],
      ladder: ['Goblin', 'Hobgoblin', 'Goblin Chief', 'Ogre', 'Ogre Lord', 'Kijin'],
      pack: [3, 6], elements: ['physical', 'earth', 'shadow'] },
    { id: 'slime', kind: 'ooze', role: 'tank', element: 'biological',
      biomes: ['swamp', 'jungle', 'forest', 'coast', 'manawaste', 'bloomrot'],
      ladder: ['Slime', 'Great Slime', 'Elemental Slime', 'King Slime', 'Named Slime', 'Demon Slime'],
      pack: [1, 3], elements: ['biological', 'water', 'fire', 'ice', 'chaos'] },
    { id: 'undead', kind: 'undead', role: 'brute', element: 'shadow',
      biomes: ['wasteland', 'swamp', 'tundra', 'desert', 'bloomrot'],
      ladder: ['Skeleton', 'Ghoul', 'Wight', 'Grave Knight', 'Revenant', 'Death Sovereign'],
      pack: [2, 5], elements: ['shadow', 'ice', 'physical', 'chaos'] },
    { id: 'spectre', kind: 'undead', role: 'horror', element: 'shadow',
      biomes: ['wasteland', 'manawaste', 'spiritwood', 'swamp', 'glacier'],
      ladder: ['Shade', 'Wraith', 'Banshee', 'Nightmare', 'Dread Phantom', 'Hollow King'],
      pack: [1, 3], elements: ['shadow', 'psychic', 'ice', 'chaos'] },
    { id: 'drake', kind: 'dragon', role: 'brute', element: 'fire',
      biomes: ['mountain', 'volcano', 'peak', 'wasteland', 'hills'],
      ladder: ['Lizardling', 'Drake', 'Wyvern', 'Elder Drake', 'Ancient Wyrm', 'Elder Dragon'],
      pack: [1, 2], elements: ['fire', 'lightning', 'ice', 'earth', 'chaos'] },
    { id: 'insect', kind: 'vermin', role: 'swarm', element: 'biological',
      biomes: ['jungle', 'forest', 'swamp', 'desert', 'bloomrot', 'deep_forest'],
      ladder: ['Biting Swarm', 'Carapace Crawler', 'Hive Warrior', 'Broodmother\'s Guard',
        'Chitin Tyrant', 'Hive Mind'],
      pack: [4, 8], elements: ['biological', 'earth', 'psychic'] },
    { id: 'golem', kind: 'construct', role: 'tank', element: 'earth',
      biomes: ['mountain', 'wasteland', 'glassfield', 'desert', 'hills'],
      ladder: ['Clay Golem', 'Stone Golem', 'Iron Golem', 'Rune Golem', 'Adamant Colossus',
        'Living Engine'],
      pack: [1, 2], elements: ['earth', 'order', 'energy', 'fire'] },
    { id: 'elemental', kind: 'spirit', role: 'caster', element: 'energy',
      biomes: ['manawaste', 'glacier', 'volcano', 'peak', 'coast', 'spiritwood', 'glassfield'],
      ladder: ['Wisp', 'Lesser Elemental', 'Elemental', 'Greater Elemental', 'Elemental Lord',
        'Elemental Sovereign'],
      pack: [1, 3], elements: ['fire', 'ice', 'lightning', 'water', 'wind', 'earth', 'energy'] },
    { id: 'treant', kind: 'plant', role: 'tank', element: 'biological',
      biomes: ['forest', 'deep_forest', 'jungle', 'spiritwood', 'bloomrot'],
      ladder: ['Sapling', 'Bramblewarden', 'Treant', 'Elder Treant', 'Grovekeeper', 'Heartwood'],
      pack: [1, 2], elements: ['biological', 'earth', 'water'] },
    { id: 'fungal', kind: 'plant', role: 'swarm', element: 'biological',
      biomes: ['swamp', 'bloomrot', 'jungle', 'deep_forest'],
      ladder: ['Sporeling', 'Myconid', 'Rotcap', 'Bloomrot Herald', 'Spore Tyrant', 'Great Mycelium'],
      pack: [3, 7], elements: ['biological', 'shadow', 'chaos'] },
    { id: 'beastman', kind: 'humanoid', role: 'brute', element: 'physical',
      biomes: ['savanna', 'plains', 'jungle', 'taiga', 'hills'],
      ladder: ['Gnoll', 'Beastman Raider', 'Beastman Champion', 'Beast Lord', 'Sacred Beast',
        'Divine Beast'],
      pack: [2, 5], elements: ['physical', 'wind', 'fire', 'light'] },
    { id: 'serpent', kind: 'beast', role: 'assassin', element: 'biological',
      biomes: ['jungle', 'swamp', 'desert', 'coast', 'bloomrot'],
      ladder: ['Viper', 'Constrictor', 'Basilisk', 'Amphisbaena', 'Hydra', 'World Serpent'],
      pack: [1, 3], elements: ['biological', 'water', 'shadow', 'earth'] },
    { id: 'raptor', kind: 'beast', role: 'skirmisher', element: 'wind',
      biomes: ['peak', 'mountain', 'savanna', 'plains', 'glacier'],
      ladder: ['Talonhawk', 'Rocbird', 'Storm Raptor', 'Thunderbird', 'Sky Tyrant', 'Tempest Roc'],
      pack: [2, 4], elements: ['wind', 'lightning', 'ice', 'physical'] },
    { id: 'aberration', kind: 'aberration', role: 'horror', element: 'chaos',
      biomes: ['manawaste', 'bloomrot', 'wasteland', 'glassfield'],
      ladder: ['Twitching Thing', 'Warped Horror', 'Rift-Spawn', 'Unmade', 'Chaos Herald',
        'Fragment of Ruin'],
      pack: [1, 3], elements: ['chaos', 'psychic', 'shadow', 'energy'] },
    { id: 'construct_arc', kind: 'construct', role: 'caster', element: 'order',
      biomes: ['glassfield', 'wasteland', 'mountain', 'desert'],
      ladder: ['Ward Servitor', 'Sigil Sentry', 'Arcane Automaton', 'Lattice Warden',
        'Axiom Engine', 'Perfect Form'],
      pack: [1, 3], elements: ['order', 'energy', 'light', 'psychic'] },
    { id: 'fey', kind: 'fey', role: 'assassin', element: 'psychic',
      biomes: ['spiritwood', 'deep_forest', 'jungle', 'grassland'],
      ladder: ['Pixie', 'Sprite', 'Thornmaiden', 'Fae Knight', 'Court Sovereign', 'Dream Tyrant'],
      pack: [2, 4], elements: ['psychic', 'biological', 'wind', 'light'] },
    { id: 'demon', kind: 'demon', role: 'horror', element: 'shadow',
      biomes: ['volcano', 'manawaste', 'wasteland', 'bloomrot'],
      ladder: ['Imp', 'Lesser Demon', 'Demon', 'Greater Demon', 'Demon Peer', 'Demon Lord'],
      pack: [1, 3], elements: ['shadow', 'fire', 'chaos', 'psychic'] },
    { id: 'angelic', kind: 'celestial', role: 'warden', element: 'light',
      biomes: ['peak', 'glassfield', 'spiritwood', 'glacier'],
      ladder: ['Luminary', 'Watcher', 'Seraph-Servitor', 'Judge', 'Archon', 'Throne'],
      pack: [1, 2], elements: ['light', 'order', 'energy'] },
    { id: 'aquatic', kind: 'beast', role: 'brute', element: 'water',
      biomes: ['coast', 'beach', 'swamp', 'jungle'],
      ladder: ['Reefclaw', 'Deep Lurker', 'Abyss Maw', 'Kraken Spawn', 'Leviathan Brood', 'Leviathan'],
      pack: [1, 3], elements: ['water', 'ice', 'lightning', 'biological'] },
    { id: 'giant', kind: 'giant', role: 'brute', element: 'earth',
      biomes: ['mountain', 'peak', 'tundra', 'glacier', 'hills'],
      ladder: ['Hill Brute', 'Stone Giant', 'Frost Giant', 'Storm Giant', 'Titan-Blooded', 'Titan'],
      pack: [1, 2], elements: ['earth', 'ice', 'lightning', 'physical'] },
    { id: 'wormkind', kind: 'vermin', role: 'brute', element: 'earth',
      biomes: ['desert', 'wasteland', 'mountain', 'manawaste'],
      ladder: ['Sand Crawler', 'Burrower', 'Devouring Worm', 'Great Wyrm', 'Dune Tyrant',
        'World-Gnawer'],
      pack: [1, 2], elements: ['earth', 'biological', 'chaos'] },
    { id: 'harpy', kind: 'humanoid', role: 'skirmisher', element: 'wind',
      biomes: ['peak', 'mountain', 'coast', 'savanna'],
      ladder: ['Harpy', 'Storm Harpy', 'Siren', 'Sky Matron', 'Tempest Queen', 'Skysovereign'],
      pack: [2, 5], elements: ['wind', 'psychic', 'lightning', 'water'] },
    { id: 'lizardfolk', kind: 'humanoid', role: 'warden', element: 'water',
      biomes: ['swamp', 'jungle', 'coast', 'beach'],
      ladder: ['Lizardfolk Scout', 'Lizardfolk Warrior', 'Marsh Champion', 'Naga',
        'Naga Sovereign', 'Tide Tyrant'],
      pack: [2, 4], elements: ['water', 'biological', 'earth', 'shadow'] },
    { id: 'phantom_beast', kind: 'spirit', role: 'caster', element: 'psychic',
      biomes: ['spiritwood', 'manawaste', 'glacier', 'peak'],
      ladder: ['Dream Fox', 'Mist Stalker', 'Nine-Tail', 'Vision Eater', 'Mind Tyrant',
        'Dream Sovereign'],
      pack: [1, 3], elements: ['psychic', 'shadow', 'light', 'chaos'] }
  ];

  MD.FAMILY_BY_ID = {};
  MD.FAMILIES.forEach(function (f) { MD.FAMILY_BY_ID[f.id] = f; });

  /* Titles bolted onto named individuals (bosses, mini-bosses, faction leaders). */
  MD.BOSS_TITLES = [
    'the Devourer', 'the Unbroken', 'Wound-Maker', 'the Patient', 'Ninefold',
    'the Hollow Crown', 'Bane of {place}', 'the Sleepless', 'Gate-Keeper',
    'the Last', 'the First', 'Skull-Throned', 'the Rotting Star', 'Silence-Bringer',
    'the Drowned', 'Ash-Wreathed', 'Thousand-Eye', 'the Unclean', 'Oath-Breaker',
    'the Long Hunger'
  ];

  /* Traits that get rolled onto named individuals for mechanical variety. */
  MD.BOSS_TRAITS = [
    { id: 'armored', name: 'Armoured', mods: { def: 0.35, res: 0.2 }, desc: 'Plated far past reason.' },
    { id: 'frenzied', name: 'Frenzied', mods: { atk: 0.4, def: -0.15, spd: 0.15 }, desc: 'Attacks recklessly and often.' },
    { id: 'arcane', name: 'Arcane-Touched', mods: { mag: 0.4, mp: 0.5 }, desc: 'Overflowing with magicules.' },
    { id: 'ancient', name: 'Ancient', mods: { hp: 0.4, res: 0.25, spd: -0.1 }, desc: 'Has survived far too long.' },
    { id: 'swift', name: 'Swift', mods: { spd: 0.4, lck: 0.2 }, desc: 'Acts before anything else does.' },
    { id: 'regenerating', name: 'Regenerating', mods: {}, passive: { regen: 0.05 }, desc: 'Wounds close as fast as they open.' },
    { id: 'venomous', name: 'Venomous', mods: {}, passive: { onHitStatus: 'poison' }, desc: 'Every strike leaves poison behind.' },
    { id: 'burning', name: 'Burning', mods: {}, passive: { onHitStatus: 'burn' }, desc: 'Wreathed in fire that spreads.' },
    { id: 'warded', name: 'Warded', mods: { res: 0.45 }, desc: 'Magic slides off it.' },
    { id: 'colossal', name: 'Colossal', mods: { hp: 0.7, atk: 0.2, spd: -0.2 }, desc: 'Far too large for the room.' },
    { id: 'phasing', name: 'Phasing', mods: {}, passive: { evade: 0.15 }, desc: 'Half of it is somewhere else.' },
    { id: 'commander', name: 'Commander', mods: { atk: 0.15 }, passive: { summons: true }, desc: 'Does not fight alone.' }
  ];

  /* Dungeon "themes" pick which families can spawn together. */
  MD.ECOLOGY_THEMES = [
    { id: 'beast_den', name: 'Beast Den', families: ['wolf', 'raptor', 'serpent', 'beastman', 'insect'] },
    { id: 'undead_crypt', name: 'Crypt', families: ['undead', 'spectre', 'demon'] },
    { id: 'goblin_warren', name: 'Warren', families: ['goblinoid', 'wolf', 'insect', 'fungal'] },
    { id: 'draconic', name: 'Wyrm Roost', families: ['drake', 'giant', 'raptor', 'elemental'] },
    { id: 'arcane_vault', name: 'Arcane Vault', families: ['construct_arc', 'golem', 'elemental', 'angelic'] },
    { id: 'verdant', name: 'Overgrowth', families: ['treant', 'fungal', 'insect', 'fey'] },
    { id: 'abyssal', name: 'Abyss', families: ['aberration', 'demon', 'spectre', 'phantom_beast'] },
    { id: 'drowned', name: 'Drowned Halls', families: ['aquatic', 'lizardfolk', 'serpent', 'elemental'] },
    { id: 'titan_hall', name: 'Titan Hall', families: ['giant', 'golem', 'wormkind', 'drake'] },
    { id: 'skyward', name: 'Skyward Reach', families: ['harpy', 'raptor', 'angelic', 'elemental'] },
    { id: 'mixed_wild', name: 'Wild Depths', families: ['wolf', 'insect', 'slime', 'fungal', 'serpent'] }
  ];

  /* Monster factions organise wild monsters into political actors. */
  MD.FACTION_KINDS = [
    { id: 'horde', name: 'Horde', families: ['goblinoid', 'beastman', 'wolf'], aggression: 0.8 },
    { id: 'brood', name: 'Brood', families: ['insect', 'serpent', 'wormkind'], aggression: 0.65 },
    { id: 'legion', name: 'Legion', families: ['undead', 'spectre'], aggression: 0.75 },
    { id: 'covenant', name: 'Covenant', families: ['demon', 'aberration'], aggression: 0.9 },
    { id: 'flight', name: 'Flight', families: ['drake', 'raptor', 'harpy'], aggression: 0.5 },
    { id: 'grove', name: 'Grove', families: ['treant', 'fungal', 'fey'], aggression: 0.35 },
    { id: 'court', name: 'Court', families: ['fey', 'phantom_beast', 'elemental'], aggression: 0.4 },
    { id: 'deep', name: 'Deep', families: ['aquatic', 'lizardfolk'], aggression: 0.55 }
  ];

  /* Drop tables reference these material ids. */
  MD.MONSTER_PARTS = {
    beast: 'Pelt', humanoid: 'Trophy', ooze: 'Core', undead: 'Grave Dust',
    dragon: 'Scale', vermin: 'Chitin', construct: 'Component', spirit: 'Essence',
    plant: 'Heartwood', aberration: 'Impossible Tissue', demon: 'Ichor',
    celestial: 'Feather', fey: 'Glamour', giant: 'Bone'
  };

  ISE.MonsterData = MD;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
