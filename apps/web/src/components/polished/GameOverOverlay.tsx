'use client';

import Link from 'next/link';
import type { Role } from './types';
import { Emblem, hc, roleColor, roleLabel, tint } from './visuals';

const ending = {
  CAUGHT: 'The cops caught the robbers.',
  ESCAPED: 'The robbers reached the escape.',
  EVADED: 'The robbers stayed ahead until time ran out.',
} as const;

export function GameOverOverlay({ winner, reason, viewerRole }: { viewerRole?: Role | null; winner: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' }) {
  const accent = roleColor(winner);
  const won = viewerRole === winner;
  return <section role="dialog" aria-modal="true" aria-label="Game over" className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 text-center" style={{ color: hc.text, background: `radial-gradient(ellipse at 50% 35%, ${tint(accent, 7)}, transparent 70%), ${hc.bg}` }}>
    <div className="w-full max-w-5xl rounded-none border p-7 sm:p-12" style={{ borderColor: tint(accent, 65), background: hc.panel }}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border" style={{ borderColor: accent, background: tint(accent, 13) }}><Emblem role={winner} size={36} /></div>
      {won && <h2 className="mt-6"><img src="/mission-passed.png" alt="Mission passed" className="mx-auto h-auto w-full" /></h2>}
      <h2 className="font-display mt-3 text-[clamp(3.5rem,10vw,7rem)] font-black uppercase leading-none tracking-normal" style={{ color: accent }}>{roleLabel(winner)} win</h2>
      <p className="mt-5 text-lg font-medium sm:text-2xl">{ending[reason]}</p>
      <div className="mx-auto mt-7 h-px w-28" style={{ background: accent }} />
      <Link href="/" className="game-primary game-home-link">Back to home ↗</Link>
    </div>
  </section>;
}
