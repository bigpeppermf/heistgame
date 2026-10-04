'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ROLE_LABELS } from '@heist/shared';
import type { PowerupType, Role } from './types';

export const hc = {
  bg: 'var(--hc-bg, #080d16)',
  panel: 'var(--hc-panel, #121c2b)',
  line: 'var(--hc-line, #314057)',
  text: 'var(--hc-text, #edf2f8)',
  dim: 'var(--hc-dim, #9ba9bd)',
  gold: 'var(--hc-gold, #f2c773)',
  cop: 'var(--hc-cop, #69caff)',
  robber: 'var(--hc-robber, #f69275)',
} as const;

export const tint = (color: string, amount = 13) =>
  `color-mix(in srgb, ${color} ${amount}%, transparent)`;

export const roleLabel = (role: Role) => ROLE_LABELS[role];

export const roleColor = (role: Role) => role === 'COP' ? hc.cop : hc.robber;

export const gadgetInfo: Record<PowerupType, { name: string; description: string }> = {
  EMP: { name: 'EMP', description: 'Disable your opponent’s Run button for 15 seconds. Use during coding.' },
  BLACKOUT: { name: 'Blackout', description: 'Cover your opponent’s editor for 6 seconds. Use during coding.' },
  JAMMED_COMMS: { name: 'Jammed Comms', description: 'Hide your opponent’s test results for 20 seconds. Use during coding.' },
  SMOKE_BOMB: { name: 'Smoke Bomb', description: 'Hide your score and test progress from your opponent until this round ends. Use during coding.' },
  ROADBLOCK: { name: 'Roadblock', description: 'Reduce your opponent’s next move by 1 tile (minimum 1). Use during the powerup phase.' },
  GETAWAY_CAR: { name: 'Getaway Car', description: 'Add 1 tile to your next move. Use during the powerup phase.' },
  SHIELD: { name: 'Shield', description: 'Automatically block the next hostile powerup used against you. Arms immediately on pickup.' },
};

export function Emblem({ role, size = 18 }: { role: Role; size?: number }) {
  const style: CSSProperties = { color: roleColor(role), width: size, height: size };
  return role === 'COP' ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path d="M12 2 20 5v6c0 5.1-3.3 8.6-8 11-4.7-2.4-8-5.9-8-11V5l8-3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path d="M3 9.5h18a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7" cy="13.5" r="1.8" fill="currentColor" /><circle cx="17" cy="13.5" r="1.8" fill="currentColor" />
      <path d="M10 5.5h4l2 4H8l2-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function GadgetGlyph({ type, size = 'text-xl' }: { type: PowerupType; size?: string }) {
  const paths: Record<PowerupType, ReactNode> = {
    EMP: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /><path d="m3 3 18 18" /></>,
    BLACKOUT: <><path d="M17.9 17.9A10 10 0 0 1 12 20C5 20 1 12 1 12a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2" /><path d="M10 10a3 3 0 0 1 4 4M1 1l22 22" /></>,
    JAMMED_COMMS: <><path d="M2 9a15 15 0 0 1 4-3M5 13a10 10 0 0 1 2-2M19 13a10 10 0 0 0-2-2M22 9a15 15 0 0 0-4-3M12 20V10m-2 12h4M2 2l20 20" /></>,
    SMOKE_BOMB: <><path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9ZM8 19v3m4-3v3m4-3v3" /></>,
    ROADBLOCK: <><rect x="2" y="9" width="20" height="6" rx="1" /><path d="M5 15v4m14-4v4M7 9l5 6m0-6 5 6" /></>,
    GETAWAY_CAR: <><path d="M19 17h2a1 1 0 0 0 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10l-2.2-2.3A2.6 2.6 0 0 0 12 7H5a1.6 1.6 0 0 0-1.4.9l-1.4 2.9A4 4 0 0 0 2 12v4a1 1 0 0 0 1 1h2m4 0h6m4 0h-2M6 10h8" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
    SHIELD: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`${size} inline-block h-[1em] w-[1em] shrink-0`}>{paths[type]}</svg>;
}
