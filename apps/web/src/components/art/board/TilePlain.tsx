import React from 'react';

export const TilePlain = ({ size = 64, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="16" width="56" height="32" rx="4" fill="var(--hc-panel)" stroke="var(--hc-line)" strokeWidth="2" />
    <path d="M12 32H52" stroke="var(--hc-line)" strokeWidth="2" strokeDasharray="4 4" />
  </svg>
);
