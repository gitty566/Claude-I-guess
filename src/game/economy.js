/* economy.js — settlement shops, prices, trainers and services.
 *
 * Stock is regenerated deterministically per settlement per restock window,
 * so leaving town and coming back doesn't reroll the shop, but waiting a
 * month does. */
(function (ISE) {
  'use strict';

  var U = ISE.U, T = ISE.T, ID = ISE.ItemData;

  var Econ = {};

  Econ.RESTOCK_DAYS = 12;

  function shopSeed(world, settlement, window) {
    return world.seed + '::shop::' + settlement.id + '::' + window;
  }

  /* Local resources make some goods cheap and others dear. */
  Econ.priceMultiplier = function (settlement, item) {
    var mult = settlement.economy.priceMod || 1;
    mult *= 1 / (0.75 + settlement.prosperity * 0.35);
    var res = settlement.economy.resources || [];
    if (item.kind === 'equipment') {
      if (res.indexOf('ore') >= 0 || res.indexOf('gems') >= 0 || res.indexOf('skyiron') >= 0) mult *= 0.85;
      if (settlement.tierIdx === 0) mult *= 1.12;
    }
    if (item.kind === 'consumable') {
      if (res.indexOf('herbs') >= 0 || res.indexOf('rare_herbs') >= 0) mult *= 0.8;
      if (res.indexOf('reagents') >= 0) mult *= 0.85;
    }
    if (item.kind === 'skill_orb' && res.indexOf('raw_mana') >= 0) mult *= 0.8;
    return mult;
  };

  Econ.buyPrice = function (settlement, item) {
    return Math.max(1, Math.round(item.value * Econ.priceMultiplier(settlement, item) * 1.25));
  };

  Econ.sellPrice = function (settlement, item) {
    return Math.max(1, Math.round(item.value * Econ.priceMultiplier(settlement, item) * 0.4));
  };

  /* Build (or fetch cached) shop stock for the current restock window. */
  Econ.stock = function (world, settlement) {
    var window = Math.floor(world.day / Econ.RESTOCK_DAYS);
    if (settlement.economy.stock && settlement.economy.stockWindow === window) {
      return settlement.economy.stock;
    }
    var rng = new ISE.RNG(shopSeed(world, settlement, window));
    var tierIdx = settlement.tierIdx;
    var maxTier = U.clamp(1 + tierIdx + (settlement.isCapital ? 1 : 0) +
      (world.params.magicDensity > 0.7 ? 1 : 0), 1, 6);
    var count = 4 + tierIdx * 4 + rng.int(0, 3);

    var items = [];
    for (var i = 0; i < count; i++) {
      var roll = rng.next();
      var tier = U.clamp(rng.skewedInt(1, maxTier, 1.6), 1, 6);
      if (roll < 0.45) {
        items.push(ISE.ItemGen.rollItem(rng, {
          tier: tier,
          rarityTier: U.clamp(tier + (rng.chance(0.15) ? 1 : 0) - (rng.chance(0.3) ? 1 : 0), 1, 5)
        }));
      } else if (roll < 0.78) {
        items.push(ISE.ItemGen.makeConsumable(rng, tier));
      } else if (roll < 0.9) {
        items.push(ISE.ItemGen.makeMaterial(rng,
          ID.RESOURCE_NAMES[rng.pick(settlement.economy.resources)] || 'Sundries', tier));
      } else {
        // Skill orbs are gated by magic density and settlement size.
        var pool = world.skills.list.filter(function (s) {
          return !s.unique && !s.apex && s.rarityTier <= maxTier &&
            s.scarcity <= 6 + tierIdx * 8 + world.params.magicDensity * 14;
        });
        if (pool.length) items.push(ISE.ItemGen.makeSkillOrb(rng, rng.pick(pool)));
      }
    }
    if (tierIdx >= 1 && rng.chance(0.25 + world.params.magicDensity * 0.3)) {
      items.push(ISE.ItemGen.makeCatalyst(rng));
    }

    settlement.economy.stock = items;
    settlement.economy.stockWindow = window;
    return items;
  };

  /* Which skills can actually be taught here. Scarcity is set at world-gen
   * from magic density, so a low-magic world's trainers teach very little. */
  Econ.trainers = function (world, settlement) {
    var window = Math.floor(world.day / (Econ.RESTOCK_DAYS * 2));
    if (settlement._trainers && settlement._trainerWindow === window) return settlement._trainers;

    var rng = new ISE.RNG(shopSeed(world, settlement, 'train' + window));
    var nation = world.nationById[settlement.nationId];
    var scholarship = nation ? nation.traits.scholarship : 0.4;
    var budget = 5 + settlement.tierIdx * 12 + scholarship * 14 +
      world.params.magicDensity * 16;

    var teachable = world.skills.list.filter(function (s) {
      if (s.unique || s.apex) return false;
      if (['trainer', 'trainer_adv', 'rare_trainer', 'skill_book'].indexOf(s.acquisition) < 0) return false;
      return s.scarcity <= budget;
    });

    // Bias toward the local biome's element and the ruling race's affinities.
    var biomeElem = T.BIOME_ELEMENT[settlement.biome];
    var race = nation ? world.races.byId[nation.raceId] : null;
    var weighted = teachable.map(function (s) {
      var w = 1;
      if (s.element === biomeElem) w += 2.5;
      if (race && race.affinity.indexOf(s.element) >= 0) w += 1.8;
      w /= (1 + s.rarityTier * 0.6);
      return [s, w];
    });

    var n = U.clamp(3 + settlement.tierIdx * 3 + Math.round(world.params.magicDensity * 4), 3, 14);
    var out = [];
    var seen = {};
    for (var i = 0; i < n * 4 && out.length < n; i++) {
      var pick = rng.weighted(weighted);
      if (!pick || seen[pick.id]) continue;
      seen[pick.id] = true;
      out.push({
        skill: pick,
        price: Econ.trainingPrice(world, pick, settlement),
        teacher: settlement.npcs.length ? rng.pick(settlement.npcs).name : 'a travelling master'
      });
    }
    settlement._trainers = out;
    settlement._trainerWindow = window;
    return out;
  };

  Econ.trainingPrice = function (world, skill, settlement) {
    var base = 60 * Math.pow(skill.rarityTier, 2.2);
    base *= (1.4 - world.params.magicDensity * 0.6);
    base *= settlement.economy.priceMod || 1;
    return Math.max(20, Math.round(base));
  };

  /* Inn: restores vitals and passes time. */
  Econ.innPrice = function (settlement) {
    return Math.round(12 * (1 + settlement.tierIdx) * (settlement.economy.priceMod || 1));
  };

  Econ.buy = function (player, world, settlement, item) {
    var price = Econ.buyPrice(settlement, item);
    if (player.gold < price) return { ok: false, reason: 'Not enough coin (' + price + ').' };
    player.gold -= price;
    U.remove(settlement.economy.stock, item);
    player.inventory.push(item);
    if (item.relic) player.relicsOwned = ISE.Player.countRelics(player);
    return { ok: true, price: price };
  };

  Econ.sell = function (player, world, settlement, item) {
    var price = Econ.sellPrice(settlement, item);
    U.remove(player.inventory, item);
    player.gold += price;
    if (item.relic) player.relicsOwned = ISE.Player.countRelics(player);
    return { ok: true, price: price };
  };

  Econ.learnFromTrainer = function (player, world, settlement, entry) {
    if (ISE.Player.knowsSkill(player, entry.skill.id)) {
      return { ok: false, reason: 'You already know ' + entry.skill.name + '.' };
    }
    if (player.gold < entry.price) return { ok: false, reason: 'Not enough coin.' };
    player.gold -= entry.price;
    ISE.Player.learnSkill(player, entry.skill, world, 'trainer');
    return { ok: true, skill: entry.skill };
  };

  ISE.Economy = Econ;
})(typeof window !== 'undefined' ? (window.ISE = window.ISE || {})
  : (global.ISE = global.ISE || {}));
