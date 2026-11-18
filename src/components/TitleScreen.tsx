import React from 'react';

interface TitleScreenProps {
  hasSavedGame: boolean;
  onStartNew: () => void;
  onContinueSaved: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSavedGame,
  onStartNew,
  onContinueSaved,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none">
      {/* Subtle left-side scrim for crisp typography contrast over the live 3D village */}
      <div
        className="absolute inset-y-0 left-0 w-full md:w-[52%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(12, 14, 18, 0.86) 0%, rgba(12, 14, 18, 0.56) 62%, rgba(12, 14, 18, 0) 100%)',
        }}
      />

      {/* Top/Middle Royal Lockup */}
      <div className="relative z-10 max-w-xl mt-6 md:mt-14 pointer-events-auto">
        {/* Bespoke inline SVG Royal Heraldic Crest */}
        <svg
          viewBox="0 0 180 76"
          className="w-36 h-16 mb-5"
          aria-hidden="true"
        >
          {/* Crossed Swords */}
          <path
            d="M42 64 L138 14 M138 64 L42 14"
            stroke="#c9a456"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Shield Escutcheon */}
          <path
            d="M90 12 L114 20 V42 C114 55 102 64 90 68 C78 64 66 55 66 42 V20 Z"
            fill="#1a2230"
            stroke="#e0bc6c"
            strokeWidth="2.4"
          />
          {/* Crown Silhouette inside Shield */}
          <path
            d="M77 45 L75 31 L84 37 L90 27 L96 37 L105 31 L103 45 Z"
            fill="#e6bd64"
            stroke="#593f14"
            strokeWidth="1.2"
          />
          <rect x="77" y="47" width="26" height="3.5" rx="1" fill="#e6bd64" />
        </svg>

        <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-[#f7f0e2] leading-[1.06] text-balance">
          Crown of Valdoria
        </h1>
        <p className="mt-4 text-base md:text-lg text-[#d4cbb8] max-w-md leading-relaxed">
          Walk your cobblestone streets in person, command builders and soldiers, raise your settlement, and defend the realm.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartNew}
            className="px-7 py-3.5 bg-[#c99b3e] hover:bg-[#dba948] active:bg-[#b58932] text-[#14110c] font-semibold text-sm tracking-wide rounded-md shadow-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2d084]"
          >
            Enter the Realm
          </button>

          {hasSavedGame && (
            <button
              type="button"
              onClick={onContinueSaved}
              className="px-6 py-3.5 bg-[#1b2029]/95 hover:bg-[#262d39] text-[#efe5d2] border border-[#c9a456]/45 font-medium text-sm rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a456]"
            >
              Continue Reign
            </button>
          )}
        </div>
      </div>

      {/* Single flat bottom control-hint line */}
      <div className="relative z-10 text-xs text-[#cfc6b4] tracking-wide">
        WASD Move · Mouse Drag Orbit · E Speak &amp; Command · F / Click Strike · H Warhorse · B Build · Tab Ledger · Esc Pause
      </div>
    </div>
  );
};
