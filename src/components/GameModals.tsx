import React from 'react';
import { GameSnapshot } from '../simulation/types';

interface PauseModalProps {
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  hasSave: boolean;
  onRestart: () => void;
  onTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onSave,
  onLoad,
  hasSave,
  onRestart,
  onTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Game Paused"
    >
      <div className="w-full max-w-sm bg-[#15181f] border border-[#c9a456]/55 rounded-md p-6 shadow-2xl text-center">
        <h2 className="font-display text-2xl font-bold text-[#f6eedf]">Reign Paused</h2>
        <p className="text-xs text-[#bdb29f] mt-1">The realm awaits your return, Your Majesty.</p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-[#c99b3e] hover:bg-[#dba948] text-[#14110c] font-semibold text-sm rounded-sm cursor-pointer"
          >
            Resume Reign
          </button>
          <button
            type="button"
            onClick={onSave}
            className="w-full py-2.5 bg-[#1d222c] hover:bg-[#28303e] text-[#efe5d2] border border-[#c8a358]/30 text-sm font-medium rounded-sm cursor-pointer"
          >
            Save Kingdom
          </button>
          {hasSave && (
            <button
              type="button"
              onClick={onLoad}
              className="w-full py-2.5 bg-[#1d222c] hover:bg-[#28303e] text-[#efe5d2] border border-[#c8a358]/30 text-sm font-medium rounded-sm cursor-pointer"
            >
              Load Saved Kingdom
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 bg-[#1d222c] hover:bg-[#28303e] text-[#efe5d2] border border-[#ffffff]/15 text-sm font-medium rounded-sm cursor-pointer"
          >
            Restart Realm
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="w-full py-2.5 bg-transparent hover:bg-[#1e232d] text-[#c7beae] text-sm rounded-sm cursor-pointer"
          >
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
};

interface OutcomeModalProps {
  snapshot: GameSnapshot;
  onPlayAgain: () => void;
  onTitle: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  snapshot,
  onPlayAgain,
  onTitle,
}) => {
  const isVictory = snapshot.outcome === 'victory';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/72"
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Kingdom Victory' : 'Kingdom Fallen'}
    >
      <div className="w-full max-w-md bg-[#15181f] border border-[#c9a456]/60 rounded-md p-7 shadow-2xl text-center">
        <div
          className={`text-xs font-semibold uppercase tracking-widest ${
            isVictory ? 'text-[#e6bd64]' : 'text-[#e06d63]'
          }`}
        >
          {isVictory ? 'Royal Triumph' : 'Crown Fallen'}
        </div>
        <h2 className="font-display text-3xl font-bold text-[#f7f0e2] mt-1">
          {isVictory ? 'Valdoria Stands Eternal' : 'The Throne Is Lost'}
        </h2>
        <p className="text-sm text-[#cfc5b3] mt-3 leading-relaxed">{snapshot.outcomeReason}</p>

        <div className="mt-6 grid grid-cols-3 gap-3 text-left">
          <div className="p-3 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
            <div className="text-[11px] text-[#9e9484]">Day Reached</div>
            <div className="text-lg font-mono-num font-bold text-[#f5cf6e] mt-0.5">{snapshot.day}</div>
          </div>
          <div className="p-3 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
            <div className="text-[11px] text-[#9e9484]">Built</div>
            <div className="text-lg font-mono-num font-bold text-[#99ca74] mt-0.5">
              {snapshot.buildingsConstructed}
            </div>
          </div>
          <div className="p-3 bg-[#1c212b] border border-[#ffffff]/10 rounded-sm">
            <div className="text-[11px] text-[#9e9484]">Brigands Slain</div>
            <div className="text-lg font-mono-num font-bold text-[#e69a8d] mt-0.5">
              {snapshot.banditsDefeated}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-2.5 bg-[#c99b3e] hover:bg-[#dba948] text-[#14110c] font-semibold text-sm rounded-sm cursor-pointer"
          >
            Rule Again
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="px-4 py-2.5 bg-[#1d222c] hover:bg-[#28303e] text-[#efe5d2] text-sm rounded-sm cursor-pointer"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
