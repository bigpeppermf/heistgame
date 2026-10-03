'use client';

import type { Role } from './types';
import { Emblem, hc, roleColor, tint } from './visuals';

const ending = {
  CAUGHT: 'Caught at the getaway car.',
  ESCAPED: 'Gone without a trace.',
  EVADED: 'The heat never closed in.',
} as const;

export function GameOverOverlay({ winner, reason }: { winner: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' }) {
  const accent = roleColor(winner);
  return <section role="dialog" aria-modal="true" aria-label="Game over" className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 text-center" style={{ color: hc.text, background: `radial-gradient(circle at 50% 40%, ${tint(accent, 24)}, transparent 58%), ${hc.bg}` }}>
    <div className="w-full max-w-2xl rounded-[30px] border p-7 shadow-2xl sm:p-12" style={{ borderColor: tint(accent, 65), background: `color-mix(in srgb, ${hc.panel} 92%, transparent)`, boxShadow: `0 0 80px ${tint(accent, 14)}` }}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border" style={{ borderColor: accent, background: tint(accent, 13) }}><Emblem role={winner} size={36} /></div>
      <p className="mt-6 text-[11px] font-black uppercase tracking-[.4em]" style={{ color: accent }}>Operation complete</p>
      <h2 className="font-display mt-3 text-[clamp(3.5rem,10vw,7rem)] font-black uppercase leading-none tracking-[.04em]" style={{ color: accent }}>{winner === 'COP' ? 'Cop wins' : 'Robber wins'}</h2>
      <p className="mt-5 text-lg font-medium sm:text-2xl">{ending[reason]}</p>
      <div className="mx-auto mt-7 h-px w-28" style={{ background: accent }} />
      <p className="mt-5 text-xs font-black uppercase tracking-[.2em]" style={{ color: hc.dim }}>Heistcode / case closed</p>
    </div>
  </section>;
}
