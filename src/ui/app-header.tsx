import { UserRound } from 'lucide-react';
import type { AppRoute, Profile } from '../domain/types';

interface HeaderProps {
  activeProfile: Profile;
  downloadsCount: number;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onChangeRoute(route: AppRoute): void;
}

export function AppHeader({
  activeProfile,
  downloadsCount,
  profiles,
  route,
  onActivateProfile,
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
          aria-selected={route === 'downloads'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('downloads')}
        >
          Downloads{downloadsCount > 0 ? ` (${downloadsCount})` : ''}
        </button>
      </nav>

      <label className="profile-menu">
        <span>
          <UserRound aria-hidden="true" size={15} />
          {activeProfile.avatarInitials}
        </span>
        <select
          aria-label="Active profile"
          value={activeProfile.id}
          onChange={(event) => onActivateProfile(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
