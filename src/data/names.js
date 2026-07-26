/* names.js — procedural naming. Everything named in the world (people,
 * nations, towns, dungeons, relics, monster clans) comes through here so
 * cultures read consistently: elven towns sound elven, orcish ones don't. */
(function (ISE) {
  'use strict';

  var U = ISE.U;

  /* Per-culture syllable banks. A culture is attached to each race in
   * races.js; unknown cultures fall back to 'common'. */
  var CULTURES = {
    common: {
      start: ['Al', 'Bran', 'Cor', 'Dun', 'Ed', 'Fal', 'Gar', 'Hal', 'Ing', 'Jor',
        'Kel', 'Lam', 'Mar', 'Nor', 'Os', 'Per', 'Quin', 'Rand', 'Sil', 'Tor',
        'Ul', 'Ver', 'Wyn', 'Yar'],
      mid: ['a', 'e', 'i', 'o', 'ra', 'de', 'li', 'mo', 'ne', 'ta', 'va', 'el', 'an'],
      end: ['ric', 'wyn', 'dor', 'mund', 'las', 'ton', 'ver', 'gar', 'ard', 'ley',
        'is', 'os', 'en', 'ia', 'eth'],
      placePre: ['Old', 'High', 'West', 'North', 'Grey', 'Red', 'Stone', 'Green', 'Fair', 'Iron'],
      placeSuf: ['ford', 'ton', 'burg', 'hold', 'mere', 'field', 'watch', 'gate',
        'reach', 'crest', 'bridge', 'haven', 'march', 'stead'],
      realm: ['Kingdom', 'Realm', 'Dominion', 'Duchy', 'Free Cities', 'Marches']
    },
    elven: {
      start: ['Ae', 'Cel', 'El', 'Fin', 'Gal', 'Il', 'Lae', 'Mith', 'Nym', 'Ori',
        'Syl', 'Thal', 'Ver', 'Yl'],
      mid: ['la', 'ri', 'the', 'nu', 'ae', 'si', 'lo', 'ma', 'ith', 'ari'],
      end: ['riel', 'dor', 'wen', 'thas', 'nor', 'lien', 'mir', 'sae', 'thil', 'anor'],
      placePre: ['Silver', 'Moon', 'Star', 'Dawn', 'Whisper', 'Sun', 'Dew', 'Amber'],
      placeSuf: ['thil', 'loren', 'wood', 'glade', 'spire', 'song', 'vale', 'bough', 'mere'],
      realm: ['Court', 'Conclave', 'Everwood', 'Sylvan Accord', 'Bloomrealm']
    },
    orcish: {
      start: ['Gro', 'Bur', 'Kra', 'Mog', 'Ur', 'Zag', 'Thok', 'Rag', 'Gul', 'Nak',
        'Dro', 'Hru', 'Skar'],
      mid: ['ga', 'zu', 'ru', 'ok', 'ar', 'ug', 'nak', 'or'],
      end: ['ash', 'gar', 'muk', 'zog', 'kar', 'nak', 'thul', 'grim', 'dak', 'ur'],
      placePre: ['Blood', 'Skull', 'Iron', 'Ash', 'Bone', 'War', 'Rust', 'Gore'],
      placeSuf: ['krag', 'hold', 'maw', 'pit', 'fang', 'stake', 'grond', 'gash'],
      realm: ['Horde', 'Warbands', 'Clans', 'Iron Host', 'Warcamp']
    },
    draconic: {
      start: ['Vor', 'Zar', 'Kal', 'Sar', 'Ny', 'Xan', 'Dra', 'Ther', 'Ig', 'Auri'],
      mid: ['ka', 'thi', 'zo', 'rha', 'ax', 'uz', 'ei', 'yr'],
      end: ['dax', 'rion', 'thyr', 'zaeth', 'mus', 'kor', 'vax', 'ynn', 'gorn'],
      placePre: ['Ember', 'Wyrm', 'Scale', 'Cinder', 'Sky', 'Storm', 'Basalt'],
      placeSuf: ['roost', 'perch', 'caldera', 'spire', 'aerie', 'throne', 'ridge'],
      realm: ['Ascendancy', 'Wyrmrealm', 'Skyhold', 'Dominion', 'Flight']
    },
    undead: {
      start: ['Mor', 'Nec', 'Vel', 'Sar', 'Ash', 'Gri', 'Um', 'Cas', 'Lich', 'Thren'],
      mid: ['os', 'ath', 'ul', 'ir', 'en', 'zar', 'om'],
      end: ['mort', 'rath', 'ux', 'esh', 'ghast', 'olis', 'vane', 'crypt', 'shade'],
      placePre: ['Pale', 'Silent', 'Hollow', 'Grave', 'Ash', 'Weeping', 'Last'],
      placeSuf: ['barrow', 'crypt', 'ossuary', 'requiem', 'mourn', 'hollow', 'tomb'],
      realm: ['Dominion', 'Pale Throne', 'Sepulchre', 'Cold Empire', 'Quietlands']
    },
    fey: {
      start: ['Pip', 'Wis', 'Nim', 'Lu', 'Fae', 'Tir', 'Mel', 'Ari', 'Sha'],
      mid: ['la', 'me', 'wi', 'sy', 'lo', 'ni'],
      end: ['spark', 'wisp', 'bell', 'dew', 'song', 'brook', 'lume', 'shine'],
      placePre: ['Glimmer', 'Hush', 'Thistle', 'Honey', 'Mirth', 'Glass'],
      placeSuf: ['ring', 'hollow', 'bloom', 'chime', 'fen', 'wander', 'grove'],
      realm: ['Wilds', 'Ringlands', 'Hidden Court', 'Dreaming', 'Bloomwild']
    },
    beast: {
      start: ['Rau', 'Kar', 'Tou', 'Gen', 'Sha', 'Mau', 'Ren', 'Bha', 'Kir'],
      mid: ['ka', 'ru', 'na', 'sha', 'to', 'mi'],
      end: ['fang', 'claw', 'mane', 'pelt', 'roar', 'tail', 'stride', 'howl'],
      placePre: ['Sun', 'Wind', 'Great', 'Free', 'Wander', 'Red', 'Long'],
      placeSuf: ['plain', 'run', 'camp', 'range', 'trail', 'kraal', 'hunt'],
      realm: ['Packlands', 'Confederation', 'Free Tribes', 'Great Range', 'Prideholds']
    },
    arcane: {
      start: ['Ther', 'Ax', 'Ob', 'Ver', 'Zeth', 'Cir', 'Ka', 'Um', 'Ny'],
      mid: ['io', 'ae', 'yr', 'os', 'ux', 'eth'],
      end: ['mancer', 'ex', 'ion', 'arch', 'um', 'ith', 'ory', 'ax'],
      placePre: ['Prism', 'Rune', 'Null', 'Aether', 'Vault', 'Sigil', 'Ley'],
      placeSuf: ['spire', 'circle', 'archive', 'nexus', 'font', 'lattice', 'seal'],
      realm: ['Magocracy', 'Conclave', 'Circle', 'Assembly', 'Athenaeum']
    },
    verdant: {
      start: ['Bry', 'Thal', 'Rho', 'Sap', 'Vine', 'Mor', 'Cel', 'Fen'],
      mid: ['o', 'ia', 'un', 'ae', 'ro'],
      end: ['root', 'bloom', 'thorn', 'bark', 'seed', 'frond', 'sprout', 'briar'],
      placePre: ['Deep', 'Green', 'Thorn', 'Moss', 'Quiet', 'Old'],
      placeSuf: ['grove', 'canopy', 'tangle', 'heart', 'bower', 'mire', 'rise'],
      realm: ['Rootspeak', 'Green Compact', 'Wildhome', 'Verdance', 'Seed Council']
    },
    forged: {
      start: ['Kor', 'Vex', 'Ord', 'Tal', 'Mek', 'Zin', 'Cog', 'Hal'],
      mid: ['ir', 'os', 'un', 'ex', 'ar'],
      end: ['-9', '-Prime', 'ex', 'mech', 'core', 'frame', 'unit', 'ax'],
      placePre: ['Bright', 'Brass', 'Grand', 'Still', 'Deep', 'First'],
      placeSuf: ['foundry', 'anvil', 'works', 'engine', 'lathe', 'forge', 'array'],
      realm: ['Assembly', 'Concordance', 'Forgestate', 'Directive', 'Great Works']
    },
    slime: {
      start: ['Glu', 'Ooz', 'Vis', 'Mu', 'Bly', 'Squ', 'Gel'],
      mid: ['o', 'u', 'i', 'ee'],
      end: ['bb', 'lch', 'sh', 'pp', 'gm', 'x'],
      placePre: ['Damp', 'Sunken', 'Soft', 'Clear', 'Weeping'],
      placeSuf: ['pool', 'sump', 'basin', 'seep', 'well', 'bath'],
      realm: ['Confluence', 'Union', 'Great Pool', 'Amalgam', 'Communion']
    },
    spirit: {
      start: ['Ae', 'Zeph', 'Lum', 'Ori', 'Vay', 'Hes', 'Sol', 'Um'],
      mid: ['ri', 'a', 'no', 'the', 'lu'],
      end: ['ael', 'is', 'une', 'yr', 'ith', 'ora', 'eon'],
      placePre: ['Pale', 'Bright', 'Thin', 'Wandering', 'Veiled'],
      placeSuf: ['veil', 'font', 'breath', 'shrine', 'echo', 'gate'],
      realm: ['Choir', 'Veil', 'Communion', 'Concord', 'Breath']
    }
  };

  var EPITHETS = {
    warlike: ['the Unbroken', 'the Bloodhand', 'Ironjaw', 'the Siegebreaker',
      'the Red', 'Skullbearer', 'the Relentless'],
    wise: ['the Wise', 'the Grey', 'the Patient', 'Starreader', 'the Deep-Thinking',
      'Lorekeeper', 'the Quiet'],
    dark: ['the Pale', 'the Devourer', 'Gravecaller', 'the Unmourned',
      'the Hollow', 'Nightbound'],
    holy: ['the Radiant', 'the Blessed', 'Dawnbringer', 'the Pure', 'Lightshod'],
    cunning: ['the Fox', 'Silvertongue', 'the Unseen', 'Coinhand', 'the Sly'],
    monstrous: ['the Ravening', 'World-Eater', 'the Many-Mouthed', 'the Abomination',
      'the Endless Hunger'],
    heroic: ['the Brave', 'the Storm', 'Kingslayer', 'the Vanguard', 'Oathkeeper',
      'the Unyielding']
  };

  var DUNGEON_FORMS = [
    { form: 'Ruins', tpl: ['Ruins of {place}', 'The {adj} Ruins', '{place} Ruins'] },
    { form: 'Cavern', tpl: ['{adj} Caverns', 'The {adj} Deep', 'Caves of {place}'] },
    { form: 'Tower', tpl: ['The {adj} Tower', 'Tower of {place}', '{place} Spire'] },
    { form: 'Crypt', tpl: ['Crypt of {place}', 'The {adj} Ossuary', '{place} Barrows'] },
    { form: 'Labyrinth', tpl: ['The {adj} Labyrinth', 'Maze of {place}', '{place} Warrens'] },
    { form: 'Temple', tpl: ['Temple of {place}', 'The {adj} Sanctum', '{place} Reliquary'] },
    { form: 'Mine', tpl: ['{place} Deepworks', 'The {adj} Shafts', 'Mines of {place}'] },
    { form: 'Nest', tpl: ['The {adj} Nest', '{place} Hive', 'Brood of {place}'] },
    { form: 'Rift', tpl: ['The {adj} Rift', 'Rift of {place}', '{place} Fracture'] },
    { form: 'Vault', tpl: ['Vault of {place}', 'The {adj} Vault', '{place} Undercroft'] }
  ];

  var DUNGEON_ADJ = ['Sunken', 'Weeping', 'Shattered', 'Whispering', 'Forgotten',
    'Burning', 'Frozen', 'Crawling', 'Endless', 'Hungering', 'Silent', 'Bleeding',
    'Twisted', 'Gilded', 'Drowned', 'Screaming', 'Blighted', 'Radiant', 'Howling',
    'Rotting', 'Glass', 'Obsidian', 'Verdigris', 'Starless'];

  var RELIC_NOUNS = {
    weapon: ['Blade', 'Edge', 'Fang', 'Spear', 'Axe', 'Warhammer', 'Bow', 'Scythe',
      'Glaive', 'Sabre', 'Cleaver', 'Lance'],
    armor: ['Plate', 'Mail', 'Aegis', 'Shell', 'Carapace', 'Robe', 'Vestment', 'Bulwark'],
    accessory: ['Ring', 'Circlet', 'Amulet', 'Sigil', 'Band', 'Pendant', 'Crown', 'Torc'],
    artifact: ['Codex', 'Orb', 'Chalice', 'Mirror', 'Key', 'Heart', 'Seed', 'Engine',
      'Loom', 'Lantern', 'Horn', 'Tome']
  };

  var RELIC_ADJ = ['Undying', 'First', 'Last', 'Weeping', 'Sundered', 'Ninefold',
    'Hollow', 'Radiant', 'Devouring', 'Silent', 'Eternal', 'Broken', 'Crowned',
    'Wandering', 'Sleeping', 'Burning', 'Drowned', 'Unwritten', 'Nameless'];

  var RELIC_OF = ['Dawn', 'Ash', 'Winter', 'the Abyss', 'Kings', 'the Storm',
    'Endings', 'the Deep', 'Sorrow', 'the Sun', 'Ruin', 'Oaths', 'the Wound',
    'Silence', 'Hunger', 'the Tide', 'Judgement', 'the Void'];

  var CLAN_PRE = ['Blood', 'Iron', 'Bone', 'Storm', 'Night', 'Ash', 'Green', 'Black',
    'Red', 'Frost', 'Rot', 'Gore', 'Deep', 'Silent'];
  var CLAN_SUF = ['fang', 'claw', 'maw', 'horde', 'brood', 'pack', 'swarm', 'kin',
    'howl', 'talon', 'coil', 'spawn'];

  var Names = {};
  Names.CULTURES = CULTURES;

  function bank(culture) { return CULTURES[culture] || CULTURES.common; }
  Names.bank = bank;

  Names.person = function (rng, culture) {
    var b = bank(culture);
    var n = b.start[Math.floor(rng.next() * b.start.length)];
    if (rng.chance(0.55)) n += b.mid[Math.floor(rng.next() * b.mid.length)];
    n += b.end[Math.floor(rng.next() * b.end.length)];
    return U.capitalize(n);
  };

  Names.fullPerson = function (rng, culture) {
    var first = Names.person(rng, culture);
    if (rng.chance(0.45)) {
      var b = bank(culture);
      var house = U.capitalize(rng.pick(b.placePre) + rng.pick(b.placeSuf));
      return first + ' of ' + house;
    }
    return first;
  };

  Names.epithet = function (rng, flavor) {
    var pool = EPITHETS[flavor] || EPITHETS.heroic;
    return rng.pick(pool);
  };

  Names.titled = function (rng, culture, flavor) {
    return Names.person(rng, culture) + ' ' + Names.epithet(rng, flavor);
  };

  Names.place = function (rng, culture) {
    var b = bank(culture);
    if (rng.chance(0.5)) {
      return rng.pick(b.placePre) + rng.pick(b.placeSuf).toLowerCase();
    }
    return U.capitalize(rng.pick(b.start).toLowerCase()) + rng.pick(b.placeSuf);
  };

  /* `kind` lets the caller force the political form (Kingdom, Horde…) so a
   * republic is never accidentally named "Dominion of ...". */
  Names.nation = function (rng, culture, ruler, kind) {
    var b = bank(culture);
    var core = Names.place(rng, culture);
    var word = kind || rng.pick(b.realm);
    var pattern = rng.int(0, 3);
    if (pattern === 0) return word + ' of ' + core;
    if (pattern === 1) return 'The ' + core + ' ' + word;
    if (pattern === 2 && ruler) return word + ' of ' + ruler;
    return 'The ' + core + ' ' + word;
  };

  Names.dungeon = function (rng, culture, form) {
    var chosen = form
      ? U.maxBy(DUNGEON_FORMS, function (f) { return f.form === form ? 1 : 0; })
      : rng.pick(DUNGEON_FORMS);
    var tpl = rng.pick(chosen.tpl);
    return {
      name: U.fill(tpl, {
        place: Names.place(rng, culture),
        adj: rng.pick(DUNGEON_ADJ)
      }),
      form: chosen.form
    };
  };

  Names.relic = function (rng, slot) {
    var noun = rng.pick(RELIC_NOUNS[slot] || RELIC_NOUNS.artifact);
    var roll = rng.int(0, 2);
    if (roll === 0) return 'The ' + rng.pick(RELIC_ADJ) + ' ' + noun;
    if (roll === 1) return noun + ' of ' + rng.pick(RELIC_OF);
    return 'The ' + noun + ' of ' + rng.pick(RELIC_OF);
  };

  Names.clan = function (rng) {
    return rng.pick(CLAN_PRE) + rng.pick(CLAN_SUF);
  };

  Names.continent = function (rng, culture) {
    var b = bank(culture);
    var base = U.capitalize(rng.pick(b.start).toLowerCase() + rng.pick(b.mid) + rng.pick(b.end));
    var forms = ['The ' + base + ' Expanse', base, base + 'ia', 'Greater ' + base,
      'The ' + base + ' Reach'];
    return rng.pick(forms);
  };

  Names.region = function (rng, biomeName) {
    var adj = ['Broken', 'Endless', 'Whispering', 'Golden', 'Cold', 'Deep', 'Wild',
      'Grey', 'Old', 'Bitter', 'Sunless', 'Wide'];
    return 'The ' + rng.pick(adj) + ' ' + biomeName;
  };

  ISE.Names = Names;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
