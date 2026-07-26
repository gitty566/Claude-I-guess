/* races.js — base races and their branching evolution trees.
 *
 * A node is one *form*. Its `req` block is a set of conditions checked
 * against the character's live record (level, deeds, biome history, skill
 * mastery, catalysts consumed, whether it has been Named). Branches are
 * alternatives, not a sequence: two goblins with different histories end up
 * as different things.
 *
 * Requirement keys understood by game/evolution.js:
 *   level          minimum level
 *   kills          total kills
 *   killsElement   {element, n} kills of monsters of an element
 *   bosses         floor bosses slain
 *   dungeons       dungeons cleared
 *   biome          array of biome ids; must have spent time in one
 *   masteredCount  {n, min} skills at >= min mastery
 *   masteredElement{element, n, min} mastered skills of an element
 *   catalyst       catalyst item tag that must be consumed
 *   named          true = must have been Named by a Named/Unique existence
 *   relics         relics owned
 *   mount          true = must have a bonded mount companion
 *   fame           minimum world fame
 *   evolutions     minimum number of prior evolutions
 */
(function (ISE) {
  'use strict';

  var RD = {};

  /* Stat blocks are "at level 1 in this form". growth is per level. */
  function S(hp, mp, atk, def, mag, res, spd, lck) {
    return { hp: hp, mp: mp, atk: atk, def: def, mag: mag, res: res, spd: spd, lck: lck };
  }

  RD.BASE_RACES = [
    /* ------------------------------------------------------------- HUMAN */
    {
      id: 'human', name: 'Human', culture: 'common', playable: true,
      biomes: ['plains', 'grassland', 'hills', 'forest', 'coast', 'beach'],
      stats: S(52, 30, 11, 10, 11, 10, 11, 12),
      growth: S(9, 6, 2.2, 2.0, 2.2, 2.0, 2.1, 1.6),
      affinity: [], resist: {}, weak: {},
      traits: ['adaptable', 'social'],
      innate: [{ arch: 'slash', elem: 'physical' }, { arch: 'sense', elem: 'physical' }],
      learnRate: 1.15,
      desc: 'Short-lived, quick to learn, and stubbornly everywhere. Humans master ' +
        'skills faster than anything else with a pulse.',
      tree: {
        id: 'human', name: 'Human', tier: 1,
        branches: [
          {
            id: 'awakened', name: 'Awakened Human', tier: 2, mult: 1.45,
            req: { level: 10, masteredCount: { n: 3, min: 30 } },
            innate: [{ arch: 'aura', elem: 'energy' }],
            desc: 'Something in you woke up. Magicules answer more readily now.',
            branches: [
              {
                id: 'hero', name: 'Hero', tier: 3, mult: 2.1,
                req: { level: 22, bosses: 3, fame: 200 },
                innate: [{ arch: 'smite', elem: 'light' }, { arch: 'ward', elem: 'light' }],
                desc: 'The world has started telling stories about you, and stories have weight.',
                branches: [
                  {
                    id: 'saint', name: 'Saint', tier: 4, mult: 3.0,
                    req: { level: 34, masteredElement: { element: 'light', n: 3, min: 60 } },
                    innate: [{ arch: 'blessing', elem: 'light' }, { arch: 'bloom', elem: 'light' }],
                    desc: 'Light does not merely obey you; it prefers you.',
                    branches: [
                      {
                        id: 'demigod', name: 'Demigod', tier: 5, mult: 4.4,
                        req: { level: 50, named: true, relics: 2 },
                        innate: [{ arch: 'cataclysm', elem: 'light' }],
                        desc: 'A mortal shape wrapped around something that is no longer mortal.'
                      }
                    ]
                  },
                  {
                    id: 'champion', name: 'Champion', tier: 4, mult: 3.05,
                    req: { level: 34, kills: 400, masteredElement: { element: 'physical', n: 3, min: 60 } },
                    innate: [{ arch: 'execute', elem: 'physical' }, { arch: 'haste', elem: 'wind' }],
                    desc: 'No divine spark. Just an unreasonable amount of practice.',
                    branches: [
                      {
                        id: 'peerless', name: 'Peerless One', tier: 5, mult: 4.4,
                        req: { level: 50, named: true, bosses: 12 },
                        innate: [{ arch: 'cataclysm', elem: 'physical' }],
                        desc: 'There is no one left in the world who trains harder than you.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'sage', name: 'Sage', tier: 3, mult: 2.0,
                req: { level: 22, masteredCount: { n: 8, min: 50 } },
                innate: [{ arch: 'analyze', elem: 'psychic' }, { arch: 'mind', elem: 'psychic' }],
                desc: 'You stopped collecting spells and started understanding them.',
                branches: [
                  {
                    id: 'archmage', name: 'Archmage', tier: 4, mult: 3.0,
                    req: { level: 34, masteredCount: { n: 14, min: 60 } },
                    innate: [{ arch: 'storm', elem: 'energy' }, { arch: 'barrier', elem: 'order' }],
                    desc: 'Magic is no longer something you cast. It is something you are owed.',
                    branches: [
                      {
                        id: 'wiseman', name: 'True Sage', tier: 5, mult: 4.3,
                        req: { level: 50, named: true, masteredCount: { n: 20, min: 75 } },
                        innate: [{ arch: 'dominate', elem: 'psychic' }],
                        desc: 'A mind that holds the whole catalogue at once.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'warlord', name: 'Warlord', tier: 3, mult: 2.05,
                req: { level: 22, kills: 250, fame: 120 },
                innate: [{ arch: 'sweep', elem: 'physical' }, { arch: 'aura', elem: 'physical' }],
                desc: 'Armies form around people like you whether or not you wanted one.',
                branches: [
                  {
                    id: 'conqueror', name: 'Conqueror', tier: 4, mult: 3.1,
                    req: { level: 34, kills: 600, fame: 400 },
                    innate: [{ arch: 'terror', elem: 'shadow' }, { arch: 'crush', elem: 'earth' }],
                    desc: 'Borders are suggestions and you are an argument.',
                    branches: [
                      {
                        id: 'godking', name: 'God-King', tier: 5, mult: 4.5,
                        req: { level: 52, named: true, fame: 900 },
                        innate: [{ arch: 'tyranny', elem: 'order' }],
                        desc: 'Rule expressed as a physical law.'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ------------------------------------------------------------ GOBLIN */
    {
      id: 'goblin', name: 'Goblin', culture: 'orcish', playable: true,
      biomes: ['forest', 'deep_forest', 'hills', 'mountain', 'swamp', 'wasteland'],
      stats: S(40, 16, 12, 8, 6, 6, 13, 8),
      growth: S(8, 3, 2.5, 1.8, 1.2, 1.4, 2.3, 1.1),
      affinity: ['physical'], resist: { poison: 0.2 }, weak: { light: 0.15 },
      traits: ['breeds_fast', 'scavenger'],
      innate: [{ arch: 'fang', elem: 'physical' }],
      learnRate: 0.9,
      desc: 'The bottom rung of every monster ecology, and the one with the most ' +
        'room above it. Goblin evolution lines run further than almost anything.',
      tree: {
        id: 'goblin', name: 'Goblin', tier: 1,
        branches: [
          {
            id: 'hobgoblin', name: 'Hobgoblin', tier: 2, mult: 1.7,
            req: { level: 8, kills: 25 },
            innate: [{ arch: 'slash', elem: 'physical' }, { arch: 'body', elem: 'physical' }],
            desc: 'Twice the size, four times the sense. Hobgoblins remember grudges.',
            branches: [
              {
                id: 'goblin_king', name: 'Goblin King', tier: 3, mult: 2.4,
                req: { level: 20, kills: 120, fame: 100 },
                innate: [{ arch: 'aura', elem: 'physical' }, { arch: 'terror', elem: 'shadow' }],
                desc: 'Goblins are not solitary. Something has to be at the top of the pile.',
                branches: [
                  {
                    id: 'ogre_chief', name: 'Ogre-blood Chief', tier: 4, mult: 3.3,
                    req: { level: 32, catalyst: 'ogre_blood', kills: 300 },
                    innate: [{ arch: 'crush', elem: 'earth' }, { arch: 'feast', elem: 'physical' }],
                    desc: 'You drank something you should not have and it agreed with you.',
                    branches: [
                      {
                        id: 'goblin_emperor', name: 'Goblin Emperor', tier: 5, mult: 4.6,
                        req: { level: 48, named: true, fame: 600 },
                        innate: [{ arch: 'tyranny', elem: 'order' }, { arch: 'cataclysm', elem: 'physical' }],
                        desc: 'An entire species reorganised around one individual.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'goblin_rider', name: 'Goblin Rider', tier: 3, mult: 2.25,
                req: { level: 18, mount: true },
                innate: [{ arch: 'haste', elem: 'wind' }, { arch: 'lance', elem: 'physical' }],
                desc: 'Bonded to a mount, and twice the creature for it.',
                branches: [
                  {
                    id: 'wyvern_rider', name: 'Wyvern Rider', tier: 4, mult: 3.2,
                    req: { level: 30, mount: true, bosses: 3 },
                    innate: [{ arch: 'storm', elem: 'wind' }, { arch: 'instinct', elem: 'wind' }],
                    desc: 'The mount got worse to ride and much worse to fight.',
                    branches: [
                      {
                        id: 'sky_marshal', name: 'Sky Marshal', tier: 5, mult: 4.4,
                        req: { level: 46, named: true, mount: true },
                        innate: [{ arch: 'cataclysm', elem: 'wind' }],
                        desc: 'The sky over your territory belongs to you.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'goblin_shaman', name: 'Goblin Shaman', tier: 3, mult: 2.2,
                req: { level: 18, masteredCount: { n: 4, min: 40 } },
                innate: [{ arch: 'hex', elem: 'shadow' }, { arch: 'venom', elem: 'biological' }],
                desc: 'Goblin magic is ugly, improvised, and unreasonably effective.',
                branches: [
                  {
                    id: 'gob_witchlord', name: 'Witch-Lord', tier: 4, mult: 3.15,
                    req: { level: 30, masteredCount: { n: 9, min: 55 } },
                    innate: [{ arch: 'plague', elem: 'biological' }, { arch: 'drain', elem: 'shadow' }],
                    desc: 'Whole warrens now cough when you tell them to.',
                    branches: [
                      {
                        id: 'gob_hexarch', name: 'Hexarch', tier: 5, mult: 4.35,
                        req: { level: 46, named: true, masteredElement: { element: 'shadow', n: 4, min: 70 } },
                        innate: [{ arch: 'siphon', elem: 'chaos' }],
                        desc: 'Curses of yours have outlived the nations they were aimed at.'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* -------------------------------------------------------------- SLIME */
    {
      id: 'slime', name: 'Slime', culture: 'slime', playable: true,
      biomes: ['swamp', 'forest', 'jungle', 'coast', 'wasteland', 'manawaste'],
      stats: S(58, 40, 7, 12, 12, 14, 8, 14),
      growth: S(11, 8, 1.6, 2.4, 2.6, 2.6, 1.5, 2.0),
      affinity: ['biological'], resist: { physical: 0.35, poison: 0.5 }, weak: { light: 0.1 },
      traits: ['formless', 'absorbing'],
      innate: [{ arch: 'drain', elem: 'biological' }, { arch: 'regeneration', elem: 'biological' }],
      learnRate: 1.35,
      desc: 'A bag of magicules with opinions. Slimes eat what they fight and ' +
        'become slightly more like it. Nothing else scales the way they do.',
      tree: {
        id: 'slime', name: 'Slime', tier: 1,
        branches: [
          {
            id: 'elem_slime', name: 'Elemental Slime', tier: 2, mult: 1.55,
            req: { level: 8, biome: ['volcano', 'glacier', 'mountain', 'swamp', 'manawaste', 'desert', 'taiga'] },
            elemental: true,
            innate: [{ arch: 'bolt', elem: 'ELEM' }, { arch: 'affinity', elem: 'ELEM' }],
            desc: 'You have been living somewhere long enough that it lives in you.',
            branches: [
              {
                id: 'named_slime', name: 'Named Slime', tier: 3, mult: 2.5,
                req: { level: 20, named: true },
                innate: [{ arch: 'analyze', elem: 'psychic' }, { arch: 'aura', elem: 'ELEM' }],
                desc: 'A Name is not decoration. It fixes what you are and makes it heavier.',
                branches: [
                  {
                    id: 'demon_slime', name: 'Demon Slime', tier: 4, mult: 3.5,
                    req: { level: 34, kills: 400, masteredCount: { n: 10, min: 60 } },
                    innate: [{ arch: 'predation', elem: 'chaos' }, { arch: 'storm', elem: 'ELEM' }],
                    desc: 'The point where "harmless ooze" stops being funny.',
                    branches: [
                      {
                        id: 'true_slime', name: 'Ultimate Slime', tier: 6, mult: 6.2,
                        req: { level: 60, named: true, relics: 3, masteredCount: { n: 25, min: 80 } },
                        innate: [{ arch: 'cataclysm', elem: 'chaos' }, { arch: 'siphon', elem: 'unique' }],
                        mythical: true,
                        desc: 'A being that has eaten enough of the world to negotiate with it.'
                      }
                    ]
                  },
                  {
                    id: 'sage_slime', name: 'Sage Slime', tier: 4, mult: 3.35,
                    req: { level: 34, masteredCount: { n: 16, min: 65 } },
                    innate: [{ arch: 'mind', elem: 'psychic' }, { arch: 'barrier', elem: 'order' }],
                    desc: 'It turns out perfect recall is easy when you have no skull.',
                    branches: [
                      {
                        id: 'oracle_slime', name: 'Oracle Slime', tier: 5, mult: 4.7,
                        req: { level: 50, masteredCount: { n: 22, min: 78 } },
                        innate: [{ arch: 'dominate', elem: 'psychic' }],
                        desc: 'Answers questions that have not been asked yet.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'metal_slime', name: 'Metal Slime', tier: 3, mult: 2.3,
                req: { level: 18, catalyst: 'ore_core' },
                innate: [{ arch: 'ward', elem: 'earth' }, { arch: 'body', elem: 'earth' }],
                desc: 'Dense, glossy, and extremely annoying to hit.',
                branches: [
                  {
                    id: 'adamant_slime', name: 'Adamant Slime', tier: 4, mult: 3.3,
                    req: { level: 32, catalyst: 'adamant_shard' },
                    innate: [{ arch: 'barrier', elem: 'order' }, { arch: 'crush', elem: 'earth' }],
                    desc: 'Weapons chip on you now.'
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ----------------------------------------------------------- BEASTKIN */
    {
      id: 'beastkin', name: 'Beastkin', culture: 'beast', playable: true,
      biomes: ['savanna', 'plains', 'forest', 'taiga', 'jungle', 'hills'],
      stats: S(56, 20, 14, 11, 8, 9, 15, 10),
      growth: S(10, 4, 2.7, 2.1, 1.5, 1.7, 2.6, 1.4),
      affinity: ['physical', 'wind'], resist: {}, weak: { psychic: 0.15 },
      traits: ['pack', 'keen_senses'],
      innate: [{ arch: 'fang', elem: 'physical' }, { arch: 'instinct', elem: 'wind' }],
      learnRate: 1.0,
      desc: 'Half a dozen peoples under one word. Fast, physical, and organised ' +
        'around packs that outlive individuals.',
      tree: {
        id: 'beastkin', name: 'Beastkin', tier: 1,
        branches: [
          {
            id: 'awakened_beast', name: 'Awakened Beastkin', tier: 2, mult: 1.5,
            req: { level: 9, kills: 30 },
            innate: [{ arch: 'sweep', elem: 'physical' }],
            desc: 'The beast half stops being a metaphor.',
            branches: [
              {
                id: 'beast_lord', name: 'Beast Lord', tier: 3, mult: 2.3,
                req: { level: 21, kills: 150, fame: 80 },
                innate: [{ arch: 'aura', elem: 'physical' }, { arch: 'haste', elem: 'wind' }],
                desc: 'Packs bend toward you without being asked.',
                branches: [
                  {
                    id: 'sacred_beast', name: 'Sacred Beast', tier: 4, mult: 3.25,
                    req: { level: 33, biome: ['spiritwood', 'deep_forest', 'peak'], masteredElement: { element: 'light', n: 2, min: 50 } },
                    innate: [{ arch: 'blessing', elem: 'light' }, { arch: 'ray', elem: 'light' }],
                    desc: 'Something old in the land decided to invest in you.',
                    branches: [
                      {
                        id: 'divine_beast', name: 'Divine Beast', tier: 5, mult: 4.5,
                        req: { level: 49, named: true, bosses: 8 },
                        innate: [{ arch: 'cataclysm', elem: 'light' }],
                        desc: 'Shrines get built where you sleep.'
                      }
                    ]
                  },
                  {
                    id: 'demon_beast', name: 'Demon Beast', tier: 4, mult: 3.3,
                    req: { level: 33, kills: 450, biome: ['wasteland', 'manawaste', 'volcano', 'bloomrot'] },
                    innate: [{ arch: 'feast', elem: 'shadow' }, { arch: 'terror', elem: 'shadow' }],
                    desc: 'Something old in the land decided to eat you and lost.',
                    branches: [
                      {
                        id: 'calamity_beast', name: 'Calamity Beast', tier: 5, mult: 4.6,
                        req: { level: 49, named: true, kills: 900 },
                        innate: [{ arch: 'worldeater', elem: 'chaos' }],
                        desc: 'Nations file you under "natural disasters".'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ---------------------------------------------------------- DRAGONKIN */
    {
      id: 'dragonkin', name: 'Dragonkin', culture: 'draconic', playable: true,
      biomes: ['mountain', 'peak', 'volcano', 'wasteland', 'glacier'],
      stats: S(70, 34, 15, 15, 15, 14, 10, 9),
      growth: S(13, 7, 2.9, 2.8, 2.9, 2.6, 1.8, 1.2),
      affinity: ['fire'], resist: { fire: 0.3, physical: 0.15 }, weak: { ice: 0.1 },
      traits: ['hoarder', 'long_lived'],
      innate: [{ arch: 'bolt', elem: 'fire' }, { arch: 'body', elem: 'fire' }],
      learnRate: 0.8,
      desc: 'Born heavy. Dragonkin start ahead of everything else and climb ' +
        'slowly toward forms that other races only appear in stories about.',
      tree: {
        id: 'wyrmling', name: 'Wyrmling', tier: 1,
        branches: [
          {
            id: 'drake', name: 'Drake', tier: 2, mult: 1.8,
            req: { level: 12, kills: 40, biome: ['mountain', 'volcano', 'wasteland', 'hills', 'peak'] },
            innate: [{ arch: 'crush', elem: 'earth' }, { arch: 'ward', elem: 'earth' }],
            desc: 'Ground-bound, armoured, and immovable in a fight.',
            branches: [
              {
                id: 'elder_drake', name: 'Elder Drake', tier: 3, mult: 2.6,
                req: { level: 26, bosses: 4, relics: 1 },
                innate: [{ arch: 'nova', elem: 'fire' }, { arch: 'affinity', elem: 'fire' }],
                desc: 'Old enough to have a hoard worth killing you for.',
                branches: [
                  {
                    id: 'elder_dragon', name: 'Elder Dragon', tier: 5, mult: 4.8,
                    req: { level: 46, named: true, relics: 2, masteredCount: { n: 15, min: 65 } },
                    innate: [{ arch: 'cataclysm', elem: 'fire' }, { arch: 'terror', elem: 'shadow' }],
                    desc: 'A being nations plan foreign policy around.',
                    branches: [
                      {
                        id: 'true_dragon', name: 'True Dragon', tier: 6, mult: 7.0,
                        req: { level: 65, named: true, relics: 4, bosses: 20, masteredCount: { n: 28, min: 85 } },
                        innate: [{ arch: 'worldeater', elem: 'fire' }, { arch: 'infinite', elem: 'unique' }],
                        mythical: true,
                        desc: 'Not a strong monster. A different category of thing. There ' +
                          'are only ever a handful in a world, and killing one is not how they end.'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'wyvern', name: 'Wyvern', tier: 2, mult: 1.75,
            req: { level: 12, kills: 40, biome: ['peak', 'mountain', 'savanna', 'glacier', 'plains'] },
            innate: [{ arch: 'lance', elem: 'wind' }, { arch: 'instinct', elem: 'wind' }],
            desc: 'Traded plating for altitude. Nothing on the ground gets a say.',
            branches: [
              {
                id: 'storm_wyvern', name: 'Storm Wyvern', tier: 3, mult: 2.55,
                req: { level: 26, masteredElement: { element: 'wind', n: 3, min: 50 } },
                innate: [{ arch: 'storm', elem: 'lightning' }, { arch: 'haste', elem: 'wind' }],
                desc: 'You nest in weather systems now.',
                branches: [
                  {
                    id: 'sky_dragon', name: 'Sky Dragon', tier: 5, mult: 4.75,
                    req: { level: 46, named: true, bosses: 10 },
                    innate: [{ arch: 'cataclysm', elem: 'lightning' }],
                    desc: 'The storm has a name and it is yours.',
                    branches: [
                      {
                        id: 'true_dragon_sky', name: 'True Dragon (Tempest)', tier: 6, mult: 7.0,
                        req: { level: 65, named: true, relics: 4, bosses: 20, masteredCount: { n: 28, min: 85 } },
                        innate: [{ arch: 'worldeater', elem: 'lightning' }, { arch: 'infinite', elem: 'unique' }],
                        mythical: true,
                        desc: 'One of the world\'s handful of True Dragons, wearing weather as a body.'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ---------------------------------------------------------------- ELF */
    {
      id: 'elf', name: 'Elf', culture: 'elven', playable: true,
      biomes: ['forest', 'deep_forest', 'spiritwood', 'jungle', 'grassland'],
      stats: S(44, 44, 9, 8, 15, 13, 13, 11),
      growth: S(7, 9, 1.8, 1.6, 2.9, 2.4, 2.4, 1.5),
      affinity: ['biological', 'wind'], resist: { psychic: 0.2 }, weak: { chaos: 0.15 },
      traits: ['long_lived', 'attuned'],
      innate: [{ arch: 'bolt', elem: 'wind' }, { arch: 'mend', elem: 'biological' }],
      learnRate: 1.2,
      desc: 'Centuries of runway and a deep bench of magic. Slow to change, ' +
        'impossible to out-study.',
      tree: {
        id: 'elf', name: 'Elf', tier: 1,
        branches: [
          {
            id: 'high_elf', name: 'High Elf', tier: 2, mult: 1.5,
            req: { level: 10, masteredCount: { n: 4, min: 35 } },
            innate: [{ arch: 'mind', elem: 'psychic' }],
            desc: 'Formal training, formal bloodline, formally insufferable.',
            branches: [
              {
                id: 'spellsinger', name: 'Spellsinger', tier: 3, mult: 2.2,
                req: { level: 22, masteredCount: { n: 9, min: 50 } },
                innate: [{ arch: 'storm', elem: 'wind' }, { arch: 'blessing', elem: 'light' }],
                desc: 'Magic performed rather than cast.',
                branches: [
                  {
                    id: 'archdruid', name: 'Archdruid', tier: 4, mult: 3.1,
                    req: { level: 34, biome: ['deep_forest', 'spiritwood', 'jungle'], masteredElement: { element: 'biological', n: 4, min: 60 } },
                    innate: [{ arch: 'bloom', elem: 'biological' }, { arch: 'plague', elem: 'biological' }],
                    desc: 'The forest files you under "forest".',
                    branches: [
                      {
                        id: 'fae_sovereign', name: 'Fae Sovereign', tier: 5, mult: 4.4,
                        req: { level: 50, named: true, relics: 2 },
                        innate: [{ arch: 'creation', elem: 'unique' }],
                        desc: 'A season answers when you call it.'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'dark_elf', name: 'Dark Elf', tier: 2, mult: 1.55,
            req: { level: 10, biome: ['wasteland', 'manawaste', 'swamp', 'deep_forest', 'bloomrot'], kills: 40 },
            innate: [{ arch: 'veil', elem: 'shadow' }, { arch: 'venom', elem: 'shadow' }],
            desc: 'Exiled, or descended from exiles, and much better at knives.',
            branches: [
              {
                id: 'shadowblade', name: 'Shadowblade', tier: 3, mult: 2.25,
                req: { level: 22, kills: 160, masteredElement: { element: 'shadow', n: 2, min: 45 } },
                innate: [{ arch: 'execute', elem: 'shadow' }, { arch: 'instinct', elem: 'shadow' }],
                desc: 'You are only ever seen on purpose.',
                branches: [
                  {
                    id: 'night_sovereign', name: 'Night Sovereign', tier: 5, mult: 4.35,
                    req: { level: 48, named: true, kills: 600 },
                    innate: [{ arch: 'siphon', elem: 'shadow' }, { arch: 'terror', elem: 'shadow' }],
                    desc: 'Darkness is not where you hide. It is staff.'
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ------------------------------------------------------------- UNDEAD */
    {
      id: 'undead', name: 'Undead', culture: 'undead', playable: true,
      biomes: ['wasteland', 'swamp', 'tundra', 'manawaste', 'bloomrot', 'desert'],
      stats: S(50, 30, 11, 12, 12, 11, 8, 7),
      growth: S(10, 6, 2.3, 2.3, 2.4, 2.1, 1.5, 0.9),
      affinity: ['shadow'], resist: { shadow: 0.4, poison: 0.9, psychic: 0.3 },
      weak: { light: 0.5, biological: 0.2 },
      traits: ['tireless', 'no_breath'],
      innate: [{ arch: 'drain', elem: 'shadow' }],
      learnRate: 0.95,
      desc: 'Does not sleep, eat, age, or stop. Light hurts, and it hurts badly.',
      tree: {
        id: 'undead', name: 'Risen', tier: 1,
        branches: [
          {
            id: 'wight', name: 'Wight', tier: 2, mult: 1.6,
            req: { level: 10, kills: 30 },
            innate: [{ arch: 'sap', elem: 'shadow' }, { arch: 'body', elem: 'order' }],
            desc: 'Enough will left to make plans.',
            branches: [
              {
                id: 'death_knight', name: 'Death Knight', tier: 3, mult: 2.4,
                req: { level: 24, kills: 200, masteredElement: { element: 'physical', n: 2, min: 45 } },
                innate: [{ arch: 'smite', elem: 'shadow' }, { arch: 'ward', elem: 'order' }],
                desc: 'Discipline that outlived the body that learned it.',
                branches: [
                  {
                    id: 'revenant_king', name: 'Revenant King', tier: 4, mult: 3.3,
                    req: { level: 36, bosses: 6, relics: 1 },
                    innate: [{ arch: 'execute', elem: 'shadow' }, { arch: 'terror', elem: 'shadow' }],
                    desc: 'Crowned by nobody, obeyed anyway.',
                    branches: [
                      {
                        id: 'death_sovereign', name: 'Death Sovereign', tier: 5, mult: 4.6,
                        req: { level: 52, named: true, kills: 800 },
                        innate: [{ arch: 'worldeater', elem: 'shadow' }],
                        desc: 'Death answers to you rather than the other way around.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'lich', name: 'Lich', tier: 3, mult: 2.35,
                req: { level: 24, masteredCount: { n: 10, min: 55 }, catalyst: 'phylactery' },
                innate: [{ arch: 'plague', elem: 'shadow' }, { arch: 'mind', elem: 'order' }],
                desc: 'You put the important part somewhere safer than your chest.',
                branches: [
                  {
                    id: 'archlich', name: 'Archlich', tier: 4, mult: 3.35,
                    req: { level: 36, masteredCount: { n: 16, min: 65 } },
                    innate: [{ arch: 'cataclysm', elem: 'shadow' }, { arch: 'hush', elem: 'psychic' }],
                    desc: 'Centuries of uninterrupted study with no need to sleep.',
                    branches: [
                      {
                        id: 'eternal', name: 'The Eternal', tier: 5, mult: 4.55,
                        req: { level: 52, named: true, relics: 3 },
                        innate: [{ arch: 'infinite', elem: 'unique' }],
                        desc: 'Killing you has become an administrative problem.'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ------------------------------------------------------------- SPIRIT */
    {
      id: 'spirit', name: 'Spirit', culture: 'spirit', playable: true,
      biomes: ['spiritwood', 'peak', 'glacier', 'manawaste', 'glassfield', 'deep_forest'],
      stats: S(38, 56, 6, 7, 17, 16, 14, 12),
      growth: S(6, 11, 1.3, 1.4, 3.1, 2.8, 2.5, 1.6),
      affinity: ['energy'], resist: { physical: 0.5 }, weak: { order: 0.25 },
      traits: ['incorporeal', 'elemental'],
      innate: [{ arch: 'bolt', elem: 'energy' }, { arch: 'affinity', elem: 'energy' }],
      learnRate: 1.25,
      desc: 'Barely a body at all. Physical weapons find very little to hit, ' +
        'but binding magic finds far too much.',
      tree: {
        id: 'wisp', name: 'Wisp', tier: 1,
        branches: [
          {
            id: 'elemental', name: 'Elemental', tier: 2, mult: 1.6,
            req: { level: 9, biome: ['volcano', 'glacier', 'peak', 'manawaste', 'coast', 'spiritwood', 'desert'] },
            elemental: true,
            innate: [{ arch: 'nova', elem: 'ELEM' }, { arch: 'mastery', elem: 'ELEM' }],
            desc: 'The place you formed in has become the thing you are.',
            branches: [
              {
                id: 'greater_elemental', name: 'Greater Elemental', tier: 3, mult: 2.4,
                req: { level: 22, masteredCount: { n: 6, min: 50 } },
                innate: [{ arch: 'storm', elem: 'ELEM' }, { arch: 'barrier', elem: 'order' }],
                desc: 'Large enough to be mistaken for weather.',
                branches: [
                  {
                    id: 'spirit_lord', name: 'Spirit Lord', tier: 4, mult: 3.3,
                    req: { level: 34, named: true },
                    innate: [{ arch: 'blessing', elem: 'light' }, { arch: 'cataclysm', elem: 'ELEM' }],
                    desc: 'Lesser spirits orbit you and do as they are told.',
                    branches: [
                      {
                        id: 'elem_sovereign', name: 'Elemental Sovereign', tier: 5, mult: 4.6,
                        req: { level: 50, named: true, relics: 2, masteredCount: { n: 18, min: 70 } },
                        innate: [{ arch: 'creation', elem: 'unique' }],
                        desc: 'One of the fixed points the element itself is measured against.'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ---------------------------------------------------------- CONSTRUCT */
    {
      id: 'construct', name: 'Construct', culture: 'forged', playable: true,
      biomes: ['wasteland', 'glassfield', 'mountain', 'desert', 'hills'],
      stats: S(66, 24, 13, 18, 10, 13, 7, 6),
      growth: S(12, 5, 2.5, 3.2, 2.0, 2.4, 1.2, 0.8),
      affinity: ['order'], resist: { poison: 1.0, biological: 0.5, psychic: 0.4 },
      weak: { lightning: 0.35, chaos: 0.2 },
      traits: ['unliving', 'modular'],
      innate: [{ arch: 'ward', elem: 'order' }, { arch: 'body', elem: 'order' }],
      learnRate: 0.85,
      desc: 'Built, not born. Immune to most of what kills people and helpless ' +
        'against a good lightning bolt.',
      tree: {
        id: 'construct', name: 'Animate Shell', tier: 1,
        branches: [
          {
            id: 'warframe', name: 'Warframe', tier: 2, mult: 1.65,
            req: { level: 10, kills: 35, catalyst: 'ore_core' },
            innate: [{ arch: 'crush', elem: 'physical' }],
            desc: 'Someone up-armoured you, or you did it yourself.',
            branches: [
              {
                id: 'sentinel', name: 'Sentinel', tier: 3, mult: 2.4,
                req: { level: 24, kills: 180 },
                innate: [{ arch: 'sweep', elem: 'order' }, { arch: 'barrier', elem: 'order' }],
                desc: 'A standing order that has outlived whoever gave it.',
                branches: [
                  {
                    id: 'sentinel_prime', name: 'Sentinel Prime', tier: 4, mult: 3.3,
                    req: { level: 36, catalyst: 'adamant_shard', bosses: 5 },
                    innate: [{ arch: 'cataclysm', elem: 'energy' }, { arch: 'mark', elem: 'order' }],
                    desc: 'Command-tier chassis. You issue the standing orders now.',
                    branches: [
                      {
                        id: 'living_engine', name: 'Living Engine', tier: 5, mult: 4.5,
                        req: { level: 52, named: true, masteredCount: { n: 16, min: 70 } },
                        innate: [{ arch: 'dominate', elem: 'order' }],
                        desc: 'The distinction between machine and mind stopped being useful.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'automaton', name: 'Arcane Automaton', tier: 3, mult: 2.3,
                req: { level: 24, masteredCount: { n: 8, min: 50 } },
                innate: [{ arch: 'ray', elem: 'energy' }, { arch: 'mind', elem: 'energy' }],
                desc: 'Runes where the muscle should be.',
                branches: [
                  {
                    id: 'archive_prime', name: 'Archive Prime', tier: 4, mult: 3.25,
                    req: { level: 36, masteredCount: { n: 15, min: 62 } },
                    innate: [{ arch: 'storm', elem: 'energy' }, { arch: 'analyze', elem: 'order' }],
                    desc: 'You are the library and the librarian.'
                  }
                ]
              }
            ]
          }
        ]
      }
    },

    /* ----------------------------------------------------------- PLANTKIN */
    {
      id: 'plantkin', name: 'Plantkin', culture: 'verdant', playable: true,
      biomes: ['forest', 'deep_forest', 'jungle', 'swamp', 'bloomrot', 'spiritwood'],
      stats: S(62, 34, 10, 14, 13, 12, 6, 10),
      growth: S(12, 7, 2.1, 2.7, 2.5, 2.3, 1.1, 1.4),
      affinity: ['biological'], resist: { water: 0.4, earth: 0.3 },
      weak: { fire: 0.45, ice: 0.15 },
      traits: ['rooted', 'photosynthetic'],
      innate: [{ arch: 'regrowth', elem: 'biological' }, { arch: 'venom', elem: 'biological' }],
      learnRate: 1.05,
      desc: 'Slow, patient, and very hard to finish off — as long as nobody ' +
        'brings fire.',
      tree: {
        id: 'plantkin', name: 'Sprout', tier: 1,
        branches: [
          {
            id: 'bloomkin', name: 'Bloomkin', tier: 2, mult: 1.55,
            req: { level: 9, biome: ['forest', 'jungle', 'deep_forest', 'bloomrot', 'swamp'] },
            innate: [{ arch: 'bloom', elem: 'biological' }],
            desc: 'You flowered, and something in the soil noticed.',
            branches: [
              {
                id: 'treant', name: 'Treant', tier: 3, mult: 2.4,
                req: { level: 22, biome: ['deep_forest', 'spiritwood', 'jungle'] },
                innate: [{ arch: 'crush', elem: 'earth' }, { arch: 'body', elem: 'biological' }],
                desc: 'Big enough to be mistaken for landscape.',
                branches: [
                  {
                    id: 'elder_treant', name: 'Elder Treant', tier: 4, mult: 3.25,
                    req: { level: 34, masteredElement: { element: 'biological', n: 4, min: 60 } },
                    innate: [{ arch: 'plague', elem: 'biological' }, { arch: 'barrier', elem: 'earth' }],
                    desc: 'Roots under three separate nations.',
                    branches: [
                      {
                        id: 'worldtree', name: 'World Tree Scion', tier: 5, mult: 4.5,
                        req: { level: 50, named: true, relics: 2 },
                        innate: [{ arch: 'creation', elem: 'biological' }],
                        desc: 'A cutting from something that predates the continents.'
                      }
                    ]
                  }
                ]
              },
              {
                id: 'rotweaver', name: 'Rotweaver', tier: 3, mult: 2.35,
                req: { level: 22, biome: ['swamp', 'bloomrot', 'wasteland'], kills: 120 },
                innate: [{ arch: 'plague', elem: 'biological' }, { arch: 'drain', elem: 'biological' }],
                desc: 'Decay is just growth pointed the other way.',
                branches: [
                  {
                    id: 'blight_lord', name: 'Blight Lord', tier: 4, mult: 3.3,
                    req: { level: 34, kills: 400 },
                    innate: [{ arch: 'siphon', elem: 'biological' }, { arch: 'terror', elem: 'biological' }],
                    desc: 'Whole valleys have gone quiet on your account.'
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  ];

  /* Templates for the 2–3 races unique to each world, generated at genesis.
   * The genesis event picks a template and fills in element/theme/name. */
  RD.GENESIS_RACE_TEMPLATES = [
    {
      id: 'shardborn', nameTpl: '{Elem}shard {Kin}', culture: 'arcane',
      originTpl: 'When {event}, the survivors nearest the wound came back wrong — ' +
        'threaded through with {elem} and unable to put it down.',
      stats: S(48, 42, 11, 10, 15, 13, 11, 11),
      growth: S(8, 8, 2.1, 2.0, 2.8, 2.3, 2.0, 1.5),
      traits: ['crystalline', 'resonant'], learnRate: 1.1,
      biomes: ['glassfield', 'manawaste', 'mountain', 'wasteland']
    },
    {
      id: 'hollowed', nameTpl: 'Hollow {Kin}', culture: 'undead',
      originTpl: '{event} left a space where a people used to be. What walked ' +
        'out of it kept the shape and lost the rest.',
      stats: S(54, 36, 12, 12, 12, 12, 10, 9),
      growth: S(10, 6, 2.4, 2.3, 2.3, 2.2, 1.8, 1.1),
      traits: ['hollow', 'tireless'], learnRate: 1.0,
      biomes: ['wasteland', 'manawaste', 'tundra', 'swamp']
    },
    {
      id: 'chorus', nameTpl: '{Elem}chorus', culture: 'spirit',
      originTpl: 'A single voice from {event} never stopped. Those who heard it ' +
        'all the way through are no longer entirely separate people.',
      stats: S(44, 50, 8, 9, 16, 15, 12, 12),
      growth: S(7, 10, 1.6, 1.7, 3.0, 2.6, 2.2, 1.7),
      traits: ['collective', 'attuned'], learnRate: 1.2,
      biomes: ['spiritwood', 'glassfield', 'peak', 'coast']
    },
    {
      id: 'graft', nameTpl: '{Elem}graft', culture: 'verdant',
      originTpl: 'After {event}, the growth that covered the ruins started ' +
        'walking, wearing whatever it had grown through.',
      stats: S(60, 32, 13, 13, 12, 11, 9, 10),
      growth: S(11, 6, 2.5, 2.5, 2.2, 2.1, 1.6, 1.3),
      traits: ['grafted', 'regrowing'], learnRate: 0.95,
      biomes: ['bloomrot', 'jungle', 'swamp', 'deep_forest']
    },
    {
      id: 'ironkin', nameTpl: '{Elem}forged', culture: 'forged',
      originTpl: 'The war engines built for {event} were never stood down. ' +
        'Somewhere in the long silence afterwards, they began deciding things.',
      stats: S(64, 26, 14, 17, 11, 12, 8, 7),
      growth: S(12, 5, 2.6, 3.0, 2.0, 2.3, 1.4, 0.9),
      traits: ['unliving', 'disciplined'], learnRate: 0.9,
      biomes: ['glassfield', 'wasteland', 'mountain', 'desert']
    },
    {
      id: 'wyrmkin', nameTpl: '{Elem}scaled {Kin}', culture: 'draconic',
      originTpl: 'The blood spilled during {event} soaked into a bloodline that ' +
        'had been merely mortal the day before.',
      stats: S(66, 32, 15, 14, 14, 13, 10, 9),
      growth: S(12, 7, 2.8, 2.6, 2.7, 2.4, 1.7, 1.2),
      traits: ['hoarder', 'proud'], learnRate: 0.85,
      biomes: ['volcano', 'mountain', 'peak', 'wasteland']
    }
  ];

  RD.KIN_WORDS = ['kin', 'folk', 'born', 'blooded', 'walkers', 'children'];

  /* Catalysts: consumable items that unlock specific evolution branches. */
  RD.CATALYSTS = {
    ogre_blood: { name: 'Ogre Blood Vial', desc: 'Thick, hot, and still moving.', tier: 3 },
    ore_core: { name: 'Living Ore Core', desc: 'A metal seed that grows when swallowed.', tier: 2 },
    adamant_shard: { name: 'Adamant Shard', desc: 'Refuses to be scratched by anything.', tier: 4 },
    phylactery: { name: 'Empty Phylactery', desc: 'Waiting for someone to put themselves in it.', tier: 3 },
    dragon_heart: { name: 'Dragon Heart', desc: 'Still warm. Still beating. Still angry.', tier: 5 },
    spirit_tear: { name: 'Spirit Tear', desc: 'Condensed grief of something that never had a body.', tier: 4 },
    world_seed: { name: 'World Seed', desc: 'A cutting from something that predates the soil.', tier: 5 },
    chaos_pearl: { name: 'Chaos Pearl', desc: 'Its colour is not the same twice.', tier: 5 }
  };

  ISE.RaceData = RD;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
