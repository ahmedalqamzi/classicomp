import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Download, Game } from '../domain/types';
import { formatBytes, formatEta, formatSpeed } from './format';
import { GameIcon } from './game-icon';

// Live transfer stats for an active download, keyed by download id. `total`
// is null while the server did not send a content length.
export interface DownloadProgress {
  received: number;
  total: number | null;
  bytesPerSecond: number;
}

interface DownloadsBarProps {
  downloads: Download[];
  games: Game[];
  open: boolean;
  progress?: Record<string, DownloadProgress>;
  onToggle(open: boolean): void;
  // Opens the library with the game selected; completed rows link there.
  onViewInLibrary?(gameId: string): void;
}

// The queue panel folds itself away shortly after the last download completes.
const AUTO_COLLAPSE_MS = 4000;

function progressText(live: DownloadProgress): string {
  const received = formatBytes(live.received);
  const speed = formatSpeed(live.bytesPerSecond);
  if (live.total === null) return `${received} · ${speed}`;
  const eta =
    live.bytesPerSecond > 0 && live.total > live.received
      ? ` · ${formatEta((live.total - live.received) / live.bytesPerSecond)}`
      : '';
  return `${received} of ${formatBytes(live.total)} · ${speed}${eta}`;
}

// One state source for the collapsed strip and the queue rows: the persisted
// download state decides the wording; live progress only fleshes out an
// active transfer. Completed downloads say "Downloaded", never "installed".
function stateText(download: Download, live: DownloadProgress | undefined): string {
  switch (download.state) {
    case 'complete':
      return 'Downloaded';
    case 'paused':
      return 'Paused';
    case 'queued':
      return 'Queued';
    default:
      return live ? progressText(live) : 'Downloading…';
  }
}

function progressPercent(download: Download, live: DownloadProgress | undefined): number | null {
  if (live) {
    return live.total !== null && live.total > 0
      ? Math.min(100, (live.received / live.total) * 100)
      : null;
  }
  return download.progress;
}

export function DownloadsBar({ downloads, games, open, progress, onToggle, onViewInLibrary }: DownloadsBarProps) {
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef<Record<string, { bucket: number; state: Download['state'] }>>({});
  const current = downloads[0];
  const currentGame = current
    ? games.find((game) => game.id === current.gameId)
    : undefined;
  const currentLive = current ? progress?.[current.id] : undefined;
  const currentPercent = current ? progressPercent(current, currentLive) : null;
  const currentComplete = current?.state === 'complete';

  // Auto-collapse the queue a few seconds after everything completes.
  const allComplete =
    downloads.length > 0 && downloads.every((download) => download.state === 'complete');
  useEffect(() => {
    if (!open || !allComplete) return;
    const timer = window.setTimeout(() => onToggle(false), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, allComplete, onToggle]);

  useEffect(() => {
    for (const download of downloads) {
      const game = games.find((item) => item.id === download.gameId);
      if (!game) continue;
      const previous = announced.current[download.id];
      if (download.state === 'complete') {
        if (previous?.state !== 'complete') setAnnouncement(`${game.title} download complete`);
        announced.current[download.id] = { bucket: 100, state: 'complete' };
        continue;
      }
      const live = download.state === 'downloading' ? progress?.[download.id] : undefined;
      const percent = progressPercent(download, live);
      const bucket = percent === null ? 0 : Math.min(100, Math.floor(percent / 25) * 25);
      if (bucket >= 25 && bucket > (previous?.bucket ?? 0)) {
        setAnnouncement(`${game.title} download ${bucket}%`);
      }
      announced.current[download.id] = { bucket, state: download.state };
    }
  }, [downloads, games, progress]);

  return (
    <footer className="downloads-area">
      <span
        aria-atomic="true"
        aria-label="Download updates"
        aria-live="polite"
        className="visually-hidden"
        role="status"
      >
        {announcement}
      </span>
      {open && downloads.length > 0 ? (
        <div aria-label="Download queue" className="downloads-panel">
          <div className="download-list">
            {downloads.map((download) => {
              const game = games.find((item) => item.id === download.gameId);
              if (!game) return null;
              const live = download.state === 'downloading' ? progress?.[download.id] : undefined;
              const complete = download.state === 'complete';
              return (
                <article className="download-row" key={download.id}>
                  <GameIcon game={game} />
                  <div>
                    <h3>{game.title}</h3>
                    <p>{stateText(download, live)}</p>
                  </div>
                  {complete ? (
                    onViewInLibrary ? (
                      <button
                        aria-label={`View ${game.title} in library`}
                        className="downloads-view-library"
                        type="button"
                        onClick={() => onViewInLibrary(download.gameId)}
                      >
                        View in Library
                      </button>
                    ) : null
                  ) : (
                    <span>{stateText(download, live)}</span>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="downloads-bar">
        <span className="downloads-label">
          Downloads{downloads.length > 0 ? ` (${downloads.length})` : ''}
        </span>
        {current && currentGame ? (
          <>
            <span className="downloads-current">{currentGame.title}</span>
            {currentComplete ? null : (
              <span
                aria-hidden="true"
                className={`downloads-progress${currentPercent === null ? ' indeterminate' : ''}`}
              >
                <span style={currentPercent === null ? undefined : { width: `${currentPercent}%` }} />
              </span>
            )}
            <span className={`downloads-state${currentLive && !currentComplete ? ' downloads-live' : ''}`}>
              {stateText(current, currentComplete ? undefined : currentLive)}
            </span>
            {currentComplete && onViewInLibrary ? (
              <button
                aria-label={`View ${currentGame.title} in library`}
                className="downloads-view-library"
                type="button"
                onClick={() => onViewInLibrary(current.gameId)}
              >
                View in Library
              </button>
            ) : null}
            <button
              aria-expanded={open}
              className="downloads-toggle"
              type="button"
              onClick={() => onToggle(!open)}
            >
              {open ? (
                <ChevronDown aria-hidden="true" size={13} />
              ) : (
                <ChevronUp aria-hidden="true" size={13} />
              )}
              {open ? 'Hide queue' : 'View queue'}
            </button>
          </>
        ) : (
          <span className="downloads-empty">No active downloads</span>
        )}
      </div>
    </footer>
  );
}
