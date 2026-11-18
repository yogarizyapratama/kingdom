import { FAMILY_SURNAMES } from './constants';
import {
  BuildingInstance,
  BuildingType,
  NpcState,
  NpcTrait,
  Profession,
  WorldState,
} from './types';

export const ALL_NPC_TRAITS: NpcTrait[] = [
  'Industrious',
  'Stalwart',
  'Charismatic',
  'Green-Thumb',
  'Crafty',
  'Brave',
  'Nimble',
  'Scholarly',
];

export const TRAIT_BY_PROFESSION: Partial<Record<Profession, NpcTrait>> = {
  farmer: 'Green-Thumb',
  woodcutter: 'Stalwart',
  builder: 'Crafty',
  merchant: 'Charismatic',
  baker: 'Industrious',
  blacksmith: 'Crafty',
  miner: 'Stalwart',
  guard: 'Brave',
  soldier: 'Brave',
  commander: 'Brave',
  chancellor: 'Scholarly',
  child: 'Nimble',
};

const WORKPLACE_TYPES_FOR_PROFESSION: Partial<Record<Profession, BuildingType[]>> = {
  farmer: ['farm', 'granary'],
  woodcutter: ['lumber_camp'],
  builder: ['quarry', 'keep'],
  merchant: ['market', 'tavern'],
  baker: ['bakery', 'granary'],
  blacksmith: ['blacksmith'],
  miner: ['quarry'],
  guard: ['watchtower', 'barracks'],
  soldier: ['barracks', 'watchtower'],
};

const FALLBACK_PROFESSION_FOR_BUILDING: Partial<Record<BuildingType, Profession>> = {
  farm: 'farmer',
  bakery: 'baker',
  lumber_camp: 'woodcutter',
  quarry: 'miner',
  blacksmith: 'blacksmith',
  market: 'merchant',
  tavern: 'merchant',
  barracks: 'soldier',
  watchtower: 'guard',
  granary: 'farmer',
};

export function inheritTraitsFromParents(
  parentA?: NpcState,
  parentB?: NpcState,
  seed = 0,
): NpcTrait[] {
  const result: NpcTrait[] = [];
  const aTraits = parentA?.traits ?? [];
  const bTraits = parentB?.traits ?? [];

  if (aTraits.length > 0) {
    result.push(aTraits[seed % aTraits.length]);
  }
  if (bTraits.length > 0) {
    const candidate = bTraits[(seed + 1) % bTraits.length];
    if (!result.includes(candidate)) {
      result.push(candidate);
    }
  }
  if (result.length === 0) {
    result.push(ALL_NPC_TRAITS[seed % ALL_NPC_TRAITS.length]);
  }
  if (result.length === 1 && (aTraits.length > 1 || bTraits.length > 1)) {
    const combined = [...aTraits, ...bTraits];
    const extra = combined.find((t) => !result.includes(t));
    if (extra) result.push(extra);
  }
  return result.slice(0, 2);
}

export function inheritProfessionFromParents(
  world: WorldState,
  child: NpcState,
  fallbackIndex = 0,
): {
  profession: Profession;
  workBuildingId: string;
  inheritedFrom?: string;
} {
  const parents = (child.parentIds ?? [])
    .map((pid) => world.npcs.find((n) => n.id === pid))
    .filter((n): n is NpcState => Boolean(n && !n.isChild && n.profession !== 'child'));

  // Also allow inheriting from an older adult member of the same house if parents died/left
  const householdAdults =
    parents.length > 0
      ? parents
      : world.npcs.filter(
          (n) =>
            !n.isChild &&
            n.profession !== 'child' &&
            n.familyName &&
            n.familyName === child.familyName,
        );

  const inheritableParents = householdAdults.filter(
    (p) => p.profession !== 'chancellor' && p.profession !== 'commander',
  );

  if (inheritableParents.length > 0) {
    const chosenParent = inheritableParents[(child.age + fallbackIndex) % inheritableParents.length];
    const desiredTypes = WORKPLACE_TYPES_FOR_PROFESSION[chosenParent.profession] ?? [];
    const matchedWork =
      world.buildings.find((b) => b.id === chosenParent.workBuildingId && b.completed) ??
      world.buildings.find((b) => b.completed && desiredTypes.includes(b.type)) ??
      world.buildings[0];

    return {
      profession: chosenParent.profession,
      workBuildingId: matchedWork.id,
      inheritedFrom: chosenParent.name,
    };
  }

  const workplaces = world.buildings.filter(
    (b) =>
      b.completed &&
      (b.type === 'farm' ||
        b.type === 'bakery' ||
        b.type === 'lumber_camp' ||
        b.type === 'quarry' ||
        b.type === 'blacksmith' ||
        b.type === 'market' ||
        b.type === 'barracks'),
  );
  const work = workplaces[fallbackIndex % Math.max(1, workplaces.length)] ?? world.buildings[0];
  const profession = FALLBACK_PROFESSION_FOR_BUILDING[work.type] ?? 'farmer';

  return {
    profession,
    workBuildingId: work.id,
  };
}

function shareParentOrSelf(a: NpcState, b: NpcState): boolean {
  if (a.id === b.id) return true;
  if (a.parentIds?.includes(b.id) || b.parentIds?.includes(a.id)) return true;
  if (a.parentIds && b.parentIds) {
    for (const pid of a.parentIds) {
      if (b.parentIds.includes(pid)) return true;
    }
  }
  return false;
}

export function findEligibleMarriagePair(world: WorldState): [NpcState, NpcState] | null {
  const singles = world.npcs.filter(
    (n) =>
      !n.isChild &&
      n.profession !== 'child' &&
      !n.spouseId &&
      n.age >= 18 &&
      n.age <= 58 &&
      n.profession !== 'chancellor',
  );
  if (singles.length < 2) return null;

  for (let i = 0; i < singles.length; i++) {
    const a = singles[i];
    for (let j = i + 1; j < singles.length; j++) {
      const b = singles[j];
      if (shareParentOrSelf(a, b)) continue;
      if (a.familyName && b.familyName && a.familyName === b.familyName) continue;
      return [a, b];
    }
  }
  return null;
}

export function marryCitizens(
  world: WorldState,
  partnerA: NpcState,
  partnerB: NpcState,
): { familyName: string; homeBuildingId: string } {
  const homes = world.buildings.filter(
    (b) => b.completed && (b.type === 'cottage' || b.type === 'tavern' || b.type === 'keep'),
  );
  const preferredHome =
    homes.find((b) => b.id === partnerA.homeBuildingId && b.type === 'cottage') ??
    homes.find((b) => b.id === partnerB.homeBuildingId && b.type === 'cottage') ??
    homes[world.totalMarriages % Math.max(1, homes.length)] ??
    world.buildings[0];

  const familyName =
    partnerA.familyName ??
    partnerB.familyName ??
    FAMILY_SURNAMES[(world.totalMarriages + world.npcs.length) % FAMILY_SURNAMES.length];

  partnerA.spouseId = partnerB.id;
  partnerB.spouseId = partnerA.id;
  partnerA.familyName = familyName;
  partnerB.familyName = familyName;
  partnerA.homeBuildingId = preferredHome.id;
  partnerB.homeBuildingId = preferredHome.id;

  partnerA.happiness = Math.min(100, partnerA.happiness + 12);
  partnerB.happiness = Math.min(100, partnerB.happiness + 12);
  partnerA.loyalty = Math.min(100, partnerA.loyalty + 6);
  partnerB.loyalty = Math.min(100, partnerB.loyalty + 6);
  partnerA.speechLine = `Wedded ${partnerB.name} of House ${familyName}!`;
  partnerB.speechLine = `Wedded ${partnerA.name} of House ${familyName}!`;
  partnerA.speechTimer = 4.5;
  partnerB.speechTimer = 4.5;

  world.totalMarriages += 1;

  return {
    familyName,
    homeBuildingId: preferredHome.id,
  };
}

export function selectParentsForBirth(world: WorldState): {
  home: BuildingInstance;
  familyName: string;
  parents: NpcState[];
} {
  const homes = world.buildings.filter(
    (b) => b.completed && (b.type === 'cottage' || b.type === 'tavern' || b.type === 'keep'),
  );
  const seenCouples = new Set<string>();
  const marriedPairs: Array<[NpcState, NpcState]> = [];

  for (const npc of world.npcs) {
    if (!npc.spouseId || npc.isChild) continue;
    const spouse = world.npcs.find((n) => n.id === npc.spouseId);
    if (!spouse || spouse.isChild) continue;
    const key = npc.id < spouse.id ? `${npc.id}:${spouse.id}` : `${spouse.id}:${npc.id}`;
    if (seenCouples.has(key)) continue;
    seenCouples.add(key);
    marriedPairs.push([npc, spouse]);
  }

  // Prefer married couples with fewer children so growing houses expand naturally
  marriedPairs.sort((a, b) => a[0].childrenIds.length - b[0].childrenIds.length);
  if (marriedPairs.length > 0) {
    const idx = world.totalBirths % marriedPairs.length;
    const [pA, pB] = marriedPairs[0][0].childrenIds.length < 3 ? marriedPairs[0] : marriedPairs[idx];
    const home =
      homes.find((h) => h.id === pA.homeBuildingId) ??
      homes.find((h) => h.id === pB.homeBuildingId) ??
      homes[0] ??
      world.buildings[0];
    const familyName =
      pA.familyName ??
      pB.familyName ??
      FAMILY_SURNAMES[(world.totalBirths + world.npcs.length) % FAMILY_SURNAMES.length];
    return { home, familyName, parents: [pA, pB] };
  }

  const fallbackHome =
    homes[(world.totalBirths + world.npcs.length) % Math.max(1, homes.length)] ?? world.buildings[0];
  const houseAdults = world.npcs.filter(
    (n) => !n.isChild && n.homeBuildingId === fallbackHome.id,
  );
  const familyName =
    houseAdults[0]?.familyName ??
    FAMILY_SURNAMES[(world.totalBirths + world.npcs.length) % FAMILY_SURNAMES.length];
  return {
    home: fallbackHome,
    familyName,
    parents: houseAdults.slice(0, 2),
  };
}

export function countMarriedCouples(world: WorldState): number {
  const seen = new Set<string>();
  let count = 0;
  for (const n of world.npcs) {
    if (!n.spouseId || n.isChild) continue;
    const spouse = world.npcs.find((s) => s.id === n.spouseId);
    if (!spouse) continue;
    const key = n.id < spouse.id ? `${n.id}:${spouse.id}` : `${spouse.id}:${n.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      count += 1;
    }
  }
  return count;
}

export interface FamilyUnitSummary {
  familyName: string;
  homeName: string;
  parents: NpcState[];
  children: NpcState[];
  marriedCouple: boolean;
  traits: NpcTrait[];
}

export function buildFamilyUnitsSummary(world: WorldState): FamilyUnitSummary[] {
  const byHouse = new Map<string, NpcState[]>();
  for (const npc of world.npcs) {
    const house = npc.familyName ?? 'Valdorian';
    const list = byHouse.get(house);
    if (list) list.push(npc);
    else byHouse.set(house, [npc]);
  }

  const summaries: FamilyUnitSummary[] = [];
  for (const [familyName, members] of byHouse.entries()) {
    const parents = members.filter((m) => !m.isChild && m.profession !== 'child');
    const children = members.filter((m) => m.isChild || m.profession === 'child');
    const firstHomeId = parents[0]?.homeBuildingId ?? members[0]?.homeBuildingId;
    const homeBuilding = world.buildings.find((b) => b.id === firstHomeId);
    const marriedCouple = parents.some(
      (p) => Boolean(p.spouseId && members.some((other) => other.id === p.spouseId)),
    );
    const traitSet = new Set<NpcTrait>();
    for (const m of members) {
      for (const tr of m.traits ?? []) traitSet.add(tr);
    }
    summaries.push({
      familyName,
      homeName: homeBuilding?.name ?? 'Valdoria Keep',
      parents,
      children,
      marriedCouple,
      traits: Array.from(traitSet),
    });
  }

  // Sort married & multi-member families first
  summaries.sort((a, b) => {
    const scoreA = (a.marriedCouple ? 10 : 0) + a.parents.length + a.children.length;
    const scoreB = (b.marriedCouple ? 10 : 0) + b.parents.length + b.children.length;
    return scoreB - scoreA;
  });

  return summaries;
}
