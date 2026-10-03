'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LandingScene from '@/components/LandingScene';
import './landing.css';
import './landing-motion.css';
import { ask, saveSession } from '@/lib/socket';

export default function Landing() {
  const router = useRouter();
  const [playScale, setPlayScale] = useState(1);
  useEffect(() => {
    const resize = () => setPlayScale(window.innerWidth / window.innerHeight < 4 / 3 ? .75 : window.innerWidth / 1920);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'create' | 'join'>('create');

  function openRoom(nextMode: 'create' | 'join') {
    setMode(nextMode);
    setError(null);
    dialog.current?.showModal();
  }

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
    const res = await ask<{ roomCode: string; playerId: string }>('create_room', { nickname: nickname.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.data);
    router.push(`/match/${res.data.roomCode}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const roomCode = code.trim().toUpperCase();
    const res = await ask<{ playerId: string }>('join_room', { roomCode, nickname: nickname.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession({ roomCode, playerId: res.data.playerId });
    router.push(`/match/${roomCode}`);
  }

  const ready = nickname.trim().length > 0 && !busy;

  return (
    <main className="landing">
      <LandingScene />
      <header className="landing-credits" aria-label="Creators">
        <span>@andrewblair390</span><span>@bigpeppermf</span>
      </header>
      <h1 className="landing-title"><img src="/landing/title.png" alt="git money" /></h1>
      <div className="landing-actions">
        <button className="landing-play" aria-label="Play — start a game" onClick={() => openRoom('create')}>
          <span className="landing-play-art" style={{ transform: `scale(${playScale})` }}><span className="landing-triangle landing-triangle-outer"><img src="/landing/465e6.svg" alt="" /></span>
          <span className="landing-triangle landing-triangle-inner"><img src="/landing/e852a.svg" alt="" /></span></span>
        </button>
        <button className="landing-button landing-join" onClick={() => openRoom('join')}>Join via code</button>
        <button className="landing-button landing-start" onClick={() => openRoom('create')}>Start a game</button>
      </div>
      {error && !dialog.current?.open && <p className="landing-error" role="alert">{error}</p>}
      <dialog ref={dialog} className="landing-dialog" aria-labelledby="room-dialog-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <form onSubmit={(event) => { event.preventDefault(); if (ready && (mode === 'create' || code.trim().length === 6)) void (mode === 'create' ? create() : join()); }}>
          <button type="button" className="landing-close" aria-label="Close" disabled={busy} onClick={() => dialog.current?.close()}>×</button>
          <h2 id="room-dialog-title">{mode === 'create' ? 'Start a game' : 'Join via code'}</h2>
          <label htmlFor="nickname">Your alias</label>
          <input id="nickname" autoFocus autoComplete="nickname" value={nickname} maxLength={20} required disabled={busy} onChange={(event) => setNickname(event.target.value)} />
          {mode === 'join' && <>
            <label htmlFor="room-code">Room code</label>
            <input id="room-code" className="landing-code" autoComplete="off" value={code} maxLength={6} minLength={6} required disabled={busy} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </>}
          {error && <p role="alert" className="landing-form-error">{error === 'TIMEOUT' ? 'Cannot reach the game server. Please try again.' : error}</p>}
          <button className="landing-button" disabled={!ready || (mode === 'join' && code.trim().length !== 6)} type="submit">{busy ? 'Connecting…' : mode === 'create' ? 'Start a game' : 'Join game'}</button>
        </form>
      </dialog>
    </main>
  );
}
