import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWeatherCycle,
  calculateDemographicRates,
  computeRealmPopularity,
  createInitialWorldState,
  demolishBuilding,
  deserializeWorld,
  enactDecree,
  getSnapshot,
  getUnlockedWeapons,
  getWeatherSpeedMultiplier,
  issueNpcOrder,
  placeBuilding,
  recruitSoldier,
  rewardNpc,
  selectKingWeapon,
  serializeWorld,
  setRationLevel,
  setSquadOrder,
  setTaxRate,
  stepWorldSimulation,
  triggerKingAttack,
  upgradeBuilding,
  WEATHER_CYCLE_DURATION,
} from './kingdomEngine';
import { getActiveRoyalQuest } from './questSystem';
import { canPlaceBuilding, groundHeightAt, WORLD_PLAYABLE_RADIUS } from './worldMath';

test('initial world state spawns king on clear central road facing north with living NPCs', () => {
  const world = createInitialWorldState();
  assert.equal(world.day, 1);
  assert.equal(world.king.x, 0);
  assert.equal(world.king.z, 14);
  assert.equal(world.king.facing, Math.PI);
  assert.equal(world.weather, 'sunny');
  assert.ok(world.npcs.length >= 10);
  assert.ok(world.bandits.length >= 4);
  assert.equal(world.outcome, 'ongoing');
  assert.ok(Math.abs(groundHeightAt(0, 0)) < 0.1);
});

test('building placement validates roads/collisions and construction advances physically via builders', () => {
  const world = createInitialWorldState();
  // Road should be blocked
  const onRoad = canPlaceBuilding(0, 0, 3.1, world.buildings);
  assert.equal(onRoad.valid, false);

  // Valid plot off the road and clear of existing buildings
  const placed = placeBuilding(world, 'cottage', 22, 14);
  assert.equal(placed.ok, true);
  assert.ok(placed.building);
  assert.equal(placed.building.completed, false);

  // Advance simulation so builders walk over and finish constructing
  for (let i = 0; i < 240; i++) {
    stepWorldSimulation(world, 0.15);
  }
  const built = world.buildings.find((b) => b.id === placed.building!.id);
  assert.ok(built);
  assert.equal(built.completed, true);
  assert.equal(built.progress, 1);
  assert.ok(world.buildingsConstructed >= 1);
});

test('direct royal commands and rewards update NPC behavior and loyalty', () => {
  const world = createInitialWorldState();
  const farmer = world.npcs.find((n) => n.profession === 'farmer');
  assert.ok(farmer);
  const startLoyalty = farmer.loyalty;
  const startGold = world.resources.gold;

  assert.equal(rewardNpc(world, farmer.id, 15), true);
  assert.equal(world.resources.gold, startGold - 15);
  assert.ok(farmer.loyalty > startLoyalty);

  assert.equal(issueNpcOrder(world, farmer.id, 'follow_king'), true);
  assert.equal(farmer.order, 'follow_king');
  assert.equal(farmer.activity, 'following_king');
  assert.equal(world.ordersIssued, 1);
});

test('tax rate changes, decrees, military recruitment, and squad orders work end-to-end', () => {
  const world = createInitialWorldState();
  const initialHap = world.averageHappiness;
  setTaxRate(world, 'high');
  stepWorldSimulation(world, 0.05);
  assert.ok(world.averageHappiness < initialHap);

  const feast = enactDecree(world, 'feast');
  assert.equal(feast.ok, true);
  stepWorldSimulation(world, 0.05);
  assert.ok(world.averageHappiness > initialHap - 5);

  const rec = recruitSoldier(world, 'soldier');
  assert.equal(rec.ok, true);
  setSquadOrder(world, 'raid_camp');
  const soldiers = world.npcs.filter((n) => n.profession === 'soldier');
  assert.ok(soldiers.every((s) => s.order === 'attack_bandits'));
});

test('king combat hits bandits and save/load roundtrips cleanly', () => {
  const world = createInitialWorldState();
  const bandit = world.bandits[0];
  world.king.x = bandit.x;
  world.king.z = bandit.z + 1.5;
  world.king.facing = Math.PI; // Facing -Z toward bandit

  const startHp = bandit.hp;
  const ev = {
    completedBuildings: [],
    combatHits: [],
    banditsKo: [],
    kingHurt: false,
    blockedHit: false,
    cartRaided: false,
    dailyTick: false,
    familyArrived: false,
    births: 0,
    deaths: 0,
    marriages: 0,
    cartDeliveries: [],
    arrowShots: [],
    questCompleted: [],
  };
  const hit = triggerKingAttack(world, ev);
  assert.equal(hit, true);
  assert.ok(bandit.hp < startHp);

  const json = serializeWorld(world);
  const restored = deserializeWorld(json);
  assert.ok(restored);
  assert.equal(getSnapshot(restored).day, getSnapshot(world).day);
  assert.equal(restored.buildings.length, world.buildings.length);
});

test('global weather cycles sunny -> rainy -> foggy -> sunny and alters NPC activity and movement speeds', () => {
  const world = createInitialWorldState();
  assert.equal(world.weather, 'sunny');
  assert.equal(getWeatherSpeedMultiplier('sunny'), 1.0);
  assert.equal(getWeatherSpeedMultiplier('rainy'), 0.8);
  assert.equal(getWeatherSpeedMultiplier('foggy'), 0.68);

  // Automatic timer advance transitions sunny -> rainy
  world.weatherTimer = 0.05;
  stepWorldSimulation(world, 0.1);
  assert.equal(world.weather, 'rainy');
  assert.ok(world.weatherTimer > WEATHER_CYCLE_DURATION - 0.5);

  const farmer = world.npcs.find((n) => n.profession === 'farmer')!;
  const guard = world.npcs.find((n) => n.profession === 'guard')!;
  assert.equal(farmer.activity, 'sheltering');
  assert.equal(guard.activity, 'patrolling');

  // Verify speed scaling while commuting
  farmer.x = 20;
  farmer.z = 20;
  stepWorldSimulation(world, 0.1);
  const rainSpeed = Math.hypot(farmer.vx, farmer.vz);
  assert.ok(Math.abs(rainSpeed - 2.8 * 0.8) < 0.05);

  // Cycle to foggy
  advanceWeatherCycle(world);
  assert.equal(world.weather, 'foggy');
  farmer.x = 20;
  farmer.z = 20;
  stepWorldSimulation(world, 0.1);
  assert.equal(farmer.activity, 'working');
  const fogSpeed = Math.hypot(farmer.vx, farmer.vz);
  assert.ok(Math.abs(fogSpeed - 2.8 * 0.68) < 0.05);

  // Cycle back to sunny
  advanceWeatherCycle(world);
  assert.equal(world.weather, 'sunny');
  assert.equal(getSnapshot(world).weatherSpeedMultiplier, 1.0);
});

test('widened landmass supports distant construction and Stronghold popularity drives settler immigration', () => {
  assert.ok(WORLD_PLAYABLE_RADIUS >= 175);
  const world = createInitialWorldState();
  const startPop = world.npcs.length;

  // Build across the widened valley east of Eastbrook River
  const eastGranary = placeBuilding(world, 'granary', 100, 30);
  assert.equal(eastGranary.ok, true);

  // Set Double Rations to boost Stronghold Popularity above immigration threshold
  const basePop = computeRealmPopularity(world);
  setRationLevel(world, 'extra');
  assert.ok(world.popularity > basePop);
  assert.ok(world.popularity >= 54);

  // Step simulation so settlers immigrate into open housing over time
  for (let i = 0; i < 400; i++) {
    stepWorldSimulation(world, 0.1);
  }
  assert.ok(world.npcs.length > startPop);
});

test('kingdom starts with families and children, and newly built buildings assign active workers', () => {
  const world = createInitialWorldState();
  const children = world.npcs.filter((n) => n.isChild || n.profession === 'child');
  assert.ok(children.length >= 4);
  assert.ok(children.some((c) => c.activity === 'playing'));

  // Build a Village Bakery and simulate until builders finish it
  const bakeryRes = placeBuilding(world, 'bakery', -28, -16);
  assert.equal(bakeryRes.ok, true);
  for (let i = 0; i < 240; i++) {
    stepWorldSimulation(world, 0.15);
  }

  const completedBakery = world.buildings.find((b) => b.id === bakeryRes.building!.id);
  assert.ok(completedBakery?.completed);
  const baker = world.npcs.find((n) => n.workBuildingId === completedBakery!.id && n.profession === 'baker');
  assert.ok(baker);
});

test('birth and death rate simulation responds to food and housing and naturally expands population', () => {
  const world = createInitialWorldState();
  // Plenty of food & open housing (20/38) -> positive birth rate > death rate
  world.resources.food = 300;
  setRationLevel(world, 'extra');
  const demo = calculateDemographicRates(world);
  assert.ok(demo.birthRatePerDay > demo.deathRatePerDay);
  assert.ok(demo.netGrowthPerDay > 0);

  // Disable immigration temporarily to isolate pure birth-rate natural expansion
  world.immigrationTimer = 99999;
  const popBefore = world.npcs.length;
  for (let i = 0; i < 600; i++) {
    world.immigrationTimer = 99999;
    stepWorldSimulation(world, 0.25); // 150s (~1.67 kingdom days)
  }
  assert.ok(world.totalBirths >= 1);
  assert.ok(world.npcs.length > popBefore);

  // When housing is full, birthRatePerDay drops to 0
  world.populationCap = world.npcs.length;
  const fullHousingRates = calculateDemographicRates(world);
  assert.equal(fullHousingRates.birthRatePerDay, 0);
});

test('famine halts births and spikes death rate while children age into adult workers', () => {
  const world = createInitialWorldState();
  // Starvation stops births and drives mortality up
  world.resources.food = 0;
  const famineDemo = calculateDemographicRates(world);
  assert.equal(famineDemo.birthRatePerDay, 0);
  assert.ok(famineDemo.deathRatePerDay > 0.5);

  world.immigrationTimer = 99999;
  const beforeFaminePop = world.npcs.length;
  for (let i = 0; i < 400; i++) {
    world.resources.food = 0;
    world.immigrationTimer = 99999;
    stepWorldSimulation(world, 0.25);
  }
  assert.ok(world.totalDeaths >= 1);
  assert.ok(world.npcs.length < beforeFaminePop);

  // Verify aging & coming-of-age graduation on a fed realm
  const fresh = createInitialWorldState();
  fresh.resources.food = 400;
  const child = fresh.npcs.find((n) => n.isChild)!;
  child.age = 13;
  // Advance 1 full day onto an even day (day 2) to trigger aging
  fresh.day = 1;
  fresh.timeOfDay = 0.99;
  stepWorldSimulation(fresh, 2.0);
  assert.equal(fresh.day, 2);
  assert.equal(child.age, 14);
  assert.equal(child.isChild, false);
  assert.notEqual(child.profession, 'child');
});

test('citizens marry into unified family units, have children who inherit traits, and inherit parent professions when grown', () => {
  const world = createInitialWorldState();
  const initialMarriages = world.totalMarriages;
  assert.ok(initialMarriages >= 2);

  // Trigger natural marriage between eligible unmarried adult citizens
  world.resources.food = 250;
  world.marriageTimer = 0.05;
  const ev = stepWorldSimulation(world, 0.1);
  assert.equal(ev.marriages, 1);
  assert.equal(world.totalMarriages, initialMarriages + 1);

  const weddedPair = world.npcs.filter(
    (n) => n.spouseId && n.id !== 'npc_farmer_1' && n.id !== 'npc_farmer_2' && n.id !== 'npc_wood_1' && n.id !== 'npc_merchant_1',
  );
  assert.equal(weddedPair.length, 2);
  assert.equal(weddedPair[0].spouseId, weddedPair[1].id);
  assert.equal(weddedPair[1].spouseId, weddedPair[0].id);
  assert.equal(weddedPair[0].familyName, weddedPair[1].familyName);
  assert.equal(weddedPair[0].homeBuildingId, weddedPair[1].homeBuildingId);

  // Spawn a newborn via natural birth accumulation and verify parentIds, childrenIds, and trait inheritance
  world.immigrationTimer = 99999;
  world.marriageTimer = 99999;
  world.birthProgress = 0.999;
  const birthEv = stepWorldSimulation(world, 0.5);
  assert.ok(birthEv.births >= 1);

  const newborn = world.npcs[world.npcs.length - 1];
  assert.equal(newborn.age, 1);
  assert.equal(newborn.isChild, true);
  assert.ok(newborn.parentIds && newborn.parentIds.length >= 1);
  assert.ok(newborn.traits.length >= 1);

  const parents = newborn.parentIds
    .map((pid) => world.npcs.find((n) => n.id === pid))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));
  assert.ok(parents.length >= 1);
  for (const p of parents) {
    assert.ok(p.childrenIds.includes(newborn.id));
  }
  const parentTraitPool = new Set(parents.flatMap((p) => p.traits));
  assert.ok(newborn.traits.some((t) => parentTraitPool.has(t)));

  // Verify growing child inherits one of their parents' professions when turning 14
  const tobin = world.npcs.find((n) => n.id === 'npc_child_3')!;
  const tobinParents = (tobin.parentIds ?? [])
    .map((pid) => world.npcs.find((n) => n.id === pid))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));
  const allowedProfessions = new Set(tobinParents.map((p) => p.profession));
  tobin.age = 13;
  world.day = 1;
  world.timeOfDay = 0.99;
  stepWorldSimulation(world, 2.0);
  assert.equal(tobin.age, 14);
  assert.equal(tobin.isChild, false);
  assert.ok(allowedProfessions.has(tobin.profession));
});

test('resource carts spawn between work sites and storage buildings, deliver cargo, and adapt to weather speed', () => {
  const world = createInitialWorldState();
  assert.ok(world.carts.length >= 4);

  const grainCart = world.carts.find((c) => c.cargoType === 'grain');
  assert.ok(grainCart);
  assert.equal(grainCart.originBuildingId, 'b_farm_1');
  assert.equal(grainCart.destinationBuildingId, 'b_granary_1');

  const timberCart = world.carts.find((c) => c.cargoType === 'timber');
  assert.ok(timberCart);
  assert.equal(timberCart.originBuildingId, 'b_lumber_1');

  // Force grain cart right before arrival at Royal Granary and verify cargo delivery increases food & flips to returning
  const foodBefore = world.resources.food;
  grainCart.returning = false;
  grainCart.progress = 0.99;
  const ev = stepWorldSimulation(world, 0.25);
  assert.ok(ev.cartDeliveries.some((d) => d.cargoType === 'grain'));
  assert.ok(world.resources.food >= foodBefore + grainCart.amount);
  assert.equal(grainCart.returning, true);

  // Measure progress step in sunny vs rainy weather
  grainCart.returning = false;
  grainCart.progress = 0.1;
  world.weather = 'sunny';
  stepWorldSimulation(world, 0.5);
  const sunnyDelta = grainCart.progress - 0.1;

  grainCart.progress = 0.1;
  world.weather = 'rainy';
  stepWorldSimulation(world, 0.5);
  const rainyDelta = grainCart.progress - 0.1;
  assert.ok(Math.abs(rainyDelta / sunnyDelta - 0.8) < 0.03);

  // Placing an active construction site redirects timber/stone carts on reload
  const placed = placeBuilding(world, 'cottage', 24, 14);
  assert.equal(placed.ok, true);
  timberCart.returning = true;
  timberCart.progress = 0.99;
  stepWorldSimulation(world, 0.25);
  assert.equal(timberCart.returning, false);
  assert.equal(timberCart.destinationBuildingId, placed.building!.id);
});

test('building upgrades raise tier, housing cap, and renown; demolish refunds 50% and forbids Keep', () => {
  const world = createInitialWorldState();
  const keepAttempt = demolishBuilding(world, 'b_keep');
  assert.equal(keepAttempt.ok, false);

  const cottage = world.buildings.find((b) => b.type === 'cottage')!;
  const capBefore = world.populationCap;
  const renownBefore = world.king.renown;

  const up2 = upgradeBuilding(world, cottage.id);
  assert.equal(up2.ok, true);
  assert.equal(cottage.level, 2);
  assert.equal(world.populationCap, capBefore + 2);
  assert.equal(world.king.renown, renownBefore + 6);

  const up3 = upgradeBuilding(world, cottage.id);
  assert.equal(up3.ok, true);
  assert.equal(cottage.level, 3);
  const up4 = upgradeBuilding(world, cottage.id);
  assert.equal(up4.ok, false);

  const woodBefore = world.resources.wood;
  const stoneBefore = world.resources.stone;
  const del = demolishBuilding(world, cottage.id);
  assert.equal(del.ok, true);
  assert.ok(world.resources.wood > woodBefore);
  assert.ok(world.resources.stone >= stoneBefore);
  assert.equal(world.buildings.some((b) => b.id === cottage.id), false);
});

test('watchtowers shoot arrows at nearby bandits, shield block mitigates damage, and renown unlocks weapons', () => {
  const world = createInitialWorldState();
  const tower = world.buildings.find((b) => b.type === 'watchtower')!;
  const bandit = world.bandits[0];
  bandit.x = tower.x + 8;
  bandit.z = tower.z + 4;
  bandit.state = 'raiding';
  const hpBefore = bandit.hp;

  const ev1 = stepWorldSimulation(world, 0.7);
  assert.ok(ev1.arrowShots.length >= 1);
  assert.ok(bandit.hp < hpBefore);

  // Weapon unlock progression
  assert.deepEqual(getUnlockedWeapons(20), ['broadsword']);
  assert.equal(selectKingWeapon(world, 'waraxe').ok, false);
  world.king.renown = 65;
  assert.deepEqual(getUnlockedWeapons(world.king.renown), ['broadsword', 'waraxe', 'royal_halberd']);
  assert.equal(selectKingWeapon(world, 'royal_halberd').ok, true);
  assert.equal(getSnapshot(world).kingWeapon, 'royal_halberd');

  // Blocking reduces bandit strike damage by 75%
  const b2 = world.bandits[1];
  b2.x = world.king.x + 1.2;
  b2.z = world.king.z;
  b2.windupTimer = 0.01;
  b2.attackCooldown = 0;
  b2.state = 'windup';
  world.king.blocking = true;
  const kingHpBefore = world.king.hp;
  const blockEv = stepWorldSimulation(world, 0.05);
  assert.equal(blockEv.blockedHit, true);
  const dmgTaken = kingHpBefore - world.king.hp;
  assert.ok(dmgTaken >= 1 && dmgTaken < b2.damage * 0.5);
});

test('inter-kingdom trade caravans route via Stone Bridge, royal quests complete, and low popularity triggers protests', () => {
  const world = createInitialWorldState();
  // Oakhaven & Ironmarch pacts trigger caravans; Ironmarch (east x:112) routes through Stone Bridge (x:68, z:6)
  const ironmarch = world.factions.find((f) => f.id === 'ironmarch')!;
  ironmarch.status = 'trade_pact';
  const oakhaven = world.factions.find((f) => f.id === 'oakhaven')!;
  oakhaven.status = 'trade_pact';

  // Complete a new cottage to satisfy first quest ('q_hovel')
  const hovelRes = placeBuilding(world, 'cottage', 26, 16);
  assert.equal(hovelRes.ok, true);
  hovelRes.building!.progress = 1;
  hovelRes.building!.completed = true;

  const goldBefore = world.resources.gold;
  const ev = stepWorldSimulation(world, 0.25);
  assert.ok(ev.questCompleted.includes('House the Realm'));
  assert.ok(world.resources.gold >= goldBefore + 40);
  assert.ok(getActiveRoyalQuest(world).completedCount >= 1);

  const caravans = world.carts.filter((c) => c.isCaravan);
  assert.equal(caravans.length, 2);
  const ironCaravan = caravans.find((c) => c.factionId === 'ironmarch')!;
  ironCaravan.returning = false;
  ironCaravan.progress = 0.35;
  stepWorldSimulation(world, 0.1);
  // Crossing Eastbrook valley moves through bridge corridor around z=6
  assert.ok(Math.abs(ironCaravan.z - 6) < 6);

  // Drop popularity below 38 -> villagers protest at Village Square
  setTaxRate(world, 'high');
  setRationLevel(world, 'half');
  world.resources.food = 0;
  stepWorldSimulation(world, 0.2);
  assert.ok(world.popularity < 38);
  assert.ok(world.npcs.some((n) => n.activity === 'protesting'));
});

