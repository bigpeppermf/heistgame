'use client';

import type { PowerupType } from './types';
import { GadgetGlyph, gadgetInfo, hc, tint } from './visuals';

export function PowerupOffer({ options, secondsLeft, onChoose }: { options: PowerupType[]; secondsLeft: number; onChoose: (t: PowerupType) => void }) {
  return <section role="dialog" aria-modal="true" aria-label="Choose a gadget" className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6" style={{ color: hc.text, background: `color-mix(in srgb, ${hc.bg} 94%, transparent)` }}>
    <div className="w-full max-w-xl rounded-[28px] border p-5 shadow-2xl sm:p-8" style={{ background: hc.panel, borderColor: hc.line, boxShadow: `0 24px 90px ${tint(hc.bg, 80)}` }}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.3em]" style={{ color: hc.gold }}>Stash unlocked</p><h2 className="font-display mt-2 text-4xl font-black uppercase leading-none tracking-[.03em] sm:text-5xl">Pick your edge.</h2><p className="mt-2 text-sm" style={{ color: hc.dim }}>Choose one gadget for your loadout.</p></div><div className="shrink-0 rounded-xl border px-3 py-2 text-center" style={{ borderColor: hc.gold, background: tint(hc.gold, 12) }}><div className="text-2xl font-black tabular-nums leading-none" style={{ color: hc.gold }}>{Math.max(0, Math.ceil(secondsLeft))}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider" style={{ color: hc.dim }}>auto pick</div></div></div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">{options.map((type, index) => <button key={`${type}-${index}`} type="button" onClick={() => onChoose(type)} className="group flex min-h-[145px] flex-col items-start rounded-2xl border p-4 text-left transition-[transform,background-color] duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: tint(hc.gold, 45), background: tint(hc.gold, 8), outlineColor: hc.gold }}><div className="flex w-full items-start justify-between" style={{ color: hc.gold }}><GadgetGlyph type={type} size="text-3xl" /><span className="text-[10px] font-black uppercase tracking-widest">0{index + 1}</span></div><strong className="mt-5 text-base font-black uppercase tracking-[.06em]" style={{ color: hc.text }}>{gadgetInfo[type].name}</strong><span className="mt-1 text-xs" style={{ color: hc.dim }}>{gadgetInfo[type].description}</span></button>)}</div>
      <p className="mt-5 text-center text-xs" style={{ color: hc.dim }}>No selection? HQ assigns one when the timer hits zero.</p>
    </div>
  </section>;
}
