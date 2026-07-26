/* events.js — the event rule table that drives both the Phase B history
 * simulation and the live world clock.
 *
 * A rule is data: a scope (what it needs picked for it), weight modifiers,
 * declarative preconditions, and the id of a procedure in sim/procs.js that
 * applies the mechanical change. The legend line is a template filled from
 * whatever the procedure returns. Adding an event means adding a row here
 * plus (only if it does something genuinely new) a procedure.
 *
 * scope values:
 *   world         no subject
 *   nation        one nation
 *   nation_pair   two nations that share a border or are known to each other
 *   settlement    one settlement
 *   dungeon       one dungeon
 *   faction       one monster faction
 *   hero          one living notable NPC
 */
(function (ISE) {
  'use strict';

  var ED = {};

  /* Weight modifier keys are world-gen parameters; the value is an exponent
   * applied as param^k, so 1.5 means "strongly scaled by this parameter". */
  ED.EVENTS = [
    /* ------------------------------------------------------------- war */
    {
      id: 'declare_war', name: 'Declaration of War', scope: 'nation_pair',
      weight: 7, mods: { warTendency: 2.0 },
      when: [{ relationBelow: -15 }, { atWar: false }],
      proc: 'declareWar', tags: ['war', 'politics'],
      legend: '{a} declared war on {b}{cause}.'
    },
    {
      id: 'battle', name: 'Field Battle', scope: 'nation_pair',
      weight: 22, mods: { warTendency: 0.6 },
      when: [{ atWar: true }],
      proc: 'battle', tags: ['war'],
      legend: 'The armies of {a} and {b} met {place}. {result}'
    },
    {
      id: 'siege', name: 'Siege', scope: 'nation_pair',
      weight: 9, mods: { warTendency: 0.8 },
      when: [{ atWar: true }, { warYears: 2 }],
      proc: 'siege', tags: ['war', 'settlement'],
      legend: '{a} laid siege to {settlement}. {result}'
    },
    {
      id: 'peace', name: 'Peace Accord', scope: 'nation_pair',
      weight: 12, mods: { warTendency: -0.8 },
      when: [{ atWar: true }, { warYears: 2 }],
      proc: 'makePeace', tags: ['war', 'politics'],
      legend: '{a} and {b} signed terms at {place}, ending {duration} of war.'
    },
    {
      id: 'annex', name: 'Annexation', scope: 'nation_pair',
      weight: 4, mods: { warTendency: 1.2 },
      when: [{ atWar: true }, { strengthRatio: 3.0 }],
      proc: 'annex', tags: ['war', 'politics'],
      legend: '{a} broke {b} utterly and took {place} for itself.'
    },

    /* -------------------------------------------------------- diplomacy */
    {
      id: 'alliance', name: 'Alliance', scope: 'nation_pair',
      weight: 8, mods: { warTendency: -1.0 },
      when: [{ relationAbove: 35 }, { atWar: false }],
      proc: 'alliance', tags: ['politics'],
      legend: '{a} and {b} swore alliance at {place}.'
    },
    {
      id: 'royal_marriage', name: 'Royal Marriage', scope: 'nation_pair',
      weight: 6, mods: { warTendency: -0.5 },
      when: [{ relationAbove: 10 }, { atWar: false }],
      proc: 'marriage', tags: ['politics'],
      legend: 'A marriage bound the ruling houses of {a} and {b}.'
    },
    {
      id: 'trade_pact', name: 'Trade Pact', scope: 'nation_pair',
      weight: 10, mods: { warTendency: -0.4 },
      when: [{ relationAbove: 0 }, { atWar: false }],
      proc: 'tradePact', tags: ['politics', 'economy'],
      legend: '{a} and {b} opened the {place} road to free trade.'
    },
    {
      id: 'betrayal', name: 'Betrayal', scope: 'nation_pair',
      weight: 5, mods: { warTendency: 1.4 },
      when: [{ allied: true }],
      proc: 'betrayal', tags: ['politics', 'war'],
      legend: '{a} broke its oath to {b}. The alliance died at {place}.'
    },
    {
      id: 'border_dispute', name: 'Border Dispute', scope: 'nation_pair',
      weight: 16, mods: { warTendency: 0.8 },
      when: [{ atWar: false }, { sharesBorder: true }],
      proc: 'relationShift', args: { delta: -14 }, tags: ['politics'],
      legend: 'A dispute over the {place} frontier soured relations between {a} and {b}.'
    },

    /* ------------------------------------------------------- internal */
    {
      id: 'golden_age', name: 'Golden Age', scope: 'nation',
      weight: 6, mods: {},
      when: [{ stabilityAbove: 60 }],
      proc: 'goldenAge', tags: ['economy'],
      legend: '{a} entered a golden age under {ruler}. Coffers and granaries filled.'
    },
    {
      id: 'famine', name: 'Famine', scope: 'nation',
      weight: 7, mods: {},
      when: [],
      proc: 'famine', tags: ['disaster'],
      legend: 'Famine struck {a}. {detail}'
    },
    {
      id: 'plague', name: 'Plague', scope: 'nation',
      weight: 6, mods: { magicDensity: 0.4 },
      when: [],
      proc: 'plague', tags: ['disaster'],
      legend: 'A plague ran through {a}, killing {detail}.'
    },
    {
      id: 'rebellion', name: 'Rebellion', scope: 'nation',
      weight: 6, mods: { warTendency: 0.7 },
      when: [{ stabilityBelow: 35 }],
      proc: 'rebellion', tags: ['politics', 'war'],
      legend: 'Rebellion broke out in {a}. {result}'
    },
    {
      id: 'successor_state', name: 'Secession', scope: 'nation',
      weight: 5, mods: { warTendency: 0.6 },
      when: [{ stabilityBelow: 34 }, { settlementsAbove: 5 }],
      proc: 'successorState', tags: ['politics'],
      legend: '{settlement} and {count} other holdings broke from {a}. They call ' +
        'themselves {newNation} now.'
    },
    {
      id: 'succession', name: 'Succession', scope: 'nation',
      weight: 11, mods: {},
      when: [{ rulerAgeAbove: 50 }],
      proc: 'succession', tags: ['politics'],
      legend: '{ruler} of {a} died. {heir} took the throne.'
    },
    {
      id: 'expansion', name: 'Expansion', scope: 'nation',
      weight: 13, mods: {},
      when: [{ stabilityAbove: 45 }],
      proc: 'expand', tags: ['politics'],
      legend: '{a} settled {place}, pushing its borders outward.'
    },
    {
      id: 'found_settlement', name: 'Founding', scope: 'nation',
      weight: 6, mods: { settlementDensity: 1.2 },
      when: [{ stabilityAbove: 40 }],
      proc: 'foundSettlement', tags: ['settlement'],
      legend: '{a} founded {settlement} on the {place} frontier.'
    },
    {
      id: 'guild_charter', name: 'Guild Charter', scope: 'nation',
      weight: 5, mods: {},
      when: [{ hasCity: true }, { noGuildBranch: true }],
      proc: 'guildCharter', tags: ['guild'],
      legend: 'The Adventurers\' Guild opened a chapter house in {settlement}.'
    },

    /* --------------------------------------------------- monsters/wild */
    {
      id: 'monster_surge', name: 'Monster Surge', scope: 'faction',
      weight: 14, mods: { monsterCeiling: 0.9, magicDensity: 0.5 },
      when: [],
      proc: 'factionGrowth', tags: ['monster'],
      legend: 'The {faction} swelled in the {place}. Travellers stopped using the road.'
    },
    {
      id: 'raid', name: 'Monster Raid', scope: 'faction',
      weight: 16, mods: { monsterCeiling: 0.7 },
      when: [{ factionStrengthRatio: 1.1 }],
      proc: 'raid', tags: ['monster', 'settlement'],
      legend: 'The {faction} fell upon {settlement}. {result}'
    },
    {
      id: 'punitive', name: 'Punitive Expedition', scope: 'nation',
      weight: 15, mods: { warTendency: 0.4 },
      when: [{ militaryAbove: 45 }, { factionInRange: 22 }],
      proc: 'punitiveExpedition', tags: ['monster', 'war'],
      legend: '{a} marched on the {faction} in {place}. {result}'
    },
    {
      id: 'dungeon_reclaimed', name: 'A New Master', scope: 'dungeon',
      weight: 20, mods: { monsterCeiling: 0.8, magicDensity: 0.5 },
      when: [{ bossAlive: false }, { clearedYearsAgo: 6 }],
      proc: 'repopulateDungeon', tags: ['dungeon', 'monster'],
      legend: '{species} took the throne room of {dungeon}. It calls itself {boss}.'
    },
    {
      id: 'boss_evolution', name: 'Evolution', scope: 'dungeon',
      weight: 10, mods: { monsterCeiling: 1.3, magicDensity: 0.6 },
      when: [{ bossAlive: true }, { bossAgeAbove: 8 }],
      proc: 'bossEvolve', tags: ['monster', 'dungeon'],
      legend: '{boss} of {dungeon} evolved into {newForm}.'
    },
    {
      id: 'dungeon_emerges', name: 'A Dungeon Opens', scope: 'world',
      weight: 6, mods: { magicDensity: 1.4, monsterCeiling: 0.5 },
      when: [{ dungeonsBelow: 140 }],
      proc: 'newDungeon', tags: ['dungeon'],
      legend: 'The ground opened at {place}. {dungeon} has been there ever since.'
    },
    {
      id: 'faction_seizes', name: 'Dungeon Seized', scope: 'faction',
      weight: 7, mods: { monsterCeiling: 0.6 },
      when: [{ factionStrengthAbove: 120 }],
      proc: 'factionSeizeDungeon', tags: ['dungeon', 'monster'],
      legend: 'The {faction} drove the last holders out of {dungeon} and claimed it.'
    },
    {
      id: 'calamity', name: 'Calamity', scope: 'world',
      weight: 1.2, mods: { monsterCeiling: 2.2, magicDensity: 1.0 },
      when: [{ yearAbove: 40 }, { calamitiesBelow: 3 }],
      proc: 'calamity', tags: ['monster', 'disaster'],
      legend: '{monster} woke beneath {place}. {result}'
    },

    /* ------------------------------------------------- heroes and delves */
    {
      id: 'hero_rises', name: 'A Hero Rises', scope: 'nation',
      weight: 14, mods: { magicDensity: 0.9 },
      when: [],
      proc: 'heroRises', tags: ['hero'],
      legend: '{hero}, {race} of {a}, took up the work of clearing the roads.'
    },
    {
      id: 'delve', name: 'Dungeon Delve', scope: 'dungeon',
      weight: 24, mods: { magicDensity: 0.5 },
      when: [{ hasLivingHeroes: true }],
      proc: 'delve', tags: ['dungeon', 'hero'],
      legend: '{hero} led a party into {dungeon}. {result}'
    },
    {
      id: 'nation_clears', name: 'Dungeon Subjugation', scope: 'nation',
      weight: 6, mods: {},
      when: [{ militaryAbove: 140 }],
      proc: 'nationClearsDungeon', tags: ['dungeon', 'politics'],
      legend: '{a} sent an army into {dungeon} and took it. {result}'
    },
    {
      id: 'relic_forged', name: 'Relic Forged', scope: 'nation',
      weight: 8, mods: { relicAbundance: 2.0, magicDensity: 0.8 },
      when: [],
      proc: 'forgeRelic', tags: ['relic'],
      legend: '{smith} of {a} forged {relic}. {detail}'
    },
    {
      id: 'relic_lost', name: 'Relic Lost', scope: 'world',
      weight: 7, mods: { relicAbundance: 0.4, warTendency: 0.4 },
      when: [{ relicsExist: true }],
      proc: 'relicMoves', tags: ['relic'],
      legend: '{relic} passed out of {oldOwner}\'s hands. {detail}'
    },
    {
      id: 'hero_falls', name: 'A Hero Falls', scope: 'hero',
      weight: 12, mods: {},
      when: [{ heroAgeAbove: 20 }],
      proc: 'heroFalls', tags: ['hero'],
      legend: '{hero} died {detail}.'
    },
    {
      id: 'hero_named', name: 'A Naming', scope: 'hero',
      weight: 4, mods: { magicDensity: 1.2, monsterCeiling: 0.6 },
      when: [{ heroLevelAbove: 25 }, { heroNotNamed: true }],
      proc: 'heroNamed', tags: ['hero', 'legend'],
      legend: '{namer} gave {hero} a true Name. The world shifted slightly to accommodate it.'
    },
    {
      id: 'prophecy', name: 'Prophecy', scope: 'world',
      weight: 4, mods: { magicDensity: 1.1 },
      when: [{ yearAbove: 20 }],
      proc: 'prophecy', tags: ['legend'],
      legend: 'A seer at {place} spoke: "{text}"'
    },
    {
      id: 'schism', name: 'Schism', scope: 'nation',
      weight: 4, mods: {},
      when: [{ stabilityBelow: 55 }],
      proc: 'schism', tags: ['politics'],
      legend: 'A schism split the faith of {a}. {detail}'
    },
    {
      id: 'tournament', name: 'Grand Tournament', scope: 'nation',
      weight: 7, mods: {},
      when: [{ stabilityAbove: 50 }, { hasCity: true }],
      proc: 'tournament', tags: ['hero'],
      legend: '{a} held a grand tournament at {settlement}. {hero} took the wreath.'
    }
  ];

  ED.EVENT_BY_ID = {};
  ED.EVENTS.forEach(function (e) { ED.EVENT_BY_ID[e.id] = e; });

  /* Reasons a war gets declared — purely flavour attached to a real cause. */
  ED.WAR_CAUSES = [
    ', citing an old claim on {place}',
    ' over the {place} tolls',
    ' after an envoy was killed at {place}',
    ' to settle a grudge three generations old',
    ' for control of {dungeon}',
    ' after {a} refused tribute',
    ' over the succession dispute at {place}',
    ''
  ];

  ED.PROPHECY_LINES = [
    'The {adj} one comes from beyond the sky, and will not know the customs.',
    'When {place} burns twice, the {monster} wakes.',
    'A slime will sit a throne before the century turns.',
    'The crown of {a} will pass to something that was never born.',
    'Count the True Dragons. When the count changes, so does everything.',
    '{relic} will choose its last bearer, and that bearer will end it.',
    'The {faction} is not the worst thing under the {place}.',
    'Two kingdoms will fall for one door that should have stayed shut.'
  ];

  /* Text fragments used by procedures for legends variety. */
  ED.FRAGMENTS = {
    battleWin: ['{winner} broke the line and held the field.',
      '{winner} carried the day; {loser} withdrew in disorder.',
      'The field went to {winner} after a full day of it.',
      '{loser} was routed. {winner} pursued for three days.'],
    battleDraw: ['Neither side could break the other. Both withdrew.',
      'The battle ended in exhaustion and mud.',
      'Both hosts bled out their strength and went home.'],
    siegeTaken: ['The walls came down and {settlement} changed hands.',
      '{settlement} fell after {duration}. Its banners were replaced.',
      'Starvation did what siege engines could not; {settlement} opened its gates.'],
    siegeHeld: ['{settlement} held. The besiegers withdrew, badly reduced.',
      'The siege broke against {settlement}\'s garrison.',
      'Relief arrived before the walls did. {settlement} held.'],
    raidWin: ['The garrison held. The attackers left their dead behind.',
      '{settlement} beat them off, barely.',
      'The raid broke on the palisade.'],
    raidLoss: ['{settlement} was overrun. What survived scattered into the hills.',
      '{settlement} burned. The {faction} holds the ground now.',
      'Nothing organised remains at {settlement}.'],
    delveWin: ['They came out with {loot} and most of their people.',
      'The party cleared to floor {floor} and returned rich.',
      '{boss} was killed. The dungeon has been quieter since.'],
    delveLoss: ['None of them came back.',
      'Two of six returned, and neither would say what happened on floor {floor}.',
      '{boss} killed them on floor {floor}.'],
    heroDeath: ['on the walls of {settlement}', 'in {dungeon}, on floor {floor}',
      'of old age, comfortably, which surprised everyone',
      'fighting the {faction}', 'in the war between {a} and {b}',
      'to poison at a feast in {settlement}', 'and no one agrees how'],
    relicMove: ['It surfaced later in {newOwner}.', 'It was carried into {dungeon} and not carried out.',
      'A thief took it. The thief has not been found.',
      'It went into the hoard of {monster}.',
      '{newOwner} holds it now, and says little about how.']
  };

  ISE.EventData = ED;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
