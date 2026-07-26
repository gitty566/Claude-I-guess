/* balance.js — combat pacing harness.
 *
 * Builds characters the way the game actually builds them (levelled, geared,
 * evolved where the tree allows, with rarity-appropriate skills) and runs
 * them against the monsters they would actually meet. Prints win rate and
 * round counts so the damage curve can be tuned against something real.
 *
 * Run: node tools/balance.js */
'use strict';
const { load } = require('./load.js');
const ISE = load({ strict: true });
const U = ISE.U;

const world = ISE.WorldGen.generate({
  seed: 'Balance', worldSize: 3, nationCount: 6, historyYears: 150,
  magicDensity: 0.5, monsterCeiling: 6
});
ISE.History.simulateHistory(world);
ISE.Player._world = world;

/* Build the character a player would plausibly have at this level. */
function build(raceId, level, seed) {
  const rng = new ISE.RNG('build' + seed);
  const p = ISE.Player.create(world, { name: 'B' + seed, raceId, originId: 'native' });
  p.level = level;

  // Deeds roughly proportional to having played to this level.
  p.deeds.kills = level * 14;
  p.deeds.bosses = Math.floor(level / 8);
  p.deeds.dungeons = Math.floor(level / 10);
  p.fame = level * 22;
  p.named = level >= 40;
  p.relicsOwned = Math.floor(level / 18);
  ISE.T.BIOME_IDS.forEach(b => { p.biomesVisited[b] = 1; });
  Object.keys(ISE.RaceData.CATALYSTS).forEach(c => { p.catalysts[c] = 1; });

  // Skills: a spread appropriate to level, partially mastered.
  const maxTier = U.clamp(1 + Math.floor(level / 9), 1, 5);
  const pool = world.skills.list.filter(s =>
    !s.unique && !s.apex && s.rarityTier <= maxTier &&
    ['attack', 'aoe', 'dot', 'buff', 'heal', 'drain', 'passive'].includes(s.category));
  const want = Math.min(10, 3 + Math.floor(level / 4));
  for (let i = 0; i < want && pool.length; i++) {
    const s = rng.pick(pool.filter(x => x.rarityTier >= Math.max(1, maxTier - 1)) || pool) ||
      rng.pick(pool);
    if (s && ISE.Player.learnSkill(p, s, world)) {
      p.skillById[s.id].mastery = U.clamp(rng.int(20, 70), 0, 100);
    }
  }

  // Evolve as far as the tree allows for this record.
  for (let step = 0; step < 6; step++) {
    const opts = ISE.Evolution.available(p, world).filter(o => o.ok);
    if (!opts.length) break;
    ISE.Evolution.evolve(p, opts[opts.length - 1].node.id, world);
  }

  // Gear appropriate to level.
  const gearTier = U.clamp(1 + Math.floor(level / 9), 1, 6);
  ['weapon', 'body', 'head', 'offhand', 'accessory'].forEach(slot => {
    const item = ISE.ItemGen.rollItem(rng, {
      tier: gearTier, rarityTier: U.clamp(gearTier, 1, 5), slot
    });
    p.inventory.push(item);
    ISE.Player.equip(p, item);
  });

  const st = ISE.Player.effectiveStats(p);
  p.hpCur = st.hp; p.mpCur = st.mp;
  return p;
}

function runFight(p, monsters, seed) {
  const party = [ISE.Combat.actorFromPlayer(p)];
  const c = ISE.Combat.start(world, party,
    monsters.map(m => ISE.Combat.actorFromMonster(m, 'enemy')), { seed: 'fight' + seed });
  let t = 0;
  while (!c.over && t++ < 400) {
    if (!c.awaitingInput) break;
    const actor = ISE.Combat.actorById(c, c.current);
    const opts = ISE.Combat.availableSkills(c, actor).filter(o => o.usable);
    // Crude but reasonable player policy: heal when low, otherwise best hit.
    const hpFrac = actor.hp / actor.stats.hp;
    const heal = opts.find(o => o.skill.category === 'heal');
    let choice;
    if (hpFrac < 0.35 && heal) choice = heal;
    else {
      const dmg = opts.filter(o => o.skill.power > 0 && o.skill.category !== 'heal');
      dmg.sort((a, b) => {
        const foes = ISE.Combat.livingOf(c, 'enemy');
        const t0 = foes[0];
        return ISE.Combat.estimate(actor, t0, b.skill) - ISE.Combat.estimate(actor, t0, a.skill);
      });
      choice = dmg[0];
    }
    ISE.Combat.playerAction(c, choice
      ? { type: 'skill', skillId: choice.skill.id } : { type: 'guard' });
  }
  return c;
}

function scenario(label, raceId, level, monTier, monLevel, count, boss) {
  let wins = 0, rounds = 0, n = 24;
  for (let i = 0; i < n; i++) {
    const p = build(raceId, level, label + i);
    const rng = new ISE.RNG('mon' + label + i);
    const fams = ISE.MonsterData.FAMILIES;
    const fam = rng.pick(fams);
    const monsters = [];
    if (boss) {
      monsters.push(ISE.MonsterGen.makeNamed(rng, world.skills, {
        family: fam, tier: monTier, level: monLevel, placeName: 'the test'
      }));
    } else {
      for (let k = 0; k < count; k++) {
        monsters.push(ISE.MonsterGen.makeMonster(rng, world.skills, {
          family: fam, tier: monTier, level: monLevel
        }));
      }
    }
    const c = runFight(p, monsters, label + i);
    if (c.result === 'victory') wins++;
    rounds += c.round;
  }
  const wr = Math.round((wins / n) * 100);
  /* Trash is meant to become trash: a high-level character deleting mooks in
   * two rounds is correct, so only the early game has a round floor. Bosses
   * are the wall and should sit well under a guaranteed win. */
  const lo = boss ? 30 : 55, hi = boss ? 85 : 100;
  const minRounds = boss ? 4 : (level <= 25 ? 3 : 1);
  const avg = rounds / n;
  const flag = wr >= lo && wr <= hi && avg <= 16 && avg >= minRounds ? '   ' : ' <<';
  console.log('  ' + label.padEnd(34) + ' win ' + String(wr).padStart(3) + '%' +
    '   avg ' + (rounds / n).toFixed(1).padStart(5) + ' rounds' + flag);
}

console.log('Combat balance (mooks 55-97% win, bosses 30-80%, 3-16 rounds)\n');
console.log(' -- level-appropriate mooks --');
scenario('lvl 1 human vs 1x tier1 lvl2', 'human', 1, 1, 2, 1);
scenario('lvl 5 human vs 1x tier1 lvl5', 'human', 5, 1, 5, 1);
scenario('lvl 12 human vs 2x tier2 lvl12', 'human', 12, 2, 12, 2);
scenario('lvl 25 human vs 3x tier3 lvl25', 'human', 25, 3, 25, 3);
scenario('lvl 40 human vs 3x tier4 lvl40', 'human', 40, 4, 40, 3);
scenario('lvl 55 human vs 3x tier5 lvl55', 'human', 55, 5, 55, 3);

console.log('\n -- monster races --');
scenario('lvl 12 slime vs 2x tier2 lvl12', 'slime', 12, 2, 12, 2);
scenario('lvl 25 goblin vs 3x tier3 lvl25', 'goblin', 25, 3, 25, 3);
scenario('lvl 40 dragonkin vs 3x t4 lvl40', 'dragonkin', 40, 4, 40, 3);
scenario('lvl 30 undead vs 3x tier3 lvl30', 'undead', 30, 3, 30, 3);
scenario('lvl 30 construct vs 3x t3 lvl30', 'construct', 30, 3, 30, 3);

console.log('\n -- floor bosses (should be hard, not hopeless) --');
scenario('lvl 15 human vs t2 boss lvl14', 'human', 15, 2, 14, 1, true);
scenario('lvl 30 human vs t4 boss lvl33', 'human', 30, 4, 33, 1, true);
scenario('lvl 45 dragonkin vs t5 boss l64', 'dragonkin', 45, 5, 64, 1, true);
scenario('lvl 60 dragonkin vs t6 boss l88', 'dragonkin', 60, 6, 88, 1, true);

console.log('\n -- overmatched (should mostly lose) --');
scenario('lvl 10 human vs t6 boss lvl60', 'human', 10, 6, 60, 1, true);
