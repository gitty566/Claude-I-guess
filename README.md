# Procedural Isekai — World Engine

A browser-playable JRPG engine that generates a world, simulates a few
centuries of its history, and then drops you into the result.

No build step, no dependencies, no server. Open `index.html` in a browser.

The design goal is the Dwarf Fortress one: the world's *current* state —
where the borders are, who holds which dungeon, which relics exist and whose
vault they are sitting in — should be the output of events that actually ran,
not a set of things an author placed. Every system below is code and data
tables. Nothing is narrated by an LLM at runtime; flavour text is templated
from generated facts.

---

## Running it

```
open index.html            # or drag it into a browser
```

Everything is classic `<script>` tags, so it works over `file://`.

### Development tools

```
node tools/selftest.js     # headless end-to-end engine test
node tools/balance.js      # combat pacing harness (win rates, round counts)
node tools/uitest.js       # drives the real page in Chromium, screenshots each screen
```

`tools/load.js` loads the browser sources into Node so the engine can be
exercised headlessly; it uses the same file list and order as `index.html`.

---

## Architecture

```
index.html          screen shells + script order
styles.css

src/core/           rng.js (seeded PRNG + stream forking), util.js, noise.js
src/data/           pure data tables — no logic
  tables.js         rarities, the 14 element types + matrix, biomes, statuses
  skills.js         skill archetypes + per-element naming lexicons
  races.js          10 base races and their branching evolution trees
  items.js          equipment bases, affixes, consumables, relic effects
  monsters.js       25 monster families with six-rung naming ladders
  events.js         the event rule table driving history and the live clock
  names.js          per-culture name generation

src/gen/            Phase A — genesis (all pure functions of the seed)
  geo.js            heightmap, climate, mana field, biomes, rivers, regions
  skillgen.js       crosses archetypes x elements into the world's catalogue
  racegen.js        prunes/expands evolution trees, invents genesis races
  nations.js        founding, territory growth, settlements, NPCs, guild
  dungeons.js       dungeon seeding, floors, monster factions
  monstergen.js     concrete monsters and named individuals
  itemgen.js        procedural gear + the relic forge
  world.js          orchestration

src/sim/            Phase B — history, and the same engine live
  procs.js          event procedures + condition checkers
  history.js        the year loop
  worldclock.js     per-day metering during play, player intervention

src/game/           the adventure layer
  combat.js         deterministic turn-based combat
  evolution.js      race evolution requirement checking
  player.js         character, stats, skills, mastery, equipment
  economy.js        shops, prices, trainers
  quests.js         guild contracts generated from world state
  dungeonrun.js     the crawl
  game.js           travel, encounters, save/load

src/ui/             map.js (canvas), ui.js (all screens)
```

### Determinism

Every generator draws from `ISE.RNG`, a seeded mulberry32. Nothing calls
`Math.random()` except the "new random seed" button and the origin re-roll.
Subsystems `fork()` their own labelled streams so adding a feature to one
does not shift another's sequence. The same seed and parameters reproduce the
same world down to relic names and who is holding them — `tools/selftest.js`
asserts this.

### The two phases

**Phase A** builds geography, races, the skill catalogue, nations, borders,
settlements, dungeons and monster factions.

**Phase B** runs N years. Each year applies numeric drift (economies chase a
target set by land and population, factions grow toward a carrying capacity)
and then fires a few events drawn from `data/events.js`. An event is a data
row: a scope, weight modifiers keyed to world-gen parameters, declarative
preconditions, and the id of a procedure in `sim/procs.js`. A thousand years
runs in about two seconds.

The live world clock uses the *same* table and the same procedures, metered
per day instead of per year. A war resolved 300 years before you arrived and
one resolved on turn 40 run identical maths.

### Parameters that actually change the world

| Parameter | What it really does |
|---|---|
| World size | map dimensions, and via land area: nation count budget, dungeon count |
| History years | how much of the world's state is consequence rather than placement |
| Magic density | mana field strength (warped biomes appear), mastery rate, skill scarcity at trainers, chain length in the skill catalogue, dungeon count — and it raises the monster ceiling with it |
| Monster power ceiling | evolution tree depth and branch width, max monster tier, faction capacity, dungeon danger tiers |
| Relic abundance | how many relics history forges before it stops |
| War tendency | relation baselines, war/peace/annex event weights, per-year event budget |
| Settlement density / defences | how many towns, how big, how well garrisoned |

Magic density and monster ceiling are coupled in `WorldGen.coupleParams` — a
flooded-with-magic world is also a more dangerous one, not just a richer one.

---

## Notes on a few systems

**Skills.** ~950 per world. The catalogue is generated by crossing ~50
archetypes (what a skill *does*) with the 14 element types (what it does it
*with*), then walking each pair up the rarity ladder so a Common fire bolt
genuinely evolves into an Epic one at high mastery. Mythical is reserved for
world-unique skills minted by the relic forge and tied to a specific legend.

**Races.** Ten base races with hand-authored branching trees, pruned or kept
deep according to the monster ceiling, plus 2–3 races invented per world from
its genesis event. Nodes flagged `elemental` fan out into one branch per
element that exists in *this* world's geography — a world with no volcano
never grows Fire Slimes.

**Relics.** Not rolled. Forged during history by a specific smith in a
specific nation for a specific reason, with a fixed effect and an owner that
is world state. They change hands when nations are annexed, heroes die, and
dungeons are cleared — including by you.

**Dungeons.** Owned by no one, a monster faction, a nation, the guild, or
you. Clearing one takes it. Leaving a boss alive long enough lets it evolve
up its family ladder. Clearing one does not make it safe forever — something
eventually moves back into the throne room.

**Combat.** Turn order by agility, damage from a mitigation curve, a 14x14
element matrix, statuses, crits, traits on named individuals. Seeded per
fight, so it is reproducible. `tools/balance.js` builds characters the way
the game actually builds them and reports win rates so the curve is tuned
against something real rather than by feel.
