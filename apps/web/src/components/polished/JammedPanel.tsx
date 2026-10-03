'use client';

import { hc, tint } from './visuals';

export function JammedPanel({ secondsLeft }: { secondsLeft: number }) {
  return <section role="alert" aria-live="polite" className="flex h-full min-h-[210px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border p-5 text-center" style={{ color: hc.text, background: `repeating-linear-gradient(0deg, ${tint(hc.cop, 5)} 0px, ${tint(hc.cop, 5)} 1px, transparent 1px, transparent 6px), ${hc.panel}`, borderColor: hc.cop }}>
    <div className="text-3xl leading-none" style={{ color: hc.cop }} aria-hidden="true">≋</div>
    <p className="mt-3 text-[10px] font-black uppercase tracking-[.3em]" style={{ color: hc.cop }}>Test feed interrupted</p>
    <h2 className="font-display mt-2 text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-none tracking-[.03em]">COMMS JAMMED</h2>
    <div className="mt-4 text-5xl font-black tabular-nums leading-none sm:text-6xl" style={{ color: hc.cop }}>{Math.max(0, Math.ceil(secondsLeft))}<span className="ml-1 text-xl">s</span></div>
    <p className="mt-3 text-xs" style={{ color: hc.dim }}>Test results return when the signal clears.</p>
  </section>;
}
