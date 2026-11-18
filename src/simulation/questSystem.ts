import { WorldState } from './types';

export interface RoyalQuestDef {
  id: string;
  title: string;
  objective: string;
  rewardGold: number;
  rewardRenown: number;
  isComplete: (world: WorldState) => boolean;
}

export const ROYAL_QUESTS: RoyalQuestDef[] = [
  {
    id: 'q_hovel',
    title: 'House the Realm',
    objective: 'Build 1 new Peasant Hovel to welcome families',
    rewardGold: 40,
    rewardRenown: 8,
    isComplete: (world) =>
      world.buildings.some((b) => b.type === 'cottage' && b.completed && !b.id.startsWith('b_cottage_')),
  },
  {
    id: 'q_harvest',
    title: 'Feed the Valley',
    objective: 'Construct 2+ new buildings & grow to 24 citizens',
    rewardGold: 60,
    rewardRenown: 10,
    isComplete: (world) => world.buildingsConstructed >= 2 && world.npcs.length >= 24,
  },
  {
    id: 'q_fortify',
    title: 'Fortify the Frontier',
    objective: 'Build a Bastion Watchtower or Stronghold Barracks',
    rewardGold: 75,
    rewardRenown: 12,
    isComplete: (world) =>
      world.buildings.some(
        (b) =>
          b.completed &&
          ((b.type === 'watchtower' && !b.id.startsWith('b_watchtower_')) ||
            (b.type === 'barracks' && !b.id.startsWith('b_barracks_'))),
      ),
  },
  {
    id: 'q_trade',
    title: 'Forge Royal Trade',
    objective: 'Establish 2 active Trade Pacts or Alliances',
    rewardGold: 90,
    rewardRenown: 15,
    isComplete: (world) =>
      world.factions.filter((f) => f.status === 'trade_pact' || f.status === 'allied').length >= 2,
  },
  {
    id: 'q_pacify',
    title: 'Pacify the North',
    objective: 'Clear all Ashwood Marauders & reach 30 citizens',
    rewardGold: 150,
    rewardRenown: 25,
    isComplete: (world) => world.bandits.length === 0 && world.npcs.length >= 30,
  },
];

export interface CompletedQuestReward {
  id: string;
  title: string;
  rewardGold: number;
  rewardRenown: number;
}

export function evaluateRoyalQuests(world: WorldState): CompletedQuestReward[] {
  if (!Array.isArray(world.completedQuests)) {
    world.completedQuests = [];
  }
  const completedSet = new Set(world.completedQuests);
  const newlyCompleted: CompletedQuestReward[] = [];

  for (const q of ROYAL_QUESTS) {
    if (completedSet.has(q.id)) continue;
    if (q.isComplete(world)) {
      completedSet.add(q.id);
      world.completedQuests.push(q.id);
      world.resources.gold += q.rewardGold;
      world.king.renown += q.rewardRenown;
      newlyCompleted.push({
        id: q.id,
        title: q.title,
        rewardGold: q.rewardGold,
        rewardRenown: q.rewardRenown,
      });
    }
  }

  return newlyCompleted;
}

export function getActiveRoyalQuest(world: WorldState): {
  current: RoyalQuestDef | null;
  completedCount: number;
  totalCount: number;
} {
  const completedSet = new Set(world.completedQuests ?? []);
  const current = ROYAL_QUESTS.find((q) => !completedSet.has(q.id)) ?? null;
  return {
    current,
    completedCount: completedSet.size,
    totalCount: ROYAL_QUESTS.length,
  };
}
