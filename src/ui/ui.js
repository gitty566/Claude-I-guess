/* ui/ui.js — all screens. Reads engine state, writes DOM, and routes user
 * input back into ISE.Game. No game rules live here. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, G = ISE.Game;
  var UI = { tab: 'status', townTab: 'shop', codexTab: 'nations', selected: null };

  /* ------------------------------------------------------------- helpers */
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  UI.esc = esc;

  function show(id) {
    ['screen-title', 'screen-create', 'screen-game'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  function rarityClass(r) { return 'r-' + (r || 'common'); }

  function elemDot(element) {
    var e = T.ELEMENT[element];
    return '<span class="dot" style="background:' + (e ? e.color : '#888') + '"></span>';
  }

  function bar(value, max, cls) {
    var pct = U.clamp01(max ? value / max : 0) * 100;
    return '<div class="bar ' + (cls || '') + '"><i style="width:' + pct.toFixed(1) + '%"></i>' +
      '<b>' + U.short(Math.max(0, Math.round(value))) + ' / ' + U.short(Math.round(max)) + '</b></div>';
  }

  function progressBar(frac, label) {
    return '<div class="mini-bar"><i style="width:' + (U.clamp01(frac) * 100).toFixed(0) + '%"></i>' +
      '<b>' + esc(label) + '</b></div>';
  }

  UI.toast = function (text, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = text;
    host.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 2600);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
  };

  function modal(title, bodyHtml, footHtml, wide) {
    var host = document.getElementById('modal-host');
    host.innerHTML = '<div class="modal-back"><div class="modal ' + (wide ? 'wide' : '') + '">' +
      '<header><h2>' + title + '</h2><button class="x" data-act="close-modal">✕</button></header>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      '<footer>' + (footHtml || '<button data-act="close-modal">Close</button>') + '</footer>' +
      '</div></div>';
    host.classList.remove('hidden');
  }
  UI.modal = modal;

  function closeModal() {
    var host = document.getElementById('modal-host');
    host.innerHTML = '';
    host.classList.add('hidden');
  }
  UI.closeModal = closeModal;

  /* ============================================================ TITLE ==== */
  var PARAM_DEFS = [
    { key: 'worldSize', label: 'World size', min: 1, max: 5, step: 1,
      fmt: function (v) { return ['', 'Tiny', 'Small', 'Medium', 'Large', 'Vast'][v]; },
      help: 'Map dimensions. Larger worlds hold more nations, dungeons and empty road.' },
    { key: 'nationCount', label: 'Nations at genesis', min: 2, max: 16, step: 1,
      help: 'How many states are founded before history begins. More means messier borders.' },
    { key: 'historyYears', label: 'Years of history', min: 0, max: 1000, step: 10,
      help: 'Simulated before you arrive. Wars, delves, relic forging, dynasties — all of it runs.' },
    { key: 'magicDensity', label: 'Magic density', min: 0, max: 1, step: 0.05, pct: true,
      help: 'How saturated the world is. Raises mastery speed, skill availability and dungeon count — ' +
        'and raises the danger floor to match.' },
    { key: 'monsterCeiling', label: 'Monster power ceiling', min: 1, max: 10, step: 1,
      help: 'Caps how strong the worst things can get, and how deep race evolution trees run.' },
    { key: 'relicAbundance', label: 'Relic abundance', min: 0, max: 1, step: 0.05, pct: true,
      help: 'How many world-unique artifacts get forged during history.' },
    { key: 'warTendency', label: 'War/peace tendency', min: 0, max: 1, step: 0.05, pct: true,
      help: 'How volatile nation relations are. High means borders move constantly.' },
    { key: 'settlementDensity', label: 'Settlement density', min: 0.4, max: 2, step: 0.1,
      help: 'Sparse frontier versus dense civilisation.' },
    { key: 'defensibility', label: 'Settlement defences', min: 0, max: 1.5, step: 0.1,
      help: 'Garrison and wall strength. Low means the wild wins arguments.' }
  ];

  UI.params = U.assign({}, ISE.WorldGen.DEFAULT_PARAMS);

  function renderTitle() {
    var p = UI.params;
    var rows = PARAM_DEFS.map(function (d) {
      var v = p[d.key];
      var display = d.fmt ? d.fmt(v) : (d.pct ? U.pct(v) : v);
      return '<div class="param" title="' + esc(d.help) + '">' +
        '<label>' + esc(d.label) + '<em>' + esc(display) + '</em></label>' +
        '<input type="range" data-param="' + d.key + '" min="' + d.min + '" max="' + d.max +
        '" step="' + d.step + '" value="' + v + '">' +
        '<small>' + esc(d.help) + '</small></div>';
    }).join('');

    $('#title-params').innerHTML = rows;
    // Never clobber what the player is in the middle of typing.
    var seedEl = $('#seed-input');
    if (seedEl && document.activeElement !== seedEl) seedEl.value = p.seed;
    var loadBtn = $('#btn-load');
    if (loadBtn) loadBtn.disabled = !G.hasSave();
  }

  /* Update one slider's readout in place. Re-rendering the whole panel on
   * every input event tears out the element being dragged, which makes the
   * sliders feel broken. */
  function updateParamLabel(key) {
    var d = null;
    PARAM_DEFS.forEach(function (x) { if (x.key === key) d = x; });
    if (!d) return;
    var input = document.querySelector('[data-param="' + key + '"]');
    if (!input) return;
    var em = input.parentNode.querySelector('label em');
    if (!em) return;
    var v = UI.params[key];
    em.textContent = d.fmt ? d.fmt(v) : (d.pct ? U.pct(v) : v);
  }

  UI.renderTitle = renderTitle;

  function setParam(key, value) {
    var d = null;
    PARAM_DEFS.forEach(function (x) { if (x.key === key) d = x; });
    if (!d) return;
    UI.params[key] = d.step >= 1 ? Math.round(value) : parseFloat(value);
    updateParamLabel(key);
  }

  function randomizeAll() {
    var r = Math.random;
    UI.params.seed = ISE.RNG.randomSeed();
    UI.params.worldSize = 1 + Math.floor(r() * 5);
    UI.params.nationCount = 3 + Math.floor(r() * 10);
    UI.params.historyYears = Math.round((50 + r() * 750) / 10) * 10;
    UI.params.magicDensity = Math.round(r() * 20) / 20;
    UI.params.monsterCeiling = 1 + Math.floor(r() * 10);
    UI.params.relicAbundance = Math.round(r() * 20) / 20;
    UI.params.warTendency = Math.round(r() * 20) / 20;
    UI.params.settlementDensity = Math.round((0.4 + r() * 1.6) * 10) / 10;
    UI.params.defensibility = Math.round(r() * 15) / 10;
    renderTitle();
  }

  /* World generation runs in chunks so the progress bar actually paints. */
  function generateWorld() {
    var params = U.assign({}, UI.params, { seed: $('#seed-input').value || UI.params.seed });
    UI.params.seed = params.seed;
    var overlay = $('#genprogress');
    overlay.classList.remove('hidden');
    var label = $('#genprogress-label');
    var fill = $('#genprogress-fill');

    function setProgress(text, frac) {
      label.textContent = text;
      fill.style.width = (U.clamp01(frac) * 100).toFixed(1) + '%';
    }

    setProgress('Shaping the world…', 0.02);
    setTimeout(function () {
      var world;
      try {
        world = ISE.WorldGen.generate(params, function (msg, frac) { setProgress(msg, frac); });
      } catch (e) {
        overlay.classList.add('hidden');
        UI.toast('World generation failed: ' + e.message, 'bad');
        throw e;
      }
      UI.pendingWorld = world;

      var years = world.params.historyYears;
      var done = 0;
      var chunk = Math.max(5, Math.round(years / 40));
      // Seed borders and the first generation of heroes; the year loop below
      // then advances history in chunks so the progress bar can paint.
      ISE.History.prepare(world);

      function step() {
        if (done >= years) {
          ISE.History.finalize(world);
          setProgress('The world remembers ' + U.num(world.legends.length) + ' events.', 1);
          setTimeout(function () {
            overlay.classList.add('hidden');
            openCreation(world);
          }, 350);
          return;
        }
        var n = Math.min(chunk, years - done);
        ISE.History.run(world, n);
        done += n;
        setProgress('Simulating history — year ' + world.year + ' of ' + years +
          ' (' + U.num(world.legends.length) + ' events)', 0.82 + 0.18 * (done / Math.max(1, years)));
        setTimeout(step, 0);
      }
      setTimeout(step, 30);
    }, 40);
  }

  /* ========================================================= CREATION ==== */
  UI.creation = { name: '', originId: 'reincarnated', raceId: null, rolled: null };

  function openCreation(world) {
    UI.world = world;
    ISE.Player._world = world;
    UI.creation.name = UI.creation.name || '';
    UI.creation.raceId = null;
    UI.creation.rolled = null;
    show('screen-create');
    renderCreation();
  }

  function renderCreation() {
    var world = UI.world;
    var c = UI.creation;
    var origin = ISE.Player.ORIGINS.filter(function (o) { return o.id === c.originId; })[0];

    var originCards = ISE.Player.ORIGINS.map(function (o) {
      return '<div class="card origin' + (o.id === c.originId ? ' sel' : '') +
        '" data-origin="' + o.id + '">' +
        '<h4>' + esc(o.name) + '</h4><p>' + esc(o.desc) + '</p>' +
        '<ul>' + o.perks.map(function (p) {
          return '<li class="perk"><b>' + esc(p.name) + '</b> ' + esc(p.text) + '</li>';
        }).join('') + o.quirks.map(function (p) {
          return '<li class="quirk"><b>' + esc(p.name) + '</b> ' + esc(p.text) + '</li>';
        }).join('') + '</ul></div>';
    }).join('');

    var pool = ISE.Player.originRaceTable(origin, world);
    var chooseFreely = origin.raceRoll === 'choose' || origin.raceRoll === 'any';
    var raceHtml;

    if (chooseFreely) {
      raceHtml = '<div class="race-grid">' + world.races.list.filter(function (r) { return r.playable; })
        .map(raceCard).join('') + '</div>';
    } else {
      raceHtml = '<p class="hint">This origin does not let you pick. Your form is decided by ' +
        'a roll on its own table — ' + pool.length + ' possible results in this world.</p>' +
        '<div class="roll-row">' +
        '<button data-act="roll-race">' + (c.rolled ? 'Roll again' : 'Roll your arrival') + '</button>' +
        (c.rolled ? '<span class="hint">You may re-roll as often as you like before starting.</span>' : '') +
        '</div>' +
        (c.rolled ? '<div class="race-grid">' + raceCard(world.races.byId[c.rolled], true) + '</div>' : '');
    }

    var picked = c.raceId ? world.races.byId[c.raceId] : null;
    var previewHtml = '';
    if (picked) {
      var tree = renderTreePreview(picked);
      previewHtml = '<div class="preview"><h3>' + esc(picked.name) + '</h3>' +
        '<p>' + esc(picked.desc) + '</p>' +
        '<div class="statline">' + T.STATS.map(function (s) {
          return '<span><em>' + s.short + '</em>' + Math.round(picked.stats[s.id]) +
            ' <small>+' + U.round(picked.growth[s.id], 1) + '/lvl</small></span>';
        }).join('') + '</div>' +
        '<p class="hint">Mastery rate ×' + U.round(picked.learnRate, 2) +
        ' · Evolution tree depth ' + picked.maxTier + ' tiers · ' +
        picked.nodes.list.length + ' forms</p>' +
        '<div class="tree-preview">' + tree + '</div></div>';
    }

    $('#create-body').innerHTML =
      '<div class="create-col">' +
        '<h3>1 · Who are you?</h3>' +
        '<input id="name-input" type="text" maxlength="24" placeholder="Name" value="' +
          esc(c.name) + '">' +
        '<h3>2 · How did you get here?</h3>' +
        '<div class="origin-grid">' + originCards + '</div>' +
      '</div>' +
      '<div class="create-col">' +
        '<h3>3 · What are you?</h3>' + raceHtml + previewHtml +
      '</div>';

    $('#btn-begin').disabled = !(c.raceId && ($('#name-input') ? true : true));
  }

  function raceCard(race, big) {
    if (!race) return '';
    var c = UI.creation;
    return '<div class="card race' + (race.id === c.raceId ? ' sel' : '') + (big ? ' big' : '') +
      '" data-race="' + race.id + '">' +
      '<h4>' + esc(race.name) + (race.unique ? ' <span class="tag">world-unique</span>' : '') + '</h4>' +
      '<p>' + esc(race.desc) + '</p>' +
      '<div class="chips">' + race.affinity.map(function (a) {
        return '<span class="chip">' + elemDot(a) + esc(T.ELEMENT[a] ? T.ELEMENT[a].name : a) + '</span>';
      }).join('') + '<span class="chip">' + race.nodes.list.length + ' forms</span></div>' +
      '</div>';
  }

  function renderTreePreview(race) {
    function node(n, depth) {
      var kids = (n.branches || []).map(function (b) { return node(b, depth + 1); }).join('');
      return '<li class="' + (n.mythical ? 'myth' : '') + '"><span class="t' + n.tier + '">' +
        esc(n.name) + '</span>' + (kids ? '<ul>' + kids + '</ul>' : '') + '</li>';
    }
    return '<ul class="tree">' + node(race.tree, 0) + '</ul>';
  }

  function beginGame() {
    var c = UI.creation;
    var name = ($('#name-input') && $('#name-input').value.trim()) || 'Wanderer';
    if (!c.raceId) { UI.toast('Pick a form first.', 'bad'); return; }
    G.startGame(UI.world, { name: name, raceId: c.raceId, originId: c.originId });
    show('screen-game');
    ISE.MapView.invalidate();
    UI.resizeMap();
    UI.refresh();
    UI.toast('Welcome to ' + UI.world.geo.continents[0].name + '.', 'good');
  }

  /* ============================================================= GAME ==== */
  /* The canvas has no size until the game screen is actually visible, so
   * this has to run after the screen is shown, not at boot. */
  UI.resizeMap = function () {
    var wrap = document.getElementById('mapwrap');
    var canvas = document.getElementById('map');
    if (!wrap || !canvas) return false;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return false;
    var scale = (window.devicePixelRatio > 1 ? 1.5 : 1);
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    if (canvas.width === cw && canvas.height === ch) return true;
    canvas.width = cw;
    canvas.height = ch;
    ISE.MapView.invalidate();
    return true;
  };

  UI.refresh = function () {
    var st = G.state;
    if (!st.world || !st.player) return;
    renderTopbar();
    UI.resizeMap();
    ISE.MapView.draw();
    renderSidebar();
    renderLog();
    renderTileInfo();

    if (st.combat) renderCombat();
    else if (st.run) renderDungeon();
    else {
      var ov = document.getElementById('overlay');
      if (ov) { ov.innerHTML = ''; ov.classList.add('hidden'); }
    }
    if (st.pendingIntervention && !st.combat) renderIntervention();
  };

  function renderTopbar() {
    var st = G.state, p = st.player, w = st.world;
    var stats = ISE.Player.effectiveStats(p);
    var nextXp = ISE.Player.xpToNext(p.level);

    /* During a fight the combat actor holds the live values — player.hpCur
     * is only written back when the fight ends. Reading the stale record
     * here put two disagreeing HP bars on screen at once. */
    var combat = st.run ? st.run.combat : st.combat;
    var hpNow = p.hpCur, mpNow = p.mpCur;
    if (combat && !combat.over) {
      var me = ISE.Combat.actorById(combat, 'player');
      if (me) { hpNow = me.hp; mpNow = me.mp; }
    }
    $('#topbar').innerHTML =
      '<div class="who"><b>' + esc(p.name) + '</b>' +
        '<span>' + esc(p.formName) + ' · ' + esc(p.raceName) + ' · Lv ' + p.level +
        (p.named ? ' · <em class="named">Named</em>' : '') + '</span></div>' +
      '<div class="vitals">' +
        '<div class="v"><label>HP</label>' + bar(hpNow, stats.hp, 'hp') + '</div>' +
        '<div class="v"><label>MP</label>' + bar(mpNow, stats.mp, 'mp') + '</div>' +
        '<div class="v"><label>XP</label>' + bar(p.xp, nextXp, 'xp') + '</div>' +
      '</div>' +
      '<div class="meta">' +
        '<span title="Coin">◈ ' + U.num(p.gold) + '</span>' +
        '<span title="Fame">★ ' + Math.round(p.fame) + '</span>' +
        '<span title="Guild rank">🜲 ' + esc(ISE.Player.guildRankName(p)) + '</span>' +
        '<span title="Date">' + esc(U.formatDate(w.day)) + '</span>' +
      '</div>' +
      '<div class="topbtns">' +
        '<button data-act="codex">World Info</button>' +
        '<button data-act="save">Save</button>' +
      '</div>';
  }

  function renderTileInfo() {
    var st = G.state, w = st.world, p = st.player;
    var t = ISE.MapView.hover || { x: p.x, y: p.y };
    var info = ISE.MapView.describeTile(w, p, t.x, t.y);
    var here = (t.x === p.x && t.y === p.y);

    var actions = [];
    if (!here) {
      var est = G.travelEstimate(w, p, t.x, t.y);
      if (est) {
        actions.push('<button data-act="travel" data-x="' + t.x + '" data-y="' + t.y + '">Travel · ' +
          est.days + ' ' + U.plural(est.days, 'day') + '</button>');
      } else actions.push('<span class="hint">No land route.</span>');
    } else {
      if (info.settlement) actions.push('<button data-act="town">Enter ' + esc(info.settlement.name) + '</button>');
      if (info.dungeon) actions.push('<button data-act="delve" data-id="' + info.dungeon.id + '">Descend</button>');
      actions.push('<button data-act="rest">Rest</button>');
      actions.push('<button data-act="wait">Wait 7 days</button>');
    }

    $('#tileinfo').innerHTML =
      '<h4>' + esc(info.title) + (here ? ' <span class="tag">you are here</span>' : '') + '</h4>' +
      '<div class="lines">' + info.lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' +
      '<div class="row">' + actions.join('') + '</div>';
  }

  var TABS = [
    { id: 'status', name: 'Status' },
    { id: 'skills', name: 'Skills' },
    { id: 'gear', name: 'Gear' },
    { id: 'evolve', name: 'Evolve' },
    { id: 'quests', name: 'Contracts' },
    { id: 'news', name: 'News' }
  ];

  function renderSidebar() {
    var tabs = TABS.map(function (t) {
      return '<button class="tab' + (UI.tab === t.id ? ' sel' : '') + '" data-tab="' + t.id + '">' +
        t.name + '</button>';
    }).join('');
    var body;
    switch (UI.tab) {
      case 'skills': body = renderSkills(); break;
      case 'gear': body = renderGear(); break;
      case 'evolve': body = renderEvolve(); break;
      case 'quests': body = renderQuests(); break;
      case 'news': body = renderNews(); break;
      default: body = renderStatus();
    }
    $('#sidebar').innerHTML = '<div class="tabs">' + tabs + '</div><div class="tabbody">' + body + '</div>';
  }

  function renderStatus() {
    var st = G.state, p = st.player, w = st.world;
    var stats = ISE.Player.effectiveStats(p);
    var path = ISE.Evolution.path(p, w);
    var origin = ISE.Player.ORIGINS.filter(function (o) { return o.id === p.originId; })[0];

    var repRows = w.livingNations().map(function (n) {
      var v = ISE.Player.reputationWith(p, n.id);
      return '<tr><td><span class="swatch" style="background:' + n.color + '"></span>' +
        esc(n.name) + '</td><td>' + esc(ISE.Player.repLabel(v)) + ' <small>(' + v + ')</small></td></tr>';
    }).join('');

    return '<div class="panel">' +
      '<h3>Attributes</h3><div class="statgrid">' +
        T.STATS.map(function (s) {
          return '<div title="' + esc(s.desc) + '"><em>' + s.short + '</em><b>' +
            U.num(stats[s.id]) + '</b></div>';
        }).join('') + '</div>' +
      '<h3>Form</h3><div class="formpath">' + path.map(function (n, i) {
        return '<span class="t' + n.tier + '">' + esc(n.name) + '</span>' +
          (i < path.length - 1 ? ' <i>→</i> ' : '');
      }).join('') + '</div>' +
      '<p class="hint">' + esc(path[path.length - 1].desc || '') + '</p>' +
      '<h3>Origin</h3><p><b>' + esc(origin.name) + '</b> — ' + esc(origin.desc) + '</p>' +
      '<ul class="perks">' + p.perks.map(function (x) {
        return '<li class="perk"><b>' + esc(x.name) + '</b> ' + esc(x.text) + '</li>';
      }).join('') + p.quirks.map(function (x) {
        return '<li class="quirk"><b>' + esc(x.name) + '</b> ' + esc(x.text) + '</li>';
      }).join('') + '</ul>' +
      '<h3>Deeds</h3><div class="statgrid small">' +
        '<div><em>Kills</em><b>' + U.num(p.deeds.kills) + '</b></div>' +
        '<div><em>Bosses</em><b>' + p.deeds.bosses + '</b></div>' +
        '<div><em>Dungeons</em><b>' + p.deeds.dungeons + '</b></div>' +
        '<div><em>Floors</em><b>' + p.deeds.floors + '</b></div>' +
        '<div><em>Relics</em><b>' + (p.relicsOwned || 0) + '</b></div>' +
        '<div><em>Raids held</em><b>' + p.deeds.raidsDefended + '</b></div>' +
      '</div>' +
      (p.companions.length ? '<h3>Companions</h3>' + p.companions.map(function (c) {
        return '<div class="comp"><b>' + esc(c.name) + '</b> Lv ' + c.level +
          (c.named ? ' <em class="named">Named</em>' : '') +
          '<div>' + bar(c.hpCur, c.stats.hp, 'hp') + '</div>' +
          (!c.named ? '<button data-act="name-comp" data-id="' + c.id + '">Give it a Name</button>' : '') +
          '</div>';
      }).join('') : '') +
      '<h3>Standing</h3><table class="rep">' + repRows + '</table>' +
      '</div>';
  }

  function skillRow(def, entry, opts) {
    opts = opts || {};
    var rarity = T.RARITY[def.rarity];
    return '<div class="skill ' + rarityClass(def.rarity) + '">' +
      '<div class="sk-head">' + elemDot(def.element) +
        '<b>' + esc(def.name) + '</b>' +
        '<span class="rar">' + rarity.name + '</span>' +
        '<span class="cat">' + (T.SKILL_CATEGORIES[def.category] || { name: def.category }).name + '</span>' +
      '</div>' +
      '<div class="sk-meta">' +
        (def.power ? '<span>power ' + def.power + '</span>' : '') +
        (def.mp ? '<span>' + def.mp + ' MP</span>' : '') +
        (def.cooldown ? '<span>CD ' + def.cooldown + '</span>' : '') +
        (def.hits > 1 ? '<span>' + def.hits + ' hits</span>' : '') +
        (def.status ? '<span>' + esc(T.STATUSES[def.status].name) + '</span>' : '') +
      '</div>' +
      '<p>' + esc(def.desc) + '</p>' +
      (entry ? progressBar(entry.mastery / 100, 'mastery ' + U.round(entry.mastery, 1) + '%') : '') +
      (opts.foot || '') + '</div>';
  }

  function renderSkills() {
    var st = G.state, p = st.player, w = st.world;
    var evolutions = ISE.Player.skillEvolutions(p, w);
    var evoById = {};
    evolutions.forEach(function (e) { evoById[e.from.id] = e; });

    var byCat = {};
    p.skills.forEach(function (entry) {
      var def = w.skills.byId[entry.id];
      if (!def) return;
      (byCat[def.category] = byCat[def.category] || []).push({ def: def, entry: entry });
    });

    var sections = Object.keys(byCat).sort().map(function (cat) {
      var name = (T.SKILL_CATEGORIES[cat] || { name: cat }).name;
      return '<h3>' + esc(name) + '</h3>' + byCat[cat].sort(function (a, b) {
        return b.def.rarityTier - a.def.rarityTier;
      }).map(function (x) {
        var ev = evoById[x.def.id];
        var foot = '';
        if (ev) {
          foot = '<div class="evo-box' + (ev.ok ? ' ready' : '') + '">' +
            '<div>Evolves into <b>' + esc(ev.to.name) + '</b> (' + T.RARITY[ev.to.rarity].name + ')</div>' +
            ev.reqs.map(function (r) {
              return '<div class="req' + (r.met ? ' met' : '') + '">' + esc(r.text) + '</div>';
            }).join('') +
            (ev.ok ? '<button data-act="evolve-skill" data-id="' + x.def.id + '">Evolve skill</button>' : '') +
            '</div>';
        }
        return skillRow(x.def, x.entry, { foot: foot });
      }).join('');
    }).join('');

    return '<div class="panel">' +
      '<p class="hint">' + p.skills.length + ' known of ' + U.num(w.skills.count) +
      ' in this world. Any skill can be learned by anyone who meets its conditions.</p>' +
      '<div class="row"><button data-act="browse-skills">Browse the world catalogue</button></div>' +
      sections + '</div>';
  }

  function itemRow(item, actions) {
    var stats = Object.keys(item.stats || {}).map(function (k) {
      return '<span>' + (T.STATS.filter(function (s) { return s.id === k; })[0] || { short: k }).short +
        ' ' + U.signed(item.stats[k]) + '</span>';
    }).join('');
    var extras = [];
    var ex = item.extras || {};
    if (ex.crit) extras.push('crit ' + U.pct(ex.crit));
    if (ex.lifesteal) extras.push('lifesteal ' + U.pct(ex.lifesteal));
    if (ex.thorns) extras.push('thorns ' + U.pct(ex.thorns));
    if (ex.pierce) extras.push('pierce ' + U.pct(ex.pierce));
    if (ex.costCut) extras.push('cost −' + U.pct(ex.costCut));
    if (ex.elemPower) {
      for (var el in ex.elemPower) extras.push(T.ELEMENT[el].name + ' +' + U.pct(ex.elemPower[el]));
    }
    return '<div class="item ' + rarityClass(item.rarity) + (item.relic ? ' relic' : '') + '">' +
      '<div class="it-head"><b>' + esc(item.name) + '</b>' +
      '<span class="rar">' + T.RARITY[item.rarity].name + '</span></div>' +
      (item.relic ? '<div class="relic-effect">' + esc(item.effectText || '') + '</div>' +
        '<p class="backstory">' + esc(item.backstory || '') + '</p>' : '') +
      (stats ? '<div class="it-stats">' + stats + '</div>' : '') +
      (extras.length ? '<div class="it-stats">' + extras.map(function (e) {
        return '<span>' + esc(e) + '</span>';
      }).join('') + '</div>' : '') +
      (item.desc && !item.relic ? '<p class="hint">' + esc(item.desc) + '</p>' : '') +
      (actions ? '<div class="row">' + actions + '</div>' : '') + '</div>';
  }
  UI.itemRow = itemRow;

  function renderGear() {
    var p = G.state.player;
    var eq = p.equipment;
    var slots = [['weapon', 'Weapon'], ['offhand', 'Off-hand'], ['head', 'Head'], ['body', 'Body']];
    var equipped = slots.map(function (s) {
      var item = eq[s[0]];
      return '<div class="slot"><label>' + s[1] + '</label>' +
        (item ? itemRow(item, '<button data-act="unequip" data-slot="' + s[0] + '">Remove</button>')
          : '<div class="empty">empty</div>') + '</div>';
    }).join('') +
      (eq.accessory || []).map(function (item, i) {
        return '<div class="slot"><label>Accessory ' + (i + 1) + '</label>' +
          (item ? itemRow(item, '<button data-act="unequip" data-slot="accessory" data-i="' + i + '">Remove</button>')
            : '<div class="empty">empty</div>') + '</div>';
      }).join('');

    var inv = p.inventory.map(function (item) {
      var acts = '';
      if (item.kind === 'equipment') acts += '<button data-act="equip" data-id="' + item.id + '">Equip</button>';
      if (item.kind === 'consumable') acts += '<button data-act="use-item" data-id="' + item.id + '">Use</button>';
      if (item.kind === 'skill_orb') acts += '<button data-act="use-orb" data-id="' + item.id + '">Learn</button>';
      if (item.kind === 'catalyst') acts += '<button data-act="use-catalyst" data-id="' + item.id + '">Consume</button>';
      acts += '<button class="ghost" data-act="drop" data-id="' + item.id + '">Drop</button>';
      return itemRow(item, acts);
    }).join('') || '<p class="hint">Nothing carried.</p>';

    return '<div class="panel"><h3>Equipped</h3><div class="slots">' + equipped + '</div>' +
      '<h3>Carried (' + p.inventory.length + ')</h3>' + inv + '</div>';
  }

  function renderEvolve() {
    var st = G.state, p = st.player, w = st.world;
    var options = ISE.Evolution.available(p, w);
    var path = ISE.Evolution.path(p, w);
    var race = w.races.byId[p.raceId];

    var body = options.map(function (opt) {
      var d = ISE.Evolution.describeNode(p, opt.node, w);
      return '<div class="evo-node' + (d.ok ? ' ready' : '') + (d.mythical ? ' myth' : '') + '">' +
        '<h4>' + esc(d.name) + ' <span class="tag">tier ' + d.tier + '</span>' +
        (d.mythical ? ' <span class="tag myth">mythical</span>' : '') + '</h4>' +
        '<p>' + esc(d.desc) + '</p>' +
        '<div class="hint">Stat multiplier ×' + U.round(d.mult, 2) +
          (d.innate.length ? ' · grants ' + d.innate.map(esc).join(', ') : '') + '</div>' +
        '<div class="reqs">' + d.reqs.map(function (r) {
          return '<div class="req' + (r.met ? ' met' : '') + '">' +
            progressBar(r.progress, r.text) + '</div>';
        }).join('') + '</div>' +
        (d.ok ? '<button data-act="evolve" data-id="' + opt.node.id + '">Evolve</button>' : '') +
        '</div>';
    }).join('') || '<p class="hint">This is a terminal form. Nothing follows it in ' +
      esc(race.name) + '\'s tree.</p>';

    return '<div class="panel">' +
      '<h3>Current path</h3><div class="formpath">' + path.map(function (n, i) {
        return '<span class="t' + n.tier + '">' + esc(n.name) + '</span>' +
          (i < path.length - 1 ? ' <i>→</i> ' : '');
      }).join('') + '</div>' +
      '<h3>Available evolutions</h3>' + body +
      '<div class="row"><button data-act="show-tree">See the whole tree</button></div>' +
      '</div>';
  }

  function renderQuests() {
    var st = G.state, p = st.player, w = st.world;
    var active = p.questsActive.map(function (q) {
      var settlement = w.settlementById[q.settlementId];
      return '<div class="quest' + (q.done ? ' done' : '') + (q.failed ? ' failed' : '') + '">' +
        '<h4>' + esc(q.title) + '</h4>' +
        '<p>' + esc(q.desc) + '</p>' +
        progressBar(q.progress / q.need, q.progress + ' / ' + q.need) +
        '<div class="hint">' + esc(q.typeName) + ' · difficulty ' + q.difficulty +
        ' · posted at ' + esc(settlement ? settlement.name : 'a lost town') +
        ' · reward ' + U.num(q.reward.gold) + ' coin, ' + U.num(q.reward.xp) + ' xp</div>' +
        (q.done ? '<div class="tag good">Complete — report to a guild branch</div>' : '') +
        (q.failed ? '<div class="tag bad">Failed</div>' : '') +
        '<button class="ghost" data-act="abandon-quest" data-id="' + q.id + '">Abandon</button>' +
        '</div>';
    }).join('') || '<p class="hint">No active contracts. Guild branches post work.</p>';

    return '<div class="panel"><h3>Active (' + p.questsActive.length + '/5)</h3>' + active +
      '<h3>Completed</h3><p class="hint">' + p.questsDone.length + ' contracts closed. Guild rank: ' +
      esc(ISE.Player.guildRankName(p)) + '.</p></div>';
  }

  function renderNews() {
    var w = G.state.world;
    var news = (w.news || []).slice().reverse().slice(0, 60).map(function (n) {
      return '<div class="news' + (n.importance > 1 ? ' big' : '') + '">' +
        '<span class="when">Year ' + n.year + '</span> ' + esc(n.text) + '</div>';
    }).join('') || '<p class="hint">Nothing has reached you yet.</p>';
    return '<div class="panel"><h3>Word from the world</h3>' + news + '</div>';
  }

  function renderLog() {
    var msgs = G.state.messages.slice(-40).reverse().map(function (m) {
      return '<div class="msg ' + m.kind + '">' + esc(m.text) + '</div>';
    }).join('');
    $('#log').innerHTML = msgs;
  }

  /* ============================================================ TOWN ===== */
  function openTown() {
    var st = G.state, w = st.world, p = st.player;
    var s = w.settlementAt(p.x, p.y);
    if (!s) { UI.toast('There is no settlement here.', 'bad'); return; }
    UI.townId = s.id;
    renderTown();
  }

  function renderTown() {
    var st = G.state, w = st.world, p = st.player;
    var s = w.settlementById[UI.townId];
    if (!s) return;
    var nat = w.nationById[s.nationId];
    var tabs = [['shop', 'Market'], ['train', 'Trainers'], ['guild', 'Guild'],
      ['people', 'People'], ['inn', 'Inn']];

    var body;
    switch (UI.townTab) {
      case 'train': body = renderTrainers(s); break;
      case 'guild': body = renderGuild(s); break;
      case 'people': body = renderPeople(s, nat); break;
      case 'inn': body = renderInn(s); break;
      default: body = renderShop(s);
    }

    var header = '<div class="town-head">' +
      '<div><b>' + esc(s.name) + '</b> — ' + esc(s.sizeName) +
      (s.isCapital ? ', capital of ' : ', in ') + esc(nat ? nat.name : 'no man\'s land') + '</div>' +
      '<div class="hint">Population ' + U.short(s.population) + ' · garrison ' + U.short(s.garrison) +
      ' · walls ' + U.round(s.walls, 1) + ' · ' +
      (s.economy.resources || []).map(function (r) {
        return esc(ISE.ItemData.RESOURCE_NAMES[r] || r);
      }).join(', ') + '</div></div>' +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (UI.townTab === t[0] ? ' sel' : '') +
          '" data-towntab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';

    modal(esc(s.name), header + '<div class="town-body">' + body + '</div>',
      '<button data-act="close-modal">Leave</button>', true);
  }

  function renderShop(s) {
    var st = G.state, w = st.world, p = st.player;
    var stock = ISE.Economy.stock(w, s);
    var buy = stock.map(function (item) {
      var price = ISE.Economy.buyPrice(s, item);
      return itemRow(item, '<button data-act="buy" data-id="' + item.id + '"' +
        (p.gold < price ? ' disabled' : '') + '>Buy · ' + U.num(price) + '</button>');
    }).join('') || '<p class="hint">Shelves are bare.</p>';

    var sell = p.inventory.map(function (item) {
      var price = ISE.Economy.sellPrice(s, item);
      return itemRow(item, '<button data-act="sell" data-id="' + item.id + '">Sell · ' +
        U.num(price) + '</button>');
    }).join('') || '<p class="hint">You are carrying nothing to sell.</p>';

    return '<div class="two-col"><div><h3>For sale</h3>' + buy + '</div>' +
      '<div><h3>Your goods</h3>' + sell + '</div></div>';
  }

  function renderTrainers(s) {
    var st = G.state, w = st.world, p = st.player;
    var list = ISE.Economy.trainers(w, s);
    var rows = list.map(function (t) {
      var known = ISE.Player.knowsSkill(p, t.skill.id);
      return skillRow(t.skill, null, {
        foot: '<div class="row"><span class="hint">Taught by ' + esc(t.teacher) + '</span>' +
          (known ? '<span class="tag">known</span>'
            : '<button data-act="learn" data-id="' + t.skill.id + '"' +
              (p.gold < t.price ? ' disabled' : '') + '>Learn · ' + U.num(t.price) + '</button>') +
          '</div>'
      });
    }).join('') || '<p class="hint">Nobody here teaches anything worth coin.</p>';
    return '<h3>Instruction available</h3>' +
      '<p class="hint">What a town can teach depends on its size, its nation\'s scholarship, ' +
      'and how saturated this world is with magic.</p>' + rows;
  }

  function renderGuild(s) {
    var st = G.state, w = st.world, p = st.player;
    if (!s.guild) {
      return '<p class="hint">No guild chapter here. Larger settlements usually have one.</p>';
    }
    var board = ISE.Quests.board(w, p, s);
    var turnIns = p.questsActive.filter(function (q) { return q.done && !q.claimed; });

    var turnHtml = turnIns.length ? '<h3>Ready to close</h3>' + turnIns.map(function (q) {
      return '<div class="quest done"><h4>' + esc(q.title) + '</h4>' +
        '<div class="hint">' + U.num(q.reward.gold) + ' coin · ' + U.num(q.reward.xp) + ' xp' +
        (q.reward.items.length ? ' · ' + q.reward.items.length + ' items' : '') + '</div>' +
        '<button data-act="turnin" data-id="' + q.id + '">Claim</button></div>';
    }).join('') : '';

    var boardHtml = board.map(function (q) {
      var locked = p.guildRank < q.rankMin;
      return '<div class="quest">' +
        '<h4>' + esc(q.title) + '</h4><p>' + esc(q.desc) + '</p>' +
        '<div class="hint">' + esc(q.typeName) + ' · difficulty ' + q.difficulty +
        ' · ' + U.num(q.reward.gold) + ' coin, ' + U.num(q.reward.xp) + ' xp' +
        (q.rankMin ? ' · requires ' + ISE.Player.GUILD_RANKS[q.rankMin] : '') + '</div>' +
        (locked ? '<span class="tag bad">rank too low</span>'
          : '<button data-act="accept-quest" data-id="' + q.id + '">Accept</button>') +
        '</div>';
    }).join('') || '<p class="hint">The board is empty this week.</p>';

    return '<p class="hint">Your rank: <b>' + esc(ISE.Player.guildRankName(p)) + '</b>' +
      ' · ' + (p.guildPoints || 0) + ' commendations</p>' + turnHtml +
      '<h3>Contracts posted</h3>' + boardHtml;
  }

  function renderPeople(s, nat) {
    var st = G.state, w = st.world, p = st.player;
    var namers = G.namers();
    var npcs = s.npcs.map(function (n) {
      return '<div class="npc"><b>' + esc(n.name) + '</b> <span class="tag">' + esc(n.roleName) + '</span>' +
        '<div class="hint">Level ' + n.level + ' · ' + n.traits.map(esc).join(', ') + '</div>' +
        (n.role === 'noble' ? '<button class="danger" data-act="kill-noble" data-id="' + n.id +
          '">Kill them</button>' : '') +
        '</div>';
    }).join('');

    var heroesHere = w.livingHeroes().filter(function (h) {
      return h.homeSettlement === s.id;
    }).map(function (h) {
      return '<div class="npc"><b>' + esc(h.name) + '</b>' +
        (h.named ? ' <span class="tag named">Named</span>' : '') +
        '<div class="hint">' + esc(h.raceName) + ' · level ' + h.level + ' · fame ' +
        Math.round(h.fame) + ' · ' + h.deeds.bosses + ' bosses slain</div>' +
        (h.named && !p.named ? '<button data-act="ask-name" data-id="' + h.id +
          '">Ask to be Named</button>' : '') + '</div>';
    }).join('');

    var politics = nat ? '<h3>Politics</h3>' +
      '<p class="hint">Standing with ' + esc(nat.name) + ': <b>' +
      esc(ISE.Player.repLabel(ISE.Player.reputationWith(p, nat.id))) + '</b></p>' +
      (p.inventory.filter(function (i) { return i.relic; }).length
        ? '<div class="row">' + p.inventory.filter(function (i) { return i.relic; })
          .map(function (r) {
            return '<button data-act="gift-relic" data-id="' + r.id + '" data-nation="' + nat.id +
              '">Gift ' + esc(r.name) + '</button>';
          }).join('') + '</div>'
        : '<p class="hint">A relic would make a persuasive gift, if you had one.</p>')
      : '';

    return '<h3>Notable people</h3>' + (npcs || '<p class="hint">Nobody of note.</p>') +
      (heroesHere ? '<h3>Adventurers of renown</h3>' + heroesHere : '') +
      (namers.length && !p.named ? '<p class="hint">Being Named by a Named existence unlocks ' +
        'the highest evolution tiers.</p>' : '') +
      politics;
  }

  function renderInn(s) {
    var price = ISE.Economy.innPrice(s);
    return '<h3>Rooms</h3><p class="hint">A bed costs ' + U.num(price) +
      ' coin a night and restores you fully. The world keeps moving while you sleep.</p>' +
      '<div class="row">' +
      '<button data-act="inn" data-n="1">1 night · ' + U.num(price) + '</button>' +
      '<button data-act="inn" data-n="7">7 nights · ' + U.num(price * 7) + '</button>' +
      '<button data-act="inn" data-n="30">30 nights · ' + U.num(price * 30) + '</button>' +
      '</div>';
  }

  /* ========================================================== COMBAT ===== */
  UI.combatTarget = null;

  function actorCard(a, isTarget) {
    var statuses = a.statuses.map(function (s) {
      var d = T.STATUSES[s.id];
      return '<span class="status" style="border-color:' + d.color + '" title="' +
        esc(d.desc) + '">' + esc(d.name) + ' ' + s.turns + '</span>';
    }).join('');
    return '<div class="actor' + (a.alive ? '' : ' dead') + (isTarget ? ' target' : '') +
      (a.boss ? ' boss' : '') + '" data-target="' + a.id + '">' +
      '<div class="a-name">' + esc(a.name) + ' <small>Lv ' + a.level + '</small></div>' +
      (a.species && a.species !== a.name ? '<div class="hint">' + esc(a.species) + '</div>' : '') +
      bar(a.hp, a.stats.hp, 'hp') +
      (a.side === 'party' ? bar(a.mp, a.stats.mp, 'mp') : '') +
      (a.traits && a.traits.length ? '<div class="traits">' + a.traits.map(function (t) {
        return '<span class="tag" title="' + esc(t.desc) + '">' + esc(t.name) + '</span>';
      }).join('') + '</div>' : '') +
      '<div class="statuses">' + statuses + '</div>' +
      '</div>';
  }

  function renderCombat() {
    var st = G.state;
    var combat = st.run ? st.run.combat : st.combat;
    if (!combat) return;
    var overlay = document.getElementById('overlay');
    overlay.classList.remove('hidden');

    var enemies = combat.enemies.map(function (a) {
      return actorCard(a, UI.combatTarget === a.id);
    }).join('');
    var party = combat.party.map(function (a) { return actorCard(a, false); }).join('');

    var log = combat.log.slice(-14).map(function (l) {
      return '<div class="cl ' + l.type + '">' + esc(l.text) + '</div>';
    }).join('');

    var actions = '';
    if (combat.over) {
      actions = '<button class="primary" data-act="combat-done">' +
        (combat.result === 'victory' ? 'Continue' : combat.result === 'fled' ? 'Withdraw' : 'Continue') +
        '</button>';
    } else if (combat.awaitingInput) {
      var actor = ISE.Combat.actorById(combat, combat.current);
      var skills = ISE.Combat.availableSkills(combat, actor);
      actions = '<div class="skillbar">' + skills.map(function (o) {
        var s = o.skill;
        return '<button class="skillbtn ' + rarityClass(s.rarity) + '" data-act="use-skill" ' +
          'data-id="' + s.id + '"' + (o.usable ? '' : ' disabled') + ' title="' + esc(s.desc) + '">' +
          elemDot(s.element) + '<b>' + esc(s.name) + '</b>' +
          '<small>' + (s.power ? 'pow ' + s.power + ' · ' : '') + o.cost + ' MP' +
          (o.cooldown ? ' · CD ' + o.cooldown : '') + '</small></button>';
      }).join('') + '</div>' +
      '<div class="row">' +
        '<button data-act="guard">Guard</button>' +
        '<button data-act="combat-items">Use item</button>' +
        (combat.canFlee ? '<button data-act="flee">Flee</button>' : '<span class="hint">No escape.</span>') +
      '</div>';
    }

    var order = ISE.Combat.turnOrder(combat).map(function (o) {
      return '<span class="turn ' + o.side + (o.current ? ' now' : '') +
        (o.done ? ' done' : '') + (o.alive ? '' : ' dead') +
        '" title="Agility ' + o.spd + '">' + esc(o.name) + '</span>';
    }).join('<i>›</i>');

    overlay.innerHTML = '<div class="combat">' +
      '<div class="side enemies"><h3>Hostile</h3>' + enemies + '</div>' +
      '<div class="middle">' +
        '<div class="turnorder"><label>Turn order</label>' + order + '</div>' +
        '<div class="clog">' + log + '</div>' +
        '<div class="cactions">' + actions + '</div>' +
        '<div class="hint">Round ' + combat.round +
        (UI.combatTarget ? ' · targeting ' + esc((ISE.Combat.actorById(combat, UI.combatTarget) || {}).name || '') : '') +
        '</div></div>' +
      '<div class="side party"><h3>Your side</h3>' + party + '</div>' +
      '</div>';
  }

  function combatAction(action) {
    var st = G.state;
    var combat = st.run ? st.run.combat : st.combat;
    if (!combat) return;
    if (action.type === 'skill') action.targetId = UI.combatTarget;
    ISE.Combat.playerAction(combat, action);
    UI.refresh();
  }

  function finishCombat() {
    var st = G.state;
    if (st.run && st.run.combat) {
      ISE.DungeonRun.resolveCombat(st.world, st.player, st.run);
      UI.combatTarget = null;
      if (st.player.hpCur <= 0 && !st.run.over) {
        ISE.DungeonRun.fail(st.world, st.player, st.run);
      }
      UI.refresh();
      return;
    }
    G.resolveCombat();
    UI.combatTarget = null;
    UI.refresh();
  }

  /* ========================================================= DUNGEON ===== */
  function renderDungeon() {
    var st = G.state, run = st.run, w = st.world, p = st.player;
    if (!run) return;
    if (run.combat) { renderCombat(); return; }
    var d = w.dungeonById[run.dungeonId];
    var overlay = document.getElementById('overlay');
    overlay.classList.remove('hidden');

    var opts = ISE.DungeonRun.options(run, p, w);
    var atExit = ISE.DungeonRun.atExit(run);
    var current = ISE.DungeonRun.currentNode(run);

    var choices;
    if (run.over) {
      choices = '<button class="primary" data-act="leave-dungeon">Leave</button>';
    } else if (atExit && current && current.type === 'stairs') {
      choices = '<button class="primary" data-act="descend">Descend to floor ' + (run.floorNum + 1) + '</button>' +
        '<button data-act="leave-dungeon">Climb out</button>';
    } else if (!opts.length) {
      choices = '<button class="primary" data-act="leave-dungeon">Climb out</button>';
    } else {
      choices = opts.map(function (o) {
        return '<button class="node-btn" data-act="node" data-i="' + o.index + '">' +
          '<b>' + esc(o.icon) + '</b><span>' + esc(o.label) + '</span>' +
          (o.distance ? '<small>skip ' + o.distance + '</small>' : '') + '</button>';
      }).join('') + '<button data-act="leave-dungeon">Withdraw</button>';
    }

    var stats = ISE.Player.effectiveStats(p);
    var trail = run.floor.nodes.map(function (n, i) {
      var state = i < run.floor.position ? 'past' : (i === run.floor.position ? 'here' : 'ahead');
      return '<span class="tnode ' + state + '">' +
        (state === 'ahead' ? '·' : ISE.DungeonRun.NODE_TYPES[n.type].icon) + '</span>';
    }).join('');

    var log = run.log.slice(-16).map(function (l) {
      return '<div class="cl ' + l.kind + '">' + esc(l.text) + '</div>';
    }).join('');

    overlay.innerHTML = '<div class="dungeon">' +
      '<header><div><b>' + esc(d.name) + '</b> — tier ' + d.tier + ' · floor ' +
        run.floorNum + ' / ' + d.floors + '</div>' +
        '<div class="hint">' + esc(d.themeName) + ' · ' + esc(ISE.MapView.ownerLabel(w, d)) +
        ' · monsters around level ' + run.floor.data.level + '</div></header>' +
      '<div class="trail">' + trail + '</div>' +
      '<div class="dbody"><div class="dlog">' + log + '</div>' +
      '<div class="dside">' +
        '<div class="v"><label>HP</label>' + bar(p.hpCur, stats.hp, 'hp') + '</div>' +
        '<div class="v"><label>MP</label>' + bar(p.mpCur, stats.mp, 'mp') + '</div>' +
        '<div class="hint">Floor ' + run.floorNum + ' of ' + d.floors +
        ' · cleared ' + run.deepest + ' behind you<br>' +
        run.kills + ' kills · ' + U.num(run.loot.gold) + ' coin · ' +
        run.loot.items.length + ' items</div>' +
        '<div class="row wrap">' +
          p.inventory.filter(function (i) { return i.kind === 'consumable'; }).slice(0, 6)
            .map(function (i) {
              return '<button data-act="use-item" data-id="' + i.id + '">' + esc(i.name) + '</button>';
            }).join('') +
        '</div>' +
      '</div></div>' +
      '<footer>' + choices + '</footer>' +
      '</div>';
  }

  /* ===================================================== INTERVENTION ==== */
  function renderIntervention() {
    var st = G.state;
    var iv = st.pendingIntervention;
    if (!iv) return;
    modal('Raid on ' + esc(iv.settlement.name),
      '<p>The <b>' + esc(iv.faction.name) + '</b> is attacking ' + esc(iv.settlement.name) +
      ' while you are standing in it.</p>' +
      '<div class="statgrid"><div><em>Attackers</em><b>' + U.short(iv.attack) + '</b></div>' +
      '<div><em>Defenders</em><b>' + U.short(iv.defense) + '</b></div></div>' +
      '<p class="hint">You can join the defence — your part of the fight is resolved as combat, ' +
      'and winning it tips the wider battle. Or you can stay out of it, and the outcome ' +
      'is settled without you either way.</p>',
      '<button class="primary" data-act="defend">Fight</button>' +
      '<button data-act="ignore-raid">Stay out of it</button>');
  }

  /* ============================================================ CODEX ==== */
  function openCodex() {
    UI.codexTab = UI.codexTab || 'nations';
    renderCodex();
  }

  var CODEX_TABS = [['nations', 'Nations'], ['relics', 'Relics'], ['dungeons', 'Dungeons'],
    ['factions', 'Monsters'], ['heroes', 'Legends'], ['history', 'Chronicle'],
    ['races', 'Races'], ['world', 'World']];

  function renderCodex() {
    var w = G.state.world, p = G.state.player;
    var body;
    switch (UI.codexTab) {
      case 'relics': body = codexRelics(w); break;
      case 'dungeons': body = codexDungeons(w, p); break;
      case 'factions': body = codexFactions(w); break;
      case 'heroes': body = codexHeroes(w); break;
      case 'history': body = codexHistory(w); break;
      case 'races': body = codexRaces(w); break;
      case 'world': body = codexWorld(w); break;
      default: body = codexNations(w, p);
    }
    var tabs = '<div class="tabs">' + CODEX_TABS.map(function (t) {
      return '<button class="tab' + (UI.codexTab === t[0] ? ' sel' : '') +
        '" data-codextab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    modal('World Info', tabs + '<div class="codex">' + body + '</div>', null, true);
  }

  function codexWorld(w) {
    var s = w.summary || ISE.History.buildSummary(w);
    var p = w.params;
    return '<h3>' + esc(w.geo.continents[0].name) + '</h3>' +
      '<p><b>' + esc(w.genesis.name) + '</b> — ' + esc(w.genesis.text) + '</p>' +
      '<div class="statgrid">' +
      '<div><em>Seed</em><b>' + esc(w.seed) + '</b></div>' +
      '<div><em>Year</em><b>' + w.year + '</b></div>' +
      '<div><em>Nations</em><b>' + s.nations + '</b></div>' +
      '<div><em>Fallen states</em><b>' + s.fallenNations + '</b></div>' +
      '<div><em>Settlements</em><b>' + s.settlements + '</b></div>' +
      '<div><em>Ruins</em><b>' + (w.ruins || []).length + '</b></div>' +
      '<div><em>Dungeons</em><b>' + w.dungeons.length + '</b></div>' +
      '<div><em>Monster powers</em><b>' + s.factions + '</b></div>' +
      '<div><em>Relics</em><b>' + w.relics.length + '</b></div>' +
      '<div><em>Skills</em><b>' + U.num(w.skills.count) + '</b></div>' +
      '<div><em>Races</em><b>' + w.races.list.length + '</b></div>' +
      '<div><em>Recorded events</em><b>' + U.num(w.legends.length) + '</b></div>' +
      '</div>' +
      '<h3>Generation parameters</h3><div class="statgrid small">' +
      '<div><em>Size</em><b>' + esc(w.geo.size) + '</b></div>' +
      '<div><em>History</em><b>' + p.historyYears + ' yrs</b></div>' +
      '<div><em>Magic density</em><b>' + U.pct(p.magicDensity) + '</b></div>' +
      '<div><em>Monster ceiling</em><b>' + p.monsterCeiling + '/10</b></div>' +
      '<div><em>Relic abundance</em><b>' + U.pct(p.relicAbundance) + '</b></div>' +
      '<div><em>War tendency</em><b>' + U.pct(p.warTendency) + '</b></div>' +
      '</div>' +
      (w.prophecies && w.prophecies.length ? '<h3>Prophecies</h3>' + w.prophecies.slice(-6)
        .map(function (pr) {
          return '<blockquote>“' + esc(pr.text) + '” <small>— year ' + pr.year + '</small></blockquote>';
        }).join('') : '');
  }

  function codexNations(w, player) {
    var living = w.livingNations();
    var rows = living.map(function (n) {
      var rel = living.filter(function (o) { return o.id !== n.id; }).map(function (o) {
        var v = ISE.Procs.H.relation(n, o);
        var label = ISE.Procs.H.atWar(n, o) ? 'AT WAR'
          : ISE.Procs.H.allied(n, o) ? 'allied'
            : v > 25 ? 'friendly' : v < -25 ? 'tense' : 'neutral';
        return '<span class="rel ' + label.replace(' ', '') + '">' + esc(o.name) + ': ' + label + '</span>';
      }).join('');
      return '<div class="nation"><h4><span class="swatch" style="background:' + n.color + '"></span>' +
        esc(n.name) + '</h4>' +
        '<div class="hint">' + esc(n.governmentName) + ' of the ' + esc(n.raceName) + ' · ruled by ' +
        esc(n.ruler.title + ' ' + n.ruler.name) + ' (generation ' + n.ruler.gen + ')</div>' +
        '<div class="statgrid small">' +
        '<div><em>Population</em><b>' + U.short(n.population) + '</b></div>' +
        '<div><em>Territory</em><b>' + n.tiles.length + '</b></div>' +
        '<div><em>Towns</em><b>' + n.settlements.length + '</b></div>' +
        '<div><em>Military</em><b>' + U.short(n.military) + '</b></div>' +
        '<div><em>Economy</em><b>' + U.short(n.economy) + '</b></div>' +
        '<div><em>Stability</em><b>' + Math.round(n.stability) + '</b></div>' +
        '<div><em>Relics</em><b>' + n.relics.length + '</b></div>' +
        '<div><em>Dungeons</em><b>' + n.dungeons.length + '</b></div>' +
        '</div>' +
        '<div class="rels">' + rel + '</div>' +
        '<div class="hint">Your standing: ' +
        esc(ISE.Player.repLabel(ISE.Player.reputationWith(player, n.id))) + '</div>' +
        '</div>';
    }).join('');
    var fallen = w.nations.filter(function (n) { return !n.alive; });
    return rows + (fallen.length ? '<h3>Fallen states</h3>' + fallen.map(function (n) {
      return '<div class="hint">' + esc(n.name) + ' — ' + esc(n.fellReason || 'ended') +
        ', year ' + n.fellYear + '</div>';
    }).join('') : '');
  }

  function codexRelics(w) {
    if (!w.relics.length) return '<p class="hint">No relics were forged in this world\'s history.</p>';
    return w.relics.map(function (r) {
      return '<div class="item relic ' + rarityClass(r.rarity) + '">' +
        '<div class="it-head"><b>' + esc(r.name) + '</b><span class="rar">' +
        T.RARITY[r.rarity].name + '</span></div>' +
        '<div class="relic-effect">' + esc(r.effectText) + '</div>' +
        '<p class="backstory">' + esc(r.backstory) + '</p>' +
        '<div class="hint">Forged year ' + r.forgedYear + ' by ' + esc(r.forgedBy) +
        ' · currently ' + esc(ISE.Procs.H.relicLocationText(w, r)) + '</div>' +
        (r.history.length > 1 ? '<div class="hint">' + r.history.length +
          ' recorded changes of hand</div>' : '') +
        '</div>';
    }).join('');
  }

  function codexDungeons(w, p) {
    var list = w.dungeons.slice().sort(function (a, b) { return b.tier - a.tier; });
    return '<p class="hint">' + list.length + ' known to exist. You have found ' +
      Object.keys(p.knownDungeons).length + '.</p>' + list.map(function (d) {
      var known = p.knownDungeons[d.id] || d.discovered;
      return '<div class="dungeon-row' + (known ? '' : ' unknown') + '">' +
        '<b>' + esc(known ? d.name : '???') + '</b> <span class="tag">tier ' + d.tier + '</span>' +
        '<div class="hint">' + (known ? esc(d.form) + ' · ' + d.floors + ' floors · ' +
          esc(d.themeName) + ' · ' + esc(ISE.MapView.ownerLabel(w, d)) +
          (d.boss ? ' · master: ' + esc(d.boss.alive ? d.boss.name : d.boss.name + ' (slain)') : '') +
          (d.cleared ? ' · CLEARED' : '') + ' · ' + esc(d.regionName)
          : 'Rumoured only.') + '</div></div>';
    }).join('');
  }

  function codexFactions(w) {
    return w.factions.filter(function (f) { return f.alive; })
      .sort(function (a, b) { return b.strength - a.strength; })
      .map(function (f) {
        return '<div class="nation"><h4>' + esc(f.name) +
          (f.calamity ? ' <span class="tag bad">calamity</span>' : '') + '</h4>' +
          '<div class="hint">' + esc(f.regionName) + ' · led by ' +
          esc(f.leader ? f.leader.name + ' (' + f.leader.species + ', tier ' + f.leader.tier + ')'
            : 'nobody in particular') + '</div>' +
          '<div class="statgrid small">' +
          '<div><em>Strength</em><b>' + U.short(f.strength) + '</b></div>' +
          '<div><em>Numbers</em><b>' + U.short(f.population) + '</b></div>' +
          '<div><em>Dungeons held</em><b>' + f.dungeons.length + '</b></div>' +
          '<div><em>Raids</em><b>' + f.raids + '</b></div>' +
          '</div></div>';
      }).join('') || '<p class="hint">The wild is quiet. For now.</p>';
  }

  function codexHeroes(w) {
    var living = w.livingHeroes();
    var dead = w.heroes.filter(function (h) { return !h.alive; }).slice(-25);
    function row(h) {
      return '<div class="hero"><b>' + esc(h.name) + '</b>' +
        (h.named ? ' <span class="tag named">Named</span>' : '') +
        '<div class="hint">' + esc(h.raceName) + ' · level ' + h.level +
        ' · fame ' + Math.round(h.fame) + ' · ' + h.deeds.bosses + ' bosses, ' +
        h.deeds.dungeons + ' dungeons' +
        (h.alive ? '' : ' · died year ' + h.diedYear + ' ' + esc(h.deathCause || '')) +
        '</div></div>';
    }
    return '<h3>Living (' + living.length + ')</h3>' +
      (living.map(row).join('') || '<p class="hint">Nobody of note is currently alive.</p>') +
      '<h3>Remembered</h3>' + dead.map(row).join('');
  }

  function codexHistory(w) {
    var filter = UI.historyFilter || 'all';
    var tags = ['all', 'war', 'politics', 'relic', 'dungeon', 'monster', 'hero', 'disaster'];
    var entries = w.legends.slice().reverse();
    if (filter !== 'all') {
      entries = entries.filter(function (e) { return (e.tags || []).indexOf(filter) >= 0; });
    }
    entries = entries.slice(0, 220);
    return '<div class="row wrap">' + tags.map(function (t) {
      return '<button class="chipbtn' + (filter === t ? ' sel' : '') +
        '" data-histfilter="' + t + '">' + t + '</button>';
    }).join('') + '</div>' +
      '<p class="hint">' + U.num(w.legends.length) + ' recorded events. Showing ' +
      entries.length + '.</p>' +
      '<div class="chronicle">' + entries.map(function (e) {
        return '<div class="legend"><span class="when">Y' + e.year + '</span>' +
          '<span class="what">' + esc(e.name) + '</span>' + esc(e.text) + '</div>';
      }).join('') + '</div>';
  }

  function codexRaces(w) {
    return w.races.list.map(function (r) {
      function node(n) {
        var kids = (n.branches || []).map(node).join('');
        return '<li class="' + (n.mythical ? 'myth' : '') + '"><span class="t' + n.tier + '">' +
          esc(n.name) + '</span>' + (kids ? '<ul>' + kids + '</ul>' : '') + '</li>';
      }
      return '<div class="racebox"><h4>' + esc(r.name) +
        (r.unique ? ' <span class="tag">unique to this world</span>' : '') + '</h4>' +
        '<p class="hint">' + esc(r.desc) + '</p>' +
        '<ul class="tree">' + node(r.tree) + '</ul></div>';
    }).join('');
  }

  /* Skill catalogue browser with filters. */
  function browseSkills() {
    UI.skillFilter = UI.skillFilter || { element: 'all', rarity: 'all', q: '' };
    renderSkillBrowser();
  }

  function renderSkillBrowser() {
    var w = G.state.world, p = G.state.player;
    var f = UI.skillFilter;
    var list = w.skills.list.filter(function (s) {
      if (f.element !== 'all' && s.element !== f.element) return false;
      if (f.rarity !== 'all' && s.rarity !== f.rarity) return false;
      if (f.q && s.name.toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
      return true;
    });
    var shown = list.slice(0, 160);

    var body = '<div class="row wrap">' +
      '<input id="skill-q" placeholder="search" value="' + esc(f.q) + '">' +
      '<select id="skill-elem"><option value="all">All types</option>' +
      T.ELEMENTS.map(function (e) {
        return '<option value="' + e.id + '"' + (f.element === e.id ? ' selected' : '') + '>' +
          e.name + '</option>';
      }).join('') + '</select>' +
      '<select id="skill-rar"><option value="all">All rarities</option>' +
      T.RARITIES.map(function (r) {
        return '<option value="' + r.id + '"' + (f.rarity === r.id ? ' selected' : '') + '>' +
          r.name + '</option>';
      }).join('') + '</select></div>' +
      '<p class="hint">' + U.num(list.length) + ' match, showing ' + shown.length +
      '. Acquisition tells you where to find it.</p>' +
      shown.map(function (s) {
        var known = ISE.Player.knowsSkill(p, s.id);
        var acq = ISE.SkillData.ACQUISITION[s.acquisition] || { name: s.acquisition, desc: '' };
        return skillRow(s, known ? p.skillById[s.id] : null, {
          foot: '<div class="hint">' + esc(acq.name) + ' — ' + esc(acq.desc) +
            (known ? ' <span class="tag good">known</span>' : '') +
            (s.unique && s.origin ? '<br>' + esc(s.origin) : '') + '</div>'
        });
      }).join('');

    modal('Skill catalogue — ' + U.num(w.skills.count) + ' skills', body, null, true);
  }

  /* Whole-tree view for the player's race. */
  function showTree() {
    var w = G.state.world, p = G.state.player;
    var race = w.races.byId[p.raceId];
    function node(n) {
      var cur = n.id === p.nodeId;
      var kids = (n.branches || []).map(node).join('');
      var d = ISE.Evolution.describeNode(p, n, w);
      var reqs = d.reqs.map(function (r) {
        return '<div class="req' + (r.met ? ' met' : '') + '">' + esc(r.text) + '</div>';
      }).join('');
      return '<li class="' + (n.mythical ? 'myth ' : '') + (cur ? 'current' : '') + '">' +
        '<span class="t' + n.tier + '">' + esc(n.name) + '</span>' +
        (cur ? ' <span class="tag good">you</span>' : '') +
        (reqs ? '<div class="nodereq">' + reqs + '</div>' : '') +
        (kids ? '<ul>' + kids + '</ul>' : '') + '</li>';
    }
    modal(esc(race.name) + ' — evolution tree',
      '<p class="hint">' + esc(race.desc) + '</p><ul class="tree big">' + node(race.tree) + '</ul>',
      null, true);
  }

  /* ========================================================== ACTIONS ==== */
  function findItem(p, id) {
    for (var i = 0; i < p.inventory.length; i++) if (p.inventory[i].id === id) return p.inventory[i];
    return null;
  }

  function handleAction(act, el) {
    var st = G.state, w = st.world, p = st.player;

    switch (act) {
      case 'close-modal': closeModal(); UI.refresh(); break;
      case 'codex': openCodex(); break;
      case 'save': {
        var r = G.save();
        UI.toast(r.ok ? 'Saved (' + U.short(r.bytes) + ' chars).' : 'Save failed: ' + r.reason,
          r.ok ? 'good' : 'bad');
        break;
      }
      case 'travel': {
        var res = G.travelTo(parseInt(el.dataset.x, 10), parseInt(el.dataset.y, 10));
        if (!res.ok) UI.toast(res.reason, 'bad');
        ISE.MapView.invalidate();
        UI.refresh();
        break;
      }
      case 'town': openTown(); break;
      case 'rest': {
        var rr = G.rest(1);
        if (!rr.ok) UI.toast(rr.reason, 'bad');
        UI.refresh();
        break;
      }
      case 'wait': G.wait(7); UI.refresh(); break;
      case 'delve': {
        var d = G.enterDungeon(el.dataset.id);
        if (!d.ok) UI.toast(d.reason, 'bad');
        UI.refresh();
        break;
      }
      case 'node':
        ISE.DungeonRun.choose(w, p, st.run, parseInt(el.dataset.i, 10));
        UI.refresh();
        break;
      case 'descend': ISE.DungeonRun.descend(w, p, st.run); UI.refresh(); break;
      case 'leave-dungeon': G.leaveDungeon(); ISE.MapView.invalidate(); UI.refresh(); break;
      case 'use-skill': combatAction({ type: 'skill', skillId: el.dataset.id }); break;
      case 'guard': combatAction({ type: 'guard' }); break;
      case 'flee': combatAction({ type: 'flee' }); break;
      case 'combat-done': finishCombat(); break;
      case 'combat-items': {
        var cons = p.inventory.filter(function (i) { return i.kind === 'consumable'; });
        modal('Use an item', cons.length ? cons.map(function (i) {
          return itemRow(i, '<button data-act="combat-use" data-id="' + i.id + '">Use</button>');
        }).join('') : '<p class="hint">You have nothing usable.</p>');
        break;
      }
      case 'combat-use':
        closeModal();
        combatAction({ type: 'item', itemId: el.dataset.id });
        break;
      case 'defend': {
        closeModal();
        G.startDefence(st.pendingIntervention);
        UI.refresh();
        break;
      }
      case 'ignore-raid': closeModal(); G.ignoreIntervention(); ISE.MapView.invalidate(); UI.refresh(); break;
      case 'evolve': {
        var r2 = ISE.Evolution.evolve(p, el.dataset.id, w);
        if (r2.ok) {
          UI.toast('You are now ' + r2.node.name + '.', 'good');
          G.say('Your form changes. You are ' + r2.node.name + '.' +
            (r2.learned.length ? ' Gained: ' + r2.learned.map(function (s) { return s.name; }).join(', ') + '.' : ''),
            'good');
          ISE.Procs.H.log(w, {
            year: w.year, ruleId: 'player_evolve', name: 'Evolution', tags: ['player'],
            text: p.name + ' became ' + r2.node.name + '.', tokens: {}
          });
        } else UI.toast(r2.reason, 'bad');
        UI.refresh();
        break;
      }
      case 'evolve-skill': {
        var r3 = ISE.Player.evolveSkill(p, el.dataset.id, w);
        UI.toast(r3.ok ? r3.from.name + ' became ' + r3.skill.name : r3.reason, r3.ok ? 'good' : 'bad');
        UI.refresh();
        break;
      }
      case 'show-tree': showTree(); break;
      case 'browse-skills': browseSkills(); break;
      case 'equip': {
        var item = findItem(p, el.dataset.id);
        if (item) ISE.Player.equip(p, item);
        UI.refresh();
        break;
      }
      case 'unequip':
        ISE.Player.unequip(p, el.dataset.slot, parseInt(el.dataset.i || '0', 10));
        UI.refresh();
        break;
      case 'use-item': {
        var it = findItem(p, el.dataset.id);
        if (!it) break;
        var stats = ISE.Player.effectiveStats(p);
        if (it.effect === 'heal') p.hpCur = U.clamp(p.hpCur + it.power, 0, stats.hp);
        else if (it.effect === 'mp') p.mpCur = U.clamp(p.mpCur + it.power, 0, stats.mp);
        else { UI.toast('That only works in a fight.', 'bad'); break; }
        U.remove(p.inventory, it);
        UI.toast('Used ' + it.name + '.', 'good');
        UI.refresh();
        break;
      }
      case 'use-orb': {
        var orb = findItem(p, el.dataset.id);
        if (!orb) break;
        var sk = w.skills.byId[orb.skillId];
        if (!sk) break;
        if (ISE.Player.learnSkill(p, sk, w, 'skill_book')) {
          U.remove(p.inventory, orb);
          UI.toast('Learned ' + sk.name + '.', 'good');
        } else UI.toast('You already know that.', 'bad');
        UI.refresh();
        break;
      }
      case 'use-catalyst': {
        var cat = findItem(p, el.dataset.id);
        if (!cat) break;
        p.catalysts[cat.catalyst] = (p.catalysts[cat.catalyst] || 0) + 1;
        U.remove(p.inventory, cat);
        UI.toast('Consumed ' + cat.name + '. Some evolutions may now be open.', 'good');
        UI.refresh();
        break;
      }
      case 'drop': {
        var dr = findItem(p, el.dataset.id);
        if (dr) U.remove(p.inventory, dr);
        UI.refresh();
        break;
      }
      case 'buy': {
        var s1 = w.settlementById[UI.townId];
        var stock = ISE.Economy.stock(w, s1);
        var bItem = stock.filter(function (i) { return i.id === el.dataset.id; })[0];
        if (bItem) {
          var br = ISE.Economy.buy(p, w, s1, bItem);
          UI.toast(br.ok ? 'Bought ' + bItem.name + '.' : br.reason, br.ok ? 'good' : 'bad');
        }
        renderTown();
        renderTopbar();
        break;
      }
      case 'sell': {
        var s2 = w.settlementById[UI.townId];
        var sItem = findItem(p, el.dataset.id);
        if (sItem) {
          var sr = ISE.Economy.sell(p, w, s2, sItem);
          UI.toast('Sold for ' + U.num(sr.price) + '.', 'good');
        }
        renderTown();
        renderTopbar();
        break;
      }
      case 'learn': {
        var s3 = w.settlementById[UI.townId];
        var entry = ISE.Economy.trainers(w, s3).filter(function (t) {
          return t.skill.id === el.dataset.id;
        })[0];
        if (entry) {
          var lr = ISE.Economy.learnFromTrainer(p, w, s3, entry);
          UI.toast(lr.ok ? 'Learned ' + entry.skill.name + '.' : lr.reason, lr.ok ? 'good' : 'bad');
        }
        renderTown();
        renderTopbar();
        break;
      }
      case 'accept-quest': {
        var s4 = w.settlementById[UI.townId];
        var q = ISE.Quests.board(w, p, s4).filter(function (x) { return x.id === el.dataset.id; })[0];
        if (q) {
          var ar = ISE.Quests.accept(p, w, q);
          UI.toast(ar.ok ? 'Accepted: ' + q.title : ar.reason, ar.ok ? 'good' : 'bad');
        }
        renderTown();
        break;
      }
      case 'turnin': {
        var tq = p.questsActive.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (tq) {
          var tr = ISE.Quests.turnIn(p, w, tq);
          if (tr.ok) {
            UI.toast('Contract closed. ' + U.num(tq.reward.gold) + ' coin.' +
              (tr.ranked ? ' Guild rank is now ' + ISE.Player.guildRankName(p) + '.' : ''), 'good');
          } else UI.toast(tr.reason, 'bad');
        }
        renderTown();
        renderTopbar();
        break;
      }
      case 'abandon-quest': {
        var aq = p.questsActive.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (aq) ISE.Quests.abandon(p, aq);
        UI.refresh();
        break;
      }
      case 'inn': {
        var nights = parseInt(el.dataset.n, 10);
        var ir = G.rest(nights);
        if (!ir.ok) UI.toast(ir.reason, 'bad');
        else UI.toast('Rested ' + nights + ' ' + U.plural(nights, 'night') + '.', 'good');
        renderTown();
        renderTopbar();
        break;
      }
      case 'ask-name': {
        var nr = G.requestName(el.dataset.id);
        UI.toast(nr.ok ? 'You have been Named.' : nr.reason, nr.ok ? 'good' : 'bad');
        renderTown();
        break;
      }
      case 'name-comp': {
        var comp = p.companions.filter(function (c) { return c.id === el.dataset.id; })[0];
        if (!comp) break;
        var nm = window.prompt('Give ' + comp.name + ' a Name:', comp.name);
        if (!nm) break;
        var cr = ISE.Player.nameCompanion(p, comp, nm.slice(0, 24), w);
        UI.toast(cr.ok ? comp.name + ' is Named. It cost ' + cr.cost + ' magicules.' : cr.reason,
          cr.ok ? 'good' : 'bad');
        UI.refresh();
        break;
      }
      case 'gift-relic': {
        var relic = findItem(p, el.dataset.id);
        if (!relic) break;
        var gr = ISE.WorldClock.playerAction(w, p, {
          type: 'gift_relic', nationId: el.dataset.nation, relic: relic
        });
        U.remove(p.inventory, relic);
        p.relicsOwned = ISE.Player.countRelics(p);
        UI.toast(gr.text, 'good');
        G.say(gr.text, 'news');
        renderTown();
        break;
      }
      case 'kill-noble': {
        var s5 = w.settlementById[UI.townId];
        var nat = w.nationById[s5.nationId];
        var npc = s5.npcs.filter(function (n) { return n.id === el.dataset.id; })[0];
        if (!npc || !nat) break;
        npc.alive = false;
        U.remove(s5.npcs, npc);
        var kr = ISE.WorldClock.playerAction(w, p, { type: 'kill_noble', nationId: nat.id });
        UI.toast(kr.text, 'bad');
        G.say(kr.text, 'bad');
        renderTown();
        break;
      }
    }
  }

  /* ============================================================ WIRING === */
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (el) { handleAction(el.dataset.act, el); return; }

    var tab = e.target.closest('[data-tab]');
    if (tab) { UI.tab = tab.dataset.tab; renderSidebar(); return; }

    var ttab = e.target.closest('[data-towntab]');
    if (ttab) { UI.townTab = ttab.dataset.towntab; renderTown(); return; }

    var ctab = e.target.closest('[data-codextab]');
    if (ctab) { UI.codexTab = ctab.dataset.codextab; renderCodex(); return; }

    var hf = e.target.closest('[data-histfilter]');
    if (hf) { UI.historyFilter = hf.dataset.histfilter; renderCodex(); return; }

    var target = e.target.closest('[data-target]');
    if (target) {
      var combat = G.state.run ? G.state.run.combat : G.state.combat;
      if (combat) {
        var a = ISE.Combat.actorById(combat, target.dataset.target);
        if (a && a.side === 'enemy' && a.alive) {
          UI.combatTarget = a.id;
          renderCombat();
        }
      }
      return;
    }

    var origin = e.target.closest('[data-origin]');
    if (origin) {
      UI.creation.originId = origin.dataset.origin;
      UI.creation.raceId = null;
      UI.creation.rolled = null;
      renderCreation();
      return;
    }
    var race = e.target.closest('[data-race]');
    if (race) { UI.creation.raceId = race.dataset.race; renderCreation(); return; }
  }

  UI.boot = function () {
    document.addEventListener('click', onClick);

    document.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.param) {
        setParam(e.target.dataset.param, e.target.value);
      }
      if (e.target.id === 'seed-input') UI.params.seed = e.target.value;
      if (e.target.id === 'name-input') UI.creation.name = e.target.value;
      if (e.target.id === 'skill-q') { UI.skillFilter.q = e.target.value; renderSkillBrowser(); }
    });
    document.addEventListener('change', function (e) {
      if (e.target.id === 'skill-elem') { UI.skillFilter.element = e.target.value; renderSkillBrowser(); }
      if (e.target.id === 'skill-rar') { UI.skillFilter.rarity = e.target.value; renderSkillBrowser(); }
      if (e.target.id === 'map-mode') {
        ISE.MapView.mode = e.target.value;
        ISE.MapView.invalidate();
        ISE.MapView.draw();
      }
    });

    $('#btn-generate').addEventListener('click', generateWorld);
    $('#btn-random').addEventListener('click', randomizeAll);
    $('#btn-newseed').addEventListener('click', function () {
      UI.params.seed = ISE.RNG.randomSeed();
      renderTitle();
    });
    $('#btn-begin').addEventListener('click', beginGame);
    $('#btn-back-title').addEventListener('click', function () { show('screen-title'); });
    $('#btn-roll-race') && $('#btn-roll-race').addEventListener('click', function () {});
    $('#btn-load').addEventListener('click', function () {
      var r = G.loadFromStorage();
      if (!r.ok) { UI.toast(r.reason, 'bad'); return; }
      UI.world = G.state.world;
      show('screen-game');
      ISE.MapView.invalidate();
      UI.resizeMap();
      UI.refresh();
    });

    document.addEventListener('click', function (e) {
      var roll = e.target.closest('[data-act="roll-race"]');
      if (!roll) return;
      var origin = ISE.Player.ORIGINS.filter(function (o) {
        return o.id === UI.creation.originId;
      })[0];
      var rng = new ISE.RNG(UI.world.seed + '::roll::' + Math.random());
      var race = ISE.Player.rollOriginRace(rng, origin, UI.world);
      UI.creation.rolled = race.id;
      UI.creation.raceId = race.id;
      renderCreation();
    });

    var canvas = document.getElementById('map');
    ISE.MapView.init(canvas, function (x, y) {
      ISE.MapView.hover = { x: x, y: y };
      renderTileInfo();
      ISE.MapView.draw();
    });

    window.addEventListener('resize', UI.resizeMap);
    setTimeout(UI.resizeMap, 0);

    renderTitle();
    show('screen-title');
  };

  ISE.UI = UI;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
