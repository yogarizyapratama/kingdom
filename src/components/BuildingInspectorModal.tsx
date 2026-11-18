import React from 'react';
import { ArrowUpCircle, Trash2, Users, X } from 'lucide-react';
import { BUILDING_SPECS, PROFESSION_LABELS } from '../simulation/constants';
import { getBuildingUpgradeCost } from '../simulation/kingdomEngine';
import { BuildingInstance, NpcState, ResourceStock } from '../simulation/types';

interface BuildingInspectorModalProps {
  building: BuildingInstance;
  npcs: NpcState[];
  resources: ResourceStock;
  onUpgrade: (buildingId: string) => void;
  onDemolish: (buildingId: string) => void;
  onClose: () => void;
}

export const BuildingInspectorModal: React.FC<BuildingInspectorModalProps> = ({
  building,
  npcs,
  resources,
  onUpgrade,
  onDemolish,
  onClose,
}) => {
  const spec = BUILDING_SPECS[building.type];
  const cost = getBuildingUpgradeCost(building);
  const canAffordUpgrade =
    building.completed &&
    building.level < 3 &&
    resources.gold >= cost.gold &&
    resources.wood >= cost.wood &&
    resources.stone >= cost.stone;

  const assignedNpcs = npcs.filter(
    (n) => n.workBuildingId === building.id || n.homeBuildingId === building.id,
  );
  const refundWood = Math.round(spec.costWood * 0.5);
  const refundStone = Math.round(spec.costStone * 0.5);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${building.name}`}
    >
      <div className="w-full max-w-md bg-[#15181f] border border-[#c9a456]/55 rounded-md shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#c9a456]/25 bg-[#1b1f28]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-bold text-[#f6eedf]">{building.name}</h3>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-[#c99b3e]/20 text-[#f3cf78] border border-[#c9a456]/40 rounded-sm">
                Tier {building.level}/3
              </span>
            </div>
            <p className="text-xs text-[#cbbda4] mt-0.5">{spec.roleSummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#cbbda4] hover:text-white cursor-pointer"
            aria-label="Close Building Inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {!building.completed && (
            <div className="p-3 bg-[#1d222c] border border-[#c9a456]/35 rounded-sm">
              <div className="flex justify-between text-[#f3ead8] font-medium mb-1">
                <span>Construction Progress</span>
                <span className="font-mono-num">{Math.round(building.progress * 100)}%</span>
              </div>
              <div className="h-2 bg-[#101318] rounded-sm overflow-hidden">
                <div
                  className="h-full bg-[#c99b3e]"
                  style={{ width: `${Math.round(building.progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Output & Assigned Citizens */}
          <div className="p-3 bg-[#1a1e26] border border-[#ffffff]/10 rounded-sm space-y-2">
            <div className="flex items-center justify-between text-[#dfd5c3]">
              <span className="flex items-center gap-1.5 font-semibold">
                <Users className="w-3.5 h-3.5 text-[#e6bd64]" />
                <span>Residents &amp; Workers ({assignedNpcs.length})</span>
              </span>
              <span className="text-[#9e9484]">
                Output ×{(1 + Math.max(0, building.level - 1) * 0.45).toFixed(2)}
              </span>
            </div>
            {assignedNpcs.length === 0 ? (
              <div className="text-[#9e9484]">No citizens currently stationed here.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignedNpcs.slice(0, 8).map((n) => (
                  <span
                    key={n.id}
                    className="px-2 py-0.5 bg-[#12161e] border border-[#ffffff]/10 rounded-sm text-[#e8dfce]"
                  >
                    {n.name} · {PROFESSION_LABELS[n.profession]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions: Upgrade & Demolish */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!canAffordUpgrade}
              onClick={() => onUpgrade(building.id)}
              className="w-full py-2.5 px-3 bg-[#c99b3e] hover:bg-[#dba948] disabled:bg-[#2a2f3b] disabled:text-[#7e7769] text-[#14110c] font-semibold rounded-sm flex items-center justify-between transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-1.5">
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  {!building.completed
                    ? 'Finish Construction First'
                    : building.level >= 3
                      ? 'Maximum Tier Reached'
                      : `Upgrade to Tier ${building.level + 1} (+45% Output)`}
                </span>
              </span>
              {building.completed && building.level < 3 && (
                <span className="font-mono-num text-[11px]">
                  {cost.gold}g · {cost.wood}w · {cost.stone}s
                </span>
              )}
            </button>

            {building.type !== 'keep' && (
              <button
                type="button"
                onClick={() => onDemolish(building.id)}
                className="w-full py-2 px-3 bg-[#24191b] hover:bg-[#382125] border border-[#b93c34]/45 text-[#e8a39d] rounded-sm flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Dismantle Building</span>
                </span>
                <span className="font-mono-num text-[11px]">
                  Refund +{refundWood}w +{refundStone}s
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
