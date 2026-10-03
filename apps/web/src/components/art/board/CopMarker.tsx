import React from 'react';

export const CopMarker = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M24 4L8 12V22C8 31 14.5 40 24 44C33.5 40 40 31 40 22V12L24 4Z" fill="var(--hc-cop)" stroke="var(--hc-bg)" strokeWidth="4" />
    <path d="M24 14L27 21H35L28.5 26L31 34L24 29L17 34L19.5 26L13 21H21L24 14Z" fill="var(--hc-bg)" />
  </svg>
);
