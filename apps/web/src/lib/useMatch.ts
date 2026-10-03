'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  MatchSnapshot, PlayerView, PowerupType, Role, RoundScore, TestResult,
} from '@heist/shared';
import { ask, getSocket, loadSession } from './socket';

export type RunOutput = {
  runId: string;
  results: TestResult[];
  stdout: string;
  stderr: string;
};

export type Offer = { options: PowerupType[]; deadlineAt: number };
export type GameOver = { winner: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' };

/**
 * Subscribes to the server and exposes what it last said. The server is
 * authoritative: nothing here derives game state, it only stores messages.
 * `now` exists solely to drive countdown displays against server deadlines.
 */
export function useMatch(roomCode: string) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roundResult, setRoundResult] = useState<Record<string, RoundScore> | null>(null);
  const [runOutput, setRunOutput] = useState<RunOutput | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const session = loadSession();
    const myId = session?.roomCode === roomCode ? session.playerId : null;
    setPlayerId(myId);

    const leave = (message: string) => {
      if (active) router.replace(`/?error=${encodeURIComponent(message)}`);
    };
    if (!myId) {
      leave('No saved match session. Create or join a room.');
      return () => { active = false; };
    }

    const socket = getSocket();

    const rejoin = () => {
      void ask('rejoin', { roomCode, playerId: myId }).then((res) => {
        if (!res.ok) leave(`Could not rejoin match: ${res.error}`);
      });
    };

    const onRoundResult = ({ scores }: { scores: Record<string, RoundScore> }) => setRoundResult(scores);
    const onRunOutput = (p: RunOutput) => setRunOutput(p);
    const onProgress = ({ playerId: who, done, total }: { playerId: string; done: number; total: number }) =>
      setProgress((prev) => ({ ...prev, [who]: { done, total } }));
    const onOffer = (p: Offer) => setOffer(p);
    const onGameOver = (p: GameOver) => setGameOver(p);
    const onBlocked = ({ type }: { type: PowerupType }) => setToast(`${type} BLOCKED BY SHIELD`);
    const onApplied = ({ type, targetId }: { type: PowerupType; targetId: string }) => {
      if (targetId === myId) setToast(`INCOMING: ${type}`);
    };
    const onError = ({ message }: { message: string }) => setToast(message);
    const onDark = () => setToast('OPPONENT WENT DARK');
    const onBack = () => setToast('OPPONENT IS BACK');

    socket.on('connect', rejoin);
    socket.on('snapshot', setSnapshot);
    socket.on('round_result', onRoundResult);
    socket.on('run_output', onRunOutput);
    socket.on('test_progress', onProgress);
    socket.on('powerup_offer', onOffer);
    socket.on('game_over', onGameOver);
    socket.on('effect_blocked', onBlocked);
    socket.on('effect_applied', onApplied);
    socket.on('error_msg', onError);
    socket.on('opponent_disconnected', onDark);
    socket.on('opponent_reconnected', onBack);

    if (socket.connected) rejoin();

    const clock = setInterval(() => setNow(Date.now()), 200);
    return () => {
      active = false;
      clearInterval(clock);
      socket.off('connect', rejoin);
      socket.off('snapshot', setSnapshot);
      socket.off('round_result', onRoundResult);
      socket.off('run_output', onRunOutput);
      socket.off('test_progress', onProgress);
      socket.off('powerup_offer', onOffer);
      socket.off('game_over', onGameOver);
      socket.off('effect_blocked', onBlocked);
      socket.off('effect_applied', onApplied);
      socket.off('error_msg', onError);
      socket.off('opponent_disconnected', onDark);
      socket.off('opponent_reconnected', onBack);
    };
  }, [roomCode, router]);

  // Clear a toast after a moment.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2_500);
    return () => clearTimeout(t);
  }, [toast]);

  // A new round clears last round's panels.
  const round = snapshot?.round ?? 0;
  useEffect(() => {
    setRoundResult(null);
    setRunOutput(null);
    setOffer(null);
    setProgress({});
  }, [round]);

  const notify = useCallback((message: string) => setToast(message), []);

  const me: PlayerView | null = snapshot?.players.find((p) => p.id === playerId) ?? null;
  const opponent: PlayerView | null = snapshot?.players.find((p) => p.id !== playerId) ?? null;

  return {
    snapshot, me, opponent, now, roundResult, runOutput, offer, setOffer,
    // The snapshot also carries the winner, so a reload after game over still shows it.
    gameOver: gameOver ?? (snapshot?.winner
      ? { winner: snapshot.winner.role, reason: snapshot.winner.reason }
      : null),
    toast, notify, progress,
  };
}
