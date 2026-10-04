'use client';

import type { Phase, PlayerView, PowerupType } from './types';
import { GadgetGlyph, gadgetInfo, hc, tint } from './visuals';

const codingOnly = new Set<PowerupType>(['EMP', 'BLACKOUT', 'JAMMED_COMMS', 'SMOKE_BOMB']);
const hostile = new Set<PowerupType>(['EMP', 'BLACKOUT', 'JAMMED_COMMS', 'ROADBLOCK']);

function disabledReason(type: PowerupType, phase: Phase, hostileUsed: boolean) {
  if (type === 'SHIELD') return 'Auto-arms on pickup';
  if (hostileUsed && hostile.has(type)) return 'One hostile gadget per round';
  if (codingOnly.has(type) && phase !== 'CODING') return 'Available during coding';
  if ((type === 'ROADBLOCK' || type === 'GETAWAY_CAR') && phase !== 'POWERUP') return 'Available during powerup';
  return null;
}

export function PowerupTray({ me, phase, hostileUsed, onUse }: { me: PlayerView; phase: Phase; hostileUsed: boolean; onUse: (t: PowerupType) => void }) {
  return (
    <section aria-label="Gadget tray" className="w-full rounded-none border p-3 shadow-2xl sm:p-4" style={{ color: hc.text, background: hc.panel, borderColor: hc.line }}>
      <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[.28em]" style={{ color: hc.gold }}>Loadout</div><h2 className="text-sm font-black uppercase tracking-[.12em]">Your gadgets <span className="tabular-nums" style={{ color: hc.dim }}>({me.inventory.length})</span></h2></div>{me.shielded && <span className="rounded-none border px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em]" style={{ color: hc.cop, borderColor: hc.cop, background: tint(hc.cop) }}>⬡ Shield armed</span>}</div>
      {me.inventory.length === 0 ? <div className="rounded-none border border-dashed px-4 py-4 text-center text-xs" style={{ color: hc.dim, borderColor: hc.line }}>No gadgets in your loadout. Hit a stash tile to gear up.</div> : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {me.inventory.map((type, index) => {
            const reason = disabledReason(type, phase, hostileUsed);
            const disabled = reason !== null;
            return <div key={`${type}-${index}`} title={reason ?? gadgetInfo[type].description} className="flex min-w-[104px] flex-1 sm:min-w-[125px]"><button type="button" disabled={disabled} onClick={() => onUse(type)} aria-label={`${gadgetInfo[type].name}${reason ? `, ${reason}` : ', use gadget'}`} className="group flex w-full flex-col items-start rounded-none border px-3 py-3 text-left transition-[transform,background-color,opacity] duration-200 enabled:hover:-translate-y-1 enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45" style={{ color: disabled ? hc.dim : hc.gold, background: disabled ? hc.bg : tint(hc.gold, 10), borderColor: disabled ? hc.line : tint(hc.gold, 55) }}><GadgetGlyph type={type} /><span className="mt-2 text-[11px] font-black uppercase tracking-[.08em]" style={{ color: disabled ? hc.dim : hc.text }}>{gadgetInfo[type].name}</span><span className="mt-0.5 text-[10px] leading-tight" style={{ color: hc.dim }}>{gadgetInfo[type].description}{reason && <span className="mt-1 block font-bold">{reason}</span>}</span></button></div>;
          })}
        </div>
      )}
    </section>
  );
}
