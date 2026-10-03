'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { BALANCE, type Language, type PowerupType } from '@heist/shared';
import { CodeEditor } from '@/components/CodeEditor';
import { TestResults } from '@/components/TestResults';
import { ActiveEffectBadges } from '@/components/polished/ActiveEffectBadges';
import { BlackoutOverlay } from '@/components/polished/BlackoutOverlay';
import { Board } from '@/components/polished/Board';
import { GameOverOverlay } from '@/components/polished/GameOverOverlay';
import { JammedPanel } from '@/components/polished/JammedPanel';
import { PowerupOffer } from '@/components/polished/PowerupOffer';
import { PowerupTray } from '@/components/polished/PowerupTray';
import { ScorePanel } from '@/components/polished/ScorePanel';
import { formatClock, remainingMs } from '@/lib/clock';
import { bufferKey, loadBuffer, saveBuffer } from '@/lib/editorBuffer';
import { ask, loadSession } from '@/lib/socket';
import { useMatch } from '@/lib/useMatch';

const HOSTILE: PowerupType[] = ['EMP', 'BLACKOUT', 'JAMMED_COMMS', 'ROADBLOCK'];

const secondsUntil = (expiresAt: number, now: number) => Math.ceil(remainingMs(expiresAt, now) / 1000);

export default function MatchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: roomCode } = use(params);
  const {
    snapshot, me, opponent, now, roundResult, runOutput, offer, setOffer,
    gameOver, toast, notify, progress,
  } = useMatch(roomCode);

  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState('');
  const [seeded, setSeeded] = useState<string | null>(null);
  const [hostileUsed, setHostileUsed] = useState(false);
  const buffers = useRef<Record<string, string>>({});

  const problem = snapshot?.problem ?? null;
  const phase = snapshot?.phase;
  const round = snapshot?.round ?? 0;
  const playerId = loadSession()?.playerId;
  const activeKey = problem && playerId ? bufferKey(roomCode, playerId, problem.id, language) : null;

  // Seed the editor from starter code once per problem+language; revisiting a
  // key restores the player's own buffer instead of the starter.
  useEffect(() => {
    if (!problem) return;
    if (!activeKey || seeded === activeKey) return;
    setCode(buffers.current[activeKey] ?? loadBuffer(activeKey) ?? problem.starterCode[language]);
    setSeeded(activeKey);
  }, [activeKey, problem, language, seeded]);

  const onCodeChange = (next: string) => {
    if (!activeKey || seeded !== activeKey || next === code) return;
    buffers.current[activeKey] = next;
    saveBuffer(activeKey, next);
    setCode(next);
    if (phase !== 'CODING') return;
    latest.current = { code: next, language };
    if (!syncTimer.current) {
      syncTimer.current = setTimeout(() => {
        syncTimer.current = null;
        void ask('code_sync', latest.current);
      }, BALANCE.CODE_SYNC_DEBOUNCE_MS);
    }
  };

  // code_sync, throttled: the first change arms a timer and the timer sends the
  // latest buffer. Continuous typing therefore still syncs every interval, so the
  // server always holds a recent buffer to auto-submit at the coding deadline.
  const latest = useRef({ code, language });
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase === 'CODING' || !syncTimer.current) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = null;
  }, [phase]);
  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = null;
  }, []);

  // One hostile gadget per round: this only greys out the tray, the server decides.
  useEffect(() => setHostileUsed(false), [round]);

  const activeOf = (type: PowerupType) =>
    me?.activeEffects.find((e) => e.type === type && e.expiresAt > now) ?? null;
  const emp = activeOf('EMP');
  const blackout = activeOf('BLACKOUT');
  const jammed = activeOf('JAMMED_COMMS');

  const coding = phase === 'CODING';
  const clock = useMemo(
    () => formatClock(remainingMs(snapshot?.deadlineAt ?? null, now)),
    [snapshot?.deadlineAt, now],
  );

  async function usePowerup(type: PowerupType) {
    const res = await ask<{ blocked: boolean }>('use_powerup', { type });
    if (!res.ok) return notify(res.error);
    if (HOSTILE.includes(type)) setHostileUsed(true);
    if (res.data.blocked) notify(`${type} BLOCKED BY SHIELD`);
  }

  async function choosePowerup(type: PowerupType) {
    const res = await ask('choose_powerup', { type });
    if (!res.ok) return notify(res.error);
    setOffer(null);
  }

  async function run() {
    const res = await ask('run', { code, language });
    if (!res.ok) notify(res.error);
  }

  async function submit() {
    const res = await ask('submit', { code, language });
    if (!res.ok) notify(res.error);
  }

  if (!snapshot) {
    return <main className="grid min-h-screen place-items-center">Connecting…</main>;
  }

  if (phase === 'LOBBY') {
    return (
      <main className="grid min-h-screen place-items-center text-center">
        <div>
          <p style={{ color: 'var(--hc-dim)' }}>Room code</p>
          <p className="hc-display text-7xl tracking-widest" style={{ color: 'var(--hc-gold)' }}>
            {snapshot.roomCode}
          </p>
          <p className="mt-4" style={{ color: 'var(--hc-dim)' }}>Waiting for your partner…</p>
        </div>
      </main>
    );
  }

  const oppProgress = opponent ? progress[opponent.id] : undefined;
  const showScores = !!roundResult && (phase === 'SCORING' || phase === 'POWERUP' || phase === 'MOVEMENT');

  return (
    <main className="relative flex h-screen flex-col">
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{ borderColor: 'var(--hc-line)' }}
      >
        <div>
          <span style={{ color: me?.role === 'COP' ? 'var(--hc-cop)' : 'var(--hc-robber)' }}>
            {me?.role ?? '—'}
          </span>
          <span style={{ color: 'var(--hc-dim)' }}> · {me?.nickname}</span>
          {me && <ActiveEffectBadges effects={me.activeEffects} now={now} />}
        </div>
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--hc-dim)' }}>
            ROUND {round}/{BALANCE.TOTAL_ROUNDS} · {phase}
          </p>
          <p className="text-2xl font-bold">{clock}</p>
        </div>
        <div className="text-right" style={{ color: 'var(--hc-dim)' }}>
          {opponent?.nickname ?? 'waiting'}
          {opponent?.submitted ? ' · LOCKED IN' : ''}
          {opponent?.connected === false ? ' · DARK' : ''}
          {oppProgress && (
            <span style={{ color: 'var(--hc-gold)' }}>
              {' · '}{oppProgress.done}/{oppProgress.total} CRACKED
            </span>
          )}
        </div>
      </header>

      {toast && (
        <div className="px-4 py-1 text-center text-sm" style={{ background: 'var(--hc-panel)' }}>
          {toast}
        </div>
      )}

      <section className="flex min-h-0 flex-1">
        <aside
          className="w-80 shrink-0 overflow-auto border-r p-4"
          style={{ borderColor: 'var(--hc-line)' }}
        >
          {problem ? (
            <>
              <h2 className="font-bold" style={{ color: 'var(--hc-gold)' }}>{problem.title}</h2>
              <p className="mt-2 text-sm leading-relaxed">{problem.narrative}</p>
              <div className="mt-4 text-xs" style={{ color: 'var(--hc-dim)' }}>
                {problem.sampleTests.map((t, i) => (
                  <pre key={i} className="mt-2 whitespace-pre-wrap">
                    in  {JSON.stringify(t.input)}{'\n'}out {JSON.stringify(t.expected)}
                  </pre>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--hc-dim)' }}>The job is being cased…</p>
          )}
        </aside>

        {coding ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--hc-line)' }}>
              {(['python', 'javascript'] as Language[]).map((l) => (
                <button
                  key={l}
                  className="rounded px-2 py-1 text-xs"
                  style={{
                    background: language === l ? 'var(--hc-gold)' : 'transparent',
                    color: language === l ? '#000' : 'var(--hc-dim)',
                  }}
                  onClick={() => setLanguage(l)}
                >
                  {l}
                </button>
              ))}

              <div className="ml-auto flex gap-2">
                <button
                  className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  style={{ borderColor: 'var(--hc-line)' }}
                  disabled={!!emp}
                  onClick={() => void run()}
                >
                  {emp ? `EMP ${secondsUntil(emp.expiresAt, now)}s` : 'RUN'}
                </button>
                <button
                  className="rounded px-3 py-1 text-sm font-bold text-black disabled:opacity-40"
                  style={{ background: 'var(--hc-gold)' }}
                  disabled={me?.submitted}
                  onClick={() => void submit()}
                >
                  {me?.submitted ? 'LOCKED IN' : 'SUBMIT'}
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <CodeEditor
                value={code}
                language={language}
                disabled={!!me?.submitted}
                onChange={onCodeChange}
              />
              {blackout && <BlackoutOverlay secondsLeft={secondsUntil(blackout.expiresAt, now)} />}
            </div>

            <div className="relative h-56 shrink-0 border-t" style={{ borderColor: 'var(--hc-line)' }}>
              <TestResults
                results={runOutput?.results ?? []}
                stdout={runOutput?.stdout ?? ''}
                stderr={runOutput?.stderr ?? ''}
              />
              {jammed && (
                <div className="absolute inset-0 z-10">
                  <JammedPanel secondsLeft={secondsUntil(jammed.expiresAt, now)} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            {phase === 'ROLE_REVEAL' && me && (
              <p className="mb-6 text-center text-xl">
                You are the{' '}
                <span style={{ color: me.role === 'COP' ? 'var(--hc-cop)' : 'var(--hc-robber)' }}>
                  {me.role}
                </span>
              </p>
            )}
            <Board players={snapshot.players} />
          </div>
        )}
      </section>

      {me && (phase === 'CODING' || phase === 'POWERUP') && (
        <PowerupTray me={me} phase={snapshot.phase} hostileUsed={hostileUsed} onUse={(t) => void usePowerup(t)} />
      )}

      {showScores && roundResult && (
        <ScorePanel players={snapshot.players} scores={roundResult} round={round} />
      )}

      {phase === 'POWERUP' && offer && (
        <PowerupOffer
          options={offer.options}
          secondsLeft={secondsUntil(offer.deadlineAt, now)}
          onChoose={(t) => void choosePowerup(t)}
        />
      )}

      {gameOver && <GameOverOverlay winner={gameOver.winner} reason={gameOver.reason} />}
    </main>
  );
}
