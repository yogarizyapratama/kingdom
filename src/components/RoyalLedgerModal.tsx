import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BUILDING_SPECS, PROFESSION_LABELS } from '../simulation/constants';
import { buildFamilyUnitsSummary } from '../simulation/familySystem';
import {
  calculateDemographicRates,
  getAdvisorReport,
  getUnlockedWeapons,
  MAX_REALM_POPULATION,
} from '../simulation/kingdomEngine';
import { KingWeaponType, RationLevel, SquadOrder, TaxRate, WorldState } from '../simulation/types';

interface RoyalLedgerModalProps {
  world: WorldState;
  onSetTaxRate: (rate: TaxRate) => void;
  onSetRationLevel: (level: RationLevel) => void;
  onEnactDecree: (decree: 'feast' | 'forestry' | 'muster') => void;
  onRecruit: (role: 'soldier' | 'guard' | 'worker') => void;
  onSquadOrder: (order: SquadOrder) => void;
  onDiplomacy: (factionId: string, action: 'trade_envoy' | 'gift' | 'demand_truce') => void;
  onSelectWeapon: (weapon: KingWeaponType) => void;
  onClose: () => void;
}

type LedgerTab = 'realm' | 'families' | 'council' | 'military' | 'diplomacy';

export const RoyalLedgerModal: React.FC<RoyalLedgerModalProps> = ({
  world,
  onSetTaxRate,
  onSetRationLevel,
  onEnactDecree,
  onRecruit,
  onSquadOrder,
  onDiplomacy,
  onSelectWeapon,
  onClose,
}) => {
  const [tab, setTab] = useState<LedgerTab>('realm');
  const advisors = getAdvisorReport(world);
  const familyUnits = buildFamilyUnitsSummary(world);
  const militaryNpcs = world.npcs.filter(
    (n) => n.profession === 'guard' || n.profession === 'soldier' || n.profession === 'commander',
  );

  // Compute daily income/upkeep summary
  let dailyFood = 0;
  let dailyWood = 0;
  let dailyStone = 0;
  let dailyGold = 0;
  for (const b of world.buildings) {
    if (!b.completed) continue;
    const spec = BUILDING_SPECS[b.type];
    dailyFood += spec.dailyFood;
    dailyWood += spec.dailyWood;
    dailyStone += spec.dailyStone;
    dailyGold += spec.dailyGold;
  }
  const demographics = calculateDemographicRates(world);
  const taxPerCap = world.taxRate === 'low' ? 2 : world.taxRate === 'normal' ? 4 : 7;
  const adultsCount = Math.max(0, world.npcs.length - demographics.childrenCount);
  const taxIncome = adultsCount * taxPerCap;
  const rationFactor = world.rationLevel === 'half' ? 0.8 : world.rationLevel === 'extra' ? 1.8 : 1.2;
  const foodUnits = world.npcs.reduce((sum, n) => sum + (n.isChild || n.profession === 'child' ? 0.5 : 1), 0);
  const foodNeed = Math.max(4, Math.round(foodUnits * rationFactor));

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Royal Ledger and Kingdom Management"
    >
      <div className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-[#15181f] border border-[#c9a456]/55 rounded-md shadow-2xl overflow-hidden">
        {/* Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[#c9a456]/25 bg-[#1b1f28]">
          <div>
            <h2 className="font-display text-xl font-bold text-[#f6eedf]">Royal Ledger of Valdoria</h2>
            <div className="text-xs text-[#cbbda4] mt-0.5 tabular-nums">
              Day {world.day} · {world.season} · Renown {world.king.renown} · Population {world.npcs.length}/
              {world.populationCap}
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#101318] rounded-sm border border-[#c9a456]/20">
            {(
              [
                ['realm', 'Realm & Taxes'],
                ['families', 'Families'],
                ['council', 'Royal Council'],
                ['military', 'Military'],
                ['diplomacy', 'World Map'],
              ] as Array<[LedgerTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                  tab === id
                    ? 'bg-[#c99b3e] text-[#14110c]'
                    : 'text-[#d4cab7] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#cbbda4] hover:text-white cursor-pointer"
            aria-label="Close Royal Ledger"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto royal-scroll space-y-6">
          {tab === 'realm' && (
            <>
              {/* Economy Forecast */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
                  <div className="text-xs text-[#a99f8d]">Treasury Gold</div>
                  <div className="text-xl font-mono-num font-bold text-[#f5cf6e] mt-1">
                    {Math.round(world.resources.gold)}
                  </div>
                  <div className="text-[11px] text-[#cbbda4] mt-0.5 tabular-nums">
                    +{dailyGold + taxIncome}/day ({taxIncome} tax)
                  </div>
                </div>
                <div className="p-3.5 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
                  <div className="text-xs text-[#a99f8d]">Food Stores</div>
                  <div className="text-xl font-mono-num font-bold text-[#99ca74] mt-1">
                    {Math.round(world.resources.food)}
                  </div>
                  <div className="text-[11px] text-[#cbbda4] mt-0.5 tabular-nums">
                    Net {dailyFood - foodNeed >= 0 ? '+' : ''}
                    {dailyFood - foodNeed}/day
                  </div>
                </div>
                <div className="p-3.5 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
                  <div className="text-xs text-[#a99f8d]">Timber Stock</div>
                  <div className="text-xl font-mono-num font-bold text-[#d6b384] mt-1">
                    {Math.round(world.resources.wood)}
                  </div>
                  <div className="text-[11px] text-[#cbbda4] mt-0.5 tabular-nums">
                    +{dailyWood}/day
                  </div>
                </div>
                <div className="p-3.5 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
                  <div className="text-xs text-[#a99f8d]">Quarry Stone</div>
                  <div className="text-xl font-mono-num font-bold text-[#bfc5cd] mt-1">
                    {Math.round(world.resources.stone)}
                  </div>
                  <div className="text-[11px] text-[#cbbda4] mt-0.5 tabular-nums">
                    +{dailyStone}/day
                  </div>
                </div>
              </div>

              {/* Active Supply Cart Logistics Summary */}
              <div className="px-4 py-2.5 bg-[#161a22] border border-[#ffffff]/10 rounded-sm flex flex-wrap items-center justify-between gap-2 text-xs text-[#cbbda4]">
                <span>
                  Physical Supply Carts:{' '}
                  <strong className="text-[#f3cf78] font-mono-num">
                    {world.carts?.length ?? 0} Active Wagon{(world.carts?.length ?? 0) === 1 ? '' : 's'}
                  </strong>
                </span>
                <span className="text-[#9e9484]">
                  Hauling grain, timber, stone, loaves &amp; arms between work sites and storage hubs
                </span>
              </div>

              {/* Stronghold Popularity & Settler Influx */}
              <div className="p-4 bg-[#1a1e26] border border-[#c9a456]/30 rounded-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#f3ead8]">
                    Stronghold Popularity &amp; Settler Growth
                  </h3>
                  <p className="text-xs text-[#bdb29f] mt-0.5">
                    {world.popularity >= 54 && world.npcs.length < Math.min(MAX_REALM_POPULATION, world.populationCap)
                      ? 'Settlers are flocking to Valdoria automatically over time thanks to strong Popularity and open housing.'
                      : world.popularity < 28
                        ? 'Unrest is driving villagers away! Lower taxes or raise Granary Rations to restore Popularity.'
                        : world.npcs.length >= Math.min(MAX_REALM_POPULATION, world.populationCap)
                          ? 'Housing capacity full — build more Peasant Hovels to welcome additional settlers.'
                          : 'Raise Popularity above 54% with rations, taverns, or low taxes to draw steady settler immigration.'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-2xl font-mono-num font-bold ${
                      world.popularity >= 54
                        ? 'text-[#7cd698]'
                        : world.popularity >= 35
                          ? 'text-[#f2c96b]'
                          : 'text-[#e88a7d]'
                    }`}
                  >
                    {world.popularity}%
                  </div>
                  <div className="text-[11px] text-[#cbbda4] tabular-nums">
                    Folk {world.npcs.length}/{Math.min(MAX_REALM_POPULATION, world.populationCap)}
                  </div>
                </div>
              </div>

              {/* Birth & Death Rate Demographics */}
              <div className="p-4 bg-[#1a1e26] border border-[#c9a456]/25 rounded-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[#f3ead8]">
                      Natural Birth &amp; Death Rate Simulation
                    </h3>
                    <p className="text-xs text-[#bdb29f] mt-0.5">
                      {world.resources.food <= 0
                        ? 'Granaries empty! Famine is spiking the death rate and halting new births.'
                        : world.npcs.length >= Math.min(MAX_REALM_POPULATION, world.populationCap)
                          ? 'Housing is full — births are paused until new Peasant Hovels are built.'
                          : demographics.netGrowthPerDay > 0
                            ? `Food reserves (${demographics.foodDaysReserve}d) and open housing beds are driving natural village expansion.`
                            : 'Raise food stores or Granary Rations to keep natural births ahead of mortality.'}
                    </p>
                  </div>
                  <div className="text-xs text-[#cbbda4] tabular-nums">
                    {demographics.familiesCount} Families · {demographics.childrenCount} Children ·{' '}
                    {demographics.eldersCount} Elders
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 bg-[#131720] border border-[#ffffff]/10 rounded-sm">
                    <div className="text-[11px] text-[#a99f8d]">Birth Rate</div>
                    <div className="text-base font-mono-num font-bold text-[#7cd698] mt-0.5">
                      +{demographics.birthRatePerDay.toFixed(2)}/day
                    </div>
                    <div className="text-[10px] text-[#9e9484] tabular-nums">
                      Total Births: {demographics.totalBirths}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#131720] border border-[#ffffff]/10 rounded-sm">
                    <div className="text-[11px] text-[#a99f8d]">Death Rate</div>
                    <div
                      className={`text-base font-mono-num font-bold mt-0.5 ${
                        demographics.deathRatePerDay > demographics.birthRatePerDay
                          ? 'text-[#e88a7d]'
                          : 'text-[#e2c288]'
                      }`}
                    >
                      -{demographics.deathRatePerDay.toFixed(2)}/day
                    </div>
                    <div className="text-[10px] text-[#9e9484] tabular-nums">
                      Total Deaths: {demographics.totalDeaths}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#131720] border border-[#ffffff]/10 rounded-sm">
                    <div className="text-[11px] text-[#a99f8d]">Net Natural Growth</div>
                    <div
                      className={`text-base font-mono-num font-bold mt-0.5 ${
                        demographics.netGrowthPerDay >= 0 ? 'text-[#99ca74]' : 'text-[#e88a7d]'
                      }`}
                    >
                      {demographics.netGrowthPerDay >= 0 ? '+' : ''}
                      {demographics.netGrowthPerDay.toFixed(2)}/day
                    </div>
                    <div className="text-[10px] text-[#9e9484] tabular-nums">
                      Food Reserve: {demographics.foodDaysReserve}d
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#131720] border border-[#ffffff]/10 rounded-sm">
                    <div className="text-[11px] text-[#a99f8d]">Housing Occupancy</div>
                    <div className="text-base font-mono-num font-bold text-[#f2eadb] mt-0.5">
                      {Math.round(demographics.housingOccupancy * 100)}%
                    </div>
                    <div className="text-[10px] text-[#9e9484] tabular-nums">
                      {world.npcs.length}/{Math.min(MAX_REALM_POPULATION, world.populationCap)} Beds
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax & Ration Policies */}
              <div className="p-4 bg-[#1a1e26] border border-[#c9a456]/25 rounded-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[#f3ead8]">Royal Taxation Rate</h3>
                    <p className="text-xs text-[#bdb29f] mt-0.5">
                      Higher taxes fill the treasury faster at the cost of citizen happiness and Popularity.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(
                      [
                        ['low', 'Low (2g/folk)'],
                        ['normal', 'Normal (4g/folk)'],
                        ['high', 'High (7g/folk)'],
                      ] as Array<[TaxRate, string]>
                    ).map(([rate, label]) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => onSetTaxRate(rate)}
                        className={`px-3 py-2 text-xs font-medium rounded-sm border cursor-pointer ${
                          world.taxRate === rate
                            ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                            : 'bg-[#13161d] hover:bg-[#232936] text-[#e7decb] border-[#ffffff]/15'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#ffffff]/10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[#f3ead8]">Granary Food Rations</h3>
                    <p className="text-xs text-[#bdb29f] mt-0.5">
                      Generous rations boost Popularity (+16%) and speed up settler immigration.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(
                      [
                        ['half', 'Half (0.8x · -14 Pop)'],
                        ['normal', 'Normal (1.2x · +6 Pop)'],
                        ['extra', 'Double (1.8x · +16 Pop)'],
                      ] as Array<[RationLevel, string]>
                    ).map(([level, label]) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onSetRationLevel(level)}
                        className={`px-3 py-2 text-xs font-medium rounded-sm border cursor-pointer ${
                          world.rationLevel === level
                            ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                            : 'bg-[#13161d] hover:bg-[#232936] text-[#e7decb] border-[#ffffff]/15'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Royal Decrees */}
              <div>
                <h3 className="font-display text-sm font-semibold text-[#f3ead8] mb-2.5">Royal Decrees</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => onEnactDecree('feast')}
                    className="p-3.5 text-left bg-[#1b2029] hover:bg-[#242b37] border border-[#c9a456]/30 rounded-sm cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-[#f3cf78]">Host Harvest Feast</div>
                    <div className="text-xs text-[#cbbda4] mt-1">Cost: 40 Gold · 30 Food</div>
                    <div className="text-xs text-[#99ca74] mt-1">+18 Happiness · +10 Loyalty · +10 Renown</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnactDecree('forestry')}
                    className="p-3.5 text-left bg-[#1b2029] hover:bg-[#242b37] border border-[#c9a456]/30 rounded-sm cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-[#d6b384]">Forestry Drive</div>
                    <div className="text-xs text-[#cbbda4] mt-1">Cost: 25 Gold</div>
                    <div className="text-xs text-[#99ca74] mt-1">Doubles Lumber Camp wood output for 3 days</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnactDecree('muster')}
                    className="p-3.5 text-left bg-[#1b2029] hover:bg-[#242b37] border border-[#c9a456]/30 rounded-sm cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-[#94b8e8]">Issue Militia Rations</div>
                    <div className="text-xs text-[#cbbda4] mt-1">Cost: 35 Gold</div>
                    <div className="text-xs text-[#99ca74] mt-1">Restores full health to King &amp; all citizens</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'families' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#1a1e26] border border-[#c9a456]/25 rounded-sm">
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#f3ead8]">
                    Houses &amp; Family Lineage ({familyUnits.length} Houses)
                  </h3>
                  <p className="text-xs text-[#bdb29f] mt-0.5">
                    Unmarried citizens wed naturally, raise children who inherit traits at birth, and pass on their trades at age 14.
                  </p>
                </div>
                <div className="text-right text-xs tabular-nums text-[#e6bd64] font-mono-num">
                  Total Marriages: {world.totalMarriages}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {familyUnits.map((unit) => (
                  <div
                    key={unit.familyName}
                    className="p-3.5 bg-[#1b2029] border border-[#c9a456]/25 rounded-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-sm font-semibold text-[#f3cf78]">
                          House {unit.familyName}
                        </div>
                        <div className="text-[11px] text-[#9e9484]">{unit.homeName}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm border ${
                          unit.marriedCouple
                            ? 'bg-[#27382b] text-[#9be2b0] border-[#6bb586]/40'
                            : 'bg-[#222733] text-[#cbbda4] border-[#ffffff]/15'
                        }`}
                      >
                        {unit.marriedCouple ? 'Wedded Couple' : 'Household'}
                      </span>
                    </div>

                    {unit.parents.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-[#9e9484]">Adults</div>
                        {unit.parents.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs text-[#eee5d3]"
                          >
                            <span className="truncate">
                              {p.name}{' '}
                              <span className="text-[#a99f8d]">
                                ({PROFESSION_LABELS[p.profession]}, {p.age}y)
                              </span>
                            </span>
                            <span className="text-[10px] text-[#e6bd64] shrink-0 ml-2">
                              {p.traits.join(' · ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {unit.children.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-[#ffffff]/10">
                        <div className="text-[10px] uppercase tracking-wider text-[#9e9484]">
                          Children ({unit.children.length})
                        </div>
                        {unit.children.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between text-xs text-[#cde8b5]"
                          >
                            <span className="truncate">
                              {c.name}{' '}
                              <span className="text-[#9e9484]">(Age {c.age})</span>
                            </span>
                            <span className="text-[10px] text-[#99ca74] shrink-0 ml-2">
                              {c.traits.join(' · ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'council' && (
            <div className="grid sm:grid-cols-2 gap-4">
              {advisors.map((a) => (
                <div
                  key={a.advisor}
                  className="p-4 bg-[#1b2029] border border-[#c9a456]/25 rounded-sm"
                >
                  <div className="font-display text-sm font-semibold text-[#f1cb75]">{a.advisor}</div>
                  <div className="text-xs text-[#9e9484] mt-0.5">{a.role}</div>
                  <p className="text-sm text-[#e9e0cf] mt-2.5 leading-relaxed">“{a.advice}”</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'military' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#1a1e26] border border-[#c9a456]/25 rounded-sm">
                <div>
                  <div className="font-display text-sm font-semibold text-[#f3ead8]">
                    Muster Forces ({militaryNpcs.length} Active)
                  </div>
                  <div className="text-xs text-[#bdb29f] mt-0.5">
                    Housing Capacity: {world.npcs.length}/{world.populationCap}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRecruit('soldier')}
                    className="px-3.5 py-2 text-xs font-semibold bg-[#7a2924] hover:bg-[#94332d] text-[#faecea] rounded-sm cursor-pointer"
                  >
                    Recruit Soldier (30g · 15 Food)
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecruit('guard')}
                    className="px-3.5 py-2 text-xs font-semibold bg-[#28384d] hover:bg-[#354b66] text-[#e5effc] rounded-sm cursor-pointer"
                  >
                    Recruit Guard (30g · 15 Food)
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecruit('worker')}
                    className="px-3.5 py-2 text-xs font-semibold bg-[#2d3e2d] hover:bg-[#3a523a] text-[#e5f5e5] rounded-sm cursor-pointer"
                  >
                    Settle Builder (20g · 10 Food)
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#e6bd64] uppercase tracking-wider mb-2">
                  Campaign &amp; Garrison Orders
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      ['patrol', 'Patrol Village'],
                      ['follow_king', 'Escort King'],
                      ['guard_gate', 'Hold North Gate'],
                      ['raid_camp', 'Raid Bandit Camp'],
                    ] as Array<[SquadOrder, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSquadOrder(key)}
                      className={`px-3 py-2 text-xs font-medium rounded-sm border cursor-pointer ${
                        world.squadOrder === key
                          ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                          : 'bg-[#1c212b] hover:bg-[#272f3d] text-[#efe5d2] border-[#ffffff]/15'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Royal Armory Weapon Mastery */}
              <div className="p-4 bg-[#1a1e26] border border-[#c9a456]/25 rounded-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-[#e6bd64] uppercase tracking-wider">
                    Royal Armory · King’s Weaponry
                  </div>
                  <div className="text-[11px] text-[#cbbda4]">Renown {world.king.renown}</div>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {(
                    [
                      ['broadsword', 'Royal Broadsword', '26 DMG · 3.4 Reach', 0],
                      ['waraxe', 'Knight’s Waraxe', '36 DMG · 3.6 Reach', 30],
                      ['royal_halberd', 'Royal Halberd', '44 DMG · 4.2 Reach', 60],
                    ] as Array<[KingWeaponType, string, string, number]>
                  ).map(([wKey, wName, wStat, reqRenown]) => {
                    const unlocked = getUnlockedWeapons(world.king.renown).includes(wKey);
                    const equipped = (world.king.weapon ?? 'broadsword') === wKey;
                    return (
                      <button
                        key={wKey}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => onSelectWeapon(wKey)}
                        className={`p-2.5 text-left rounded-sm border transition-colors ${
                          equipped
                            ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                            : unlocked
                              ? 'bg-[#1c212b] hover:bg-[#272f3d] text-[#efe5d2] border-[#ffffff]/15 cursor-pointer'
                              : 'bg-[#14171f] text-[#7e7769] border-[#ffffff]/5 cursor-not-allowed'
                        }`}
                      >
                        <div className="text-xs font-semibold">{wName}</div>
                        <div className="text-[10px] mt-0.5 opacity-90">
                          {unlocked ? wStat : `Unlocks at ${reqRenown} Renown`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                {militaryNpcs.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3.5 py-2.5 bg-[#1a1f28] border border-[#ffffff]/10 rounded-sm text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#f3ead8]">{m.name}</div>
                      <div className="text-[#9e9484]">
                        {PROFESSION_LABELS[m.profession]} · {m.activity.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="font-mono-num text-[#e69a8d]">
                      {Math.round(m.hp)}/{m.maxHp} HP
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'diplomacy' && (
            <div className="grid md:grid-cols-2 gap-5 items-start">
              {/* Interactive Regional Territory Map */}
              <div className="p-4 bg-[#101318] border border-[#c9a456]/35 rounded-sm">
                <div className="text-xs font-display text-[#e6bd64] mb-2">Regional Map of Valdoria</div>
                <svg viewBox="0 0 100 100" className="w-full h-60 bg-[#1a221b] rounded-sm border border-[#ffffff]/10">
                  {/* River path */}
                  <path d="M 65 0 Q 72 40 62 75 T 68 100" fill="none" stroke="#3c6e85" strokeWidth="3" />
                  {/* Roads */}
                  <path d="M 50 20 L 50 75 M 20 56 L 80 42" stroke="#857458" strokeWidth="1.5" strokeDasharray="2 2" />
                  {/* Valdoria Center */}
                  <circle cx="50" cy="54" r="10" fill="#c99b3e" fillOpacity="0.25" stroke="#e6bd64" strokeWidth="1" />
                  <circle cx="50" cy="54" r="2.5" fill="#f3cf78" />
                  <text x="50" y="69" textAnchor="middle" fill="#f6eedf" fontSize="4.5" fontWeight="bold">
                    Valdoria (You)
                  </text>

                  {/* Neighbor Factions */}
                  {world.factions.map((f) => {
                    const col =
                      f.status === 'allied' || f.status === 'trade_pact'
                        ? '#6bb586'
                        : f.status === 'war' || f.status === 'hostile'
                          ? '#d96357'
                          : '#c9a456';
                    return (
                      <g key={f.id}>
                        <circle cx={f.mapX} cy={f.mapY} r="3" fill={col} />
                        <text x={f.mapX} y={f.mapY - 5} textAnchor="middle" fill="#dfd5c3" fontSize="4">
                          {f.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Faction Diplomacy Cards */}
              <div className="space-y-3">
                {world.factions.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 bg-[#1b2029] border border-[#c9a456]/25 rounded-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-display text-sm font-semibold text-[#f3ead8]">{f.name}</div>
                        <div className="text-xs text-[#9e9484]">
                          {f.ruler} · {f.territoryLabel}
                        </div>
                      </div>
                      <div className="text-right text-xs tabular-nums">
                        <div className="capitalize font-semibold text-[#e6bd64]">
                          {f.status.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[#bdb29f] font-mono-num">Rel {f.relation}</div>
                      </div>
                    </div>
                    <p className="text-xs text-[#cfc5b3]">{f.summary}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {f.id !== 'ashwood' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onDiplomacy(f.id, 'trade_envoy')}
                            className="px-2.5 py-1.5 text-[11px] font-medium bg-[#243228] hover:bg-[#314536] text-[#d5f0dc] rounded-sm cursor-pointer"
                          >
                            Trade Caravan (20 Food → +35g)
                          </button>
                          <button
                            type="button"
                            onClick={() => onDiplomacy(f.id, 'gift')}
                            className="px-2.5 py-1.5 text-[11px] font-medium bg-[#252e3d] hover:bg-[#323e52] text-[#dce8f8] rounded-sm cursor-pointer"
                          >
                            Envoy Gift (35g → +18 Rel)
                          </button>
                        </>
                      )}
                      {(f.status === 'war' || f.status === 'hostile') && (
                        <button
                          type="button"
                          onClick={() => onDiplomacy(f.id, 'demand_truce')}
                          className="px-2.5 py-1.5 text-[11px] font-medium bg-[#3b2926] hover:bg-[#4f3632] text-[#f5dcd8] rounded-sm cursor-pointer"
                        >
                          Demand Truce (25 Renown)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
