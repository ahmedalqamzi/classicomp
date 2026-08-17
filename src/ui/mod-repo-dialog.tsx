import { Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Game } from '../domain/types';
import {
  getModRepos,
  normalizeModRepo,
  saveModRepos,
} from '../platform/mods-collector';
import type { ModRepoSource } from '../platform/mods-collector';
import { useModalFocus } from './keyboard-accessibility';

// Recomp-tool style mod sources: paste a GitHub repository and it lists as a
// pinned mod for the chosen game. Same modal pattern as the other dialogs.
function backdropClose(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

interface ModRepoDialogProps {
  games: Game[];
  onClose(): void;
  onSourcesChanged(): void;
  returnFocusTo?: HTMLElement | null;
}

export function ModRepoDialog({
  games,
  onClose,
  onSourcesChanged,
  returnFocusTo,
}: ModRepoDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<ModRepoSource[]>(() => getModRepos());
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [repoInput, setRepoInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocusRef: inputRef,
    returnFocusTo,
  });

  function gameTitle(id: string): string {
    return games.find((game) => game.id === id)?.title ?? id;
  }

  function addSource() {
    const repo = normalizeModRepo(repoInput);
    if (!repo || !gameId) {
      setError('Enter a GitHub repository as "owner/name" or paste its URL.');
      return;
    }
    if (sources.some((source) => source.repo === repo && source.gameId === gameId)) {
      setError('That repository is already added for this game.');
      return;
    }
    const next = [...sources, { gameId, repo }];
    setSources(next);
    saveModRepos(next);
    setRepoInput('');
    setError(null);
    onSourcesChanged();
  }

  function removeSource(source: ModRepoSource) {
    const next = sources.filter(
      (entry) => !(entry.repo === source.repo && entry.gameId === source.gameId),
    );
    setSources(next);
    saveModRepos(next);
    onSourcesChanged();
  }

  return (
    <div className="dialog-overlay" onClick={backdropClose(onClose)}>
      <div
        aria-labelledby="mod-repo-dialog-title"
        aria-modal="true"
        className="dialog-card mod-repo-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="mod-repo-dialog-title">Mod repositories</h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        <p className="dialog-note">
          Pin GitHub repositories as mod sources for a game — they always list first in its mod
          section. Sources stay on this device.
        </p>
        <div className="mod-repo-form">
          <select
            aria-label="Game for this mod repository"
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
          >
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
          <input
            aria-label="GitHub repository (owner/name or URL)"
            className="media-key-input"
            placeholder="owner/name or GitHub URL"
            ref={inputRef}
            spellCheck={false}
            type="text"
            value={repoInput}
            onChange={(event) => {
              setRepoInput(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addSource();
            }}
          />
          <button className="dialog-primary" type="button" onClick={addSource}>
            Add
          </button>
        </div>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        {sources.length > 0 ? (
          <ul className="mod-repo-list">
            {sources.map((source) => (
              <li key={`${source.gameId}-${source.repo}`}>
                <span className="mod-repo-name">{source.repo}</span>
                <span className="mod-repo-game">{gameTitle(source.gameId)}</span>
                <button
                  aria-label={`Remove ${source.repo}`}
                  type="button"
                  onClick={() => removeSource(source)}
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mod-repo-empty">No repositories added yet.</p>
        )}
        <div className="dialog-actions">
          <button className="dialog-secondary" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
