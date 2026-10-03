'use client';

import { hc, tint } from './visuals';

export function BlackoutOverlay({ secondsLeft }: { secondsLeft: number }) {
  return <div role="alert" aria-live="polite" className="absolute inset-0 z-30 flex min-h-[180px] flex-col items-center justify-center overflow-hidden border p-5 text-center" style={{ color: hc.text, background: `radial-gradient(circle at center, ${tint(hc.gold, 8)}, transparent 55%), ${hc.bg}`, borderColor: hc.line }}>
    <div className="absolute inset-x-0 top-0 h-1" style={{ background: hc.gold }} />
    <p className="text-[10px] font-black uppercase tracking-[.35em]" style={{ color: hc.gold }}>Signal interruption</p>
    <h2 className="font-display mt-3 text-[clamp(3.5rem,12vw,7rem)] font-black uppercase leading-none tracking-[.04em]">BLACKOUT</h2>
    <div className="mt-4 text-[clamp(3rem,12vw,7rem)] font-black tabular-nums leading-none" style={{ color: hc.gold }}>{Math.max(0, Math.ceil(secondsLeft))}<span className="ml-1 text-xl tracking-normal sm:text-3xl">s</span></div>
    <p className="mt-4 max-w-sm text-sm" style={{ color: hc.dim }}>Your editor is dark. Access returns when the countdown ends.</p>
  </div>;
}
