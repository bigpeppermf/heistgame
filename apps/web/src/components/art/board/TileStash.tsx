import React from 'react';

export const TileStash = ({ size = 64, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="16" width="56" height="32" rx="4" fill="var(--hc-panel)" stroke="var(--hc-gold)" strokeWidth="2" />
    <path d="M32 20L36 26L42 28L37 32L39 38L32 35L25 38L27 32L22 28L28 26L32 20Z" fill="var(--hc-gold)" />
  </svg>
);
