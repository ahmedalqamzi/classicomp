import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { getDonateUrl, saveDonateUrl } from '../platform/donate';
import { useModalFocus } from './keyboard-accessibility';

// Same modal pattern as the IGDB key dialog: Escape or a backdrop click
// dismisses, focus starts in the field.
function backdropClose(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

interface DonateDialogProps {
  onClose(): void;
  onSaved(url: string | null): void;
  returnFocusTo?: HTMLElement | null;
}

export function DonateDialog({ onClose, onSaved, returnFocusTo }: DonateDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(getDonateUrl() ?? '');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocusRef: inputRef,
    returnFocusTo,
  });

  function save() {
    const trimmed = value.trim();
    const saved = saveDonateUrl(trimmed);
    if (trimmed !== '' && saved === null) {
      setError('Enter a PayPal.me name (like "myname") or a full https:// link.');
      return;
    }
    onSaved(saved);
    onClose();
  }

  return (
    <div className="dialog-overlay" onClick={backdropClose(onClose)}>
      <div
        aria-labelledby="donate-dialog-title"
        aria-modal="true"
        className="dialog-card donate-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="donate-dialog-title">Donate button</h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        <p className="dialog-note">
          Shows a Donate button in the header that opens your PayPal page. Enter your{' '}
          <a href="https://www.paypal.com/paypalme/" rel="noreferrer" target="_blank">
            PayPal.me
          </a>{' '}
          name or paste a full donate link — it stays on this device. Leave empty to remove the
          button.
        </p>
        <input
          aria-label="PayPal.me name or donate link"
          className="media-key-input"
          placeholder="PayPal.me name or https:// link"
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
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
