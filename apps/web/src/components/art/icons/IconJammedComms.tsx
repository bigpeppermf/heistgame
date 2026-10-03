import React from 'react';

export const IconJammedComms = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 8.82a15 15 0 0 1 4.11-3.23M5 12.859a10 10 0 0 1 2.18-1.55M8.5 16.429a5 5 0 0 1 .71-.4M16.5 16.03a5 5 0 0 1 .71.4M19 12.859a10 10 0 0 1 2.18 1.55M22 8.82a15 15 0 0 1-4.11 3.23" />
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="10" y1="22" x2="14" y2="22" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);
