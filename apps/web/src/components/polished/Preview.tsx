'use client';

import type { ReactNode } from 'react';
import { ActiveEffectBadges } from './ActiveEffectBadges';
import { BlackoutOverlay } from './BlackoutOverlay';
import { Board } from './Board';
import { GameOverOverlay } from './GameOverOverlay';
import { JammedPanel } from './JammedPanel';
import { PowerupOffer } from './PowerupOffer';
import { PowerupTray } from './PowerupTray';
import { ScorePanel } from './ScorePanel';
import type { PlayerView, RoundScore } from './types';
import { hc } from './visuals';

const fixtureNow = 1_800_000_000_000;

const cop: PlayerView = {
  id: 'cop-1', nickname: 'BYTEWITCH', role: 'COP', position: 8,
  inventory: [], shielded: false, activeEffects: [],
  submitted: true, connected: false, progress: 100,
};

const robber: PlayerView = {
  id: 'robber-1', nickname: 'GHOST.exe', role: 'ROBBER', position: 13,
  inventory: ['EMP', 'SMOKE_BOMB', 'GETAWAY_CAR'], shielded: true,
  activeEffects: [
    { type: 'SMOKE_BOMB', expiresAt: fixtureNow + 12_000 },
    { type: 'JAMMED_COMMS', expiresAt: fixtureNow + 5_000 },
    { type: 'BLACKOUT', expiresAt: fixtureNow - 1_000 },
  ],
  submitted: true, connected: true, progress: 100,
};

const scores: Record<string, RoundScore> = {
  [cop.id]: { correctness: 72, style: 16, total: 88, baseTiles: 4, modifierDelta: -1, speedBonus: 0, tiles: 3, passed: 7, totalTests: 10, note: 'We found a trail. They found a shortcut.' },
  [robber.id]: { correctness: 80, style: 19, total: 99, baseTiles: 5, modifierDelta: 1, speedBonus: 1, tiles: 7, passed: 10, totalTests: 10, note: 'The alarm was just background music.' },
};

function Demo({ title, children, height }: { title: string; children: ReactNode; height?: string }) {
  return <section className="min-w-0"><h2 className="mb-3 text-xs font-black uppercase tracking-normal" style={{ color: hc.gold }}>{title}</h2><div className={`relative overflow-hidden rounded-none border ${height ?? ''}`} style={{ borderColor: hc.line, background: hc.panel }}>{children}</div></section>;
}

export default function Preview() {
  return <main className="game-theme game-preview min-h-screen px-4 py-8 sm:px-8" style={{ color: hc.text, background: hc.bg }}>
    <div className="mx-auto max-w-6xl space-y-9">
      <header className="border-b pb-6" style={{ borderColor: hc.line }}><p className="text-xs font-black uppercase tracking-normal" style={{ color: hc.gold }}>git money / component preview</p><h1 className="font-display mt-2 text-5xl font-black uppercase tracking-normal sm:text-7xl">Visual review</h1><p className="mt-2 text-sm" style={{ color: hc.dim }}>Fixture: Heist Crew on tile 13, disconnected Cops, stacked effects, armed shield, and both empty and full loadouts.</p></header>
      <Demo title="01 / Board"><Board players={[cop, robber]} /></Demo>
      <Demo title="02 / Round score" height="h-[780px] sm:h-[620px]"><ScorePanel players={[cop, robber]} scores={scores} round={2} /></Demo>
      <div className="grid gap-6 lg:grid-cols-2"><Demo title="03 / Three gadgets + shield"><PowerupTray me={robber} phase="CODING" hostileUsed={true} onUse={() => undefined} /></Demo><Demo title="03 / Empty inventory"><PowerupTray me={cop} phase="CODING" hostileUsed={true} onUse={() => undefined} /></Demo></div>
      <Demo title="04 / Stacked active effects"><div className="p-6"><ActiveEffectBadges effects={robber.activeEffects} now={fixtureNow} /></div></Demo>
      <div className="grid gap-6 lg:grid-cols-2"><Demo title="05 / Stash offer" height="h-[420px]"><PowerupOffer options={['BLACKOUT', 'ROADBLOCK']} secondsLeft={7} onChoose={() => undefined} /></Demo><Demo title="06 / Editor blackout" height="h-[420px]"><BlackoutOverlay secondsLeft={9} /></Demo></div>
      <div className="grid gap-6 lg:grid-cols-2"><Demo title="07 / Jammed test results" height="h-[280px]"><JammedPanel secondsLeft={6} /></Demo><Demo title="08 / Game over" height="h-[420px]"><GameOverOverlay winner="ROBBER" reason="ESCAPED" viewerRole="ROBBER" /></Demo></div>
    </div>
  </main>;
}
