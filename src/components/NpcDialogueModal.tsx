import React from 'react';
import { X } from 'lucide-react';
import { PROFESSION_LABELS } from '../simulation/constants';
import { NpcOrderType, NpcState } from '../simulation/types';

interface NpcDialogueModalProps {
  npc: NpcState;
  worldNpcs: NpcState[];
  kingGold: number;
  onIssueOrder: (npcId: string, order: NpcOrderType) => void;
  onReward: (npcId: string) => void;
  onRecruit: (role: 'soldier' | 'guard' | 'worker') => void;
  onClose: () => void;
}

export const NpcDialogueModal: React.FC<NpcDialogueModalProps> = ({
  npc,
  worldNpcs,
  kingGold,
  onIssueOrder,
  onReward,
  onRecruit,
  onClose,
}) => {
  const isMilitary =
    npc.profession === 'commander' || npc.profession === 'soldier' || npc.profession === 'guard';

  const spouse = npc.spouseId ? worldNpcs.find((n) => n.id === npc.spouseId) : undefined;
  const parents = (npc.parentIds ?? [])
    .map((id) => worldNpcs.find((n) => n.id === id))
    .filter((n): n is NpcState => Boolean(n));
  const children = (npc.childrenIds ?? [])
    .map((id) => worldNpcs.find((n) => n.id === id))
    .filter((n): n is NpcState => Boolean(n));

  const orderButtons: Array<{ order: NpcOrderType; label: string }> = [
    { order: 'follow_king', label: 'Follow Me' },
    { order: 'guard_post', label: 'Guard This Post' },
    { order: 'assist_construction', label: 'Assist Construction' },
    { order: 'work_farm', label: 'Work Fields' },
    { order: 'gather_wood', label: 'Gather Timber' },
    { order: 'patrol_village', label: 'Patrol Village' },
    ...(isMilitary ? [{ order: 'attack_bandits' as NpcOrderType, label: 'Assault Bandit Camp' }] : []),
    { order: 'resume_duty', label: 'Resume Regular Duty' },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={`Royal Audience with ${npc.name}`}
    >
      <div className="w-full max-w-xl bg-[#15181f] border border-[#c9a456]/55 rounded-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#c9a456]/25 bg-[#1b1f28]">
          <div>
            <h2 className="font-display text-xl font-bold text-[#f6eedf]">{npc.name}</h2>
            <div className="mt-1 text-xs text-[#cbbda4]">
              {PROFESSION_LABELS[npc.profession]}
              {npc.familyName ? ` · House ${npc.familyName}` : ''} · Age {npc.age} · {npc.personality}
            </div>
            {npc.traits && npc.traits.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {npc.traits.map((trait) => (
                  <span
                    key={trait}
                    className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm bg-[#252b38] text-[#f0cb75] border border-[#c9a456]/35"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#cbbda4] hover:text-white rounded-sm cursor-pointer"
            aria-label="Close Dialogue"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Citizen Status Strip */}
        <div className="px-6 py-3 grid grid-cols-4 gap-3 bg-[#12151b] border-b border-[#ffffff]/10 text-xs">
          <div>
            <div className="text-[#9e9484]">Loyalty</div>
            <div className="font-mono-num font-semibold text-[#7dc8d6] mt-0.5">{npc.loyalty}%</div>
          </div>
          <div>
            <div className="text-[#9e9484]">Happiness</div>
            <div className="font-mono-num font-semibold text-[#99ca74] mt-0.5">{npc.happiness}%</div>
          </div>
          <div>
            <div className="text-[#9e9484]">Health</div>
            <div className="font-mono-num font-semibold text-[#e69a8d] mt-0.5">
              {Math.round(npc.hp)}/{npc.maxHp}
            </div>
          </div>
          <div>
            <div className="text-[#9e9484]">Activity</div>
            <div className="font-medium text-[#f2eadb] mt-0.5 capitalize truncate">
              {npc.activity.replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        {/* Family Lineage Strip */}
        {(spouse || parents.length > 0 || children.length > 0) && (
          <div className="px-6 py-2.5 bg-[#161a22] border-b border-[#ffffff]/10 text-xs flex flex-wrap gap-x-5 gap-y-1 text-[#d8ceb9]">
            {spouse && (
              <div>
                <span className="text-[#9e9484]">Spouse: </span>
                <span className="font-medium text-[#f3cf78]">
                  {spouse.name} ({PROFESSION_LABELS[spouse.profession]})
                </span>
              </div>
            )}
            {parents.length > 0 && (
              <div>
                <span className="text-[#9e9484]">Parents: </span>
                <span className="font-medium text-[#e7decb]">
                  {parents.map((p) => `${p.name} (${PROFESSION_LABELS[p.profession]})`).join(' & ')}
                </span>
              </div>
            )}
            {children.length > 0 && (
              <div>
                <span className="text-[#9e9484]">Children: </span>
                <span className="font-medium text-[#99ca74]">
                  {children.map((c) => `${c.name.split(' ')[0]} (${c.age}y)`).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Citizen Dialogue / Report */}
        <div className="px-6 py-4">
          <div className="p-4 bg-[#1c212b] border border-[#c9a456]/25 rounded-sm text-sm text-[#efe6d5] leading-relaxed">
            “{npc.speechTimer > 0 && npc.speechLine ? npc.speechLine : npc.complaint}”
          </div>

          {/* Direct Royal Orders */}
          <div className="mt-5">
            <div className="text-xs font-semibold text-[#e6bd64] uppercase tracking-wider mb-2.5">
              Issue Royal Order
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {orderButtons.map((btn) => (
                <button
                  key={btn.order}
                  type="button"
                  onClick={() => onIssueOrder(npc.id, btn.order)}
                  className={`px-3 py-2 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                    npc.order === btn.order
                      ? 'bg-[#c99b3e] text-[#14110c] border-[#f2d084]'
                      : 'bg-[#1d222c] hover:bg-[#28303e] text-[#efe5d2] border-[#c8a358]/30'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Royal Actions */}
          <div className="mt-5 pt-4 border-t border-[#ffffff]/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={kingGold < 15}
                onClick={() => onReward(npc.id)}
                className="px-3.5 py-2 text-xs font-semibold rounded-sm bg-[#27382b] hover:bg-[#324a38] disabled:opacity-45 text-[#d8f3df] border border-[#6bb586]/45 cursor-pointer"
              >
                Reward 15 Gold
              </button>

              {npc.profession === 'commander' && (
                <button
                  type="button"
                  onClick={() => onRecruit('soldier')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-sm bg-[#283345] hover:bg-[#35445c] text-[#dce8f8] border border-[#6c8fbf]/45 cursor-pointer"
                >
                  Recruit Soldier (30g · 15 Food)
                </button>
              )}

              {npc.profession === 'chancellor' && (
                <button
                  type="button"
                  onClick={() => onRecruit('worker')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-sm bg-[#283345] hover:bg-[#35445c] text-[#dce8f8] border border-[#6c8fbf]/45 cursor-pointer"
                >
                  Settle Artisan (20g · 10 Food)
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-[#252a34] hover:bg-[#313845] text-[#f2eadb] rounded-sm cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
