import {
  BANDIT_CAMP_POS,
  BUILDING_SPECS,
  CHILD_FIRST_NAMES,
  FAMILY_SURNAMES,
  INITIAL_FACTIONS,
  NORTH_GATE_POS,
  NPC_FIRST_NAMES,
  VILLAGE_SQUARE_POS,
} from './constants';
import {
  ALL_NPC_TRAITS,
  TRAIT_BY_PROFESSION,
  countMarriedCouples,
  findEligibleMarriagePair,
  inheritProfessionFromParents,
  inheritTraitsFromParents,
  marryCitizens,
  selectParentsForBirth,
} from './familySystem';
import { CartDeliveryEvent, stepResourceCarts, syncLogisticsCarts } from './logisticsSystem';
import { evaluateRoyalQuests } from './questSystem';
import {
  BanditUnit,
  BuildingInstance,
  BuildingType,
  DemographicMetrics,
  GameSnapshot,
  KingdomEvent,
  KingWeaponType,
  NpcOrderType,
  NpcState,
  NpcTrait,
  Profession,
  RationLevel,
  ResourceCartState,
  Season,
  SquadOrder,
  TaxRate,
  WeatherCondition,
  WorldState,
} from './types';
import { canPlaceBuilding, clampToPlayableWorld, groundHeightAt } from './worldMath';

export const MAX_REALM_POPULATION = 60;

export const WEATHER_CYCLE: WeatherCondition[] = ['sunny', 'rainy', 'foggy'];
export const WEATHER_CYCLE_DURATION = 42;

export function getWeatherSpeedMultiplier(weather: WeatherCondition): number {
  if (weather === 'rainy') return 0.8;
  if (weather === 'foggy') return 0.68;
  return 1.0;
}

export function advanceWeatherCycle(world: WorldState, explicit?: WeatherCondition): WeatherCondition {
  const idx = WEATHER_CYCLE.indexOf(world.weather);
  const next = explicit ?? WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length];
  world.weather = next;
  world.weatherTimer = WEATHER_CYCLE_DURATION;

  const messages: Record<WeatherCondition, { title: string; detail: string; tone: KingdomEvent['tone'] }> = {
    sunny: {
      title: 'Skies Clear',
      detail: 'Warm sunlight returns; citizens resume outdoor work at full pace.',
      tone: 'economy',
    },
    rainy: {
      title: 'Rainfall Across Valdoria',
      detail: 'Steady rain slows travel (-20% speed); civilians seek shelter indoors.',
      tone: 'warning',
    },
    foggy: {
      title: 'Dense Valley Fog',
      detail: 'Thick mist blankets the roads (-32% speed); patrols tighten near gates.',
      tone: 'warning',
    },
  };
  const info = messages[next];
  addKingdomEvent(world, info.title, info.detail, info.tone);
  return next;
}

export interface ArrowShotEvent {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
}

export interface SimulationStepEvents {
  completedBuildings: string[];
  combatHits: Array<{ x: number; z: number; heavy: boolean }>;
  banditsKo: Array<{ x: number; z: number }>;
  arrowShots: ArrowShotEvent[];
  kingHurt: boolean;
  blockedHit: boolean;
  dailyTick: boolean;
  familyArrived: boolean;
  births: number;
  deaths: number;
  marriages: number;
  cartDeliveries: CartDeliveryEvent[];
  cartRaided: boolean;
  questCompleted: string[];
}

let idCounter = 100;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createInitialWorldState(): WorldState {
  const buildings: BuildingInstance[] = [
    {
      id: 'b_keep',
      type: 'keep',
      name: 'Valdoria Citadel Keep',
      x: 0,
      z: -22,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 2,
    },
    {
      id: 'b_cottage_1',
      type: 'cottage',
      name: 'Westgate Hovel',
      x: -13,
      z: -3,
      rotationY: 0.4,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
    {
      id: 'b_cottage_2',
      type: 'cottage',
      name: 'Oakbeam Hovel',
      x: 13,
      z: -4,
      rotationY: -0.5,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
    {
      id: 'b_cottage_3',
      type: 'cottage',
      name: 'Southfield Hovel',
      x: -12,
      z: 16,
      rotationY: 0.2,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
    {
      id: 'b_cottage_4',
      type: 'cottage',
      name: 'Riverlane Hovel',
      x: 13,
      z: 22,
      rotationY: -0.35,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
    {
      id: 'b_farm_1',
      type: 'farm',
      name: 'Sunmeadow Wheat Estate',
      x: -26,
      z: 14,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 2,
    },
    {
      id: 'b_granary_1',
      type: 'granary',
      name: 'Royal Granary',
      x: -14,
      z: -15,
      rotationY: 0.15,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_lumber_1',
      type: 'lumber_camp',
      name: 'Pinecrest Woodcutter',
      x: 24,
      z: -18,
      rotationY: -0.4,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 2,
    },
    {
      id: 'b_quarry_1',
      type: 'quarry',
      name: 'Highland Quarry',
      x: 42,
      z: -24,
      rotationY: 0.3,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_market_1',
      type: 'market',
      name: 'Crown Market Square',
      x: 11,
      z: 11,
      rotationY: -0.25,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_tavern_1',
      type: 'tavern',
      name: 'Golden Lion Alehouse',
      x: -13,
      z: 26,
      rotationY: 0.25,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_barracks_1',
      type: 'barracks',
      name: 'Stronghold Barracks',
      x: 16,
      z: -24,
      rotationY: -0.3,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 3,
    },
    {
      id: 'b_watchtower_1',
      type: 'watchtower',
      name: 'West Northgate Bastion',
      x: -7,
      z: -42,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_watchtower_2',
      type: 'watchtower',
      name: 'East Northgate Bastion',
      x: 7,
      z: -42,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 1,
    },
    {
      id: 'b_wall_1',
      type: 'stone_wall',
      name: 'West Curtain Wall',
      x: -14,
      z: -42,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
    {
      id: 'b_wall_2',
      type: 'stone_wall',
      name: 'East Curtain Wall',
      x: 14,
      z: -42,
      rotationY: 0,
      progress: 1,
      completed: true,
      level: 1,
      assignedWorkers: 0,
    },
  ];

  const npcDefs: Array<{
    id: string;
    name: string;
    age: number;
    familyName?: string;
    isChild?: boolean;
    traits?: NpcTrait[];
    spouseId?: string;
    parentIds?: string[];
    childrenIds?: string[];
    profession: Profession;
    personality: string;
    x: number;
    z: number;
    home: string;
    work: string;
    complaint: string;
  }> = [
    {
      id: 'npc_chancellor',
      name: 'Chancellor Rowan',
      age: 54,
      familyName: 'Valdor',
      traits: ['Scholarly', 'Charismatic'],
      profession: 'chancellor',
      personality: 'Measured, loyal strategist',
      x: -3.4,
      z: -11.5,
      home: 'b_keep',
      work: 'b_keep',
      complaint: 'Keep Popularity high with generous rations and fair taxes—new settlers will flock to Valdoria.',
    },
    {
      id: 'npc_commander',
      name: 'Commander Thorne',
      age: 41,
      familyName: 'Ironhand',
      traits: ['Brave', 'Stalwart'],
      profession: 'commander',
      personality: 'Steadfast, disciplined veteran',
      x: 3.6,
      z: -12.2,
      home: 'b_barracks_1',
      work: 'b_barracks_1',
      complaint: 'Our bastion towers stand firm, Sire. Order us to patrol or march into the northern highlands.',
    },
    {
      id: 'npc_farmer_1',
      name: 'Aldric the Farmer',
      age: 37,
      familyName: 'Sunmeadow',
      traits: ['Green-Thumb', 'Industrious'],
      spouseId: 'npc_farmer_2',
      childrenIds: ['npc_child_1', 'npc_child_2'],
      profession: 'farmer',
      personality: 'Hardworking, weather-wise',
      x: -22,
      z: 12,
      home: 'b_cottage_1',
      work: 'b_farm_1',
      complaint: 'The granary is steady, though another Wheat Estate or Bakery will feed many newcomers.',
    },
    {
      id: 'npc_farmer_2',
      name: 'Maren of Sunmeadow',
      age: 29,
      familyName: 'Sunmeadow',
      traits: ['Charismatic', 'Green-Thumb'],
      spouseId: 'npc_farmer_1',
      childrenIds: ['npc_child_1', 'npc_child_2'],
      profession: 'farmer',
      personality: 'Cheerful, pragmatic',
      x: -25,
      z: 16,
      home: 'b_cottage_1',
      work: 'b_farm_1',
      complaint: 'Good bread and low taxes keep the village humming from dawn till dusk.',
    },
    {
      id: 'npc_builder_1',
      name: 'Master Builder Cedric',
      age: 46,
      familyName: 'Stonewright',
      traits: ['Crafty', 'Industrious'],
      profession: 'builder',
      personality: 'Meticulous craftsman',
      x: 3.2,
      z: 4.2,
      home: 'b_cottage_2',
      work: 'b_keep',
      complaint: 'Give me timber and cut stone, Sire, and we will raise walls, bakeries, and hovels.',
    },
    {
      id: 'npc_builder_2',
      name: 'Bram the Mason',
      age: 33,
      familyName: 'Millstone',
      traits: ['Crafty', 'Stalwart'],
      childrenIds: ['npc_child_4'],
      profession: 'builder',
      personality: 'Sturdy, plainspoken',
      x: -4.4,
      z: 7.0,
      home: 'b_cottage_3',
      work: 'b_quarry_1',
      complaint: 'The eastern quarry yields prime limestone blocks for our stronghold walls.',
    },
    {
      id: 'npc_wood_1',
      name: 'Garrick Woodsman',
      age: 34,
      familyName: 'Oakbeam',
      traits: ['Stalwart', 'Industrious'],
      spouseId: 'npc_merchant_1',
      childrenIds: ['npc_child_3'],
      profession: 'woodcutter',
      personality: 'Watchful, rugged',
      x: 21,
      z: -16,
      home: 'b_cottage_2',
      work: 'b_lumber_1',
      complaint: 'Fine oak and pine east of the keep—plenty of timber for growing districts.',
    },
    {
      id: 'npc_wood_2',
      name: 'Soren the Sawyer',
      age: 28,
      familyName: 'Greenwood',
      traits: ['Stalwart', 'Nimble'],
      childrenIds: ['npc_child_5'],
      profession: 'woodcutter',
      personality: 'Brisk, tireless',
      x: 25,
      z: -14,
      home: 'b_cottage_4',
      work: 'b_lumber_1',
      complaint: 'Another woodcutter camp across the river would keep our stockpiles overflowing.',
    },
    {
      id: 'npc_merchant_1',
      name: 'Merchant Elara',
      age: 31,
      familyName: 'Oakbeam',
      traits: ['Charismatic', 'Crafty'],
      spouseId: 'npc_wood_1',
      childrenIds: ['npc_child_3'],
      profession: 'merchant',
      personality: 'Shrewd, well-traveled',
      x: 9.2,
      z: 9.2,
      home: 'b_cottage_2',
      work: 'b_market_1',
      complaint: 'Caravans cross the stone bridge from Oakhaven daily whenever roads stay safe.',
    },
    {
      id: 'npc_merchant_2',
      name: 'Innkeeper Maude',
      age: 43,
      familyName: 'Hearthstone',
      traits: ['Charismatic', 'Industrious'],
      childrenIds: ['npc_child_6'],
      profession: 'merchant',
      personality: 'Warm, gregarious',
      x: -11.5,
      z: 24,
      home: 'b_tavern_1',
      work: 'b_tavern_1',
      complaint: 'Nothing lifts peasant morale faster than a lively alehouse after harvest!',
    },
    {
      id: 'npc_guard_1',
      name: 'Guard Osric',
      age: 27,
      familyName: 'Watchward',
      traits: ['Brave', 'Nimble'],
      profession: 'guard',
      personality: 'Alert sentinel',
      x: -4.2,
      z: -34,
      home: 'b_barracks_1',
      work: 'b_watchtower_1',
      complaint: 'Northgate bastions are manned, my Liege. Watchers scan the northern pine ridge.',
    },
    {
      id: 'npc_guard_2',
      name: 'Guard Godwin',
      age: 31,
      familyName: 'Shieldborn',
      traits: ['Brave', 'Stalwart'],
      profession: 'guard',
      personality: 'Calm watchman',
      x: 4.5,
      z: -35,
      home: 'b_barracks_1',
      work: 'b_watchtower_2',
      complaint: 'Ashwood scouts lurk deep in the northern woods beyond the ridge.',
    },
    {
      id: 'npc_soldier_1',
      name: 'Sergeant Haldor',
      age: 30,
      familyName: 'Vanguard',
      traits: ['Brave', 'Industrious'],
      profession: 'soldier',
      personality: 'Brave vanguard',
      x: 12,
      z: -19,
      home: 'b_barracks_1',
      work: 'b_barracks_1',
      complaint: 'My blade is sharp and awaiting your royal banner.',
    },
    {
      id: 'npc_soldier_2',
      name: 'Shieldmaiden Freya',
      age: 25,
      familyName: 'Frostblade',
      traits: ['Brave', 'Nimble'],
      profession: 'soldier',
      personality: 'Fierce, protective',
      x: -6.5,
      z: -24,
      home: 'b_barracks_1',
      work: 'b_barracks_1',
      complaint: 'An Armory & Smithy will forge heavier iron blades for the whole garrison.',
    },
    {
      id: 'npc_child_1',
      name: 'Pip Sunmeadow',
      age: 9,
      familyName: 'Sunmeadow',
      isChild: true,
      traits: ['Green-Thumb', 'Nimble'],
      parentIds: ['npc_farmer_1', 'npc_farmer_2'],
      profession: 'child',
      personality: 'Curious, energetic',
      x: -2.4,
      z: 7.8,
      home: 'b_cottage_1',
      work: 'b_cottage_1',
      complaint: 'Look, Your Majesty! I can run all the way around the village well before sunset!',
    },
    {
      id: 'npc_child_2',
      name: 'Lilly Sunmeadow',
      age: 7,
      familyName: 'Sunmeadow',
      isChild: true,
      traits: ['Charismatic', 'Industrious'],
      parentIds: ['npc_farmer_1', 'npc_farmer_2'],
      profession: 'child',
      personality: 'Cheerful, imaginative',
      x: 2.2,
      z: 8.2,
      home: 'b_cottage_1',
      work: 'b_cottage_1',
      complaint: 'Mama says if we build a Village Bakery, we get warm honey loaves every morning!',
    },
    {
      id: 'npc_child_3',
      name: 'Tobin Oakbeam',
      age: 11,
      familyName: 'Oakbeam',
      isChild: true,
      traits: ['Stalwart', 'Crafty'],
      parentIds: ['npc_wood_1', 'npc_merchant_1'],
      profession: 'child',
      personality: 'Playful, helpful',
      x: 11.4,
      z: -1.8,
      home: 'b_cottage_2',
      work: 'b_cottage_2',
      complaint: 'When I grow up, I want to follow my parents’ craft in Valdoria!',
    },
    {
      id: 'npc_child_4',
      name: 'Milo Millstone',
      age: 8,
      familyName: 'Millstone',
      isChild: true,
      traits: ['Crafty', 'Nimble'],
      parentIds: ['npc_builder_2'],
      profession: 'child',
      personality: 'Lively, nimble',
      x: -11.8,
      z: 16.5,
      home: 'b_cottage_3',
      work: 'b_cottage_3',
      complaint: 'We race wooden swords by the hovel whenever the guards aren’t watching!',
    },
    {
      id: 'npc_child_5',
      name: 'Wren Greenwood',
      age: 10,
      familyName: 'Greenwood',
      isChild: true,
      traits: ['Stalwart', 'Nimble'],
      parentIds: ['npc_wood_2'],
      profession: 'child',
      personality: 'Observant, sweet',
      x: 10.8,
      z: 17.5,
      home: 'b_cottage_4',
      work: 'b_cottage_4',
      complaint: 'Look at the market stalls! Traders bring apples and ribbons from across the river.',
    },
    {
      id: 'npc_child_6',
      name: 'Clara Hearthstone',
      age: 6,
      familyName: 'Hearthstone',
      isChild: true,
      traits: ['Charismatic', 'Nimble'],
      parentIds: ['npc_merchant_2'],
      profession: 'child',
      personality: 'Bright, giggling',
      x: -1.8,
      z: 4.5,
      home: 'b_tavern_1',
      work: 'b_tavern_1',
      complaint: 'The sky is so wide today, my King! Can I pet your royal warhorse later?',
    },
  ];

  const defaultFamilyByHome: Record<string, string> = {
    b_cottage_1: 'Sunmeadow',
    b_cottage_2: 'Oakbeam',
    b_cottage_3: 'Millstone',
    b_cottage_4: 'Greenwood',
    b_tavern_1: 'Hearthstone',
    b_keep: 'Valdor',
    b_barracks_1: 'Ironhand',
  };

  const npcs: NpcState[] = npcDefs.map((d, idx) => ({
    id: d.id,
    name: d.name,
    age: d.age,
    familyName: d.familyName ?? defaultFamilyByHome[d.home] ?? 'Valdorian',
    isChild: Boolean(d.isChild || d.profession === 'child'),
    traits: d.traits ?? [TRAIT_BY_PROFESSION[d.profession] ?? ALL_NPC_TRAITS[idx % ALL_NPC_TRAITS.length]],
    spouseId: d.spouseId,
    parentIds: d.parentIds,
    childrenIds: d.childrenIds ? [...d.childrenIds] : [],
    profession: d.profession,
    personality: d.personality,
    x: d.x,
    z: d.z,
    vx: 0,
    vz: 0,
    facing: 0,
    targetX: d.x,
    targetZ: d.z,
    homeBuildingId: d.home,
    workBuildingId: d.work,
    activity: d.isChild
      ? 'playing'
      : d.profession === 'guard' || d.profession === 'soldier'
        ? 'patrolling'
        : 'working',
    order: 'resume_duty',
    guardX: d.x,
    guardZ: d.z,
    hp: d.isChild ? 55 : d.profession === 'guard' || d.profession === 'soldier' || d.profession === 'commander' ? 105 : 75,
    maxHp: d.isChild ? 55 : d.profession === 'guard' || d.profession === 'soldier' || d.profession === 'commander' ? 105 : 75,
    loyalty: 78,
    happiness: 78,
    wealth: d.isChild ? 4 : 18,
    attackCooldown: 0,
    swingTimer: 0,
    hitFlashTimer: 0,
    carryResource: 'none',
    complaint: d.complaint,
    speechLine: '',
    speechTimer: 0,
  }));

  const bandits: BanditUnit[] = [
    {
      id: 'bandit_1',
      name: 'Ashwood Raider',
      archetype: 'raider',
      x: BANDIT_CAMP_POS.x - 5.5,
      z: BANDIT_CAMP_POS.z + 3,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 65,
      maxHp: 65,
      damage: 11,
      speed: 4.1,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: BANDIT_CAMP_POS.x - 5.5,
      homeZ: BANDIT_CAMP_POS.z + 3,
      state: 'camp_idle',
    },
    {
      id: 'bandit_2',
      name: 'Ashwood Skirmisher',
      archetype: 'archer_skirmisher',
      x: BANDIT_CAMP_POS.x + 5.5,
      z: BANDIT_CAMP_POS.z + 2,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 55,
      maxHp: 55,
      damage: 9,
      speed: 4.5,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: BANDIT_CAMP_POS.x + 5.5,
      homeZ: BANDIT_CAMP_POS.z + 2,
      state: 'camp_idle',
    },
    {
      id: 'bandit_3',
      name: 'Forest Brigand',
      archetype: 'raider',
      x: BANDIT_CAMP_POS.x - 2.0,
      z: BANDIT_CAMP_POS.z + 7.5,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 65,
      maxHp: 65,
      damage: 11,
      speed: 4.0,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: BANDIT_CAMP_POS.x - 2.0,
      homeZ: BANDIT_CAMP_POS.z + 7.5,
      state: 'camp_idle',
    },
    {
      id: 'bandit_4',
      name: 'Warchief Kragg',
      archetype: 'chieftain',
      x: BANDIT_CAMP_POS.x,
      z: BANDIT_CAMP_POS.z - 3.0,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 135,
      maxHp: 135,
      damage: 17,
      speed: 3.7,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: BANDIT_CAMP_POS.x,
      homeZ: BANDIT_CAMP_POS.z - 3.0,
      state: 'camp_idle',
    },
    {
      id: 'bandit_5',
      name: 'Highland Marauder',
      archetype: 'raider',
      x: 92,
      z: -68,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 70,
      maxHp: 70,
      damage: 12,
      speed: 4.1,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: 92,
      homeZ: -68,
      state: 'camp_idle',
    },
    {
      id: 'bandit_6',
      name: 'Ridge Stalker',
      archetype: 'archer_skirmisher',
      x: 98,
      z: -74,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 60,
      maxHp: 60,
      damage: 10,
      speed: 4.5,
      attackCooldown: 0,
      windupTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      homeX: 98,
      homeZ: -74,
      state: 'camp_idle',
    },
  ];

  const initialState: WorldState = {
    day: 1,
    timeOfDay: 0.36, // Crisp morning sunlight
    season: 'Spring',
    weather: 'sunny',
    weatherTimer: WEATHER_CYCLE_DURATION,
    taxRate: 'normal',
    rationLevel: 'normal',
    popularity: 74,
    immigrationTimer: 12,
    emigrationTimer: 20,
    birthProgress: 0,
    deathProgress: 0,
    totalBirths: 0,
    totalDeaths: 0,
    totalMarriages: 2,
    marriageTimer: 18,
    feastBuffDays: 0,
    forestryDriveDays: 0,
    militiaMustered: false,
    resources: {
      gold: 210,
      wood: 130,
      stone: 95,
      food: 145,
      iron: 30,
    },
    populationCap: calculatePopulationCap(buildings),
    averageLoyalty: 78,
    averageHappiness: 76,
    king: {
      x: 0,
      z: 14,
      y: groundHeightAt(0, 14),
      vy: 0,
      facing: Math.PI, // Facing north (-Z) toward Village Square & Citadel Keep
      hp: 150,
      maxHp: 150,
      stamina: 100,
      maxStamina: 100,
      mounted: false,
      renown: 20,
      weapon: 'broadsword',
      blocking: false,
      attackTimer: 0,
      attackCooldown: 0,
      hitFlashTimer: 0,
      grounded: true,
    },
    buildings,
    npcs,
    bandits,
    carts: [],
    factions: INITIAL_FACTIONS.map((f) => ({ ...f })),
    events: [
      {
        id: 'ev_init_1',
        day: 1,
        title: 'Stronghold Founded in Valdoria',
        detail: 'Walk your realm, grow your population via Popularity & hovels, and fortify the northern ridge.',
        tone: 'royal',
      },
    ],
    squadOrder: 'patrol',
    banditsDefeated: 0,
    buildingsConstructed: 0,
    ordersIssued: 0,
    completedQuests: [],
    outcome: 'ongoing',
    outcomeReason: '',
    lastDailyTickDay: 1,
    raidCooldownTimer: 32,
    dayAccumulator: 0,
  };

  initialState.popularity = computeRealmPopularity(initialState);
  syncLogisticsCarts(initialState, true);
  return initialState;
}

export function calculatePopulationCap(buildings: BuildingInstance[]): number {
  return buildings
    .filter((b) => b.completed)
    .reduce((acc, b) => {
      const base = BUILDING_SPECS[b.type]?.housingBonus ?? 0;
      const upgradeBonus = base > 0 ? Math.max(0, b.level - 1) * 2 : 0;
      return acc + base + upgradeBonus;
    }, 0);
}

export function getBuildingUpgradeCost(b: BuildingInstance): { gold: number; wood: number; stone: number } {
  const tierMult = b.level === 1 ? 1 : 1.7;
  return {
    gold: Math.round(42 * tierMult),
    wood: Math.round(22 * tierMult),
    stone: Math.round(16 * tierMult),
  };
}

export function upgradeBuilding(
  world: WorldState,
  buildingId: string,
): { ok: boolean; reason?: string; building?: BuildingInstance } {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b) return { ok: false, reason: 'Building not found' };
  if (!b.completed) return { ok: false, reason: 'Finish construction before upgrading' };
  if (b.level >= 3) return { ok: false, reason: 'Already at Tier 3 (Maximum)' };

  const cost = getBuildingUpgradeCost(b);
  if (
    world.resources.gold < cost.gold ||
    world.resources.wood < cost.wood ||
    world.resources.stone < cost.stone
  ) {
    return { ok: false, reason: `Needs ${cost.gold}g, ${cost.wood}w, ${cost.stone}s` };
  }

  world.resources.gold -= cost.gold;
  world.resources.wood -= cost.wood;
  world.resources.stone -= cost.stone;
  b.level += 1;
  world.king.renown += 6;
  world.populationCap = Math.min(MAX_REALM_POPULATION, calculatePopulationCap(world.buildings));
  addKingdomEvent(
    world,
    `${b.name} Upgraded`,
    `${b.name} expanded to Tier ${b.level}, boosting output and prestige!`,
    'economy',
  );
  return { ok: true, building: b };
}

export function demolishBuilding(
  world: WorldState,
  buildingId: string,
): { ok: boolean; reason?: string; refundedWood?: number; refundedStone?: number } {
  const idx = world.buildings.findIndex((item) => item.id === buildingId);
  if (idx === -1) return { ok: false, reason: 'Building not found' };
  const b = world.buildings[idx];
  if (b.type === 'keep') return { ok: false, reason: 'Cannot demolish the Royal Citadel Keep' };

  const spec = BUILDING_SPECS[b.type];
  const refundedWood = Math.round(spec.costWood * 0.5);
  const refundedStone = Math.round(spec.costStone * 0.5);
  world.resources.wood += refundedWood;
  world.resources.stone += refundedStone;

  world.buildings.splice(idx, 1);
  const fallbackHub = world.buildings.find((item) => item.type === 'keep') ?? world.buildings[0];
  if (fallbackHub) {
    for (const npc of world.npcs) {
      if (npc.homeBuildingId === buildingId) npc.homeBuildingId = fallbackHub.id;
      if (npc.workBuildingId === buildingId) npc.workBuildingId = fallbackHub.id;
    }
  }
  world.populationCap = Math.min(MAX_REALM_POPULATION, calculatePopulationCap(world.buildings));
  syncLogisticsCarts(world, false);
  addKingdomEvent(
    world,
    `${b.name} Dismantled`,
    `Reclaimed ${refundedWood} Wood and ${refundedStone} Stone from ${b.name}.`,
    'economy',
  );
  return { ok: true, refundedWood, refundedStone };
}

export function getUnlockedWeapons(renown: number): KingWeaponType[] {
  const list: KingWeaponType[] = ['broadsword'];
  if (renown >= 30) list.push('waraxe');
  if (renown >= 60) list.push('royal_halberd');
  return list;
}

export function selectKingWeapon(
  world: WorldState,
  weapon: KingWeaponType,
): { ok: boolean; reason?: string } {
  const unlocked = getUnlockedWeapons(world.king.renown);
  if (!unlocked.includes(weapon)) {
    const req = weapon === 'waraxe' ? 30 : 60;
    return { ok: false, reason: `Requires ${req} Royal Renown` };
  }
  world.king.weapon = weapon;
  return { ok: true };
}

export function addKingdomEvent(
  world: WorldState,
  title: string,
  detail: string,
  tone: KingdomEvent['tone'] = 'royal',
): void {
  world.events.unshift({
    id: nextId('ev'),
    day: world.day,
    title,
    detail,
    tone,
  });
  if (world.events.length > 24) {
    world.events.length = 24;
  }
}

export function placeBuilding(
  world: WorldState,
  type: BuildingType,
  x: number,
  z: number,
  rotationY = 0,
): { ok: boolean; reason?: string; building?: BuildingInstance } {
  const spec = BUILDING_SPECS[type];
  if (!spec || !spec.buildable) {
    return { ok: false, reason: 'Blueprint cannot be built here' };
  }
  if (
    world.resources.gold < spec.costGold ||
    world.resources.wood < spec.costWood ||
    world.resources.stone < spec.costStone
  ) {
    return { ok: false, reason: 'Insufficient treasury resources' };
  }

  const check = canPlaceBuilding(x, z, spec.footprintRadius, world.buildings);
  if (!check.valid) {
    return { ok: false, reason: check.reason };
  }

  world.resources.gold -= spec.costGold;
  world.resources.wood -= spec.costWood;
  world.resources.stone -= spec.costStone;

  const building: BuildingInstance = {
    id: nextId('b'),
    type,
    name: spec.name,
    x,
    z,
    rotationY,
    progress: 0.05,
    completed: false,
    level: 1,
    assignedWorkers: 1,
  };
  world.buildings.push(building);

  // Immediately task builders if idle or working at Keep
  for (const npc of world.npcs) {
    if (npc.profession === 'builder' && npc.order === 'resume_duty') {
      npc.activity = 'building';
      npc.targetX = x;
      npc.targetZ = z;
      npc.speechLine = `On my way to raise ${spec.name}!`;
      npc.speechTimer = 3.5;
    }
  }

  addKingdomEvent(
    world,
    `${spec.name} Staked`,
    `Builders dispatched to construct ${spec.name}.`,
    'economy',
  );

  return { ok: true, building };
}

export function issueNpcOrder(
  world: WorldState,
  npcId: string,
  order: NpcOrderType,
): boolean {
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc) return false;

  npc.order = order;
  world.ordersIssued += 1;

  switch (order) {
    case 'follow_king':
      npc.activity = 'following_king';
      npc.speechLine = 'Right behind you, Your Majesty.';
      break;
    case 'guard_post':
      npc.activity = 'guarding';
      npc.guardX = world.king.x;
      npc.guardZ = world.king.z;
      npc.targetX = world.king.x;
      npc.targetZ = world.king.z;
      npc.speechLine = 'I shall hold this post with my life.';
      break;
    case 'work_farm': {
      const farm = world.buildings.find((b) => b.type === 'farm' && b.completed);
      if (farm) {
        npc.workBuildingId = farm.id;
        npc.targetX = farm.x;
        npc.targetZ = farm.z;
      }
      npc.activity = 'commuting';
      npc.speechLine = 'Heading to the fields at once, Sire.';
      break;
    }
    case 'gather_wood': {
      const camp = world.buildings.find((b) => b.type === 'lumber_camp' && b.completed);
      if (camp) {
        npc.workBuildingId = camp.id;
        npc.targetX = camp.x;
        npc.targetZ = camp.z;
      }
      npc.activity = 'commuting';
      npc.speechLine = 'Axes ready! Off to gather timber.';
      break;
    }
    case 'assist_construction': {
      const site = world.buildings.find((b) => !b.completed);
      if (site) {
        npc.targetX = site.x;
        npc.targetZ = site.z;
        npc.activity = 'building';
        npc.speechLine = `Assisting work on ${site.name}.`;
      } else {
        npc.order = 'resume_duty';
        npc.activity = 'working';
        npc.speechLine = 'No active sites, returning to my craft.';
      }
      break;
    }
    case 'patrol_village':
      npc.activity = 'patrolling';
      npc.speechLine = 'Patrolling the village lanes, Sire.';
      break;
    case 'attack_bandits':
      npc.activity = 'marching';
      npc.targetX = BANDIT_CAMP_POS.x;
      npc.targetZ = BANDIT_CAMP_POS.z;
      npc.speechLine = 'For Valdoria! Moving against the brigands!';
      break;
    case 'resume_duty':
    default:
      npc.activity = npc.profession === 'guard' || npc.profession === 'soldier' ? 'patrolling' : 'working';
      npc.speechLine = 'Returning to my regular duties.';
      break;
  }

  npc.speechTimer = 4.0;
  addKingdomEvent(world, 'Royal Order Issued', `${npc.name} ordered: ${order.replace(/_/g, ' ')}.`, 'royal');
  return true;
}

export function rewardNpc(world: WorldState, npcId: string, goldAmount = 15): boolean {
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc || world.resources.gold < goldAmount) return false;
  world.resources.gold -= goldAmount;
  npc.wealth += goldAmount;
  npc.loyalty = Math.min(100, npc.loyalty + 14);
  npc.happiness = Math.min(100, npc.happiness + 16);
  npc.speechLine = 'Your generosity honors my house, Sire!';
  npc.speechTimer = 4.0;
  world.king.renown += 4;
  addKingdomEvent(world, 'Royal Favor', `Rewarded ${npc.name} with ${goldAmount} Gold.`, 'royal');
  return true;
}

export function recruitSoldier(
  world: WorldState,
  role: 'soldier' | 'guard' | 'worker',
): { ok: boolean; reason?: string } {
  const costGold = role === 'worker' ? 20 : 30;
  const costFood = role === 'worker' ? 10 : 15;
  if (world.npcs.length >= world.populationCap) {
    return { ok: false, reason: 'Build more cottages or barracks to raise housing capacity' };
  }
  if (world.resources.gold < costGold || world.resources.food < costFood) {
    return { ok: false, reason: `Requires ${costGold} Gold and ${costFood} Food` };
  }

  world.resources.gold -= costGold;
  world.resources.food -= costFood;

  const barracks = world.buildings.find((b) => b.type === 'barracks' && b.completed) ?? world.buildings[0];
  const cottage = world.buildings.find((b) => b.type === 'cottage' && b.completed) ?? world.buildings[0];
  const name = `${NPC_FIRST_NAMES[(world.npcs.length * 3 + world.day) % NPC_FIRST_NAMES.length]}`;
  const profession: Profession = role === 'worker' ? 'builder' : role;

  const spawnX = (role === 'worker' ? cottage.x : barracks.x) + (Math.random() - 0.5) * 3;
  const spawnZ = (role === 'worker' ? cottage.z : barracks.z) + 3.5;

  const primaryTrait = TRAIT_BY_PROFESSION[profession] ?? 'Brave';
  const secondaryTrait = ALL_NPC_TRAITS[(world.npcs.length + world.day) % ALL_NPC_TRAITS.length];
  const traits: NpcTrait[] = primaryTrait === secondaryTrait ? [primaryTrait] : [primaryTrait, secondaryTrait];

  world.npcs.push({
    id: nextId('npc'),
    name: role === 'soldier' ? `Vanguard ${name}` : role === 'guard' ? `Guard ${name}` : `${name} the Artisan`,
    age: 22 + (world.npcs.length % 15),
    familyName: FAMILY_SURNAMES[world.npcs.length % FAMILY_SURNAMES.length],
    traits,
    childrenIds: [],
    profession,
    personality: role === 'worker' ? 'Eager apprentice' : 'Sworn defender of the Crown',
    x: spawnX,
    z: spawnZ,
    vx: 0,
    vz: 0,
    facing: 0,
    targetX: spawnX,
    targetZ: spawnZ,
    homeBuildingId: role === 'worker' ? cottage.id : barracks.id,
    workBuildingId: role === 'worker' ? cottage.id : barracks.id,
    activity: role === 'worker' ? 'working' : 'patrolling',
    order: 'resume_duty',
    guardX: spawnX,
    guardZ: spawnZ,
    hp: role === 'worker' ? 75 : 105,
    maxHp: role === 'worker' ? 75 : 105,
    loyalty: 82,
    happiness: 80,
    wealth: 12,
    attackCooldown: 0,
    swingTimer: 0,
    hitFlashTimer: 0,
    carryResource: 'none',
    complaint: 'Ready to serve Crown and Kingdom!',
    speechLine: 'Reporting for duty, Your Majesty!',
    speechTimer: 4.0,
  });

  addKingdomEvent(
    world,
    role === 'worker' ? 'New Citizen Settled' : 'Soldier Mustered',
    `${name} joined the realm as ${profession}.`,
    role === 'worker' ? 'economy' : 'military',
  );
  return { ok: true };
}

export function setSquadOrder(world: WorldState, order: SquadOrder): void {
  world.squadOrder = order;
  world.ordersIssued += 1;
  for (const npc of world.npcs) {
    if (npc.profession === 'soldier' || npc.profession === 'guard' || npc.profession === 'commander') {
      if (order === 'follow_king') {
        npc.order = 'follow_king';
        npc.activity = 'following_king';
        npc.speechLine = 'Escorting the King!';
      } else if (order === 'guard_gate') {
        npc.order = 'guard_post';
        npc.guardX = NORTH_GATE_POS.x + (Math.random() - 0.5) * 6;
        npc.guardZ = NORTH_GATE_POS.z;
        npc.activity = 'guarding';
        npc.speechLine = 'Securing the North Gate!';
      } else if (order === 'raid_camp') {
        npc.order = 'attack_bandits';
        npc.activity = 'marching';
        npc.targetX = BANDIT_CAMP_POS.x;
        npc.targetZ = BANDIT_CAMP_POS.z;
        npc.speechLine = 'Advance on the Ashwood Camp!';
      } else {
        npc.order = 'resume_duty';
        npc.activity = 'patrolling';
        npc.speechLine = 'Resuming village patrols.';
      }
      npc.speechTimer = 3.5;
    }
  }
  const labels: Record<SquadOrder, string> = {
    patrol: 'Garrison ordered to patrol the village.',
    follow_king: 'Garrison rallied to escort the King.',
    guard_gate: 'Garrison stationed at the North Gate.',
    raid_camp: 'Army marching north to assault the Bandit Camp!',
  };
  addKingdomEvent(world, 'Military Command', labels[order], 'military');
}

export function computeRealmPopularity(world: WorldState): number {
  let score = 52;
  if (world.taxRate === 'low') score += 12;
  else if (world.taxRate === 'high') score -= 18;

  if (world.rationLevel === 'extra') score += 16;
  else if (world.rationLevel === 'normal') score += 6;
  else score -= 14;

  if (world.resources.food <= 0) score -= 26;

  let taverns = 0;
  let granaries = 0;
  let markets = 0;
  let security = 0;
  for (const b of world.buildings) {
    if (!b.completed) continue;
    if (b.type === 'tavern') taverns += 1;
    else if (b.type === 'granary') granaries += 1;
    else if (b.type === 'market') markets += 1;
    else if (b.type === 'watchtower') security += 4;
    else if (b.type === 'stone_wall') security += 2;
  }

  score += Math.min(18, taverns * 6);
  score += Math.min(8, granaries * 4);
  score += Math.min(8, markets * 4);
  score += Math.min(10, security);
  if (world.feastBuffDays > 0) score += 16;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function setRationLevel(world: WorldState, level: RationLevel): void {
  if (world.rationLevel === level) return;
  world.rationLevel = level;
  const delta = level === 'extra' ? 8 : level === 'half' ? -9 : 0;
  for (const npc of world.npcs) {
    npc.happiness = Math.max(10, Math.min(100, npc.happiness + delta));
  }
  world.popularity = computeRealmPopularity(world);
  const label = level === 'extra' ? 'Double Rations' : level === 'half' ? 'Half Rations' : 'Normal Rations';
  addKingdomEvent(
    world,
    'Granary Rations Altered',
    `Rations set to ${label} (Popularity ${world.popularity}%).`,
    level === 'half' ? 'warning' : 'royal',
  );
}

function createCitizenNpc(
  world: WorldState,
  opts: {
    profession: Profession;
    homeBuildingId: string;
    workBuildingId: string;
    familyName: string;
    isChild?: boolean;
    traits?: NpcTrait[];
    parentIds?: string[];
    spawnX: number;
    spawnZ: number;
  },
): NpcState {
  const isChild = Boolean(opts.isChild || opts.profession === 'child');
  const idx = world.npcs.length;
  const firstName = isChild
    ? CHILD_FIRST_NAMES[(idx * 3 + world.day) % CHILD_FIRST_NAMES.length]
    : NPC_FIRST_NAMES[(idx * 5 + world.day) % NPC_FIRST_NAMES.length];

  const professionTitles: Record<Profession, string> = {
    farmer: `${firstName} ${opts.familyName}`,
    woodcutter: `${firstName} ${opts.familyName}`,
    builder: `${firstName} ${opts.familyName}`,
    merchant: `Trader ${firstName} ${opts.familyName}`,
    baker: `Baker ${firstName} ${opts.familyName}`,
    blacksmith: `Smith ${firstName} ${opts.familyName}`,
    miner: `Miner ${firstName} ${opts.familyName}`,
    child: `${firstName} ${opts.familyName}`,
    guard: `Watchman ${firstName}`,
    soldier: `Vanguard ${firstName}`,
    commander: `Captain ${firstName}`,
    chancellor: `Steward ${firstName}`,
  };

  const workBuilding = world.buildings.find((b) => b.id === opts.workBuildingId) ?? world.buildings[0];
  const complaints: Partial<Record<Profession, string>> = {
    baker: `Warm loaves are baking at ${workBuilding.name} right now, Your Majesty!`,
    blacksmith: `Forging crisp steel blades and armor at ${workBuilding.name}!`,
    miner: `Splitting limestone blocks at ${workBuilding.name} for our castle walls.`,
    farmer: `Tending crops at ${workBuilding.name} to keep the royal granary full.`,
    woodcutter: `Chopping oak and pine around ${workBuilding.name}.`,
    merchant: `Goods are flowing briskly through ${workBuilding.name}!`,
    child: `Playing in the sun with the ${opts.familyName} family!`,
  };

  const defaultPrimary = TRAIT_BY_PROFESSION[opts.profession] ?? ALL_NPC_TRAITS[idx % ALL_NPC_TRAITS.length];
  const defaultSecondary = ALL_NPC_TRAITS[(idx + world.day + 2) % ALL_NPC_TRAITS.length];
  const traits: NpcTrait[] =
    opts.traits && opts.traits.length > 0
      ? opts.traits
      : defaultPrimary === defaultSecondary
        ? [defaultPrimary]
        : [defaultPrimary, defaultSecondary];

  return {
    id: nextId('npc'),
    name: professionTitles[opts.profession],
    age: isChild ? 5 + ((idx * 3) % 8) : 20 + ((idx * 3) % 24),
    familyName: opts.familyName,
    isChild,
    traits,
    parentIds: opts.parentIds,
    childrenIds: [],
    profession: opts.profession,
    personality: isChild ? 'Playful, cheerful child' : 'Industrious royal subject',
    x: opts.spawnX,
    z: opts.spawnZ,
    vx: 0,
    vz: 0,
    facing: 0,
    targetX: workBuilding.x,
    targetZ: workBuilding.z + 2.2,
    homeBuildingId: opts.homeBuildingId,
    workBuildingId: opts.workBuildingId,
    activity: isChild ? 'playing' : opts.profession === 'guard' ? 'patrolling' : 'commuting',
    order: 'resume_duty',
    guardX: workBuilding.x,
    guardZ: workBuilding.z + 2.5,
    hp: isChild ? 55 : opts.profession === 'guard' ? 100 : 75,
    maxHp: isChild ? 55 : opts.profession === 'guard' ? 100 : 75,
    loyalty: Math.min(95, Math.max(58, world.popularity)),
    happiness: Math.min(95, Math.max(58, world.popularity)),
    wealth: isChild ? 4 : 12,
    attackCooldown: 0,
    swingTimer: 0,
    hitFlashTimer: 0,
    carryResource: 'none',
    complaint: complaints[opts.profession] ?? 'Proud to serve and work in Valdoria!',
    speechLine: isChild ? 'Yay, a new home!' : 'Ready to work, Sire!',
    speechTimer: 4.0,
  };
}

function assignWorkerToCompletedBuilding(world: WorldState, building: BuildingInstance, events: SimulationStepEvents): void {
  const homes = world.buildings.filter(
    (b) => b.completed && (b.type === 'cottage' || b.type === 'tavern' || b.type === 'keep'),
  );
  const home = building.type === 'cottage' || building.type === 'tavern'
    ? building
    : homes[world.npcs.length % Math.max(1, homes.length)] ?? world.buildings[0];
  const familyName = FAMILY_SURNAMES[(world.buildingsConstructed + world.npcs.length) % FAMILY_SURNAMES.length];
  const keep = world.buildings[0];

  if (building.type === 'cottage') {
    // New Peasant Hovel brings a whole settler family (parent + child)!
    const jobs: Profession[] = ['farmer', 'woodcutter', 'builder', 'merchant'];
    const parentProf = jobs[world.buildingsConstructed % jobs.length];
    const workMatches = world.buildings.filter((b) => b.completed && (b.type === 'farm' || b.type === 'market' || b.type === 'lumber_camp'));
    const workId = workMatches[0]?.id ?? building.id;
    let parent: NpcState | undefined;
    if (world.npcs.length < MAX_REALM_POPULATION) {
      parent = createCitizenNpc(world, {
        profession: parentProf,
        homeBuildingId: building.id,
        workBuildingId: workId,
        familyName,
        spawnX: building.x - 1.2,
        spawnZ: building.z + 2.6,
      });
      world.npcs.push(parent);
    }
    if (world.npcs.length < MAX_REALM_POPULATION) {
      const child = createCitizenNpc(world, {
        profession: 'child',
        homeBuildingId: building.id,
        workBuildingId: building.id,
        familyName,
        isChild: true,
        parentIds: parent ? [parent.id] : undefined,
        traits: parent ? inheritTraitsFromParents(parent, undefined, world.npcs.length) : undefined,
        spawnX: building.x + 1.0,
        spawnZ: building.z + 2.8,
      });
      if (parent) parent.childrenIds.push(child.id);
      world.npcs.push(child);
      events.familyArrived = true;
    }
    building.assignedWorkers = 2;
    return;
  }

  if (building.type === 'stone_wall') {
    building.assignedWorkers = 0;
    return;
  }

  const buildingToProfession: Partial<Record<BuildingType, Profession>> = {
    farm: 'farmer',
    granary: 'farmer',
    bakery: 'baker',
    lumber_camp: 'woodcutter',
    quarry: 'miner',
    blacksmith: 'blacksmith',
    market: 'merchant',
    tavern: 'merchant',
    barracks: 'guard',
    watchtower: 'guard',
  };
  const targetProf = buildingToProfession[building.type];
  if (!targetProf) return;

  // Spawn a specialist artisan/worker if realm population allows, otherwise reassign an existing matching worker
  if (world.npcs.length < Math.min(MAX_REALM_POPULATION, calculatePopulationCap(world.buildings))) {
    const worker = createCitizenNpc(world, {
      profession: targetProf,
      homeBuildingId: home.id,
      workBuildingId: building.id,
      familyName,
      spawnX: keep.x + 1.5,
      spawnZ: keep.z + 6.5,
    });
    worker.guardX = building.x;
    worker.guardZ = building.z + 2.5;
    world.npcs.push(worker);
    building.assignedWorkers = 1;
    events.familyArrived = true;
  } else {
    const candidate = world.npcs.find((n) => !n.isChild && n.profession === targetProf && n.order === 'resume_duty');
    if (candidate) {
      candidate.workBuildingId = building.id;
      candidate.targetX = building.x + 2.2;
      candidate.targetZ = building.z + 2.2;
      candidate.activity = 'commuting';
      building.assignedWorkers = 1;
    }
  }
}

function spawnImmigrantCitizen(world: WorldState, events?: SimulationStepEvents): void {
  const homes = world.buildings.filter(
    (b) => b.completed && (b.type === 'cottage' || b.type === 'tavern' || b.type === 'keep'),
  );
  const home = homes[world.npcs.length % Math.max(1, homes.length)] ?? world.buildings[0];
  const farms = world.buildings.filter((b) => b.completed && (b.type === 'farm' || b.type === 'granary'));
  const bakeries = world.buildings.filter((b) => b.completed && b.type === 'bakery');
  const smithies = world.buildings.filter((b) => b.completed && b.type === 'blacksmith');
  const quarries = world.buildings.filter((b) => b.completed && b.type === 'quarry');
  const lumbers = world.buildings.filter((b) => b.completed && b.type === 'lumber_camp');
  const markets = world.buildings.filter((b) => b.completed && (b.type === 'market' || b.type === 'tavern'));
  const barracks = world.buildings.filter((b) => b.completed && (b.type === 'barracks' || b.type === 'watchtower'));

  const roll = world.npcs.length % 7;
  let profession: Profession = 'farmer';
  let workBuildingId = farms[0]?.id ?? home.id;

  if (roll === 1 && lumbers.length > 0) {
    profession = 'woodcutter';
    workBuildingId = lumbers[world.npcs.length % lumbers.length].id;
  } else if (roll === 2 && bakeries.length > 0) {
    profession = 'baker';
    workBuildingId = bakeries[world.npcs.length % bakeries.length].id;
  } else if (roll === 3 && markets.length > 0) {
    profession = 'merchant';
    workBuildingId = markets[world.npcs.length % markets.length].id;
  } else if (roll === 4 && barracks.length > 0) {
    profession = 'guard';
    workBuildingId = barracks[world.npcs.length % barracks.length].id;
  } else if (roll === 5 && smithies.length > 0) {
    profession = 'blacksmith';
    workBuildingId = smithies[world.npcs.length % smithies.length].id;
  } else if (roll === 6 && quarries.length > 0) {
    profession = 'miner';
    workBuildingId = quarries[world.npcs.length % quarries.length].id;
  } else if (farms.length > 0) {
    profession = 'farmer';
    workBuildingId = farms[world.npcs.length % farms.length].id;
  }

  const familyName = FAMILY_SURNAMES[(world.npcs.length + world.day) % FAMILY_SURNAMES.length];
  const keep = world.buildings[0];
  const sx = keep.x + ((world.npcs.length % 5) - 2) * 1.1;
  const sz = keep.z + 6.5;

  const adult = createCitizenNpc(world, {
    profession,
    homeBuildingId: home.id,
    workBuildingId,
    familyName,
    spawnX: sx,
    spawnZ: sz,
  });
  world.npcs.push(adult);

  // If housing allows another bed, bring a child of the same family along!
  const cap = Math.min(MAX_REALM_POPULATION, world.populationCap);
  let settledText = `${adult.name} settled in Valdoria`;
  if (world.npcs.length < cap) {
    const child = createCitizenNpc(world, {
      profession: 'child',
      homeBuildingId: home.id,
      workBuildingId: home.id,
      familyName,
      isChild: true,
      parentIds: [adult.id],
      traits: inheritTraitsFromParents(adult, undefined, world.npcs.length),
      spawnX: sx + 0.9,
      spawnZ: sz + 0.6,
    });
    adult.childrenIds.push(child.id);
    world.npcs.push(child);
    settledText = `The ${familyName} family (${adult.name} & child ${child.name.split(' ')[0]}) settled in Valdoria`;
  }
  if (events) events.familyArrived = true;

  addKingdomEvent(
    world,
    'New Family Settled',
    `${settledText} (${world.npcs.length}/${world.populationCap}).`,
    'economy',
  );
}

export function calculateDemographicRates(world: WorldState): DemographicMetrics {
  const effectiveCap = Math.max(1, Math.min(MAX_REALM_POPULATION, world.populationCap));
  const openBeds = Math.max(0, effectiveCap - world.npcs.length);
  const overcrowding = Math.max(0, world.npcs.length - effectiveCap);

  const childrenCount = world.npcs.filter((n) => n.isChild || n.profession === 'child').length;
  const eldersCount = world.npcs.filter((n) => n.age >= 68).length;
  const adultsCount = Math.max(0, world.npcs.length - childrenCount);
  const familiesCount = new Set(world.npcs.map((n) => n.familyName).filter(Boolean)).size;
  const marriedCouplesCount = countMarriedCouples(world);

  const rationFactor = world.rationLevel === 'half' ? 0.8 : world.rationLevel === 'extra' ? 1.8 : 1.2;
  const foodUnits = world.npcs.reduce((sum, n) => sum + (n.isChild || n.profession === 'child' ? 0.5 : 1), 0);
  const dailyFoodNeed = Math.max(4, foodUnits * rationFactor);
  const foodDaysReserve = world.resources.food / dailyFoodNeed;

  // Birth rate scales with married couples, food reserves, ration generosity, open housing beds, and realm happiness
  let birthRatePerDay = 0;
  if (openBeds > 0 && world.resources.food > 8 && (marriedCouplesCount > 0 || adultsCount >= 2)) {
    const rationMult = world.rationLevel === 'extra' ? 1.45 : world.rationLevel === 'normal' ? 1.0 : 0.35;
    const foodFactor = Math.max(0, Math.min(1.3, (foodDaysReserve - 0.45) / 3.2));
    const housingFactor = Math.min(1.45, 0.55 + openBeds / 12);
    const happyFactor = 0.5 + (Math.max(20, world.popularity) / 100) * 0.75;
    const familyBase = Math.max(0.9, marriedCouplesCount * 0.65 + adultsCount / 8) * 0.24;
    birthRatePerDay = familyBase * rationMult * foodFactor * housingFactor * happyFactor;
  }

  // Death rate rises sharply on famine (food == 0), malnutrition, overcrowding/winter exposure, and old age
  let deathRatePerDay = 0;
  if (world.npcs.length > 0) {
    const hasGranaryOrTavern = world.buildings.some(
      (b) => b.completed && (b.type === 'granary' || b.type === 'tavern'),
    );
    const baseAccidentRate = world.npcs.length * (hasGranaryOrTavern ? 0.0015 : 0.003);
    const elderMortality = eldersCount * (foodDaysReserve < 1 ? 0.14 : 0.065);
    let famineRate = 0;
    if (world.resources.food <= 0) {
      famineRate = 0.45 + world.npcs.length * 0.055;
    } else if (foodDaysReserve < 0.9 || (world.rationLevel === 'half' && foodDaysReserve < 1.8)) {
      famineRate = 0.16;
    }
    const exposureMult = world.season === 'Winter' || world.weather === 'rainy' ? 1.4 : 1.0;
    const overcrowdingRate = overcrowding > 0 ? overcrowding * 0.14 * exposureMult : 0;

    deathRatePerDay = baseAccidentRate + elderMortality + famineRate + overcrowdingRate;
  }

  const roundedBirth = Number(birthRatePerDay.toFixed(2));
  const roundedDeath = Number(deathRatePerDay.toFixed(2));
  return {
    birthRatePerDay: roundedBirth,
    deathRatePerDay: roundedDeath,
    netGrowthPerDay: Number((roundedBirth - roundedDeath).toFixed(2)),
    foodDaysReserve: Number(foodDaysReserve.toFixed(1)),
    housingOccupancy: Number((world.npcs.length / effectiveCap).toFixed(2)),
    totalBirths: world.totalBirths,
    totalDeaths: world.totalDeaths,
    familiesCount,
    childrenCount,
    eldersCount,
  };
}

function spawnNewbornCitizen(world: WorldState, events: SimulationStepEvents): void {
  const effectiveCap = Math.min(MAX_REALM_POPULATION, world.populationCap);
  if (world.npcs.length >= effectiveCap) return;

  const { home, familyName, parents } = selectParentsForBirth(world);
  const inheritedTraits = inheritTraitsFromParents(parents[0], parents[1], world.totalBirths);
  const parentIds = parents.map((p) => p.id);

  const newborn = createCitizenNpc(world, {
    profession: 'child',
    homeBuildingId: home.id,
    workBuildingId: home.id,
    familyName,
    isChild: true,
    traits: inheritedTraits,
    parentIds,
    spawnX: home.x + ((world.totalBirths % 3) - 1) * 1.1,
    spawnZ: home.z + 2.5,
  });
  newborn.age = 1;
  newborn.personality = 'Joyful village newborn';
  newborn.speechLine =
    parents.length >= 2
      ? `Born to ${parents[0].name.split(' ')[0]} & ${parents[1].name.split(' ')[0]} of House ${familyName}!`
      : `Born to House ${familyName}!`;
  newborn.speechTimer = 4.0;

  for (const p of parents) {
    if (!p.childrenIds.includes(newborn.id)) {
      p.childrenIds.push(newborn.id);
    }
  }

  world.npcs.push(newborn);
  world.totalBirths += 1;
  events.births += 1;

  const parentDetail =
    parents.length >= 2
      ? ` to ${parents[0].name.split(' ')[0]} & ${parents[1].name.split(' ')[0]} (Traits: ${inheritedTraits.join(', ')})`
      : ` in House ${familyName}`;
  addKingdomEvent(
    world,
    'Child Born in Valdoria',
    `${newborn.name} was born${parentDetail} (${world.npcs.length}/${world.populationCap}).`,
    'royal',
  );
}

function processCitizenDeath(world: WorldState, events: SimulationStepEvents): void {
  if (world.npcs.length <= 2) return;

  // Prefer natural elder passing first, then lowest-HP non-advisor citizens
  const candidates = world.npcs.filter(
    (n) => n.profession !== 'chancellor' && n.profession !== 'commander',
  );
  if (candidates.length === 0) return;

  const starving = world.resources.food <= 0;
  const elders = candidates.filter((n) => n.age >= 68);
  let victim: NpcState;
  if (elders.length > 0) {
    victim = elders.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), elders[0]);
  } else if (starving) {
    // Under famine, weakest/lowest-HP citizens perish first (protect children until adults drop low)
    const pool = candidates.filter((n) => !n.isChild);
    const activePool = pool.length > 0 ? pool : candidates;
    victim = activePool.reduce((weak, cur) => (cur.hp < weak.hp ? cur : weak), activePool[0]);
  } else {
    // Avoid killing young children from random accidents when elders exist or food is plentiful
    const adultPool = candidates.filter((n) => !n.isChild);
    const activePool = adultPool.length > 0 ? adultPool : candidates;
    victim = activePool.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), activePool[0]);
  }

  const idx = world.npcs.findIndex((n) => n.id === victim.id);
  if (idx === -1) return;
  world.npcs.splice(idx, 1);
  for (const n of world.npcs) {
    if (n.spouseId === victim.id) n.spouseId = undefined;
    if (n.childrenIds.includes(victim.id)) {
      n.childrenIds = n.childrenIds.filter((cid) => cid !== victim.id);
    }
  }
  world.totalDeaths += 1;
  events.deaths += 1;

  const isOvercrowded = world.npcs.length >= world.populationCap;
  const causeTitle = starving
    ? 'Famine Claims a Soul'
    : victim.age >= 68
      ? 'Elder Passed Peacefully'
      : isOvercrowded
        ? 'Overcrowding Illness'
        : 'Citizen Passed Away';
  const causeDetail = starving
    ? `${victim.name} succumbed to starvation. Raise food production or granary stores!`
    : victim.age >= 68
      ? `${victim.name} (age ${victim.age}) passed peacefully in ${victim.familyName ?? 'Valdoria'}.`
      : `${victim.name} died due to hardship (${world.npcs.length}/${world.populationCap}).`;

  if (starving || isOvercrowded) {
    for (const n of world.npcs) {
      if (n.familyName === victim.familyName || starving) {
        n.happiness = Math.max(10, n.happiness - (starving ? 6 : 3));
      }
    }
  }

  addKingdomEvent(world, causeTitle, causeDetail, starving || isOvercrowded ? 'warning' : 'royal');
}

export function setTaxRate(world: WorldState, rate: TaxRate): void {
  if (world.taxRate === rate) return;
  world.taxRate = rate;
  const delta = rate === 'low' ? 6 : rate === 'high' ? -9 : 0;
  for (const npc of world.npcs) {
    npc.happiness = Math.max(10, Math.min(100, npc.happiness + delta));
    if (rate === 'high') {
      npc.loyalty = Math.max(15, npc.loyalty - 5);
    } else if (rate === 'low') {
      npc.loyalty = Math.min(100, npc.loyalty + 4);
    }
  }
  world.popularity = computeRealmPopularity(world);
  addKingdomEvent(
    world,
    'Tax Edict Proclaimed',
    `Royal taxes set to ${rate.toUpperCase()} (Popularity ${world.popularity}%).`,
    rate === 'high' ? 'warning' : 'royal',
  );
}

export function enactDecree(
  world: WorldState,
  decree: 'feast' | 'forestry' | 'muster',
): { ok: boolean; reason?: string } {
  if (decree === 'feast') {
    if (world.resources.gold < 40 || world.resources.food < 30) {
      return { ok: false, reason: 'Needs 40 Gold & 30 Food' };
    }
    world.resources.gold -= 40;
    world.resources.food -= 30;
    world.feastBuffDays = 3;
    world.king.renown += 10;
    for (const npc of world.npcs) {
      npc.happiness = Math.min(100, npc.happiness + 18);
      npc.loyalty = Math.min(100, npc.loyalty + 10);
      npc.speechLine = 'Long live the King! What a feast!';
      npc.speechTimer = 4.0;
    }
    addKingdomEvent(world, 'Royal Harvest Feast', 'Citizens celebrate across the square; loyalty surges!', 'royal');
    return { ok: true };
  }
  if (decree === 'forestry') {
    if (world.resources.gold < 25) return { ok: false, reason: 'Needs 25 Gold' };
    world.resources.gold -= 25;
    world.forestryDriveDays = 3;
    addKingdomEvent(world, 'Forestry Drive', 'Lumber production doubled for 3 days.', 'economy');
    return { ok: true };
  }
  if (decree === 'muster') {
    if (world.resources.gold < 35) return { ok: false, reason: 'Needs 35 Gold' };
    world.resources.gold -= 35;
    world.militiaMustered = true;
    world.king.hp = world.king.maxHp;
    for (const npc of world.npcs) {
      npc.hp = npc.maxHp;
    }
    addKingdomEvent(world, 'Militia Supplies Issued', 'All guards and citizens healed & outfitted.', 'military');
    return { ok: true };
  }
  return { ok: false };
}

export function performDiplomacy(
  world: WorldState,
  factionId: string,
  action: 'trade_envoy' | 'gift' | 'demand_truce',
): { ok: boolean; reason?: string } {
  const faction = world.factions.find((f) => f.id === factionId);
  if (!faction) return { ok: false, reason: 'Faction not found' };

  if (action === 'trade_envoy') {
    if (world.resources.food < 20) return { ok: false, reason: 'Needs 20 Food for trade caravan' };
    world.resources.food -= 20;
    world.resources.gold += 35;
    faction.relation = Math.min(100, faction.relation + 8);
    if (faction.relation >= 30 && faction.status === 'neutral') faction.status = 'trade_pact';
    addKingdomEvent(world, 'Trade Caravan Sent', `Traded 20 Food with ${faction.name} for 35 Gold.`, 'economy');
    return { ok: true };
  }
  if (action === 'gift') {
    if (world.resources.gold < 35) return { ok: false, reason: 'Needs 35 Gold' };
    world.resources.gold -= 35;
    faction.relation = Math.min(100, faction.relation + 18);
    if (faction.relation >= 65) faction.status = 'allied';
    else if (faction.relation >= 15 && faction.status === 'hostile') faction.status = 'neutral';
    world.king.renown += 6;
    addKingdomEvent(world, 'Diplomatic Gift', `Sent royal envoy to ${faction.ruler} (${faction.name}).`, 'royal');
    return { ok: true };
  }
  if (action === 'demand_truce') {
    if (world.king.renown < 25) return { ok: false, reason: 'Requires 25 Royal Renown' };
    faction.relation = Math.min(100, faction.relation + 22);
    if (faction.status === 'war' || faction.status === 'hostile') faction.status = 'neutral';
    addKingdomEvent(world, 'Truce Negotiated', `${faction.name} agreed to respect Valdoria’s borders.`, 'royal');
    return { ok: true };
  }
  return { ok: false };
}

const towerFireTimers = new WeakMap<WorldState, Map<string, number>>();

function stepWatchtowerDefenses(world: WorldState, dt: number, events: SimulationStepEvents): void {
  const aliveBandits = world.bandits.filter((b) => b.state !== 'ko');
  if (aliveBandits.length === 0) return;

  let timerMap = towerFireTimers.get(world);
  if (!timerMap) {
    timerMap = new Map<string, number>();
    towerFireTimers.set(world, timerMap);
  }

  for (const b of world.buildings) {
    if (!b.completed || b.type !== 'watchtower') continue;
    const prevCd = timerMap.get(b.id) ?? 0.6;
    const nextCd = prevCd - dt;
    if (nextCd > 0) {
      timerMap.set(b.id, nextCd);
      continue;
    }

    let target: BanditUnit | null = null;
    let bestDist = 23 + (b.level - 1) * 3;
    for (const bandit of aliveBandits) {
      const d = Math.hypot(bandit.x - b.x, bandit.z - b.z);
      if (d < bestDist) {
        bestDist = d;
        target = bandit;
      }
    }

    if (!target) {
      timerMap.set(b.id, 0.35);
      continue;
    }

    const cooldown = Math.max(0.95, 1.85 - (b.level - 1) * 0.35);
    timerMap.set(b.id, cooldown);
    const dmg = 16 + (b.level - 1) * 6;
    target.hp -= dmg;
    target.hitFlashTimer = 0.08;
    events.arrowShots.push({
      fromX: b.x,
      fromY: groundHeightAt(b.x, b.z) + 7.2,
      fromZ: b.z,
      toX: target.x,
      toY: groundHeightAt(target.x, target.z) + 1.1,
      toZ: target.z,
    });
    events.combatHits.push({ x: target.x, z: target.z, heavy: false });

    if (target.hp <= 0) {
      target.hp = 0;
      target.state = 'ko';
      target.koTimer = 0.55;
      world.banditsDefeated += 1;
      world.resources.gold += 14;
      world.king.renown += 6;
      events.banditsKo.push({ x: target.x, z: target.z });
      addKingdomEvent(
        world,
        `${b.name} Volley`,
        `Watchtower archers felled ${target.name} (+14 Gold, +6 Renown).`,
        'military',
      );
    }
  }
}

export function triggerKingAttack(
  world: WorldState,
  events: SimulationStepEvents,
): boolean {
  const king = world.king;
  if (king.attackCooldown > 0 || king.stamina < 12) return false;
  king.attackCooldown = 0.45;
  king.attackTimer = 0.28;
  king.stamina = Math.max(0, king.stamina - 12);

  const forwardX = Math.sin(king.facing);
  const forwardZ = Math.cos(king.facing);
  const weapon = king.weapon ?? 'broadsword';
  const hitRange = weapon === 'royal_halberd' ? 4.2 : weapon === 'waraxe' ? 3.6 : 3.4;
  const weaponBonus = weapon === 'royal_halberd' ? 18 : weapon === 'waraxe' ? 10 : 0;

  for (const bandit of world.bandits) {
    if (bandit.state === 'ko') continue;
    const dx = bandit.x - king.x;
    const dz = bandit.z - king.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= hitRange) {
      const dot = dist > 0.01 ? (dx / dist) * forwardX + (dz / dist) * forwardZ : 1;
      if (dot > -0.25) {
        const dmg = (king.mounted ? 34 : 26) + weaponBonus;
        bandit.hp -= dmg;
        bandit.hitFlashTimer = 0.08;
        // Knockback
        const nx = dist > 0.01 ? dx / dist : forwardX;
        const nz = dist > 0.01 ? dz / dist : forwardZ;
        bandit.x += nx * 1.4;
        bandit.z += nz * 1.4;
        events.combatHits.push({ x: bandit.x, z: bandit.z, heavy: true });

        if (bandit.hp <= 0) {
          bandit.hp = 0;
          bandit.state = 'ko';
          bandit.koTimer = 0.55;
          world.banditsDefeated += 1;
          world.resources.gold += 18;
          world.king.renown += 8;
          events.banditsKo.push({ x: bandit.x, z: bandit.z });
          addKingdomEvent(
            world,
            'Brigand Defeated',
            `King struck down ${bandit.name} (+18 Gold, +8 Renown).`,
            'military',
          );
        }
      }
    }
  }
  return true;
}

export function stepWorldSimulation(
  world: WorldState,
  dt: number,
): SimulationStepEvents {
  const events: SimulationStepEvents = {
    completedBuildings: [],
    combatHits: [],
    banditsKo: [],
    arrowShots: [],
    kingHurt: false,
    blockedHit: false,
    dailyTick: false,
    familyArrived: false,
    births: 0,
    deaths: 0,
    marriages: 0,
    cartDeliveries: [],
    cartRaided: false,
    questCompleted: [],
  };

  if (world.outcome !== 'ongoing') return events;

  // Advance day/night clock (~90s real time = 1 full kingdom day)
  const dayDurationSeconds = 90;
  world.dayAccumulator += dt;
  world.timeOfDay += dt / dayDurationSeconds;
  if (world.timeOfDay >= 1) {
    world.timeOfDay -= 1;
    world.day += 1;
    runDailyKingdomTick(world, events);
  }

  // Advance global weather cycle between sunny -> rainy -> foggy
  world.weatherTimer -= dt;
  if (world.weatherTimer <= 0) {
    advanceWeatherCycle(world);
  }

  // Update king timers & shield stamina drain
  if (world.king.attackCooldown > 0) world.king.attackCooldown = Math.max(0, world.king.attackCooldown - dt);
  if (world.king.attackTimer > 0) world.king.attackTimer = Math.max(0, world.king.attackTimer - dt);
  if (world.king.hitFlashTimer > 0) world.king.hitFlashTimer = Math.max(0, world.king.hitFlashTimer - dt);
  if (world.king.blocking && world.king.stamina > 1) {
    world.king.stamina = Math.max(0, world.king.stamina - dt * 8);
    if (world.king.stamina <= 1) world.king.blocking = false;
  } else {
    world.king.stamina = Math.min(world.king.maxStamina, world.king.stamina + dt * 16);
  }

  // Trigger occasional small bandit raid probes
  world.raidCooldownTimer -= dt;
  if (world.raidCooldownTimer <= 0) {
    world.raidCooldownTimer = 38;
    const idleRaiders = world.bandits.filter((b) => b.state === 'camp_idle' && b.archetype !== 'chieftain');
    if (idleRaiders.length > 0) {
      const raider = idleRaiders[0];
      raider.state = 'raiding';
      addKingdomEvent(
        world,
        'Border Skirmish',
        `${raider.name} is probing south toward the North Gate!`,
        'warning',
      );
    }
  }

  world.populationCap = Math.min(MAX_REALM_POPULATION, calculatePopulationCap(world.buildings));
  world.popularity = computeRealmPopularity(world);

  // Update NPCs
  stepNpcs(world, dt, events);

  // Update physical logistics resource carts between work sites & storage hubs
  events.cartDeliveries = stepResourceCarts(world, dt, getWeatherSpeedMultiplier(world.weather));

  // Watchtower defensive arrow volleys
  stepWatchtowerDefenses(world, dt, events);

  // Update Bandits
  stepBandits(world, dt, events);

  // Clean up KO'd bandits after ko animation completes
  world.bandits = world.bandits.filter((b) => !(b.state === 'ko' && b.koTimer <= 0));

  // Evaluate progressive Royal Quests
  const questRewards = evaluateRoyalQuests(world);
  for (const qr of questRewards) {
    events.questCompleted.push(qr.title);
    addKingdomEvent(
      world,
      `Royal Decree Fulfilled: ${qr.title}`,
      `Granted +${qr.rewardGold} Gold and +${qr.rewardRenown} Renown!`,
      'royal',
    );
  }

  // Recompute aggregates & Stronghold popularity
  world.populationCap = Math.min(MAX_REALM_POPULATION, calculatePopulationCap(world.buildings));
  world.popularity = computeRealmPopularity(world);

  // Natural marriages between eligible unmarried adult citizens
  if (world.resources.food > 10 && world.popularity >= 42) {
    world.marriageTimer -= dt;
    if (world.marriageTimer <= 0) {
      world.marriageTimer = 24;
      const pair = findEligibleMarriagePair(world);
      if (pair) {
        const [partnerA, partnerB] = pair;
        const { familyName } = marryCitizens(world, partnerA, partnerB);
        events.marriages += 1;
        addKingdomEvent(
          world,
          'Royal Wedding in Valdoria',
          `${partnerA.name} & ${partnerB.name} wed and founded House ${familyName}!`,
          'royal',
        );
      }
    }
  }

  // Resource-driven natural birth & death rate simulation
  const demo = calculateDemographicRates(world);
  world.birthProgress += (demo.birthRatePerDay / dayDurationSeconds) * dt;
  while (world.birthProgress >= 1) {
    world.birthProgress -= 1;
    spawnNewbornCitizen(world, events);
  }

  world.deathProgress += (demo.deathRatePerDay / dayDurationSeconds) * dt;
  while (world.deathProgress >= 1) {
    world.deathProgress -= 1;
    processCitizenDeath(world, events);
  }

  // Stronghold-style dynamic immigration & emigration over time
  if (
    world.popularity >= 54 &&
    world.npcs.length < world.populationCap &&
    world.npcs.length < MAX_REALM_POPULATION &&
    world.resources.food > 5
  ) {
    const immigSpeed = 0.65 + ((world.popularity - 50) / 50) * 1.1;
    world.immigrationTimer -= dt * immigSpeed;
    if (world.immigrationTimer <= 0) {
      world.immigrationTimer = 14;
      spawnImmigrantCitizen(world, events);
    }
  } else if (world.popularity < 28 && world.npcs.length > 6) {
    world.emigrationTimer -= dt;
    if (world.emigrationTimer <= 0) {
      world.emigrationTimer = 18;
      const departed = world.npcs.pop();
      if (departed) {
        addKingdomEvent(
          world,
          'Citizen Departed',
          `${departed.name} left Valdoria due to low Popularity (${world.popularity}%).`,
          'warning',
        );
      }
    }
  }

  if (world.npcs.length > 0) {
    let sumLoy = 0;
    let sumHap = 0;
    for (const n of world.npcs) {
      sumLoy += n.loyalty;
      sumHap += n.happiness;
    }
    world.averageLoyalty = Math.round(sumLoy / world.npcs.length);
    world.averageHappiness = Math.round(sumHap / world.npcs.length);
  }

  // Check victory / defeat conditions
  if (world.king.hp <= 0) {
    world.outcome = 'defeat';
    world.outcomeReason = 'The King fell in battle defending Valdoria.';
  } else if (world.averageLoyalty <= 12) {
    world.outcome = 'defeat';
    world.outcomeReason = 'Popular rebellion toppled the throne due to extreme discontent.';
  } else if (world.bandits.length === 0 && world.buildingsConstructed >= 3) {
    world.outcome = 'victory';
    world.outcomeReason =
      'You eradicated the Ashwood Marauders and expanded Valdoria into a mighty stronghold!';
  } else if (
    world.buildingsConstructed >= 6 &&
    world.npcs.length >= 24 &&
    world.resources.gold >= 380 &&
    world.popularity >= 75
  ) {
    world.outcome = 'victory';
    world.outcomeReason = 'Valdoria flourished into a prosperous, populous medieval stronghold under your rule!';
  }

  return events;
}

function runDailyKingdomTick(world: WorldState, events: SimulationStepEvents): void {
  events.dailyTick = true;
  world.lastDailyTickDay = world.day;

  const seasons: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];
  world.season = seasons[Math.floor((world.day - 1) / 4) % 4];

  if (world.feastBuffDays > 0) world.feastBuffDays -= 1;
  if (world.forestryDriveDays > 0) world.forestryDriveDays -= 1;

  let prodFood = 0;
  let prodWood = 0;
  let prodStone = 0;
  let prodGold = 0;
  let prodIron = 0;

  for (const b of world.buildings) {
    if (!b.completed) continue;
    const spec = BUILDING_SPECS[b.type];
    const lvlMult = 1 + Math.max(0, b.level - 1) * 0.45;
    prodFood += Math.round(spec.dailyFood * lvlMult);
    prodWood += Math.round(spec.dailyWood * lvlMult) * (world.forestryDriveDays > 0 ? 2 : 1);
    prodStone += Math.round(spec.dailyStone * lvlMult);
    prodGold += Math.round(spec.dailyGold * lvlMult);
    if (b.type === 'blacksmith') prodIron += Math.round(8 * lvlMult);
  }

  // Winter reduces farm yield slightly
  if (world.season === 'Winter') {
    prodFood = Math.round(prodFood * 0.65);
  }

  // Tax income per working adult + ration-scaled food consumption (children eat half share)
  const adultsCount = world.npcs.filter((n) => !n.isChild && n.profession !== 'child').length;
  const taxPerCitizen = world.taxRate === 'low' ? 2 : world.taxRate === 'normal' ? 4 : 7;
  const taxGold = adultsCount * taxPerCitizen;
  const rationFactor = world.rationLevel === 'half' ? 0.8 : world.rationLevel === 'extra' ? 1.8 : 1.2;
  const foodUnits = world.npcs.reduce((sum, n) => sum + (n.isChild || n.profession === 'child' ? 0.5 : 1), 0);
  const foodConsumed = Math.max(4, Math.round(foodUnits * rationFactor));

  world.resources.food = Math.max(0, world.resources.food + prodFood - foodConsumed);
  world.resources.wood += prodWood;
  world.resources.stone += prodStone;
  world.resources.iron += prodIron;
  world.resources.gold = Math.max(0, world.resources.gold + prodGold + taxGold);

  // Trade pact bonus
  const oakhaven = world.factions.find((f) => f.id === 'oakhaven');
  if (oakhaven && (oakhaven.status === 'trade_pact' || oakhaven.status === 'allied')) {
    world.resources.gold += 12;
  }

  // Natural citizen aging every 2 days & coming-of-age parent trade inheritance
  if (world.day % 2 === 0) {
    for (let i = 0; i < world.npcs.length; i++) {
      const npc = world.npcs[i];
      npc.age += 1;
      if ((npc.isChild || npc.profession === 'child') && npc.age >= 14) {
        const inherited = inheritProfessionFromParents(world, npc, i);
        const work = world.buildings.find((b) => b.id === inherited.workBuildingId) ?? world.buildings[0];
        const nextProf = inherited.profession;
        npc.isChild = false;
        npc.profession = nextProf;
        npc.workBuildingId = work.id;
        npc.activity = nextProf === 'guard' || nextProf === 'soldier' ? 'patrolling' : 'commuting';
        npc.hp = nextProf === 'guard' || nextProf === 'soldier' ? 105 : Math.max(npc.hp, 75);
        npc.maxHp = nextProf === 'guard' || nextProf === 'soldier' ? 105 : 75;
        npc.personality = inherited.inheritedFrom
          ? `Apprenticed in ${inherited.inheritedFrom}'s craft`
          : 'Grown village artisan';
        npc.speechLine = inherited.inheritedFrom
          ? `Taking up ${inherited.inheritedFrom}'s trade at ${work.name}!`
          : `Now of age to work at ${work.name}!`;
        npc.speechTimer = 4.0;
        addKingdomEvent(
          world,
          'Youth Came of Age',
          inherited.inheritedFrom
            ? `${npc.name} turned ${npc.age} and inherited ${inherited.inheritedFrom}'s trade as ${nextProf}.`
            : `${npc.name} reached age ${npc.age} and joined ${work.name} as ${nextProf}.`,
          'economy',
        );
      }
    }
  }

  // Natural HP regen for king & citizens if fed; starvation drains HP
  if (world.resources.food > 0) {
    world.king.hp = Math.min(world.king.maxHp, world.king.hp + 20);
    for (const npc of world.npcs) {
      npc.hp = Math.min(npc.maxHp, npc.hp + 15);
      if (world.taxRate === 'low') npc.happiness = Math.min(100, npc.happiness + 2);
      if (world.taxRate === 'high') npc.happiness = Math.max(10, npc.happiness - 4);
    }
  } else {
    for (const npc of world.npcs) {
      npc.hp = Math.max(10, npc.hp - 14);
      npc.happiness = Math.max(10, npc.happiness - 10);
      npc.loyalty = Math.max(10, npc.loyalty - 8);
    }
    addKingdomEvent(world, 'Granaries Empty', 'Food shortage! Build Wheat Estates or Bakeries.', 'warning');
  }

  world.popularity = computeRealmPopularity(world);
  addKingdomEvent(
    world,
    `Day ${world.day} · ${world.season}`,
    `Tax +${taxGold}g, Trade +${prodGold}g, Food ${prodFood - foodConsumed >= 0 ? '+' : ''}${prodFood - foodConsumed}.`,
    'economy',
  );
}

function stepNpcs(world: WorldState, dt: number, events: SimulationStepEvents): void {
  const isNight = world.timeOfDay < 0.2 || world.timeOfDay > 0.86;
  const activeConstruction = world.buildings.find((b) => !b.completed);
  const aliveBandits = world.bandits.filter((b) => b.state !== 'ko');

  for (let i = 0; i < world.npcs.length; i++) {
    const npc = world.npcs[i];
    if (npc.speechTimer > 0) npc.speechTimer = Math.max(0, npc.speechTimer - dt);
    if (npc.attackCooldown > 0) npc.attackCooldown = Math.max(0, npc.attackCooldown - dt);
    if (npc.swingTimer > 0) npc.swingTimer = Math.max(0, npc.swingTimer - dt);
    if (npc.hitFlashTimer > 0) npc.hitFlashTimer = Math.max(0, npc.hitFlashTimer - dt);

    const isMilitary =
      npc.profession === 'guard' || npc.profession === 'soldier' || npc.profession === 'commander';
    const isChild = Boolean(npc.isChild || npc.profession === 'child');

    // Check nearby enemy engagement for military or adult self-defense (children flee indoors)
    let nearestBandit: BanditUnit | null = null;
    let nearestBanditDist = Infinity;
    for (const b of aliveBandits) {
      const d = Math.hypot(b.x - npc.x, b.z - npc.z);
      if (d < nearestBanditDist) {
        nearestBanditDist = d;
        nearestBandit = b;
      }
    }

    const aggroRange = isMilitary ? 16 : isChild ? 0 : 6;
    if (nearestBandit && !isChild && (nearestBanditDist < aggroRange || npc.order === 'attack_bandits')) {
      npc.activity = 'fighting';
      npc.targetX = nearestBandit.x;
      npc.targetZ = nearestBandit.z;

      if (nearestBanditDist <= 2.1) {
        npc.vx = 0;
        npc.vz = 0;
        npc.facing = Math.atan2(nearestBandit.x - npc.x, nearestBandit.z - npc.z);
        if (npc.attackCooldown <= 0) {
          npc.attackCooldown = 1.05;
          npc.swingTimer = 0.3;
          const smithyBonus = world.buildings.filter((b) => b.completed && b.type === 'blacksmith').length * 4;
          const dmg = isMilitary ? 16 + smithyBonus : 6;
          nearestBandit.hp -= dmg;
          nearestBandit.hitFlashTimer = 0.08;
          events.combatHits.push({ x: nearestBandit.x, z: nearestBandit.z, heavy: isMilitary });
          if (nearestBandit.hp <= 0) {
            nearestBandit.hp = 0;
            nearestBandit.state = 'ko';
            nearestBandit.koTimer = 0.55;
            world.banditsDefeated += 1;
            world.resources.gold += 14;
            world.king.renown += 5;
            events.banditsKo.push({ x: nearestBandit.x, z: nearestBandit.z });
            addKingdomEvent(
              world,
              'Garrison Victory',
              `${npc.name} defeated ${nearestBandit.name}!`,
              'military',
            );
          }
        }
        continue;
      }
    } else if (npc.order === 'follow_king') {
      npc.activity = 'following_king';
      const angle = (i * 1.4) % (Math.PI * 2);
      npc.targetX = world.king.x + Math.cos(angle) * 3.2;
      npc.targetZ = world.king.z + Math.sin(angle) * 3.2;
    } else if (npc.order === 'guard_post') {
      npc.activity = 'guarding';
      npc.targetX = npc.guardX;
      npc.targetZ = npc.guardZ;
    } else if (activeConstruction && !isChild && (npc.profession === 'builder' || npc.order === 'assist_construction')) {
      npc.activity = 'building';
      npc.targetX = activeConstruction.x + Math.cos(i) * 2.6;
      npc.targetZ = activeConstruction.z + Math.sin(i) * 2.6;
    } else if (isNight && !isMilitary && npc.order === 'resume_duty') {
      npc.activity = 'sleeping';
      const home = world.buildings.find((b) => b.id === npc.homeBuildingId) ?? world.buildings[0];
      npc.targetX = home.x;
      npc.targetZ = home.z + 2.2;
    } else if (
      world.weather === 'rainy' &&
      !isMilitary &&
      npc.profession !== 'chancellor' &&
      npc.order === 'resume_duty'
    ) {
      // Rain drives uncommanded civilians and children to shelter at tavern or their home cottage
      npc.activity = 'sheltering';
      const home = world.buildings.find((b) => b.id === npc.homeBuildingId) ?? world.buildings[0];
      const tavern = !isChild ? world.buildings.find((b) => b.type === 'tavern' && b.completed) : undefined;
      const shelter = tavern ?? home;
      npc.targetX = shelter.x + ((i % 3) - 1) * 1.1;
      npc.targetZ = shelter.z + 2.1;
    } else if (isChild && npc.order === 'resume_duty') {
      // Children joyfully play around the Village Square well, meadows, and their family home!
      npc.activity = 'playing';
      const home = world.buildings.find((b) => b.id === npc.homeBuildingId) ?? world.buildings[0];
      const playSpots = [
        { x: -3.2, z: 8.5 },
        { x: 3.4, z: 7.2 },
        { x: home.x + 2.0, z: home.z + 3.2 },
        { x: 0.5, z: 11.2 },
      ];
      const spot = playSpots[(Math.floor(world.dayAccumulator * 0.24) + i) % playSpots.length];
      npc.targetX = spot.x;
      npc.targetZ = spot.z;
    } else {
      // Normal daytime duty
      if (isMilitary) {
        npc.activity = 'patrolling';
        const patrolWaypoints =
          world.weather === 'foggy'
            ? [
                { x: -2, z: -13 },
                { x: 2.5, z: -11 },
                { x: 3.5, z: 2.5 },
                { x: -3.5, z: 3 },
              ]
            : [
                { x: -3, z: -23 },
                { x: 4, z: -15 },
                { x: 5, z: 3 },
                { x: -5, z: 4 },
              ];
        const wp = patrolWaypoints[(Math.floor(world.dayAccumulator * 0.12) + i) % patrolWaypoints.length];
        npc.targetX = wp.x + (i % 3) * 1.2;
        npc.targetZ = wp.z;
      } else if (npc.profession === 'chancellor') {
        npc.activity = 'working';
        npc.targetX = -3.2;
        npc.targetZ = -9.5;
      } else if (
        world.popularity < 38 &&
        !isMilitary &&
        !isChild &&
        npc.order === 'resume_duty' &&
        i % 4 === 0
      ) {
        // Citizen protest petition at Village Square well when Popularity drops
        npc.activity = 'protesting';
        const angle = i * 0.85;
        npc.targetX = VILLAGE_SQUARE_POS.x + Math.cos(angle) * 3.8;
        npc.targetZ = VILLAGE_SQUARE_POS.z + Math.sin(angle) * 3.8;
        if (npc.speechTimer <= 0) {
          npc.speechLine =
            world.taxRate === 'high'
              ? 'Taxes are crushing us, Sire!'
              : 'Hear our petition at the square, Your Majesty!';
          npc.speechTimer = 5.5;
        }
      } else {
        const work = world.buildings.find((b) => b.id === npc.workBuildingId) ?? world.buildings[0];
        const market = world.buildings.find((b) => b.type === 'market' && b.completed);
        // Visit market mid-afternoon (skipped in fog/rain)
        if (
          market &&
          world.weather === 'sunny' &&
          world.timeOfDay > 0.62 &&
          world.timeOfDay < 0.74 &&
          npc.profession !== 'merchant'
        ) {
          npc.activity = 'visiting_market';
          npc.targetX = market.x + ((i % 3) - 1) * 2.2;
          npc.targetZ = market.z + 2.5;
        } else {
          npc.activity = 'working';
          const offsetAngle = i * 1.7;
          npc.targetX = work.x + Math.cos(offsetAngle) * 2.8;
          npc.targetZ = work.z + Math.sin(offsetAngle) * 2.8;
        }
      }
    }

    // Move NPC smoothly toward target (scaled by global weather speed multiplier)
    const dx = npc.targetX - npc.x;
    const dz = npc.targetZ - npc.z;
    const dist = Math.hypot(dx, dz);
    const weatherMult = getWeatherSpeedMultiplier(world.weather);
    const baseNpcSpeed =
      npc.activity === 'following_king' || npc.activity === 'fighting'
        ? 4.4
        : npc.activity === 'playing'
          ? 3.1
          : 2.8;
    const speed = baseNpcSpeed * weatherMult;

    if (dist > 0.55) {
      npc.vx = (dx / dist) * speed;
      npc.vz = (dz / dist) * speed;
      const next = clampToPlayableWorld(npc.x + npc.vx * dt, npc.z + npc.vz * dt);
      npc.x = next.x;
      npc.z = next.z;
      npc.facing = Math.atan2(npc.vx, npc.vz);
    } else {
      npc.vx = 0;
      npc.vz = 0;
      // Active workplace tool animation (woodchop, mining, blacksmithing, farming, baking)
      if (npc.activity === 'working' && !isChild && !isMilitary && npc.profession !== 'chancellor') {
        const workBld = world.buildings.find((b) => b.id === npc.workBuildingId);
        if (workBld) {
          npc.facing = Math.atan2(workBld.x - npc.x, workBld.z - npc.z);
        }
        if (
          npc.profession === 'woodcutter' ||
          npc.profession === 'miner' ||
          npc.profession === 'blacksmith' ||
          npc.profession === 'farmer' ||
          npc.profession === 'baker'
        ) {
          npc.swingTimer = Math.sin(world.dayAccumulator * 4.5 + i) > 0.65 ? 0.16 : 0;
        }
      }
      // Perform building construction progress when at active construction site!
      if (npc.activity === 'building' && activeConstruction && !activeConstruction.completed) {
        npc.swingTimer = Math.sin(world.dayAccumulator * 6) > 0.5 ? 0.15 : 0;
        const spec = BUILDING_SPECS[activeConstruction.type];
        const workWeatherMult = world.weather === 'sunny' ? 1.0 : world.weather === 'rainy' ? 0.75 : 0.72;
        activeConstruction.progress = Math.min(
          1,
          activeConstruction.progress + (dt * workWeatherMult) / spec.buildWorkRequired,
        );
        if (activeConstruction.progress >= 1 && !activeConstruction.completed) {
          activeConstruction.completed = true;
          activeConstruction.progress = 1;
          world.buildingsConstructed += 1;
          world.king.renown += 12;
          events.completedBuildings.push(activeConstruction.name);
          assignWorkerToCompletedBuilding(world, activeConstruction, events);
          addKingdomEvent(
            world,
            `${activeConstruction.name} Completed`,
            `${npc.name} finished building ${activeConstruction.name}!`,
            'economy',
          );
          if (npc.order === 'assist_construction') {
            npc.order = 'resume_duty';
          }
        }
      }
    }
  }
}

function stepBandits(world: WorldState, dt: number, events: SimulationStepEvents): void {
  for (const bandit of world.bandits) {
    if (bandit.hitFlashTimer > 0) bandit.hitFlashTimer = Math.max(0, bandit.hitFlashTimer - dt);
    if (bandit.attackCooldown > 0) bandit.attackCooldown = Math.max(0, bandit.attackCooldown - dt);

    if (bandit.state === 'ko') {
      bandit.koTimer -= dt;
      continue;
    }

    // Find closest target (King or nearby NPC)
    let targetX = bandit.homeX;
    let targetZ = bandit.homeZ;
    let targetKind: 'none' | 'king' | 'npc' = 'none';
    let targetNpc: NpcState | null = null;
    let minTargetDist = Infinity;

    const kingDist = Math.hypot(world.king.x - bandit.x, world.king.z - bandit.z);
    if (kingDist < 17 || (bandit.state === 'raiding' && kingDist < 34)) {
      minTargetDist = kingDist;
      targetX = world.king.x;
      targetZ = world.king.z;
      targetKind = 'king';
    }

    for (const npc of world.npcs) {
      const d = Math.hypot(npc.x - bandit.x, npc.z - bandit.z);
      const detectR = bandit.state === 'raiding' ? 28 : 15;
      if (d < detectR && d < minTargetDist) {
        minTargetDist = d;
        targetX = npc.x;
        targetZ = npc.z;
        targetKind = 'npc';
        targetNpc = npc;
      }
    }

    // If raiding and no target nearby, march toward North Gate
    if (bandit.state === 'raiding' && targetKind === 'none') {
      targetX = NORTH_GATE_POS.x;
      targetZ = NORTH_GATE_POS.z;
    }

    // Check bandit raiding loaded resource carts if unguarded
    if (bandit.state === 'raiding' && Array.isArray(world.carts)) {
      for (const cart of world.carts) {
        if (cart.returning || (cart.raidedCooldown ?? 0) > 0) continue;
        if (Math.hypot(cart.x - bandit.x, cart.z - bandit.z) < 3.1) {
          const kingNear = Math.hypot(world.king.x - cart.x, world.king.z - cart.z) < 5.5;
          const guardNear = world.npcs.some(
            (n) =>
              (n.profession === 'guard' || n.profession === 'soldier' || n.profession === 'commander') &&
              Math.hypot(n.x - cart.x, n.z - cart.z) < 5.5,
          );
          if (!kingNear && !guardNear) {
            cart.returning = true;
            cart.raidedCooldown = 14;
            events.cartRaided = true;
            events.combatHits.push({ x: cart.x, z: cart.z, heavy: false });
            addKingdomEvent(
              world,
              'Supply Wagon Ambushed',
              `${bandit.name} looted an unguarded ${cart.cargoType.replace('_', ' ')} wagon!`,
              'warning',
            );
            break;
          }
        }
      }
    }

    // Telegraph windup state before hitting!
    if (bandit.state === 'windup') {
      bandit.vx = 0;
      bandit.vz = 0;
      bandit.windupTimer -= dt;
      if (bandit.windupTimer <= 0) {
        bandit.state = bandit.homeZ < -45 && minTargetDist > 20 ? 'camp_idle' : 'raiding';
        bandit.attackCooldown = 1.35;
        if (targetKind === 'king' && Math.hypot(world.king.x - bandit.x, world.king.z - bandit.z) <= 2.6) {
          if (world.king.blocking && world.king.stamina >= 6) {
            const mitigated = Math.max(2, Math.round(bandit.damage * 0.25));
            world.king.hp = Math.max(0, world.king.hp - mitigated);
            world.king.stamina = Math.max(0, world.king.stamina - 6);
            bandit.attackCooldown = 2.0;
            events.blockedHit = true;
            events.combatHits.push({ x: world.king.x, z: world.king.z, heavy: false });
          } else {
            world.king.hp = Math.max(0, world.king.hp - bandit.damage);
            world.king.hitFlashTimer = 0.1;
            events.kingHurt = true;
            events.combatHits.push({ x: world.king.x, z: world.king.z, heavy: true });
          }
        } else if (targetNpc && Math.hypot(targetNpc.x - bandit.x, targetNpc.z - bandit.z) <= 2.6) {
          targetNpc.hp = Math.max(15, targetNpc.hp - bandit.damage); // Citizens get wounded & retreat rather than permanently soft-locking early
          targetNpc.hitFlashTimer = 0.1;
          events.combatHits.push({ x: targetNpc.x, z: targetNpc.z, heavy: false });
        }
      }
      continue;
    }

    if (targetKind !== 'none' && minTargetDist <= 2.2 && bandit.attackCooldown <= 0) {
      bandit.state = 'windup';
      bandit.windupTimer = 0.42; // Visible 420ms telegraph windup!
      bandit.facing = Math.atan2(targetX - bandit.x, targetZ - bandit.z);
      continue;
    }

    const dx = targetX - bandit.x;
    const dz = targetZ - bandit.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.8) {
      const effectiveSpeed = bandit.speed * getWeatherSpeedMultiplier(world.weather);
      bandit.vx = (dx / dist) * effectiveSpeed;
      bandit.vz = (dz / dist) * effectiveSpeed;
      bandit.x += bandit.vx * dt;
      bandit.z += bandit.vz * dt;
      bandit.facing = Math.atan2(bandit.vx, bandit.vz);
    } else {
      bandit.vx = 0;
      bandit.vz = 0;
      if (bandit.state === 'raiding' && targetKind === 'none') {
        bandit.state = 'camp_idle';
      }
    }
  }
}

export function getSnapshot(world: WorldState): GameSnapshot {
  const soldiersCount = world.npcs.filter(
    (n) => n.profession === 'guard' || n.profession === 'soldier' || n.profession === 'commander',
  ).length;
  const demo = calculateDemographicRates(world);

  return {
    day: world.day,
    timeOfDay: world.timeOfDay,
    season: world.season,
    weather: world.weather,
    weatherSpeedMultiplier: getWeatherSpeedMultiplier(world.weather),
    resources: { ...world.resources },
    population: world.npcs.length,
    populationCap: world.populationCap,
    popularity: world.popularity,
    birthRatePerDay: demo.birthRatePerDay,
    deathRatePerDay: demo.deathRatePerDay,
    totalBirths: world.totalBirths,
    totalDeaths: world.totalDeaths,
    rationLevel: world.rationLevel,
    soldiersCount,
    banditsRemaining: world.bandits.filter((b) => b.state !== 'ko').length,
    averageLoyalty: world.averageLoyalty,
    averageHappiness: world.averageHappiness,
    taxRate: world.taxRate,
    squadOrder: world.squadOrder,
    kingHp: Math.round(world.king.hp),
    kingMaxHp: world.king.maxHp,
    kingStamina: Math.round(world.king.stamina),
    kingMaxStamina: world.king.maxStamina,
    kingMounted: world.king.mounted,
    kingRenown: world.king.renown,
    kingWeapon: world.king.weapon ?? 'broadsword',
    kingBlocking: Boolean(world.king.blocking),
    banditsDefeated: world.banditsDefeated,
    buildingsConstructed: world.buildingsConstructed,
    ordersIssued: world.ordersIssued,
    outcome: world.outcome,
    outcomeReason: world.outcomeReason,
  };
}

export function serializeWorld(world: WorldState): string {
  return JSON.stringify(world);
}

export function deserializeWorld(raw: string): WorldState | null {
  try {
    const parsed = JSON.parse(raw) as WorldState;
    if (!parsed || typeof parsed.day !== 'number' || !parsed.king || !Array.isArray(parsed.buildings)) {
      return null;
    }
    const rawWeather = parsed.weather as string;
    if (rawWeather === 'clear') parsed.weather = 'sunny';
    else if (rawWeather === 'rain') parsed.weather = 'rainy';
    else if (rawWeather === 'overcast') parsed.weather = 'foggy';
    else if (rawWeather !== 'sunny' && rawWeather !== 'rainy' && rawWeather !== 'foggy') {
      parsed.weather = 'sunny';
    }
    if (typeof parsed.weatherTimer !== 'number') {
      parsed.weatherTimer = WEATHER_CYCLE_DURATION;
    }
    if (parsed.rationLevel !== 'half' && parsed.rationLevel !== 'normal' && parsed.rationLevel !== 'extra') {
      parsed.rationLevel = 'normal';
    }
    if (typeof parsed.immigrationTimer !== 'number') parsed.immigrationTimer = 12;
    if (typeof parsed.emigrationTimer !== 'number') parsed.emigrationTimer = 20;
    if (typeof parsed.birthProgress !== 'number') parsed.birthProgress = 0;
    if (typeof parsed.deathProgress !== 'number') parsed.deathProgress = 0;
    if (typeof parsed.totalBirths !== 'number') parsed.totalBirths = 0;
    if (typeof parsed.totalDeaths !== 'number') parsed.totalDeaths = 0;
    if (typeof parsed.totalMarriages !== 'number') parsed.totalMarriages = 0;
    if (typeof parsed.marriageTimer !== 'number') parsed.marriageTimer = 18;
    if (!parsed.king.weapon) parsed.king.weapon = 'broadsword';
    if (typeof parsed.king.blocking !== 'boolean') parsed.king.blocking = false;
    if (!Array.isArray(parsed.completedQuests)) parsed.completedQuests = [];
    if (Array.isArray(parsed.npcs)) {
      parsed.npcs.forEach((n, idx) => {
        if (!Array.isArray(n.traits) || n.traits.length === 0) {
          n.traits = [TRAIT_BY_PROFESSION[n.profession] ?? ALL_NPC_TRAITS[idx % ALL_NPC_TRAITS.length]];
        }
        if (!Array.isArray(n.childrenIds)) {
          n.childrenIds = [];
        }
      });
    }
    if (!Array.isArray(parsed.carts)) {
      parsed.carts = [];
    }
    syncLogisticsCarts(parsed, parsed.carts.length === 0);
    parsed.popularity = computeRealmPopularity(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function getTimeLabel(timeOfDay: number): string {
  const hour = Math.floor(timeOfDay * 24);
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Dusk';
  return 'Night';
}

export function getClosestNpc(world: WorldState, maxDistance = 4.2): NpcState | null {
  let best: NpcState | null = null;
  let bestDist = maxDistance;
  for (const npc of world.npcs) {
    const d = Math.hypot(npc.x - world.king.x, npc.z - world.king.z);
    if (d < bestDist) {
      bestDist = d;
      best = npc;
    }
  }
  return best;
}

export function getClosestBuilding(world: WorldState, maxDistance = 8.4): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDist = maxDistance;
  for (const b of world.buildings) {
    const d = Math.hypot(b.x - world.king.x, b.z - world.king.z);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

export function getClosestCart(world: WorldState, maxDistance = 5.2): ResourceCartState | null {
  let best: ResourceCartState | null = null;
  let bestDist = maxDistance;
  for (const cart of world.carts ?? []) {
    const d = Math.hypot(cart.x - world.king.x, cart.z - world.king.z);
    if (d < bestDist) {
      bestDist = d;
      best = cart;
    }
  }
  return best;
}

export function getAdvisorReport(world: WorldState): Array<{ advisor: string; role: string; advice: string }> {
  const incomplete = world.buildings.filter((b) => !b.completed);
  const foodNeed = world.npcs.length * 1.3;
  const farms = world.buildings.filter((b) => b.type === 'farm' && b.completed).length;

  return [
    {
      advisor: 'Chancellor Rowan',
      role: 'Royal Chancellor',
      advice:
        world.npcs.length >= world.populationCap
          ? 'Housing is at capacity, Sire. Raise a Timber Cottage to welcome new settlers.'
          : `Valdoria holds ${world.npcs.length}/${world.populationCap} souls with ${world.averageLoyalty}% loyalty.`,
    },
    {
      advisor: 'Commander Thorne',
      role: 'Military Commander',
      advice:
        world.bandits.length > 0
          ? `${world.bandits.length} Ashwood marauders remain in the northern timberline. Rally the garrison when ready.`
          : 'The northern woods are cleared of brigands! Our borders stand secure.',
    },
    {
      advisor: 'Aldric of Sunmeadow',
      role: 'Steward of Provisions',
      advice:
        world.resources.food < 45 || farms < 2
          ? `Our folk consume ~${Math.round(foodNeed)} food daily. A second Wheat Farmstead is wise before winter.`
          : 'Granaries are well-stocked for the coming days.',
    },
    {
      advisor: 'Master Builder Cedric',
      role: 'Master Builder',
      advice:
        incomplete.length > 0
          ? `Currently raising ${incomplete[0].name} (${Math.round(incomplete[0].progress * 100)}% complete).`
          : 'All blueprints are built. Select Build [B] to expand the realm.',
    },
  ];
}

export function getVillageLandmarkPos(key: 'square' | 'keep' | 'gate' | 'camp'): { x: number; z: number } {
  if (key === 'keep') return { x: 0, z: -18 };
  if (key === 'gate') return NORTH_GATE_POS;
  if (key === 'camp') return BANDIT_CAMP_POS;
  return VILLAGE_SQUARE_POS;
}
