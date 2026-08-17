import type { Profile } from '../domain/types';

interface SignInViewProps {
  profiles: Profile[];
  onSignIn(profileId: string): void;
}

export function SignInView({ profiles, onSignIn }: SignInViewProps) {
  return (
    <main className="sign-in-view">
      <a
        className="skip-link"
        href="#active-view"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('active-view')?.focus();
        }}
      >
        Skip to content
      </a>
      <section
        className="sign-in-card"
        aria-labelledby="sign-in-heading"
        id="active-view"
        tabIndex={-1}
      >
        <h1 id="sign-in-heading">Sign in to Classicomp</h1>
        <div className="sign-in-accounts">
          {profiles.map((profile) => (
            <button
              className="sign-in-account"
              key={profile.id}
              type="button"
              onClick={() => onSignIn(profile.id)}
            >
              <span aria-hidden="true" className="sign-in-avatar">
                {profile.avatarInitials}
              </span>
              {profile.displayName}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
