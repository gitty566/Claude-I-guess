/* load.js — loads the engine's browser scripts into node for headless
 * testing. Same file list and order as index.html. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'src/core/rng.js',
  'src/core/util.js',
  'src/core/noise.js',
  'src/data/tables.js',
  'src/data/names.js',
  'src/data/skills.js',
  'src/data/races.js',
  'src/data/items.js',
  'src/data/monsters.js',
  'src/data/events.js',
  'src/gen/skillgen.js',
  'src/gen/racegen.js',
  'src/gen/geo.js',
  'src/gen/itemgen.js',
  'src/gen/monstergen.js',
  'src/gen/nations.js',
  'src/gen/dungeons.js',
  'src/gen/world.js',
  'src/sim/procs.js',
  'src/sim/history.js',
  'src/sim/worldclock.js',
  'src/game/combat.js',
  'src/game/evolution.js',
  'src/game/player.js',
  'src/game/economy.js',
  'src/game/quests.js',
  'src/game/dungeonrun.js',
  'src/game/game.js'
];

function load(opts) {
  opts = opts || {};
  const sandbox = { console, Date, Math, JSON, setTimeout, clearTimeout };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const files = opts.files || FILES;
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      if (opts.strict) throw new Error('missing file: ' + rel);
      continue;
    }
    const code = fs.readFileSync(full, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      throw new Error('Error loading ' + rel + ': ' + e.message + '\n' + e.stack);
    }
  }
  return sandbox.ISE;
}

module.exports = { load, FILES, ROOT };
