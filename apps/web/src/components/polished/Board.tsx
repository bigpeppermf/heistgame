'use client';

import type { PlayerView, Role } from './types';
import { Emblem, hc, roleColor, roleLabel, tint } from './visuals';

const visualOrder = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14];
const stash = new Set([5, 9, 12]);

function markerPosition(position: number) {
  const tile = Math.max(0, Math.min(14, Math.trunc(position) || 0));
  const row = Math.floor(tile / 5);
  const column = row === 1 ? 9 - tile : tile % 5;
  return `translate(${column * 100}%, ${row * 100}%)`;
}

function Marker({ player }: { player: PlayerView }) {
  const color = roleColor(player.role);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-10 h-1/3 w-1/5 p-1.5 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:p-2"
      style={{ transform: markerPosition(player.position) }}
      aria-label={`${player.nickname}, ${roleLabel(player.role)}, tile ${player.position}${player.connected ? '' : ', disconnected'}`}
    >
      <div className={`flex h-full justify-center ${player.role === 'COP' ? 'items-start' : 'items-end'}`}>
        <div
          className={`flex min-w-0 items-center gap-1 rounded-none border px-1.5 py-1 shadow-lg backdrop-blur-md sm:px-2 ${player.role === 'ROBBER' ? 'mt-auto' : ''}`}
          style={{ color, borderColor: color, background: `color-mix(in srgb, ${hc.bg} 84%, ${color})`, boxShadow: `0 0 20px ${tint(color, 25)}`, opacity: player.connected ? 1 : .55 }}
        >
          <Emblem role={player.role} size={13} />
          <span className="hidden truncate text-[10px] font-black uppercase tracking-[.14em] sm:block">{roleLabel(player.role)}</span>
        </div>
      </div>
    </div>
  );
}

export function Board({ players }: { players: PlayerView[] }) {
  const cop = players.find(player => player.role === 'COP');
  const robber = players.find(player => player.role === 'ROBBER');
  const gap = cop && robber ? Math.max(0, robber.position - cop.position) : null;

  return (
    <section aria-label="Heist board" className="relative w-full overflow-hidden rounded-none border p-4 shadow-2xl sm:p-6" style={{ color: hc.text, background: `radial-gradient(circle at 50% -15%, ${tint(hc.gold, 12)}, transparent 50%), ${hc.bg}`, borderColor: hc.line }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.35em]" style={{ color: hc.gold }}>git money / pursuit map</div>
          <h2 className="font-display mt-2 text-3xl font-black uppercase leading-none tracking-[.03em] sm:text-4xl">The chase</h2>
          <p className="mt-2 text-xs" style={{ color: hc.dim }}>15 tiles · stash at 05, 09, 12 · escape at 14</p>
        </div>
        <div className="rounded-none border px-4 py-2 text-right" style={{ background: tint(hc.panel, 85), borderColor: hc.line }}>
          <div className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: hc.dim }}>Distance to capture</div>
          <div className="mt-0.5 text-2xl font-black tabular-nums leading-none" style={{ color: gap === 0 ? hc.cop : hc.gold }}>{gap === null ? '—' : String(gap).padStart(2, '0')} <span className="text-xs tracking-normal" style={{ color: hc.dim }}>{gap === 1 ? 'tile' : 'tiles'}</span></div>
        </div>
      </div>

      <div className="relative">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="list" aria-label="Tiles 0 through 14">
          {visualOrder.map(tile => {
            const isStash = stash.has(tile);
            const isEscape = tile === 14;
            const isStart = tile === 0;
            const accent = isEscape ? hc.robber : isStash ? hc.gold : hc.line;
            return (
              <div key={tile} role="listitem" aria-label={`Tile ${tile}${isStash ? ', gadget stash' : ''}${isEscape ? ', escape' : ''}`} className="relative flex h-[76px] min-w-0 flex-col justify-between overflow-hidden rounded-none border p-2 sm:h-[106px] rounded-none sm:p-3" style={{ borderColor: accent, background: isEscape || isStash ? tint(accent, 12) : hc.panel }}>
                <div className="flex items-start justify-between gap-0.5">
                  <span className="text-[10px] font-black tabular-nums tracking-[.1em] sm:text-xs" style={{ color: isEscape || isStash ? accent : hc.dim }}>{String(tile).padStart(2, '0')}</span>
                  {(isStash || isEscape) && <span aria-hidden="true" className="text-base leading-none sm:text-xl" style={{ color: accent }}>{isEscape ? '✦' : '◇'}</span>}
                </div>
                <span className="truncate text-[8px] font-black uppercase tracking-[.06em] sm:text-[10px] sm:tracking-[.15em]" style={{ color: isEscape || isStash ? accent : hc.dim }}>{isEscape ? 'Escape' : isStash ? 'Stash' : isStart ? 'Start' : 'Street'}</span>
              </div>
            );
          })}
        </div>
        {players.filter(player => player.role === 'COP' || player.role === 'ROBBER').map(player => <Marker key={player.id} player={player} />)}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: hc.line }}>
        {(['COP', 'ROBBER'] as Role[]).map(role => {
          const player = role === 'COP' ? cop : robber;
          return <div key={role} className="flex min-w-0 items-center gap-2"><Emblem role={role} /><span className="truncate text-xs font-bold">{player?.nickname ?? roleLabel(role)}</span><span className="text-[10px] font-black uppercase tracking-wider" style={{ color: roleColor(role) }}>{roleLabel(role)} · {String(player?.position ?? 0).padStart(2, '0')}</span>{player && !player.connected && <span className="rounded-none border px-1.5 py-0.5 text-[9px] uppercase" style={{ color: hc.dim, borderColor: hc.line }}>offline</span>}</div>;
        })}
      </div>
    </section>
  );
}
