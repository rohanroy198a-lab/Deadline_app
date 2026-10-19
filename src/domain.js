export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n, i) => i === 0 ? String(n).padStart(2, '0') : String(n).padStart(2, '0')).join(':');
}

export function getUrgency(deadlineAt, now = Date.now()) {
  const remaining = Number(deadlineAt) - Number(now);
  if (!Number.isFinite(remaining) || remaining <= 0) return 'ended';
  if (remaining <= 60 * 60 * 1000) return 'critical';
  if (remaining <= 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

export function getUrgencyLabel(level) {
  return ({ ended: 'DEADLINE ENDED', critical: 'ENDING SOON', soon: 'DUE TODAY', normal: 'UPCOMING' })[level] || 'UPCOMING';
}
