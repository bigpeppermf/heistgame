'use client';

import type { ActiveEffect } from './types';
import { GadgetGlyph, gadgetInfo, hc, tint } from './visuals';

export function ActiveEffectBadges({ effects, now }: { effects: ActiveEffect[]; now: number }) {
  const active = effects.filter(effect => effect.expiresAt > now);
  if (active.length === 0) return null;
  return <div className="flex flex-wrap gap-2" aria-label="Active effects">{active.map((effect, index) => {
    const remaining = Math.ceil((effect.expiresAt - now) / 1000);
    return <div key={`${effect.type}-${effect.expiresAt}-${index}`} className="flex items-center gap-2 rounded-none border px-3 py-1.5 text-xs font-bold" style={{ color: hc.gold, borderColor: tint(hc.gold, 45), background: tint(hc.gold, 11) }}><GadgetGlyph type={effect.type} size="text-sm" /><span>{gadgetInfo[effect.type].name}</span><span className="border-l pl-2 font-black tabular-nums" style={{ borderColor: tint(hc.gold, 40), color: hc.text }}>{remaining}s</span></div>;
  })}</div>;
}
