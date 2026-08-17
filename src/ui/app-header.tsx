import { ArrowLeft, ArrowRight, Bell, ChevronDown, ExternalLink, Heart, Image, LogOut, Search, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppRoute, Profile, ReleaseNotice } from '../domain/types';
import { getDonateUrl } from '../platform/donate';
import { DonateDialog } from './donate-dialog';
import { useMenuFocus } from './keyboard-accessibility';
import { MediaKeyDialog } from './media-key-dialog';

interface HeaderProps {
  activeProfile: Profile;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
  onChangeRoute(route: AppRoute): void;
  // Optional account surfaces; when omitted the header renders exactly as
  // before, with no friends button or account entry in the menu.
  accountEmail?: string | null;
  onOpenSignIn?(): void;
  onOpenFriends?(): void;
  // Release notices for wishlisted games. When the prop is omitted the bell
  // does not render at all; an empty array renders it without a badge.
  releaseNotices?: ReleaseNotice[];
  onDismissNotice?(noticeId: string): void;
  onOpenNoticeGame?(gameKey: string): void;
  // Steam-style persistent store search. Omitting the list hides the box;
  // suggestion clicks reuse the notice-open path (route to store + open).
  searchGames?: HeaderSearchGame[];
  // Steam-style back/forward chevrons; omitted handlers hide them.
  canNavBack?: boolean;
  canNavForward?: boolean;
  onNavBack?(): void;
  onNavForward?(): void;
}

export interface HeaderSearchGame {
  gameKey: string;
  title: string;
  // Lowercased haystack of every name the game answers to ("zelda" must
  // find "Twilight Princess" through the full series title).
  searchText: string;
  coverUrl: string | null;
  availability: string;
}

export function AppHeader({
  activeProfile,
  profiles,
  route,
  onActivateProfile,
  onSignOut,
  onChangeRoute,
  accountEmail = null,
  onOpenSignIn,
  onOpenFriends,
  releaseNotices,
  onDismissNotice,
  onOpenNoticeGame,
  searchGames,
  canNavBack = false,
  canNavForward = false,
  onNavBack,
  onNavForward,
}: HeaderProps) {
  // The owner's PayPal link (local-only), configured from the account menu.
  // Supporting the project lives on the Roadmap page now, where what the money
  // pays for is actually written down — a bare Donate button in a toolbar asks
  // for money without answering "for what?".
  const [, setDonateUrl] = useState<string | null>(() => getDonateUrl());
  const [donateOpen, setDonateOpen] = useState(false);
  const accountMenu = (
    <AccountMenu
      accountEmail={accountEmail}
      activeProfile={activeProfile}
      profiles={profiles}
      onActivateProfile={onActivateProfile}
      onEditDonate={() => setDonateOpen(true)}
      onOpenSignIn={onOpenSignIn}
      onSignOut={onSignOut}
    />
  );

  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1>CLASSICOMP</h1>
      </div>

      {onNavBack && onNavForward ? (
        <div className="header-nav-arrows">
          <button
            aria-label="Back"
            disabled={!canNavBack}
            type="button"
            onClick={onNavBack}
          >
            <ArrowLeft aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Forward"
            disabled={!canNavForward}
            type="button"
            onClick={onNavForward}
          >
            <ArrowRight aria-hidden="true" size={14} />
          </button>
        </div>
      ) : null}

      <nav aria-label="Primary" className="primary-tabs" role="tablist">
        <button
          aria-selected={route === 'store'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('store')}
        >
          Store
        </button>
        <button
          aria-selected={route === 'library'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('library')}
        >
          Library
        </button>
        <button
          aria-selected={route === 'mods'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('mods')}
        >
          Mods
        </button>
        <button
          aria-selected={route === 'roadmap'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('roadmap')}
        >
          Roadmap
        </button>
      </nav>

      {searchGames && onOpenNoticeGame ? (
        <HeaderSearch games={searchGames} onOpenGame={onOpenNoticeGame} />
      ) : null}

      {onOpenFriends || onOpenSignIn || releaseNotices ? (
        <div className="header-account-area">
          {releaseNotices ? (
            <NotificationsBell
              notices={releaseNotices}
              onDismiss={onDismissNotice}
              onOpenGame={onOpenNoticeGame}
            />
          ) : null}
          {onOpenFriends ? (
            <button className="header-friends" type="button" onClick={onOpenFriends}>
              <Users aria-hidden="true" size={13} />
              Friends
            </button>
          ) : null}
          {accountMenu}
        </div>
      ) : (
        accountMenu
      )}
      {donateOpen ? (
        <DonateDialog
          onClose={() => setDonateOpen(false)}
          onSaved={(url) => setDonateUrl(url)}
        />
      ) : null}
    </header>
  );
}

interface HeaderSearchProps {
  games: HeaderSearchGame[];
  onOpenGame(gameKey: string): void;
}

const SEARCH_SUGGESTION_LIMIT = 6;

// Steam's always-visible store search: type anywhere, get capsule
// suggestions, Enter or click jumps straight to the game page.
function HeaderSearch({ games, onOpenGame }: HeaderSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const normalized = query.trim().toLowerCase();
  const matches =
    normalized.length >= 2
      ? games
          .filter((game) => game.searchText.includes(normalized))
          .slice(0, SEARCH_SUGGESTION_LIMIT)
      : [];
  const open = matches.length > 0;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setQuery('');
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(gameKey: string) {
    setQuery('');
    setActiveIndex(0);
    onOpenGame(gameKey);
  }

  return (
    <div className="header-search" ref={rootRef}>
      <Search aria-hidden="true" size={13} />
      <input
        aria-autocomplete="list"
        aria-controls="header-search-results"
        aria-expanded={open}
        aria-label="Search the store"
        placeholder="Search the store"
        role="combobox"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(matches[Math.min(activeIndex, matches.length - 1)].gameKey);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {open ? (
        <ul className="header-search-results" id="header-search-results" role="listbox">
          {matches.map((game, index) => (
            <li key={game.gameKey}>
              <button
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : undefined}
                role="option"
                type="button"
                onClick={() => choose(game.gameKey)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {game.coverUrl ? (
                  <img alt="" loading="lazy" src={game.coverUrl} />
                ) : (
                  <span aria-hidden="true" className="header-search-cover-fallback" />
                )}
                <span className="header-search-title">{game.title}</span>
                <span className="header-search-state">{game.availability}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface NotificationsBellProps {
  notices: ReleaseNotice[];
  onDismiss?(noticeId: string): void;
  onOpenGame?(gameKey: string): void;
}

// Steam-style notifications: a bell with an unread count, a dropdown listing
// each new release with a link to it, and a per-notice dismiss.
function NotificationsBell({ notices, onDismiss, onOpenGame }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { closeAndRestore, menuRef, onMenuKeyDown } = useMenuFocus<HTMLDivElement>(
    open,
    () => setOpen(false),
    { returnFocusTo: triggerRef.current },
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="header-notices" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={notices.length > 0 ? `Notifications (${notices.length} new)` : 'Notifications'}
        className="header-friends"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell aria-hidden="true" size={13} />
        {notices.length > 0 ? (
          <span aria-hidden="true" className="notices-badge">
            {notices.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="notices-dropdown"
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {notices.length === 0 ? (
            <p className="notices-empty">No new releases</p>
          ) : (
            <ul>
              {notices.map((notice) => (
                <li className="notice-row" key={notice.id}>
                  {onOpenGame ? (
                    <button
                      className="notice-open"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        closeAndRestore();
                        onOpenGame(notice.gameKey);
                      }}
                    >
                      {notice.gameShortTitle} {notice.version} is out
                    </button>
                  ) : (
                    <span className="notice-open">
                      {notice.gameShortTitle} {notice.version} is out
                    </span>
                  )}
                  {notice.url ? (
                    <a
                      aria-label={`Open the ${notice.gameShortTitle} ${notice.version} release page`}
                      className="notice-link"
                      href={notice.url}
                      rel="noreferrer"
                      target="_blank"
                      onClick={closeAndRestore}
                    >
                      <ExternalLink aria-hidden="true" size={11} />
                    </a>
                  ) : null}
                  {onDismiss ? (
                    <button
                      aria-label={`Dismiss the ${notice.gameShortTitle} ${notice.version} notice`}
                      className="notice-dismiss"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        closeAndRestore();
                        onDismiss(notice.id);
                      }}
                    >
                      <X aria-hidden="true" size={12} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface AccountMenuProps {

  activeProfile: Profile;
  profiles: Profile[];
  accountEmail: string | null;
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
  onOpenSignIn?(): void;
  onEditDonate(): void;
}

function AccountMenu({
  activeProfile,
  profiles,
  accountEmail,
  onActivateProfile,
  onSignOut,
  onOpenSignIn,
  onEditDonate,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [mediaKeyOpen, setMediaKeyOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { closeAndRestore, menuRef, onMenuKeyDown } = useMenuFocus<HTMLDivElement>(
    open,
    () => setOpen(false),
    { returnFocusTo: triggerRef.current },
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const otherProfiles = profiles.filter((profile) => profile.id !== activeProfile.id);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="account-avatar">
          {activeProfile.avatarInitials}
        </span>
        {activeProfile.displayName}
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      {open ? (
        <div
          className="account-dropdown"
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {onOpenSignIn ? (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeAndRestore();
                  onOpenSignIn();
                }}
              >
                {accountEmail ?? 'Sign in'}
              </button>
              <hr />
            </>
          ) : null}
          {otherProfiles.length > 0 ? (
            <>
              <h2>Switch account</h2>
              {otherProfiles.map((profile) => (
                <button
                  key={profile.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    closeAndRestore();
                    onActivateProfile(profile.id);
                  }}
                >
                  <span aria-hidden="true">{profile.avatarInitials}</span>
                  {profile.displayName}
                </button>
              ))}
              <hr />
            </>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              closeAndRestore();
              setMediaKeyOpen(true);
            }}
          >
            <Image aria-hidden="true" size={13} />
            IGDB screenshots…
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              closeAndRestore();
              onEditDonate();
            }}
          >
            <Heart aria-hidden="true" size={13} />
            Donate button…
          </button>
          <button
            className="sign-out-item"
            role="menuitem"
            type="button"
            onClick={() => {
              closeAndRestore();
              onSignOut();
            }}
          >
            <LogOut aria-hidden="true" size={13} />
            Sign out
          </button>
        </div>
      ) : null}
      {mediaKeyOpen ? (
        <MediaKeyDialog
          returnFocusTo={triggerRef.current}
          onClose={() => setMediaKeyOpen(false)}
        />
      ) : null}
    </div>
  );
}
