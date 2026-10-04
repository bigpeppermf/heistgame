'use client';

import { hc } from './visuals';

export function JammedPanel({ secondsLeft }: { secondsLeft: number }) {
  return <section role="alert" aria-live="polite" className="flex h-full min-h-[210px] w-full flex-col items-center justify-center overflow-hidden rounded-none border p-5 text-center" style={{ color: hc.text, background: hc.panel, borderColor: hc.cop }}>
    <div className="text-3xl leading-none" style={{ color: hc.cop }} aria-hidden="true">≋</div>
    <h2 className="font-display mt-2 text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-none tracking-normal">COMMS JAMMED</h2>
    <div className="mt-4 text-5xl font-black tabular-nums leading-none sm:text-6xl" style={{ color: hc.cop }}>{Math.max(0, Math.ceil(secondsLeft))}<span className="ml-1 text-xl">s</span></div>
    <p className="mt-3 text-xs" style={{ color: hc.dim }}>Test results return when the timer ends.</p>
  </section>;
}
