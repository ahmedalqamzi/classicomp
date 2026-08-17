import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { Friend } from '../domain/types';
import { useModalFocus } from './keyboard-accessibility';

interface FriendsPanelProps {
  open: boolean;
  friends: Friend[];
  pending: Friend[];
  error: string | null;
  onAddFriend(email: string): void;
  onClose(): void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

function FriendRow({ friend }: { friend: Friend }) {
  return (
    <li className="friend-row" data-status={friend.status}>
      <span aria-hidden="true" className="friend-avatar">
        {initials(friend.displayName)}
      </span>
      <span className="friend-name">{friend.displayName}</span>
      <span className="friend-status">{friend.status}</span>
    </li>
  );
}

// Steam-style friends slide-over. Presentational only: the parent owns the
// friends list, pending requests, and the add-friend call. Escape or a click
// on the dimmed backdrop closes it, like every other overlay in the app.
export function FriendsPanel({ open, friends, pending, error, onAddFriend, onClose }: FriendsPanelProps) {
  const [email, setEmail] = useState('');
  const panelRef = useModalFocus<HTMLElement>(open, onClose);

  if (!open) return null;

  const online = friends.filter((friend) => friend.status === 'online');
  const offline = friends.filter((friend) => friend.status === 'offline');

  return (
    <div
      className="friends-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="friends-panel-title"
        aria-modal="true"
        className="friends-panel"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id="friends-panel-title">Friends</h2>
          <button aria-label="Close" className="dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>

        <form
          className="friends-add"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = email.trim();
            if (trimmed.length === 0) return;
            onAddFriend(trimmed);
            setEmail('');
          }}
        >
          <input
            aria-label="Add friend by email"
            placeholder="Add friend by email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button aria-label="Add friend" type="submit">
            <UserPlus aria-hidden="true" size={14} />
          </button>
        </form>

        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="friends-list">
          {pending.length > 0 ? (
            <section aria-label="Pending requests" className="friends-group">
              <h3>Pending requests</h3>
              <ul>
                {pending.map((friend) => (
                  <FriendRow friend={friend} key={friend.id} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Online" className="friends-group">
            <h3>Online</h3>
            {online.length > 0 ? (
              <ul>
                {online.map((friend) => (
                  <FriendRow friend={friend} key={friend.id} />
                ))}
              </ul>
            ) : (
              <p className="friends-empty">No friends online</p>
            )}
          </section>

          <section aria-label="Offline" className="friends-group">
            <h3>Offline</h3>
            {offline.length > 0 ? (
              <ul>
                {offline.map((friend) => (
                  <FriendRow friend={friend} key={friend.id} />
                ))}
              </ul>
            ) : (
              <p className="friends-empty">No friends offline</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
