import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppRoute, Profile } from '../domain/types';

interface HeaderProps {
  activeProfile: Profile;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
  onChangeRoute(route: AppRoute): void;
}

export function AppHeader({
  activeProfile,
  profiles,
  route,
  onActivateProfile,
  onSignOut,
  onChangeRoute,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1>CLASSICOMP</h1>
      </div>

      <nav aria-label="Primary" className="primary-tabs" role="tablist">
        <button
          aria-selected={route === 'library'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('library')}
        >
          Library
        </button>
        <button
          aria-selected={route === 'catalog'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('catalog')}
        >
          Catalog
        </button>
        <button
          aria-selected={route === 'mods'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('mods')}
        >
          Mods
        </button>
      </nav>

      <AccountMenu
        activeProfile={activeProfile}
        profiles={profiles}
        onActivateProfile={onActivateProfile}
        onSignOut={onSignOut}
      />
    </header>
  );
}

interface AccountMenuProps {
  activeProfile: Profile;
  profiles: Profile[];
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
}

function AccountMenu({ activeProfile, profiles, onActivateProfile, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const otherProfiles = profiles.filter((profile) => profile.id !== activeProfile.id);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound aria-hidden="true" size={15} />
        {activeProfile.displayName}
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      {open ? (
        <div className="account-dropdown" role="menu">
          {otherProfiles.length > 0 ? (
            <>
              <h2>Switch account</h2>
              {otherProfiles.map((profile) => (
                <button
                  key={profile.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
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
            className="sign-out-item"
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut aria-hidden="true" size={13} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
