import React from 'react';
import { WorldState } from '../simulation/types';

interface MinimapProps {
  world: WorldState;
}

const WORLD_SPAN = 140; // Maps [-140..+140] onto [0..120]

function toMapCoord(v: number): number {
  return Math.max(4, Math.min(116, ((v + WORLD_SPAN) / (WORLD_SPAN * 2)) * 120));
}

export const Minimap: React.FC<MinimapProps> = ({ world }) => {
  const kx = toMapCoord(world.king.x);
  const kz = toMapCoord(world.king.z);
  const facingDeg = (-world.king.facing * 180) / Math.PI + 180;

  return (
    <div
      className="pointer-events-auto bg-[#12151b]/92 border border-[#c8a358]/40 rounded-md p-2 shadow-xl"
      aria-label="Kingdom Tactical Minimap"
    >
      <div className="flex items-center justify-between gap-3 text-[10px] text-[#cbbda4] mb-1.5 px-0.5 whitespace-nowrap">
        <span className="font-display font-semibold text-[#f1cb75] tracking-wider uppercase">
          Valdoria Map
        </span>
        <span className="font-mono-num text-[#9e9484]">{world.carts?.length ?? 0} carts</span>
      </div>

      <svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
        className="block rounded-sm bg-[#1c231c] border border-[#ffffff]/10"
      >
        {/* Eastbrook River */}
        <path
          d="M 88 0 Q 92 30 89 60 T 88 120"
          fill="none"
          stroke="#2f6685"
          strokeWidth={4.5}
        />

        {/* North-South & East-West Highways */}
        <line x1={60} y1={14} x2={60} y2={112} stroke="#6f6656" strokeWidth={2} />
        <line x1={12} y1={63} x2={114} y2={63} stroke="#6f6656" strokeWidth={2} />
        {/* Stone Bridge highlight */}
        <rect x={85} y={60} width={8} height={5} fill="#c8b89a" rx={0.5} />

        {/* Buildings */}
        {world.buildings.map((b) => {
          const bx = toMapCoord(b.x);
          const bz = toMapCoord(b.z);
          const isKeep = b.type === 'keep';
          const fill = !b.completed
            ? '#eab308'
            : isKeep
              ? '#f5cf6e'
              : b.type === 'watchtower' || b.type === 'barracks' || b.type === 'stone_wall'
                ? '#78a5d4'
                : '#b7a98f';
          const sz = isKeep ? 5.5 : 3.2;
          return (
            <rect
              key={b.id}
              x={bx - sz / 2}
              y={bz - sz / 2}
              width={sz}
              height={sz}
              fill={fill}
              rx={0.5}
            />
          );
        })}

        {/* Moving Supply Carts & Trade Caravans */}
        {(world.carts ?? []).map((cart) => (
          <circle
            key={cart.id}
            cx={toMapCoord(cart.x)}
            cy={toMapCoord(cart.z)}
            r={cart.isCaravan ? 2.5 : 1.7}
            fill={cart.isCaravan ? '#ffdf6b' : '#d69e49'}
          />
        ))}

        {/* Garrison & Bandits */}
        {world.npcs
          .filter((n) => n.profession === 'guard' || n.profession === 'soldier' || n.profession === 'commander')
          .map((g) => (
            <circle
              key={g.id}
              cx={toMapCoord(g.x)}
              cy={toMapCoord(g.z)}
              r={1.7}
              fill="#60a5fa"
            />
          ))}

        {world.bandits
          .filter((b) => b.state !== 'ko')
          .map((b) => (
            <circle
              key={b.id}
              cx={toMapCoord(b.x)}
              cy={toMapCoord(b.z)}
              r={2.1}
              fill="#ef4444"
            />
          ))}

        {/* King Directional Marker */}
        <g transform={`translate(${kx}, ${kz}) rotate(${facingDeg})`}>
          <polygon points="0,-4.2 3.1,3.2 0,1.6 -3.1,3.2" fill="#ffffff" stroke="#c99b3e" strokeWidth={0.8} />
        </g>
      </svg>
    </div>
  );
};
