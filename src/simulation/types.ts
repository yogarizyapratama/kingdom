export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type TaxRate = 'low' | 'normal' | 'high';

export type RationLevel = 'half' | 'normal' | 'extra';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type WeatherCondition = 'sunny' | 'rainy' | 'foggy';

export type CartCargoType = 'grain' | 'timber' | 'stone' | 'bread' | 'iron_arms' | 'trade_goods';

export type Profession =
  | 'farmer'
  | 'woodcutter'
  | 'builder'
  | 'merchant'
  | 'baker'
  | 'blacksmith'
  | 'miner'
  | 'child'
  | 'guard'
  | 'soldier'
  | 'commander'
  | 'chancellor';

export type NpcTrait =
  | 'Industrious'
  | 'Stalwart'
  | 'Charismatic'
  | 'Green-Thumb'
  | 'Crafty'
  | 'Brave'
  | 'Nimble'
  | 'Scholarly';

export type NpcActivity =
  | 'sleeping'
  | 'commuting'
  | 'working'
  | 'building'
  | 'playing'
  | 'patrolling'
  | 'following_king'
  | 'guarding'
  | 'marching'
  | 'fighting'
  | 'visiting_market'
  | 'protesting'
  | 'sheltering'
  | 'resting';

export type NpcOrderType =
  | 'resume_duty'
  | 'follow_king'
  | 'guard_post'
  | 'work_farm'
  | 'gather_wood'
  | 'assist_construction'
  | 'patrol_village'
  | 'attack_bandits';

export type BuildingType =
  | 'keep'
  | 'cottage'
  | 'farm'
  | 'granary'
  | 'bakery'
  | 'lumber_camp'
  | 'quarry'
  | 'blacksmith'
  | 'market'
  | 'barracks'
  | 'watchtower'
  | 'stone_wall'
  | 'tavern';

export type BuildingCategory = 'royal' | 'residential' | 'economic' | 'military';

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  category: BuildingCategory;
  roleSummary: string;
  costGold: number;
  costWood: number;
  costStone: number;
  buildWorkRequired: number;
  footprintRadius: number;
  housingBonus: number;
  dailyFood: number;
  dailyWood: number;
  dailyStone: number;
  dailyGold: number;
  buildable: boolean;
}

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  name: string;
  x: number;
  z: number;
  rotationY: number;
  progress: number; // 0..1 (1 = complete)
  completed: boolean;
  level: number;
  assignedWorkers: number;
}

export interface NpcState {
  id: string;
  name: string;
  age: number;
  familyName?: string;
  isChild?: boolean;
  traits: NpcTrait[];
  spouseId?: string;
  parentIds?: string[];
  childrenIds: string[];
  profession: Profession;
  personality: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  targetX: number;
  targetZ: number;
  homeBuildingId: string;
  workBuildingId: string;
  activity: NpcActivity;
  order: NpcOrderType;
  guardX: number;
  guardZ: number;
  hp: number;
  maxHp: number;
  loyalty: number; // 0..100
  happiness: number; // 0..100
  wealth: number;
  attackCooldown: number;
  swingTimer: number;
  hitFlashTimer: number;
  carryResource: 'none' | 'grain' | 'timber' | 'stone';
  complaint: string;
  speechLine: string;
  speechTimer: number;
}

export interface BanditUnit {
  id: string;
  name: string;
  archetype: 'raider' | 'archer_skirmisher' | 'chieftain';
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackCooldown: number;
  windupTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  homeX: number;
  homeZ: number;
  state: 'camp_idle' | 'raiding' | 'windup' | 'recover' | 'ko';
}

export interface ResourceStock {
  gold: number;
  wood: number;
  stone: number;
  food: number;
  iron: number;
}

export interface DiplomaticFaction {
  id: string;
  name: string;
  ruler: string;
  relation: number; // -100..100
  status: 'allied' | 'trade_pact' | 'neutral' | 'hostile' | 'war';
  strength: number;
  territoryLabel: string;
  mapX: number;
  mapY: number;
  summary: string;
}

export interface KingdomEvent {
  id: string;
  day: number;
  title: string;
  detail: string;
  tone: 'royal' | 'economy' | 'military' | 'warning';
}

export type KingWeaponType = 'broadsword' | 'waraxe' | 'royal_halberd';

export interface KingState {
  x: number;
  z: number;
  y: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mounted: boolean;
  renown: number;
  weapon?: KingWeaponType;
  blocking?: boolean;
  attackTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  grounded: boolean;
}

export type SquadOrder = 'patrol' | 'follow_king' | 'guard_gate' | 'raid_camp';

export interface ResourceCartState {
  id: string;
  cargoType: CartCargoType;
  amount: number;
  originBuildingId: string;
  destinationBuildingId: string;
  x: number;
  z: number;
  facing: number;
  speed: number;
  progress: number; // 0..1 along current leg
  returning: boolean;
  isCaravan?: boolean;
  factionId?: string;
  originX?: number;
  originZ?: number;
  destX?: number;
  destZ?: number;
  raidedCooldown?: number;
}

export interface WorldState {
  day: number;
  timeOfDay: number; // 0..1 (0.25 = dawn, 0.5 = noon, 0.75 = dusk)
  season: Season;
  weather: WeatherCondition;
  weatherTimer: number;
  taxRate: TaxRate;
  rationLevel: RationLevel;
  popularity: number;
  immigrationTimer: number;
  emigrationTimer: number;
  birthProgress: number;
  deathProgress: number;
  totalBirths: number;
  totalDeaths: number;
  totalMarriages: number;
  marriageTimer: number;
  feastBuffDays: number;
  forestryDriveDays: number;
  militiaMustered: boolean;
  resources: ResourceStock;
  populationCap: number;
  averageLoyalty: number;
  averageHappiness: number;
  king: KingState;
  buildings: BuildingInstance[];
  npcs: NpcState[];
  bandits: BanditUnit[];
  carts: ResourceCartState[];
  factions: DiplomaticFaction[];
  events: KingdomEvent[];
  squadOrder: SquadOrder;
  banditsDefeated: number;
  buildingsConstructed: number;
  ordersIssued: number;
  completedQuests?: string[];
  outcome: 'ongoing' | 'victory' | 'defeat';
  outcomeReason: string;
  lastDailyTickDay: number;
  raidCooldownTimer: number;
  dayAccumulator: number;
}

export interface GameSnapshot {
  day: number;
  timeOfDay: number;
  season: Season;
  weather: WeatherCondition;
  weatherSpeedMultiplier: number;
  resources: ResourceStock;
  population: number;
  populationCap: number;
  popularity: number;
  birthRatePerDay: number;
  deathRatePerDay: number;
  totalBirths: number;
  totalDeaths: number;
  rationLevel: RationLevel;
  soldiersCount: number;
  banditsRemaining: number;
  averageLoyalty: number;
  averageHappiness: number;
  taxRate: TaxRate;
  squadOrder: SquadOrder;
  kingHp: number;
  kingMaxHp: number;
  kingStamina: number;
  kingMaxStamina: number;
  kingMounted: boolean;
  kingRenown: number;
  kingWeapon: KingWeaponType;
  kingBlocking: boolean;
  banditsDefeated: number;
  buildingsConstructed: number;
  ordersIssued: number;
  outcome: 'ongoing' | 'victory' | 'defeat';
  outcomeReason: string;
}

export interface DemographicMetrics {
  birthRatePerDay: number;
  deathRatePerDay: number;
  netGrowthPerDay: number;
  foodDaysReserve: number;
  housingOccupancy: number;
  totalBirths: number;
  totalDeaths: number;
  familiesCount: number;
  childrenCount: number;
  eldersCount: number;
}
