import React from 'react';

export const IconRoadblock = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="9" width="20" height="6" rx="1" />
    <path d="M5 15v4" />
    <path d="M19 15v4" />
    <path d="M7 9l5 6" />
    <path d="M12 9l5 6" />
  </svg>
);
