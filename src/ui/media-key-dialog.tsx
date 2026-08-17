import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { getIgdbCredentials, saveIgdbCredentials } from '../platform/media-connector';
import { useModalFocus } from './keyboard-accessibility';

// Steam-style modal card matching the game dialogs: Escape or a backdrop
// click dismisses, focus starts in the first field.
function backdropClose(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

interface MediaKeyDialogProps {
  onClose(): void;
  returnFocusTo?: HTMLElement | null;
}

export function MediaKeyDialog({ onClose, returnFocusTo }: MediaKeyDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stored = getIgdbCredentials();
  const [clientId, setClientId] = useState(stored?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState(stored?.clientSecret ?? '');
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocusRef: inputRef,
    returnFocusTo,
  });

  function save() {
    saveIgdbCredentials(clientId, clientSecret);
    onClose();
  }

  return (
    <div className="dialog-overlay" onClick={backdropClose(onClose)}>
      <div
        aria-labelledby="media-key-dialog-title"
        aria-modal="true"
        className="dialog-card media-key-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="media-key-dialog-title">IGDB screenshots</h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        <p className="dialog-note">
          IGDB adds HD screenshot galleries for every game, console exclusives included. Register
          a free app at{' '}
          <a href="https://dev.twitch.tv/console/apps" rel="noreferrer" target="_blank">
            dev.twitch.tv/console/apps
          </a>{' '}
          and paste its Client ID and Secret — both stay on this device.
        </p>
        <input
          aria-label="IGDB Client ID"
          className="media-key-input"
          placeholder="Client ID"
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        />
        <input
          aria-label="IGDB Client Secret"
          className="media-key-input"
          placeholder="Client Secret"
          spellCheck={false}
          type="password"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <div className="dialog-actions">
          <button className="dialog-primary" type="button" onClick={save}>
            Save
          </button>
          <button className="dialog-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
