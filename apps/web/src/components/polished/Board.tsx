'use client';

import type { CSSProperties } from 'react';
import { CopMarker } from '../art/board/CopMarker';
import { RobberMarker } from '../art/board/RobberMarker';
import type { PlayerView, Role } from './types';
import { Emblem, GadgetGlyph, roleLabel } from './visuals';

// Page 2's winding route, in board-local coordinates. Tile 14 completes the escape.
const spaces = [
  [65, 54], [305, 98], [572, 27], [778, 98], [984, 27], [1211, 72],
  [1085, 333], [849, 415], [659, 306], [466, 377], [207, 306], [44, 448],
  [278, 590], [643, 625], [1085, 625],
] as const;
const routes = [
  ['ce692', 208.6, 130.4, 103.982, 63.7037], ['14520', 450.6, 77.3, 146.405, 112.496],
  ['20708', 712.1, 83.3, 61.4628, 82.2842], ['bb295', 905.6, 94.2, 82.7857, 77.064],
  ['9e24c', 1128.7, 78.9, 73.6461, 47.4573], ['6f498', 1235, 198.7, 58.12, 218.006],
  ['8293e', 1000.8, 410.1, 79.1547, 98.4821], ['43ddc', 819.7, 384.6, 26.6853, 105.816],
  ['e3bc0', 500.9, 270.3, 161.9, 109.689], ['596d0', 304.6, 460.6, 151.594, 15.4737],
  ['f5cda', 85.4, 357.8, 128.582, 91.3474], ['0b50f', 74.1, 594.5, 198.659, 178.379],
  ['3b164', 423.4, 640.6, 205.594, 84.8462],
] as const;
const stash = new Set([5, 9, 12]);
const districts = ['The vault', 'Back alley', 'Old town', 'Market', 'Crosswalk', 'Supply depot', 'Rail yard', 'Warehouse', 'Downtown', 'Safe house', 'Side street', 'Underpass', 'Black market', 'The docks', 'Getaway'];
const location = (tile: number): CSSProperties => {
  const [x, y] = spaces[tile] ?? spaces[0];
  return { left: `${x / 1436 * 100}%`, top: `${y / 807 * 100}%` };
};

function Marker({ player }: { player: PlayerView }) {
  const tile = Math.max(0, Math.min(14, Math.trunc(player.position) || 0));
  return <div className={`pursuit-marker pursuit-marker-${player.role.toLowerCase()}`} style={{ ...location(tile), opacity: player.connected ? 1 : .55 }} aria-label={`${player.nickname}, ${roleLabel(player.role)}, tile ${tile}${player.connected ? '' : ', disconnected'}`}>
    <div className="pursuit-token">{player.role === 'COP' ? <CopMarker size={36} /> : <RobberMarker size={36} />}</div>
  </div>;
}

export function Board({ players }: { players: PlayerView[] }) {
  const cop = players.find(player => player.role === 'COP');
  const robber = players.find(player => player.role === 'ROBBER');
  const gap = cop && robber ? Math.max(0, robber.position - cop.position) : null;
  return <section aria-label="Heist board" className="pursuit-board">
    <header className="pursuit-header">
      <div><p className="game-eyebrow">git money / pursuit board</p><h2>The great getaway</h2><p className="pursuit-subtitle">One winding route. Stay ahead. Make it out.</p></div>
      <div className="pursuit-distance"><span>Distance to capture</span><strong>{gap === null ? '—' : String(gap).padStart(2, '0')} <small>{gap === 1 ? 'space' : 'spaces'}</small></strong></div>
    </header>
    <div className="pursuit-scroll" tabIndex={0} aria-label="Pursuit map; scroll horizontally on small screens">
      <div className="pursuit-map">
        <svg className="pursuit-route" viewBox="0 0 1436 807" aria-hidden="true">
          {routes.map(([asset, x, y, width, height]) => <image key={asset} href={`/board/${asset}.svg`} x={x} y={y} width={width} height={height} />)}
          <path d="M790 696 C880 696 920 730 1074 696" fill="none" stroke="var(--hc-gold)" strokeWidth="5" strokeDasharray="10 9" />
        </svg>
        <ol className="pursuit-spaces" aria-label="Tiles 0 through 14">
          {spaces.map((_, tile) => {
            const isStash = stash.has(tile), isEscape = tile === 14;
            const occupants = players.filter(player => player.position === tile);
            return <li key={tile} className={`pursuit-space ${isStash ? 'pursuit-stash' : ''} ${isEscape ? 'pursuit-escape' : ''} ${tile === 0 ? 'pursuit-start' : ''} ${occupants.length ? 'pursuit-occupied' : ''}`} style={location(tile)} aria-label={`Tile ${tile}, ${districts[tile]}${isStash ? ', gadget stash' : ''}${isEscape ? ', escape' : ''}${occupants.map(player => `, ${player.nickname}`).join('')}`}>
              <div className="pursuit-space-top"><span>{String(tile).padStart(2, '0')}</span><span aria-hidden="true">{isStash ? '◇' : isEscape ? '↗' : tile < 6 ? '→' : tile < 12 ? '←' : '→'}</span></div>
              <div className="pursuit-space-icon">{isStash ? <GadgetGlyph type="SHIELD" /> : isEscape ? <GadgetGlyph type="GETAWAY_CAR" /> : <span aria-hidden="true" className="pursuit-street-lines" />}</div>
              <div className="pursuit-space-label"><strong>{isEscape ? 'Escape' : isStash ? 'Stash' : tile === 0 ? 'Start' : 'Street'}</strong><span>{districts[tile]}</span></div>
            </li>;
          })}
        </ol>
        {players.filter(player => player.role === 'COP' || player.role === 'ROBBER').map(player => <Marker key={player.id} player={player} />)}
        <div className="pursuit-map-caption" aria-hidden="true">THE CITY IS YOUR GAME BOARD <span>FOLLOW THE GOLD →</span></div>
      </div>
    </div>
    <footer className="pursuit-footer">
      <div className="pursuit-players">{(['COP', 'ROBBER'] as Role[]).map(role => {
        const player = role === 'COP' ? cop : robber;
        return <div key={role} className={`pursuit-player pursuit-player-${role.toLowerCase()}`}><Emblem role={role} /><div><strong>{player?.nickname ?? roleLabel(role)}</strong><span>{roleLabel(role)} · tile {String(player?.position ?? 0).padStart(2, '0')}{player && !player.connected ? ' · offline' : ''}</span></div></div>;
      })}</div>
      <p className="pursuit-key"><span>◇</span> Stash: 05 / 09 / 12 <span>↗</span> Escape: 14</p>
    </footer>
  </section>;
}
