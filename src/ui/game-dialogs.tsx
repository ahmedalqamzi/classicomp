import { X } from 'lucide-react';
import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Prerequisite } from '../domain/prerequisites';
import type { Game, LibraryEntry, TrackedProject } from '../domain/types';
import { pickBestAsset } from '../platform/downloader';
import { pickOriginalCopy } from '../platform/shell';
import { formatBytes, formatPlayTime, installStateLabel } from './format';
import { useModalFocus } from './keyboard-accessibility';

// Both game dialogs are Steam-style modal cards: Escape or a backdrop click
// dismisses and focus starts on a safe control (Cancel for the destructive
// one).
// Dismiss when the click lands on the dimmed backdrop itself, not the card.
function backdropClose(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

interface UninstallDialogProps {
  gameTitle: string;
  onConfirm(): void;
  onCancel(): void;
  returnFocusTo?: HTMLElement | null;
}

export function UninstallDialog({ gameTitle, onConfirm, onCancel, returnFocusTo }: UninstallDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onCancel, {
    initialFocusRef: cancelRef,
    returnFocusTo,
  });

  return (
    <div className="dialog-overlay" onClick={backdropClose(onCancel)}>
      <div
        aria-labelledby="uninstall-dialog-title"
        aria-modal="true"
        className="dialog-card uninstall-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="uninstall-dialog-title">Uninstall {gameTitle}?</h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onCancel}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        <p className="dialog-note">
          This removes it from your library; you can download it again from the Store.
        </p>
        <div className="dialog-actions">
          <button className="dialog-danger" type="button" onClick={onConfirm}>
            Uninstall
          </button>
          <button className="dialog-secondary" ref={cancelRef} type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface GamePropertiesDialogProps {
  game: Game;
  entry?: LibraryEntry;
  project?: TrackedProject;
  onClose(): void;
  returnFocusTo?: HTMLElement | null;
}

// Steam's Properties window summarizes and links out; it does not repeat the
// Game Information panel row for row. So: one summary line, an honest note
// for downloads that still need manual setup, and links to upstream/store.
export function GamePropertiesDialog({
  game,
  entry,
  project,
  onClose,
  returnFocusTo,
}: GamePropertiesDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocusRef: closeRef,
    returnFocusTo,
  });

  const installState = entry?.installState ?? 'available';
  const playMinutes = entry?.playMinutes ?? 0;
  const asset = project ? pickBestAsset(project.downloadAssets) : null;
  const summaryParts = [
    installStateLabel(installState),
    `Version ${game.version}`,
    game.runtime,
    ...(playMinutes > 0 ? [`${formatPlayTime(playMinutes)} played`] : []),
  ];

  return (
    <div className="dialog-overlay" onClick={backdropClose(onClose)}>
      <div
        aria-labelledby="properties-dialog-title"
        aria-modal="true"
        className="dialog-card properties-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="properties-dialog-title">{game.title} — Properties</h2>
          <button
            aria-label="Close"
            className="dialog-close"
            ref={closeRef}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>

        <section className="properties-section">
          <h3>Summary</h3>
          <p className="properties-summary">{summaryParts.join(' · ')}</p>
          {entry?.installPath ? (
            <p className="properties-path">Installed at {entry.installPath}</p>
          ) : null}
          {installState === 'downloaded' ? (
            <p className="dialog-note">
              The release file finished downloading and sits in your downloads folder; a
              verified install recipe is not available yet, so setup is manual.
            </p>
          ) : null}
        </section>

        <section className="properties-section">
          <h3>Links</h3>
          <ul className="properties-links">
            <li>
              <a href={game.upstreamUrl} rel="noreferrer" target="_blank">
                Upstream project
              </a>
            </li>
            {project ? (
              <li>
                <a href={project.repositoryUrl} rel="noreferrer" target="_blank">
                  {project.projectName} repository
                </a>
                <span className="properties-link-note">
                  {project.latestVersion ?? 'No releases'}
                  {asset
                    ? ` · ${asset.name}${asset.sizeBytes !== null ? ` · ${formatBytes(asset.sizeBytes)}` : ''}`
                    : ''}
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

interface RomSetupDialogProps {
  game: Game;
  entry?: LibraryEntry;
  project?: TrackedProject;
  // Present when the build cannot ask for the original game itself, and names
  // exactly what it needs.
  prerequisite?: Prerequisite | null;
  onLink(romPath: string | null): void;
  onClose(): void;
  returnFocusTo?: HTMLElement | null;
}

// The one step between a finished download and Play. A recompilation ships
// the engine and none of the content, so it cannot run until the player
// points it at their own original copy — this dialog is that step, and
// nothing else. It deliberately does not restate the build instructions from
// the store's setup guide: by this point the build already exists on disk.
export function RomSetupDialog({
  game,
  entry,
  project,
  prerequisite = null,
  onLink,
  onClose,
  returnFocusTo,
}: RomSetupDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocusRef: closeRef,
    returnFocusTo,
  });
  const linked = entry?.romPath ?? null;

  return (
    <div className="dialog-overlay" onClick={backdropClose(onClose)}>
      <div
        aria-labelledby="rom-dialog-title"
        aria-modal="true"
        className="dialog-card rom-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="rom-dialog-title">Set up {game.title}</h2>
          <button
            aria-label="Close"
            className="dialog-close"
            ref={closeRef}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>

        <section className="properties-section">
          <p className="dialog-note">
            {prerequisite?.kind === 'tool'
              ? `${project?.projectName ?? game.title} builds its game data from ${prerequisite.label}. Link it here and Classicomp runs the conversion for you — expect it to take around ${prerequisite.minutes} minutes, once.`
              : prerequisite
                ? `${project?.projectName ?? game.title} cannot start until it is given ${prerequisite.label}. Link it here and Classicomp will hand it to the game every time you press Play.`
                : `${project?.projectName ?? game.title} rebuilds the game engine and ships no game content. Linking your own copy is optional — most builds ask for it themselves on first run.`}
          </p>
          <div className="rom-dialog-actions">
            <button
              aria-label={`Choose your original copy of ${game.title}`}
              className="primary-action"
              type="button"
              onClick={() => {
                // The desktop's own chooser, because only it returns a path —
                // and the path is what gets handed to the game.
                void pickOriginalCopy(prerequisite?.accepts).then((chosen) => {
                  if (chosen) onLink(chosen);
                });
              }}
            >
              {linked ? 'Choose a different file' : 'Choose file…'}
            </button>
            {linked ? (
              <button className="setup-action" type="button" onClick={() => onLink(null)}>
                Unlink
              </button>
            ) : null}
          </div>
          {linked ? (
            <p className="properties-path">Linked: {linked}</p>
          ) : (
            <p className="properties-path">No original copy linked yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
