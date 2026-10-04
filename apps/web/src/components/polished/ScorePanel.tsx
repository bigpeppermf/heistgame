'use client';

import type { PlayerView, RoundScore } from './types';
import { Emblem, roleColor, roleLabel } from './visuals';

function ScoreCard({ player, score }: { player: PlayerView; score: RoundScore | undefined }) {
  const accent = roleColor(player.role);
  return (
    <article className="round-score-card" style={{ borderTopColor: accent }}>
      <header className="round-score-player">
        <Emblem role={player.role} size={24} />
        <div><h3>{player.nickname}</h3><p style={{ color: accent }}>{roleLabel(player.role)}</p></div>
      </header>
      <div className="round-score-movement">
        <strong style={{ color: accent }}>{score?.tiles ?? '—'}</strong>
        <div><span>{score?.tiles === 1 ? 'space earned' : 'spaces earned'}</span></div>
      </div>
      <dl className="round-score-metrics">
        <Metric label="Tests passed" value={score ? `${score.passed} / ${score.totalTests}` : '—'} />
        <Metric label="Style points" value={score ? String(score.style) : '—'} />
        <Metric label="Total score" value={score ? String(score.total) : '—'} />
        <Metric label="Base movement" value={score ? `${score.baseTiles} ${score.baseTiles === 1 ? 'space' : 'spaces'}` : '—'} />
        {score && score.speedBonus > 0 && <Metric label="Speed bonus" value={`+${score.speedBonus}`} />}
        {score && score.modifierDelta !== 0 && <Metric label="Gadget effect" value={score.modifierDelta > 0 ? `+${score.modifierDelta}` : String(score.modifierDelta)} />}
      </dl>
      <p className="round-score-note">{score?.note || 'Waiting for the results…'}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function ScorePanel({ players, scores, round }: { players: PlayerView[]; scores: Record<string, RoundScore>; round: number }) {
  return (
    <section role="dialog" aria-modal="true" aria-label={`Round ${round} results`} className="round-results absolute inset-0 z-40 overflow-y-auto">
      <div className="round-results-sheet">
        <header className="round-results-heading">
          <div><p>Round {String(round).padStart(2, '0')} / score sheet</p><h2>Round results</h2></div>
          <span>Next: movement</span>
        </header>
        <div className="round-results-cards">{players.map(player => <ScoreCard key={player.id} player={player} score={scores[player.id]} />)}</div>
      </div>
    </section>
  );
}
