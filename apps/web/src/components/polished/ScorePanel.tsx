'use client';

import type { PlayerView, RoundScore } from './types';
import { Emblem, hc, roleColor, roleLabel, tint } from './visuals';

function ScoreCard({ player, score }: { player: PlayerView; score: RoundScore | undefined }) {
  const accent = roleColor(player.role);
  return (
    <article className="flex min-w-0 flex-1 flex-col rounded-none border p-4 sm:p-6" style={{ borderColor: tint(accent, 50), background: `linear-gradient(145deg, ${tint(accent, 14)}, ${hc.panel} 42%)` }}>
      <div className="flex items-center gap-2"><Emblem role={player.role} size={21} /><span className="truncate text-sm font-black uppercase tracking-[.12em]" style={{ color: accent }}>{player.nickname}</span><span className="ml-auto text-[10px] font-bold uppercase tracking-wider" style={{ color: hc.dim }}>{roleLabel(player.role)}</span></div>
      <div className="mt-5 flex items-end gap-3 border-b pb-4" style={{ borderColor: hc.line }}>
        <div className="text-[clamp(4.5rem,12vw,8rem)] font-black tabular-nums leading-[.8] tracking-[-.1em]" style={{ color: accent }}>{score?.tiles ?? '—'}</div>
        <div className="pb-1 text-sm font-black uppercase tracking-[.22em]" style={{ color: hc.dim }}>final<br />tiles</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:text-sm">
        <Metric label="Tests passed" value={score ? `${score.passed} / ${score.totalTests}` : '—'} />
        <Metric label="Style points" value={score ? String(score.style) : '—'} />
        <Metric label="Total score" value={score ? String(score.total) : '—'} />
        <Metric label="Base tiles" value={score ? String(score.baseTiles) : '—'} />
        {score && score.speedBonus > 0 && <Metric label="Speed bonus" value={`+${score.speedBonus}`} />}
        {score && score.modifierDelta !== 0 && <Metric label="Gadget modifier" value={score.modifierDelta > 0 ? `+${score.modifierDelta}` : String(score.modifierDelta)} />}
      </div>
      <blockquote className="mt-auto pt-5 text-sm italic leading-relaxed" style={{ color: hc.dim }}>“{score?.note || 'Awaiting the verdict from HQ.'}”</blockquote>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 justify-between gap-2 border-b pb-1.5" style={{ borderColor: hc.line }}><span style={{ color: hc.dim }}>{label}</span><strong className="shrink-0 tabular-nums" style={{ color: hc.text }}>{value}</strong></div>;
}

export function ScorePanel({ players, scores, round }: { players: PlayerView[]; scores: Record<string, RoundScore>; round: number }) {
  return (
    <section role="dialog" aria-modal="true" aria-label={`Round ${round} results`} className="absolute inset-0 z-40 overflow-y-auto p-3 sm:p-6" style={{ color: hc.text, background: `color-mix(in srgb, ${hc.bg} 96%, transparent)` }}>
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4" style={{ borderColor: hc.line }}>
          <div><p className="text-[10px] font-black uppercase tracking-[.35em]" style={{ color: hc.gold }}>After action report</p><h2 className="font-display mt-2 text-4xl font-black uppercase tracking-[.03em] sm:text-6xl">Round {round} <span style={{ color: hc.gold }}>results</span></h2></div>
          <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: hc.dim }}>Movement authorized</p>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">{players.map(player => <ScoreCard key={player.id} player={player} score={scores[player.id]} />)}</div>
      </div>
    </section>
  );
}
