export function remainingMs(deadlineAt: number | null, now: number): number {
  if (deadlineAt === null) return 0;
  return Math.max(0, deadlineAt - now);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
