/* selftest.js — headless end-to-end exercise of the engine.
 * Run: node tools/selftest.js [seed] */
'use strict';
const { load } = require('./load.js');
const ISE = load({ strict: true });

let failures = 0;
function check(label, cond, extra) {
  if (!cond) { failures++; console.log('  FAIL  ' + label + (extra ? '  ' + extra : '')); }
  else console.log('  ok    ' + label + (extra ? '  ' + extra : ''));
}

const seed = process.argv[2] || 'Selftest-1';
console.log('== world generation ==');
const world = ISE.WorldGen.generate({
  seed, worldSize: 3, nationCount: 6, historyYears: 220,
  magicDensity: 0.55, monsterCeiling: 6, relicAbundance: 0.6, warTendency: 0.5
});
ISE.History.simulateHistory(world);
const S = world.summary;
check('skill catalogue >= 500', S.skills >= 500, S.skills + ' skills');
check('races generated', world.races.list.length >= 12, world.races.list.length + ' races');
check('nations survive history', S.nations >= 1, S.nations + ' living');
check('settlements exist', S.settlements > 0, S.settlements);
check('dungeons exist', world.dungeons.length > 0, world.dungeons.length);
check('relics forged', world.relics.length > 0, world.relics.length);
check('legends recorded', world.legends.length > 50, world.legends.length);

console.log('\n== determinism ==');
const w2 = ISE.WorldGen.generate({
  seed, worldSize: 3, nationCount: 6, historyYears: 220,
  magicDensity: 0.55, monsterCeiling: 6, relicAbundance: 0.6, warTendency: 0.5
});
ISE.History.simulateHistory(w2);
check('same seed -> same nation names',
  JSON.stringify(world.nations.map(n => n.name)) === JSON.stringify(w2.nations.map(n => n.name)));
check('same seed -> same legend count', world.legends.length === w2.legends.length,
  world.legends.length + ' vs ' + w2.legends.length);
check('same seed -> same relic names',
  JSON.stringify(world.relics.map(r => r.name)) === JSON.stringify(w2.relics.map(r => r.name)));

console.log('\n== skill catalogue shape ==');
const byRarity = {};
world.skills.list.forEach(s => { byRarity[s.rarity] = (byRarity[s.rarity] || 0) + 1; });
console.log('  ' + JSON.stringify(byRarity));
const elems = {};
world.skills.list.forEach(s => { elems[s.element] = (elems[s.element] || 0) + 1; });
check('all 14 core types represented',
  ISE.T.CORE_ELEMENTS.every(e => elems[e] > 0), Object.keys(elems).length + ' types');
check('skills form evolution chains',
  world.skills.list.filter(s => s.evolvesTo).length > 100,
  world.skills.list.filter(s => s.evolvesTo).length + ' chained');
check('mythical skills are unique/world-tied',
  world.skills.list.filter(s => s.rarity === 'mythical').every(s => s.unique));

console.log('\n== character creation ==');
ISE.Player._world = world;
const state = ISE.Game.startGame(world, {
  name: 'Test Subject', raceId: 'slime', originId: 'reincarnated'
});
const player = state.player;
check('player placed', player.x !== undefined && player.locationId, 'at ' + player.locationId);
check('player has innate skills', player.skills.length > 0, player.skills.length + ' skills');
const st0 = ISE.Player.effectiveStats(player);
check('stats computed', st0.hp > 0 && st0.atk > 0, JSON.stringify(st0));

console.log('\n== combat ==');
const rng = new ISE.RNG('combat-test');
const fam = ISE.MonsterData.FAMILY_BY_ID.wolf;
const mob = ISE.MonsterGen.makeMonster(rng, world.skills, { family: fam, tier: 1, level: 2 });
let combat = ISE.Combat.start(world,
  [ISE.Combat.actorFromPlayer(player)],
  [ISE.Combat.actorFromMonster(mob, 'enemy')],
  { seed: 'fight1' });
let turns = 0;
while (!combat.over && turns++ < 200) {
  if (combat.awaitingInput) {
    const opts = ISE.Combat.availableSkills(combat, ISE.Combat.actorById(combat, combat.current));
    const usable = opts.filter(o => o.usable && o.skill.category !== 'buff');
    ISE.Combat.playerAction(combat, usable.length
      ? { type: 'skill', skillId: usable[0].skill.id }
      : { type: 'guard' });
  } else break;
}
check('combat terminates', combat.over, combat.result + ' in ' + combat.round + ' rounds');
check('combat produced a log', combat.log.length > 3, combat.log.length + ' entries');

console.log('\n== initiative fairness ==');
{
  /* Monster ids ('mon_…', 'named_…') sort before 'player', so an id-based
   * tiebreak silently handed every tied initiative to the enemy. Build an
   * exact speed tie and check the player moves first and enters at full HP. */
  const tp = ISE.Player.create(world, { name: 'Tie', raceId: 'human', originId: 'native' });
  const tstats = ISE.Player.effectiveStats(tp);
  tp.hpCur = tstats.hp; tp.mpCur = tstats.mp;
  const twolf = ISE.MonsterGen.makeMonster(new ISE.RNG('tie'), world.skills,
    { family: ISE.MonsterData.FAMILY_BY_ID.wolf, tier: 1, level: 3 });
  const pActor = ISE.Combat.actorFromPlayer(tp);
  twolf.stats.spd = pActor.stats.spd;               // exact tie
  const tc = ISE.Combat.start(world, [pActor],
    [ISE.Combat.actorFromMonster(twolf, 'enemy')], { seed: 'tie' });
  check('speed ties go to the player', tc.order[0] === 'player',
    'order: ' + tc.order.join(' > '));
  check('player enters a tied fight at full health',
    tc.party[0].hp === tc.party[0].stats.hp,
    tc.party[0].hp + '/' + tc.party[0].stats.hp);

  // A genuinely faster enemy still pre-empts, but must announce it.
  const fast = ISE.MonsterGen.makeMonster(new ISE.RNG('fast'), world.skills,
    { family: ISE.MonsterData.FAMILY_BY_ID.raptor, tier: 2, level: 12 });
  fast.stats.spd = pActor.stats.spd * 3;
  const p2 = ISE.Player.create(world, { name: 'Slow', raceId: 'human', originId: 'native' });
  const s2 = ISE.Player.effectiveStats(p2);
  p2.hpCur = s2.hp; p2.mpCur = s2.mp;
  const fc = ISE.Combat.start(world, [ISE.Combat.actorFromPlayer(p2)],
    [ISE.Combat.actorFromMonster(fast, 'enemy')], { seed: 'fast' });
  check('a faster enemy still moves first', fc.order[0] !== 'player');
  check('being pre-empted is stated in the log',
    fc.log.some(l => l.type === 'preempt'),
    (fc.log.filter(l => l.type === 'preempt')[0] || {}).text || 'no preempt line');
}

console.log('\n== rest restores to full ==');
{
  const rp = ISE.Game.state.player;
  const before = ISE.Player.effectiveStats(rp);
  rp.hpCur = 1; rp.mpCur = 1;
  ISE.Player.rest(rp, 1);
  check('rest fills health and magicules', rp.hpCur === before.hp && rp.mpCur === before.mp,
    rp.hpCur + '/' + before.hp + ' hp, ' + rp.mpCur + '/' + before.mp + ' mp');
  const ra = ISE.Combat.actorFromPlayer(rp);
  check('a rested character is built into combat at full health',
    ra.hp === ra.stats.hp, ra.hp + '/' + ra.stats.hp);
}

console.log('\n== dungeon run ==');
const nearDungeon = world.dungeons
  .slice().sort((a, b) => ISE.U.dist(a.x, a.y, player.x, player.y) - ISE.U.dist(b.x, b.y, player.x, player.y))[0];
player.x = nearDungeon.x; player.y = nearDungeon.y;
const entered = ISE.Game.enterDungeon(nearDungeon.id);
check('dungeon entered', entered.ok, nearDungeon.name + ' t' + nearDungeon.tier + ' f' + nearDungeon.floors);
const run = ISE.Game.state.run;
let steps = 0;
while (!run.over && steps++ < 60) {
  if (run.combat) {
    let t = 0;
    while (!run.combat.over && t++ < 300) {
      if (run.combat.awaitingInput) {
        const actor = ISE.Combat.actorById(run.combat, run.combat.current);
        const opts = ISE.Combat.availableSkills(run.combat, actor).filter(o => o.usable);
        ISE.Combat.playerAction(run.combat, opts.length
          ? { type: 'skill', skillId: opts[0].skill.id } : { type: 'guard' });
      } else break;
    }
    ISE.DungeonRun.resolveCombat(world, player, run);
    continue;
  }
  const opts = ISE.DungeonRun.options(run, player, world);
  if (!opts.length) {
    if (ISE.DungeonRun.atExit(run)) {
      const node = ISE.DungeonRun.currentNode(run);
      if (node && node.type === 'stairs') ISE.DungeonRun.descend(world, player, run);
      else break;
    } else break;
  } else {
    ISE.DungeonRun.choose(world, player, run, opts[0].index);
  }
  if (player.hpCur <= 0) break;
}
check('dungeon run advanced', run.floor.position >= 0 || run.over,
  'floor ' + run.floorNum + ', ' + run.kills + ' kills, ' + run.log.length + ' log lines');

console.log('\n== economy + quests ==');
const town = world.settlements.filter(s => !s.destroyed && s.guild)[0] || world.settlements[0];
const stock = ISE.Economy.stock(world, town);
check('shop stocked', stock.length > 0, stock.length + ' items in ' + town.name);
const trainers = ISE.Economy.trainers(world, town);
check('trainers available', trainers.length > 0, trainers.length + ' skills taught');
const board = ISE.Quests.board(world, player, town);
check('quest board populated', board.length > 0, board.length + ' contracts');
const takeable = board.filter(q => q.rankMin <= player.guildRank);
check('board offers work an unranked newcomer can take', takeable.length > 0,
  takeable.length + ' of ' + board.length + ' open at rank ' + player.guildRank);
if (takeable.length) {
  const acc = ISE.Quests.accept(player, world, takeable[0]);
  check('quest accepted', acc.ok, takeable[0].title);
}

console.log('\n== evolution ==');
const evo = ISE.Evolution.available(player, world);
check('evolution options listed', evo.length > 0,
  evo.map(e => e.node.name + (e.ok ? ' [OK]' : ' [locked]')).join(', '));
// Force-satisfy and evolve to prove the path works.
player.level = 40;
player.deeds.kills = 900; player.deeds.bosses = 20; player.deeds.dungeons = 12;
player.fame = 1200; player.named = true; player.relicsOwned = 5;
ISE.T.BIOME_IDS.forEach(b => { player.biomesVisited[b] = 1; });
Object.keys(ISE.RaceData.CATALYSTS).forEach(c => { player.catalysts[c] = 1; });
player.skills.forEach(s => { s.mastery = 100; });
world.skills.list.filter(s => s.rarityTier <= 3).slice(0, 40)
  .forEach(s => { ISE.Player.learnSkill(player, s, world); player.skillById[s.id].mastery = 90; });
const evo2 = ISE.Evolution.available(player, world);
const doable = evo2.filter(e => e.ok);
check('evolution reachable when requirements met', doable.length > 0,
  doable.map(d => d.node.name).join(', ') || evo2.map(e =>
    e.node.name + ':' + e.reqs.filter(r => !r.met).map(r => r.key).join('/')).join(' | '));
if (doable.length) {
  const before = ISE.Player.effectiveStats(player).hp;
  const r = ISE.Evolution.evolve(player, doable[0].node.id, world);
  check('evolved', r.ok, player.formName + ' hp ' + before + ' -> ' + r.after.hp);
}

console.log('\n== skill evolution ==');
const chains = ISE.Player.skillEvolutions(player, world);
const ready = chains.filter(c => c.ok);
check('skill upgrades offered', chains.length > 0, chains.length + ' chains, ' + ready.length + ' ready');
if (ready.length) {
  const r = ISE.Player.evolveSkill(player, ready[0].from.id, world);
  check('skill evolved', r.ok, ready[0].from.name + ' -> ' + ready[0].to.name);
}

console.log('\n== full dungeon clear: ownership + relics ==');
{
  // Give a dungeon a relic, then clear it outright with an overpowered
  // character to prove the boss-kill -> ownership -> relic chain fires.
  const d = world.dungeons.filter(x => x.tier <= 5 && x.boss && x.boss.alive)
    .sort((a, b) => a.tier - b.tier)[0];
  const relic = world.relics[0];
  if (d && relic) {
    ISE.Procs.H.giveRelicTo(world, relic, 'dungeon', d.id, 'test placement');
    const ownerBefore = d.ownerType;

    const hero = ISE.Player.create(world, { name: 'Clearer', raceId: 'dragonkin', originId: 'native' });
    hero.level = 90;
    const strong = world.skills.list
      .filter(s => s.category === 'aoe' && s.rarityTier >= 4).slice(0, 3);
    strong.forEach(s => { ISE.Player.learnSkill(hero, s, world); hero.skillById[s.id].mastery = 100; });
    const hs = ISE.Player.effectiveStats(hero);
    hero.hpCur = hs.hp * 50; hero.mpCur = hs.mp * 50;
    hero.x = d.x; hero.y = d.y;
    ISE.Game.state.player = hero;
    ISE.Game.state.world = world;

    const dr = ISE.DungeonRun.enter(world, hero, d);
    ISE.Game.state.run = dr;
    let guard = 0;
    while (!dr.over && guard++ < 4000) {
      if (dr.combat) {
        if (dr.combat.over) { ISE.DungeonRun.resolveCombat(world, hero, dr); continue; }
        const a = ISE.Combat.actorById(dr.combat, dr.combat.current);
        if (!a) break;
        // Cheat the character's survival, not the rules: we are testing the
        // clear chain, not whether this build can win the fights.
        dr.combat.party.forEach(x => { x.hp = x.stats.hp; x.mp = x.stats.mp; });
        const o = ISE.Combat.availableSkills(dr.combat, a).filter(x => x.usable && x.skill.power > 0);
        ISE.Combat.playerAction(dr.combat, o.length
          ? { type: 'skill', skillId: o[0].skill.id } : { type: 'guard' });
        continue;
      }
      hero.hpCur = ISE.Player.effectiveStats(hero).hp;
      const opts = ISE.DungeonRun.options(dr, hero, world);
      if (!opts.length) {
        const node = ISE.DungeonRun.currentNode(dr);
        if (node && node.type === 'stairs') { ISE.DungeonRun.descend(world, hero, dr); continue; }
        break;
      }
      ISE.DungeonRun.choose(world, hero, dr, opts[opts.length - 1].index);
    }
    check('dungeon cleared to the bottom', d.cleared,
      d.name + ' t' + d.tier + ', ' + d.floors + ' floors, reached ' + dr.floorNum);
    check('boss is dead', !d.boss.alive, d.boss.name);
    check('ownership transferred to the player', d.ownerType === 'player',
      ownerBefore + ' -> ' + d.ownerType);
    check('relic changed hands to the player', relic.ownerType === 'player',
      relic.name + ' is now ' + ISE.Procs.H.relicLocationText(world, relic));
    check('clear was written into the chronicle',
      world.legends.some(l => l.ruleId === 'player_clear'));
    ISE.Game.state.player = player;
    ISE.Game.state.run = null;
  }
}

console.log('\n== world clock during play ==');
const beforeDay = world.day;
const report = ISE.WorldClock.advance(world, player, 400);
check('clock advanced', world.day === beforeDay + 400, 'day ' + world.day + ' year ' + world.year);
check('world kept simulating', world.legends.length > 50, world.legends.length + ' legends total');

console.log('\n== save / load ==');
const json = ISE.Game.serialize();
check('serialised', !!json, ISE.U.short(json.length) + ' chars');
const loaded = ISE.Game.load(json);
check('loaded', loaded.ok);
check('player survived round-trip',
  ISE.Game.state.player.name === player.name &&
  ISE.Game.state.player.skills.length === player.skills.length,
  ISE.Game.state.player.skills.length + ' skills');
check('world state survived round-trip',
  ISE.Game.state.world.dungeons.length === world.dungeons.length &&
  ISE.Game.state.world.relics.length === world.relics.length);

console.log('\n' + (failures ? failures + ' FAILURES' : 'all checks passed'));
process.exit(failures ? 1 : 0);
