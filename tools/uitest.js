/* uitest.js — drives the real page in a browser: generates a world, creates a
 * character, travels, fights, delves, shops, and screenshots each step.
 * Run: node tools/uitest.js [outdir] */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
let shotN = 0;

async function shot(page, name) {
  shotN++;
  const file = path.join(OUT, String(shotN).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  console.log('  shot ' + path.basename(file));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', m => {
    if (m.type() === 'error') { errors.push('console: ' + m.text()); }
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));

  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForTimeout(400);
  console.log('== title ==');
  await shot(page, 'title');

  // Set a known seed + modest history so the run is quick and reproducible.
  await page.fill('#seed-input', 'UITest-Alpha');
  await page.evaluate(() => {
    ISE.UI.params.worldSize = 3;
    ISE.UI.params.nationCount = 6;
    ISE.UI.params.historyYears = 200;
    ISE.UI.params.magicDensity = 0.6;
    ISE.UI.params.monsterCeiling = 6;
    ISE.UI.params.relicAbundance = 0.6;
    ISE.UI.renderTitle();
  });
  await page.fill('#seed-input', 'UITest-Alpha');

  console.log('== generating ==');
  await page.click('#btn-generate');
  await page.waitForSelector('#screen-create:not(.hidden)', { timeout: 90000 });
  await page.waitForTimeout(300);
  await shot(page, 'creation');

  const genInfo = await page.evaluate(() => ({
    skills: ISE.UI.world.skills.count,
    races: ISE.UI.world.races.list.length,
    nations: ISE.UI.world.livingNations().length,
    legends: ISE.UI.world.legends.length,
    relics: ISE.UI.world.relics.length,
    dungeons: ISE.UI.world.dungeons.length,
    year: ISE.UI.world.year
  }));
  console.log('  world:', JSON.stringify(genInfo));

  // Character creation: reincarnated -> roll a race.
  await page.fill('#name-input', 'Test Rimuru');
  await page.click('[data-origin="reincarnated"]');
  await page.waitForTimeout(120);
  await page.click('[data-act="roll-race"]');
  await page.waitForTimeout(150);
  await shot(page, 'race-rolled');

  const race = await page.evaluate(() => ISE.UI.creation.raceId);
  console.log('  rolled race:', race);

  await page.click('#btn-begin');
  await page.waitForSelector('#screen-game:not(.hidden)');
  await page.waitForTimeout(500);
  await shot(page, 'map');

  /* A stand-in for a competent player: drink when badly hurt, otherwise use
   * the skill that would actually do the most damage. Clicking whatever
   * button happens to be first tests the DOM, not the game. */
  await page.evaluate(() => {
    window.__pickAction = function () {
      const st = ISE.Game.state;
      const c = st.run ? st.run.combat : st.combat;
      if (!c || c.over || !c.awaitingInput) return false;
      const actor = ISE.Combat.actorById(c, c.current);
      const foes = ISE.Combat.livingOf(c, 'enemy');
      if (!actor || !foes.length) return false;

      if (actor.hp / actor.stats.hp < 0.35) {
        const potion = st.player.inventory.find(i => i.kind === 'consumable' && i.effect === 'heal');
        if (potion) {
          ISE.Combat.playerAction(c, { type: 'item', itemId: potion.id });
          ISE.UI.refresh();
          return true;
        }
      }
      const opts = ISE.Combat.availableSkills(c, actor).filter(o => o.usable && o.skill.power > 0
        && o.skill.category !== 'heal');
      opts.sort((a, b) => ISE.Combat.estimate(actor, foes[0], b.skill) -
        ISE.Combat.estimate(actor, foes[0], a.skill));
      const btn = opts.length
        ? document.querySelector('[data-act="use-skill"][data-id="' + opts[0].skill.id + '"]')
        : null;
      (btn || document.querySelector('[data-act="guard"]')).click();
      return true;
    };
  });

  // Sidebar tabs.
  for (const tab of ['skills', 'gear', 'evolve', 'quests', 'news', 'status']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(120);
    if (tab === 'skills' || tab === 'evolve') await shot(page, 'tab-' + tab);
  }

  // World info codex, every tab.
  await page.click('[data-act="codex"]');
  await page.waitForTimeout(250);
  await shot(page, 'codex-nations');
  for (const t of ['relics', 'dungeons', 'factions', 'heroes', 'history', 'races', 'world']) {
    await page.click(`[data-codextab="${t}"]`);
    await page.waitForTimeout(160);
    if (t === 'relics' || t === 'history' || t === 'races') await shot(page, 'codex-' + t);
  }
  await page.click('[data-act="close-modal"]');
  await page.waitForTimeout(150);

  // Town: the player starts in a settlement.
  const inTown = await page.evaluate(() => {
    const st = ISE.Game.state;
    return !!st.world.settlementAt(st.player.x, st.player.y);
  });
  if (inTown) {
    await page.click('[data-act="town"]');
    await page.waitForTimeout(250);
    await shot(page, 'town-market');
    for (const t of ['train', 'guild', 'people', 'inn']) {
      await page.click(`[data-towntab="${t}"]`);
      await page.waitForTimeout(180);
      if (t === 'guild' || t === 'train') await shot(page, 'town-' + t);
    }
    // Accept a contract if one is available.
    await page.click('[data-towntab="guild"]');
    await page.waitForTimeout(150);
    const accepted = await page.evaluate(() => {
      const b = document.querySelector('[data-act="accept-quest"]');
      if (b) { b.click(); return true; }
      return false;
    });
    if (!accepted) throw new Error('guild board offered no acceptable contract');
    console.log('  accepted a contract:', accepted);
    await page.click('[data-act="close-modal"]');
    await page.waitForTimeout(150);
  }

  // Travel toward the nearest known dungeon, fighting anything on the way.
  console.log('== travel + combat ==');
  const target = await page.evaluate(() => {
    const st = ISE.Game.state, w = st.world, p = st.player;
    let best = null, bd = 1e9;
    w.dungeons.forEach(d => {
      const dd = ISE.U.dist(d.x, d.y, p.x, p.y);
      if (dd < bd && d.tier <= 4) { bd = dd; best = d; }
    });
    if (!best) return null;
    p.knownDungeons[best.id] = true;
    best.discovered = true;
    return { x: best.x, y: best.y, name: best.name, tier: best.tier, dist: Math.round(bd) };
  });
  console.log('  target:', JSON.stringify(target));

  if (target) {
    for (let hop = 0; hop < 14; hop++) {
      const state = await page.evaluate(([tx, ty]) => {
        const st = ISE.Game.state;
        if (st.combat) return 'combat';
        if (st.pendingIntervention) return 'raid';
        if (st.player.x === tx && st.player.y === ty) return 'arrived';
        ISE.UI.handleTravel ? ISE.UI.handleTravel(tx, ty) : null;
        const r = ISE.Game.travelTo(tx, ty);
        ISE.MapView.invalidate();
        ISE.UI.refresh();
        return r.interrupted ? 'combat' : (r.ok ? 'moved' : 'blocked');
      }, [target.x, target.y]);

      if (state === 'raid') {
        await page.click('[data-act="ignore-raid"]');
        await page.waitForTimeout(150);
        continue;
      }
      if (state === 'combat') {
        await page.waitForTimeout(200);
        await shot(page, 'combat');
        // Play the fight out through the real UI buttons.
        for (let t = 0; t < 120; t++) {
          const done = await page.evaluate(() => {
            const c = ISE.Game.state.combat;
            if (!c) return 'none';
            if (c.over) return 'over';
            if (!c.awaitingInput) return 'wait';
            return 'input';
          });
          if (done === 'none') break;
          if (done === 'over') {
            await page.click('[data-act="combat-done"]');
            await page.waitForTimeout(160);
            break;
          }
          const clicked = await page.evaluate(() => window.__pickAction());
          if (!clicked) break;
          await page.waitForTimeout(60);
        }
        continue;
      }
      if (state === 'arrived') break;
      if (state === 'blocked') break;
      await page.waitForTimeout(80);
    }
    await shot(page, 'after-travel');

    // Force one wild encounter so the combat screen is always exercised.
    console.log('== forced encounter ==');
    await page.evaluate(() => {
      const st = ISE.Game.state;
      const tile = st.world.geo.idx(st.player.x, st.player.y);
      ISE.Game.startWildEncounter(tile, new ISE.RNG('uitest-encounter'));
      ISE.UI.refresh();
    });
    await page.waitForTimeout(250);
    await shot(page, 'combat');
    for (let t = 0; t < 200; t++) {
      const s2 = await page.evaluate(() => {
        const c = ISE.Game.state.combat;
        if (!c) return 'none';
        return c.over ? 'over' : (c.awaitingInput ? 'input' : 'wait');
      });
      if (s2 === 'none') break;
      if (s2 === 'over') {
        await shot(page, 'combat-result');
        await page.click('[data-act="combat-done"]');
        await page.waitForTimeout(200);
        break;
      }
      if (s2 === 'input') await page.evaluate(() => window.__pickAction());
      await page.waitForTimeout(50);
    }

    // Delve. Level the character first — a fresh level-1 arrival dies on
    // floor 1 and never exercises descent, mini-bosses or loot.
    console.log('== dungeon ==');
    const built = await page.evaluate(() => {
      const st = ISE.Game.state, w = st.world, p = st.player;
      const rng = new ISE.RNG('uitest-build');
      for (let i = 1; i < 22; i++) ISE.Player.gainXp(p, ISE.Player.xpToNext(p.level), w);
      const pool = w.skills.list.filter(s => !s.unique && !s.apex && s.rarityTier <= 3 &&
        ['attack', 'aoe', 'heal', 'buff'].includes(s.category));
      for (let i = 0; i < 8 && pool.length; i++) {
        const sk = rng.pick(pool);
        if (ISE.Player.learnSkill(p, sk, w)) p.skillById[sk.id].mastery = 45;
      }
      ['weapon', 'body', 'head', 'accessory'].forEach(slot => {
        const item = ISE.ItemGen.rollItem(rng, { tier: 3, rarityTier: 3, slot });
        p.inventory.push(item);
        ISE.Player.equip(p, item);
      });
      for (let i = 0; i < 4; i++) p.inventory.push(ISE.ItemGen.makeConsumable(rng, 2));
      const s2 = ISE.Player.effectiveStats(p);
      p.hpCur = s2.hp; p.mpCur = s2.mp;
      ISE.UI.refresh();
      return { level: p.level, skills: p.skills.length, hp: s2.hp };
    });
    console.log('  built:', JSON.stringify(built));

    const entered = await page.evaluate(([tx, ty]) => {
      const st = ISE.Game.state;
      st.player.x = tx; st.player.y = ty;
      const d = st.world.dungeonAt(tx, ty);
      if (!d) return false;
      const r = ISE.Game.enterDungeon(d.id);
      ISE.UI.refresh();
      return r.ok;
    }, [target.x, target.y]);
    console.log('  entered:', entered);

    if (entered) {
      await page.waitForTimeout(250);
      await shot(page, 'dungeon');
      for (let step = 0; step < 400; step++) {
        const what = await page.evaluate(() => {
          const st = ISE.Game.state;
          if (!st.run) return 'gone';
          if (st.run.over) return 'over';
          if (st.run.combat) return st.run.combat.over ? 'combat-over' : 'combat';
          if (st.player.hpCur <= 0) return 'dead';
          return 'explore';
        });
        if (what === 'gone' || what === 'over' || what === 'dead') break;
        if (what === 'combat') {
          const ok = await page.evaluate(() => window.__pickAction());
          if (!ok) await page.waitForTimeout(80);
          continue;
        }
        if (what === 'combat-over') {
          await page.click('[data-act="combat-done"]');
          await page.waitForTimeout(140);
          continue;
        }
        const moved = await page.evaluate(() => {
          const desc = document.querySelector('[data-act="descend"]');
          if (desc) { desc.click(); return 'descend'; }
          const node = document.querySelector('[data-act="node"]');
          if (node) { node.click(); return 'node'; }
          return 'stuck';
        });
        if (moved === 'stuck') break;
        await page.waitForTimeout(110);
      }
      await shot(page, 'dungeon-progress');
      const runInfo = await page.evaluate(() => {
        const r = ISE.Game.state.run;
        return r ? { floor: r.floorNum, kills: r.kills, gold: r.loot.gold,
          items: r.loot.items.length, over: r.over, outcome: r.outcome } : null;
      });
      console.log('  run:', JSON.stringify(runInfo));
      await page.evaluate(() => { if (ISE.Game.state.run) { ISE.Game.leaveDungeon(); ISE.UI.refresh(); } });
      await page.waitForTimeout(200);
    }
  }

  // Save + reload round trip through the UI.
  console.log('== save/load ==');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(250);
  const saved = await page.evaluate(() => !!localStorage.getItem(ISE.Game.SAVE_KEY));
  console.log('  saved:', saved);

  await page.reload();
  await page.waitForTimeout(500);
  await page.click('#btn-load');
  await page.waitForTimeout(600);
  const loaded = await page.evaluate(() => {
    const st = ISE.Game.state;
    return st.player ? { name: st.player.name, level: st.player.level,
      skills: st.player.skills.length, year: st.world.year,
      legends: st.world.legends.length } : null;
  });
  console.log('  loaded:', JSON.stringify(loaded));
  await shot(page, 'reloaded');

  await browser.close();

  console.log('\n' + (errors.length ? errors.length + ' PAGE ERRORS:' : 'no page errors'));
  errors.slice(0, 12).forEach(e => console.log('  ' + e.split('\n')[0]));
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
