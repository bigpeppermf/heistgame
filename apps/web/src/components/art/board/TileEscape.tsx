import React from 'react';

export const TileEscape = ({ size = 64, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="16" width="56" height="32" rx="4" fill="var(--hc-gold)" stroke="var(--hc-gold)" strokeWidth="2" />
    <path d="M26 22H38V42H26V22Z" fill="var(--hc-bg)" />
    <path d="M34 32H36" stroke="var(--hc-gold)" strokeWidth="2" strokeLinecap="round" />
    <path d="M44 32L52 32M52 32L48 28M52 32L48 36" stroke="var(--hc-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
