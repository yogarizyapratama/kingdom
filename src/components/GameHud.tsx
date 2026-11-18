import React from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CloudFog,
  CloudRain,
  Hammer,
  Pause,
  Shield,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BUILDING_SPECS } from '../simulation/constants';
import { getTimeLabel } from '../simulation/kingdomEngine';
import { getActiveRoyalQuest } from '../simulation/questSystem';
import { BuildingType, GameSnapshot, KingdomEvent, SquadOrder, WorldState } from '../simulation/types';
import { HudProjection } from '../engine/KingdomScene';
import { Minimap } from './Minimap';

interface GameHudProps {
  world: WorldState;
  snapshot: GameSnapshot;
  projection: HudProjection;
  events: KingdomEvent[];
  activeBuildType: BuildingType | null;
  dockCollapsed: boolean;
  muted: boolean;
  toastMessage: string | null;
  onToggleDock: () => void;
  onSelectBuildType: (type: BuildingType | null) => void;
  onSquadOrder: (order: SquadOrder) => void;
  onOpenLedger: () => void;
  onToggleMount: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onInteractClosest: (npcId: string) => void;
  onInspectBuilding: (buildingId: string) => void;
  onAttack: () => void;
  onCycleWeather: () => void;
}

const BUILDABLE_TYPES: BuildingType[] = [
  'cottage',
  'farm',
  'granary',
  'bakery',
  'lumber_camp',
  'quarry',
  'blacksmith',
  'market',
  'tavern',
  'barracks',
  'watchtower',
  'stone_wall',
];

export const GameHud: React.FC<GameHudProps> = ({
  world,
  snapshot,
  projection,
  events,
  activeBuildType,
  dockCollapsed,
  muted,
  toastMessage,
  onToggleDock,
  onSelectBuildType,
  onSquadOrder,
  onOpenLedger,
  onToggleMount,
  onToggleMute,
  onPause,
  onInteractClosest,
  onInspectBuilding,
  onAttack,
  onCycleWeather,
}) => {
  const questInfo = getActiveRoyalQuest(world);
  const hpPct = Math.max(0, Math.min(100, Math.round((snapshot.kingHp / snapshot.kingMaxHp) * 100)));
  const stamPct = Math.max(0, Math.min(100, Math.round((snapshot.kingStamina / snapshot.kingMaxStamina) * 100)));
  const speedPct = Math.round(snapshot.weatherSpeedMultiplier * 100);
  const weatherLabel =
    snapshot.weather === 'sunny' ? 'Sunny' : snapshot.weather === 'rainy' ? 'Rainy' : 'Foggy';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
      {/* TOP PERIMETER ROW */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Kingdom Status & Royal Vitality Cluster */}
        <div className="pointer-events-auto bg-[#14171d]/92 border border-[#c8a358]/35 rounded-md px-3.5 py-2.5 shadow-lg max-w-[960px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#dfd5c3]">
            <span className="font-display font-semibold text-[#f1cb75] tracking-wide whitespace-nowrap">
              Day {snapshot.day} · {snapshot.season} · {getTimeLabel(snapshot.timeOfDay)}
            </span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleWeather();
              }}
              title="Weather affects citizen activities and movement speed (click to cycle)"
              aria-label="Cycle Weather"
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#1d222c] hover:bg-[#28303e] border border-[#c8a358]/35 text-[#efe5d2] transition-colors cursor-pointer"
            >
              {snapshot.weather === 'sunny' && <Sun className="w-3.5 h-3.5 text-[#f2c96b]" />}
              {snapshot.weather === 'rainy' && <CloudRain className="w-3.5 h-3.5 text-[#7cc4e8]" />}
              {snapshot.weather === 'foggy' && <CloudFog className="w-3.5 h-3.5 text-[#c7d1d6]" />}
              <span className="font-medium">{weatherLabel}</span>
              <span className="font-mono-num tabular-nums text-[11px] text-[#bfb5a2]">{speedPct}%</span>
            </button>
            <span aria-hidden="true" className="text-[#c8a358]/40">|</span>
            <span className="tabular-nums flex items-center gap-1">
              <span>Gold</span>
              <strong className="text-[#f5cf6e] font-mono-num">{Math.round(snapshot.resources.gold)}</strong>
            </span>
            <span className="tabular-nums flex items-center gap-1">
              <span>Wood</span>
              <strong className="text-[#d6b384] font-mono-num">{Math.round(snapshot.resources.wood)}</strong>
            </span>
            <span className="tabular-nums flex items-center gap-1">
              <span>Stone</span>
              <strong className="text-[#bfc5cd] font-mono-num">{Math.round(snapshot.resources.stone)}</strong>
            </span>
            <span className="tabular-nums flex items-center gap-1">
              <span>Food</span>
              <strong className="text-[#99ca74] font-mono-num">{Math.round(snapshot.resources.food)}</strong>
            </span>
            <span
              className="tabular-nums flex items-center gap-1"
              title={`Population · Births +${snapshot.birthRatePerDay.toFixed(2)}/d · Deaths -${snapshot.deathRatePerDay.toFixed(2)}/d`}
            >
              <span>Folk</span>
              <strong className="text-[#f2eadb] font-mono-num">{snapshot.population}/{snapshot.populationCap}</strong>
            </span>
            <span className="tabular-nums flex items-center gap-1" title="Stronghold Popularity (>=54% draws new settlers)">
              <span>Pop</span>
              <strong
                className={`font-mono-num ${
                  snapshot.popularity >= 54
                    ? 'text-[#7cd698]'
                    : snapshot.popularity >= 35
                      ? 'text-[#f2c96b]'
                      : 'text-[#e88a7d]'
                }`}
              >
                {snapshot.popularity}%
              </strong>
            </span>
            <span className="tabular-nums flex items-center gap-1">
              <span>Loyalty</span>
              <strong className="text-[#7dc8d6] font-mono-num">{snapshot.averageLoyalty}%</strong>
            </span>
          </div>

          {/* King Health & Stamina Bars */}
          <div className="mt-2 flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-[190px]">
              <span className="text-[11px] font-semibold text-[#e6b3a7] uppercase tracking-wider w-7">HP</span>
              <div className="flex-1 h-2 bg-[#231919] rounded-sm overflow-hidden border border-[#ffffff]/10">
                <div
                  className="h-full bg-[#b93c34] transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${hpPct / 100})` }}
                />
              </div>
              <span className="text-[11px] font-mono-num text-[#f0d7d2] w-8 text-right">{snapshot.kingHp}</span>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-[170px]">
              <span className="text-[11px] font-semibold text-[#d9c99b] uppercase tracking-wider w-7">STM</span>
              <div className="flex-1 h-2 bg-[#1c1d18] rounded-sm overflow-hidden border border-[#ffffff]/10">
                <div
                  className="h-full bg-[#c99b3e] transition-transform duration-100 origin-left"
                  style={{ transform: `scaleX(${stamPct / 100})` }}
                />
              </div>
            </div>

            <div className="text-[11px] text-[#c7beae] tabular-nums flex items-center gap-1.5">
              <span>Garrison <strong className="text-[#efe7d8] font-mono-num">{snapshot.soldiersCount}</strong></span>
              <span className="text-[#c8a358]/50">·</span>
              <span>Raiders <strong className="text-[#e88a7d] font-mono-num">{snapshot.banditsRemaining}</strong></span>
            </div>
          </div>
        </div>

        {/* Top-Right: Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenLedger();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#14171d]/92 hover:bg-[#222731] border border-[#c8a358]/45 rounded-md text-xs font-medium text-[#f2e8d5] transition-colors cursor-pointer"
            aria-label="Open Royal Ledger"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#e6bd64]" />
            <span className="whitespace-nowrap">Ledger [Tab]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectBuildType(activeBuildType ? null : 'cottage');
            }}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeBuildType
                ? 'bg-[#c99b3e] text-[#14110c] border-[#f0cf82]'
                : 'bg-[#14171d]/92 hover:bg-[#222731] text-[#f2e8d5] border-[#c8a358]/45'
            }`}
            aria-label="Toggle Build Mode"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">Build [B]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMount();
            }}
            className={`px-3 py-2 border rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              snapshot.kingMounted
                ? 'bg-[#304e3b] text-[#e7f7ec] border-[#6bb586]/60'
                : 'bg-[#14171d]/92 hover:bg-[#222731] text-[#f2e8d5] border-[#c8a358]/45'
            }`}
            aria-label="Mount or Dismount Warhorse"
          >
            {snapshot.kingMounted ? 'Dismount [H]' : 'Mount [H]'}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="p-2 bg-[#14171d]/92 hover:bg-[#222731] border border-[#c8a358]/45 rounded-md text-[#f2e8d5] transition-colors cursor-pointer"
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#d67a6f]" /> : <Volume2 className="w-4 h-4 text-[#e6bd64]" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="p-2 bg-[#14171d]/92 hover:bg-[#222731] border border-[#c8a358]/45 rounded-md text-[#f2e8d5] transition-colors cursor-pointer"
            aria-label="Pause Game"
          >
            <Pause className="w-4 h-4 text-[#e6bd64]" />
          </button>
        </div>
      </div>

      {/* COMPACT ROYAL QUEST TRACKER (Top-Right under utility controls) */}
      {questInfo.current && (
        <div className="fixed top-16 right-4 z-10 pointer-events-auto hidden md:block w-60 bg-[#14171d]/90 border border-[#c8a358]/35 rounded-md px-3 py-2 shadow-lg">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#e6bd64]">
            <span className="font-semibold">
              Royal Quest ({questInfo.completedCount + 1}/{questInfo.totalCount})
            </span>
            <span className="font-mono-num text-[#f5cf6e]">+{questInfo.current.rewardGold}g</span>
          </div>
          <div className="text-xs font-display font-semibold text-[#f6eedf] mt-0.5">
            {questInfo.current.title}
          </div>
          <div className="text-[11px] text-[#bdb29f] leading-snug mt-0.5">
            {questInfo.current.objective}
          </div>
        </div>
      )}

      {/* WORLD-PROJECTED NPC INTERACTION PROMPT */}
      {projection.closestNpc && projection.closestNpc.visible && (
        <div
          className="fixed z-20 pointer-events-auto"
          style={{
            left: `${Math.round(projection.closestNpc.screenX)}px`,
            top: `${Math.round(projection.closestNpc.screenY)}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onInteractClosest(projection.closestNpc!.id)}
            className="px-3 py-1.5 bg-[#14171d]/95 hover:bg-[#242934] border border-[#e6bd64]/70 rounded-md shadow-lg text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#c99b3e] text-[#14110c] font-mono-num font-bold text-[11px] rounded-sm">
                E
              </span>
              <span className="text-xs font-semibold text-[#f7efe0] whitespace-nowrap">
                {projection.closestNpc.name}
              </span>
            </div>
            <div className="text-[11px] text-[#c9bfa9] mt-0.5 whitespace-nowrap">
              {projection.closestNpc.professionLabel} · {projection.closestNpc.activity.replace(/_/g, ' ')}
            </div>
          </button>
        </div>
      )}

      {/* WORLD-PROJECTED NEARBY BUILDING INSPECT PROMPT */}
      {projection.nearbyBuilding && !projection.closestNpc && (
        <div
          className="fixed z-20 pointer-events-auto"
          style={{
            left: `${Math.round(projection.nearbyBuilding.screenX)}px`,
            top: `${Math.round(projection.nearbyBuilding.screenY)}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onInspectBuilding(projection.nearbyBuilding!.id)}
            className="px-3 py-1.5 bg-[#14171d]/94 hover:bg-[#242934] border border-[#c8a358]/60 rounded-md shadow-lg text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#28303e] text-[#f3cf78] border border-[#c8a358]/50 font-mono-num font-bold text-[11px] rounded-sm">
                G
              </span>
              <span className="text-xs font-semibold text-[#f7efe0] whitespace-nowrap">
                {projection.nearbyBuilding.name} (Tier {projection.nearbyBuilding.level})
              </span>
            </div>
            <div className="text-[11px] text-[#bdb29f] mt-0.5 whitespace-nowrap">
              {projection.nearbyBuilding.completed
                ? `Inspect / Upgrade`
                : `Building ${Math.round(projection.nearbyBuilding.progress * 100)}%`}
            </div>
          </button>
        </div>
      )}

      {/* WORLD-PROJECTED LOGISTICS CART TOOLTIP */}
      {projection.nearbyCart && !projection.closestNpc && (
        <div
          className="fixed z-15 pointer-events-none"
          style={{
            left: `${Math.round(projection.nearbyCart.screenX)}px`,
            top: `${Math.round(projection.nearbyCart.screenY)}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="px-2.5 py-1 bg-[#14171d]/92 border border-[#c8a358]/45 rounded-sm shadow text-[11px] text-[#f3cf78] whitespace-nowrap">
            {projection.nearbyCart.label} {projection.nearbyCart.returning ? '(Returning)' : '(Loaded)'}
          </div>
        </div>
      )}

      {/* TOAST / BUILD FEEDBACK */}
      {(toastMessage || (activeBuildType && projection.buildPreview)) && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-4 py-2 bg-[#14171d]/95 border border-[#c8a358]/50 rounded-md text-xs text-[#f3ead8] shadow-lg whitespace-nowrap">
            {activeBuildType && projection.buildPreview
              ? projection.buildPreview.valid
                ? `Click ground to construct ${BUILDING_SPECS[activeBuildType].name}`
                : projection.buildPreview.reason || 'Move cursor onto clear meadow ground'
              : toastMessage}
          </div>
        </div>
      )}

      {/* BOTTOM ROW: CHRONICLE + COLLAPSIBLE ROYAL COMMAND DOCK */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left Compact Royal Chronicle */}
        <div className="hidden lg:block w-72 bg-[#14171d]/88 border border-[#c8a358]/25 rounded-md px-3 py-2 text-[11px] text-[#cfc5b3] pointer-events-auto">
          <div className="font-display text-[11px] text-[#e6bd64] tracking-wide mb-1">Royal Chronicle</div>
          <div className="space-y-1">
            {events.slice(0, 3).map((ev) => (
              <div key={ev.id} className="truncate" title={ev.detail}>
                <span className="text-[#e6bd64] font-mono-num">D{ev.day}</span> {ev.title} — {ev.detail}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-Center Collapsible Royal Command & Build Dock */}
        <div className="mx-auto pointer-events-auto flex flex-col items-center">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            className="flex items-center gap-1 px-3 py-1 bg-[#14171d]/92 border border-b-0 border-[#c8a358]/40 rounded-t-md text-[11px] text-[#dfd5c3] hover:text-[#ffffff] cursor-pointer"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{dockCollapsed ? 'Show Royal Dock' : 'Hide Dock'}</span>
          </button>

          {!dockCollapsed && (
            <div className="bg-[#14171d]/94 border border-[#c8a358]/45 rounded-md px-2.5 py-1.5 shadow-xl max-w-[96vw] overflow-x-auto">
              {activeBuildType ? (
                <div className="flex items-center gap-1.5">
                  {BUILDABLE_TYPES.map((bt) => {
                    const spec = BUILDING_SPECS[bt];
                    const selected = activeBuildType === bt;
                    const canAfford =
                      snapshot.resources.gold >= spec.costGold &&
                      snapshot.resources.wood >= spec.costWood &&
                      snapshot.resources.stone >= spec.costStone;
                    return (
                      <button
                        key={bt}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectBuildType(bt);
                        }}
                        className={`px-2 py-1 rounded-sm text-left border transition-colors cursor-pointer shrink-0 ${
                          selected
                            ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                            : canAfford
                              ? 'bg-[#1c2029] hover:bg-[#272d39] text-[#efe5d2] border-[#c8a358]/30'
                              : 'bg-[#191b21] text-[#857e72] border-[#ffffff]/10'
                        }`}
                      >
                        <div className="text-[11px] font-semibold whitespace-nowrap">{spec.name}</div>
                        <div className="text-[10px] font-mono-num whitespace-nowrap opacity-90">
                          {spec.costGold}g · {spec.costWood}w · {spec.costStone}s
                        </div>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onSelectBuildType(null)}
                    className="px-2 py-1.5 bg-[#3b2020] hover:bg-[#522a2a] text-[#f5dcd9] text-[11px] rounded-sm cursor-pointer whitespace-nowrap"
                  >
                    Cancel [B]
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 pr-2 border-r border-[#c8a358]/25">
                    <Shield className="w-3.5 h-3.5 text-[#e6bd64]" />
                    <span className="text-[11px] font-semibold text-[#e6bd64] whitespace-nowrap">Garrison:</span>
                  </div>
                  {(
                    [
                      ['patrol', 'Patrol Village'],
                      ['follow_king', 'Follow King'],
                      ['guard_gate', 'Guard North Gate'],
                      ['raid_camp', 'Raid Bandit Camp'],
                    ] as Array<[SquadOrder, string]>
                  ).map(([orderKey, label]) => (
                    <button
                      key={orderKey}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSquadOrder(orderKey);
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                        snapshot.squadOrder === orderKey
                          ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                          : 'bg-[#1c2029] hover:bg-[#272d39] text-[#efe5d2] border-[#c8a358]/25'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onAttack();
                    }}
                    className="px-3 py-1.5 bg-[#7a2924] hover:bg-[#96332d] text-[#faecea] text-xs font-medium rounded-sm border border-[#d66c63]/40 cursor-pointer whitespace-nowrap"
                  >
                    Strike [F]
                  </button>
                  <span
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-sm border whitespace-nowrap ${
                      snapshot.kingBlocking
                        ? 'bg-[#2a4969] text-[#e5f2ff] border-[#78b4eb]'
                        : 'bg-[#191e27] text-[#a9a192] border-[#ffffff]/10'
                    }`}
                    title="Hold C to raise your Royal Kite Shield and cut incoming damage by 75%"
                  >
                    Block [C]
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom-Right Live Tactical Minimap */}
        <div className="hidden lg:flex items-end justify-end w-72">
          <Minimap world={world} />
        </div>
      </div>
    </div>
  );
};
