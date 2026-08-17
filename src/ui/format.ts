// Human-readable byte sizes, Steam-style: 1024-based, one decimal below
// 100 of a unit ("42.3 MB"), whole numbers above ("128 MB").
import type { InstallState } from '../domain/types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

// Steam-style play time: "Never played", minutes under an hour, else hours.
export function formatPlayTime(minutes: number): string {
  if (minutes <= 0) return 'Never played';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h`;
}

// Steam-style remaining time: minutes under an hour, then "1 h 20 min".
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'under 1 min left';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min left`;
}

// One vocabulary for install state everywhere: downloads are *downloaded*,
// never "installed" — only a real executable earns that word.
export function installStateLabel(state: InstallState): string {
  switch (state) {
    case 'installed':
      return 'Installed';
    case 'downloaded':
      return 'Downloaded';
    case 'queued':
      return 'Queued';
    case 'downloading':
      return 'Downloading';
    default:
      return 'Not installed';
  }
}
