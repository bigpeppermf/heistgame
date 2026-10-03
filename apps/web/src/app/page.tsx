'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ask, saveSession } from '@/lib/socket';

export default function Landing() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get('error');
    if (message) setError(message);
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await ask<{ roomCode: string; playerId: string }>('create_room', { nickname });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.data);
    router.push(`/match/${res.data.roomCode}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const roomCode = code.trim().toUpperCase();
    const res = await ask<{ playerId: string }>('join_room', { roomCode, nickname });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession({ roomCode, playerId: res.data.playerId });
    router.push(`/match/${roomCode}`);
  }

  const ready = nickname.trim().length > 0 && !busy;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <header>
        <h1 className="hc-display text-6xl" style={{ color: 'var(--hc-gold)' }}>HEISTCODE</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--hc-dim)' }}>
          Two coders. One vault. Only one gets away.
        </p>
      </header>

      <input
        className="rounded border bg-transparent px-3 py-2"
        style={{ borderColor: 'var(--hc-line)' }}
        placeholder="Your alias"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
      />

      <button
        className="rounded px-3 py-3 font-bold text-black disabled:opacity-40"
        style={{ background: 'var(--hc-gold)' }}
        disabled={!ready}
        onClick={create}
      >
        ASSEMBLE A CREW
      </button>

      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border bg-transparent px-3 py-2 uppercase"
          style={{ borderColor: 'var(--hc-line)' }}
          placeholder="ROOM CODE"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          className="rounded border px-4 py-2 disabled:opacity-40"
          style={{ borderColor: 'var(--hc-line)' }}
          disabled={!ready || code.trim().length !== 6}
          onClick={join}
        >
          JOIN
        </button>
      </div>

      {error && <p style={{ color: 'var(--hc-robber)' }}>{error}</p>}
    </main>
  );
}
