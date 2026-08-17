import { X } from 'lucide-react';
import { useState } from 'react';
import { useModalFocus } from './keyboard-accessibility';

interface SignInDialogProps {
  open: boolean;
  configured: boolean;
  status: 'signedOut' | 'pending' | 'signedIn';
  accountEmail: string | null;
  error: string | null;
  onSaveConfig(url: string, anonKey: string): void;
  onSubmit(email: string, password: string, mode: 'signIn' | 'signUp'): void;
  onSignOut(): void;
  onClose(): void;
}

// Steam-style account dialog. Presentational only: the parent owns the
// Supabase client, the auth state machine, and persistence.
export function SignInDialog({
  open,
  configured,
  status,
  accountEmail,
  error,
  onSaveConfig,
  onSubmit,
  onSignOut,
  onClose,
}: SignInDialogProps) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const dialogRef = useModalFocus<HTMLDivElement>(open, onClose);

  if (!open) return null;

  const pending = status === 'pending';

  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="sign-in-dialog-title"
        aria-modal="true"
        className="dialog-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="sign-in-dialog-title">
            {configured ? (status === 'signedIn' ? 'Account' : 'Sign in') : 'Connect your Supabase project'}
          </h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>

        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        {!configured ? (
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveConfig(url.trim(), anonKey.trim());
            }}
          >
            <p className="dialog-note">
              Classicomp syncs accounts, friends, and tracked games through your own Supabase project.
            </p>
            <label>
              Project URL
              <input
                required
                placeholder="https://your-project.supabase.co"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label>
              Anon key
              <input
                required
                placeholder="eyJhbGciOi…"
                type="text"
                value={anonKey}
                onChange={(event) => setAnonKey(event.target.value)}
              />
            </label>
            <button className="dialog-primary" type="submit">
              Save connection
            </button>
          </form>
        ) : status === 'signedIn' ? (
          <div className="dialog-form">
            <p className="dialog-note">
              Signed in as <strong>{accountEmail ?? 'unknown account'}</strong>
            </p>
            <button className="dialog-primary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(email.trim(), password, 'signIn');
            }}
          >
            <label>
              Email
              <input
                autoComplete="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button className="dialog-primary" disabled={pending} type="submit">
                {pending ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                className="dialog-secondary"
                disabled={pending}
                type="button"
                onClick={() => onSubmit(email.trim(), password, 'signUp')}
              >
                Create account
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
