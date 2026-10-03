import React from 'react';

export const RobberMarker = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="14" width="40" height="20" rx="10" fill="var(--hc-robber)" stroke="var(--hc-bg)" strokeWidth="4" />
    <circle cx="16" cy="24" r="5" fill="var(--hc-bg)" />
    <circle cx="32" cy="24" r="5" fill="var(--hc-bg)" />
    <path d="M22 24C22 22 26 22 26 24" stroke="var(--hc-bg)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
