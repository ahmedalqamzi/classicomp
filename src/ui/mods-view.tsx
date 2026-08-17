import { ExternalLink, FolderPlus, Pin, Search, Star } from 'lucide-react';
import { useState } from 'react';
import type { Game, LiveMod, Mod } from '../domain/types';
import { getModRepos } from '../platform/mods-collector';
import { GameIcon } from './game-icon';
import { ModRepoDialog } from './mod-repo-dialog';

interface ModsViewProps {
  games: Game[];
  mods: Mod[];
  onToggleMod(modId: string): void;
  // Live Workshop-style mods pulled from the hosting site. They supplement a
  // game's bundled list — the installed mods keep their toggles either way.
  // Null (or omitted) means no live data, so only bundled mods render.
  liveMods?: LiveMod[] | null;
  modsLoading?: boolean;
  // Called after the user edits the pinned mod repositories so the live
  // list refreshes; omitting it hides the "Add mod repo" affordance.
  onSourcesChanged?(): void;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'Updated unknown';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Updated unknown';
  return `Updated ${parsed.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

// One live-mod card, shared by the Mods tab and the per-game Mods section.
// Pinned cards are the user's own repositories, so they carry a badge.
export function LiveModCard({ mod, pinned = false }: { mod: LiveMod; pinned?: boolean }) {
  return (
    <article className={pinned ? 'mod-card is-pinned' : 'mod-card'} key={mod.id}>
      <h4>{mod.name}</h4>
      <p>{mod.summary}</p>
      <div className="mod-card-meta">
        {pinned ? (
          <span className="mod-card-pinned">
            <Pin aria-hidden="true" size={10} />
            Pinned
          </span>
        ) : null}
        <span className="mod-card-author">{mod.author}</span>
        <span className="mod-card-stars">
          <Star aria-hidden="true" size={11} />
          {mod.stars}
        </span>
        <span className="mod-card-updated">{formatUpdatedAt(mod.updatedAt)}</span>
      </div>
      <a
        aria-label={`View mod ${mod.name}`}
        className="mod-card-link"
        href={mod.url}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={11} />
        View mod
      </a>
    </article>
  );
}

export function ModsView({
  games,
  mods,
  onToggleMod,
  liveMods = null,
  modsLoading = false,
  onSourcesChanged,
}: ModsViewProps) {
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Null means "all games"; a chip toggles its game on and back off.
  const [gameFilter, setGameFilter] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const matchesNeedle = (fields: string[]) =>
    needle === '' || fields.some((field) => field.toLowerCase().includes(needle));

  // Pinned repositories lead the live list for their game (the collector
  // fetches them first); match them by URL so they can be badged as the
  // user's own sources rather than ranked search results.
  const pinnedUrls = new Set(
    getModRepos().map((source) => `https://github.com/${source.repo}`.toLowerCase()),
  );

  // Totals ignore the text filter so a chip never hides itself while
  // selected; the per-game counts track it so chips answer "where are the
  // matches" as the user types.
  const sections = games.map((game) => {
    const bundledAll = mods.filter((mod) => mod.gameId === game.id);
    const liveAll = (liveMods ?? []).filter((mod) => mod.gameId === game.id);
    return {
      game,
      total: bundledAll.length + liveAll.length,
      bundled: bundledAll.filter((mod) => matchesNeedle([mod.name, mod.summary, mod.author])),
      live: liveAll.filter((mod) => matchesNeedle([mod.name, mod.summary, mod.author])),
    };
  });
  const chipEntries = sections.filter((section) => section.total > 0);
  const totalMatches = sections.reduce(
    (sum, section) => sum + section.bundled.length + section.live.length,
    0,
  );
  const visibleSections = sections.filter(
    (section) =>
      (gameFilter === null || section.game.id === gameFilter) &&
      section.bundled.length + section.live.length > 0,
  );

  return (
    <section className="mods-view" aria-labelledby="mods-heading">
      <div className="view-heading">
        <h2 id="mods-heading">Mods</h2>
        <div className="mods-heading-side">
          {modsLoading ? (
            <p className="mods-loading" role="status">
              Loading community mods…
            </p>
          ) : null}
          {onSourcesChanged ? (
            <button
              className="mods-add-repo"
              type="button"
              onClick={() => setRepoDialogOpen(true)}
            >
              <FolderPlus aria-hidden="true" size={13} />
              Add mod repo
            </button>
          ) : null}
        </div>
      </div>
      {repoDialogOpen && onSourcesChanged ? (
        <ModRepoDialog
          games={games}
          onClose={() => setRepoDialogOpen(false)}
          onSourcesChanged={onSourcesChanged}
        />
      ) : null}
      <div className="mods-toolbar">
        <label className="mods-search">
          <Search aria-hidden="true" size={13} />
          <input
            aria-label="Filter mods by name, summary, or author"
            placeholder="Filter mods…"
            spellCheck={false}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ul className="mods-game-chips">
          <li>
            <button
              aria-pressed={gameFilter === null}
              className="tag-chip"
              type="button"
              onClick={() => setGameFilter(null)}
            >
              All games
              <span className="mods-chip-count">{totalMatches}</span>
            </button>
          </li>
          {chipEntries.map(({ game, bundled, live }) => (
            <li key={game.id}>
              <button
                aria-pressed={gameFilter === game.id}
                className="tag-chip"
                type="button"
                onClick={() => setGameFilter(gameFilter === game.id ? null : game.id)}
              >
                {game.shortTitle}
                <span className="mods-chip-count">{bundled.length + live.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {visibleSections.length === 0 ? (
        <div className="mods-empty">
          <p>No mods match your filters.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setGameFilter(null);
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        visibleSections.map(({ game, bundled, live }) => (
          <section className="mods-game" key={game.id} aria-labelledby={`mods-${game.id}`}>
            <h3 id={`mods-${game.id}`}>
              <GameIcon game={game} />
              {game.title}
              <span className="mods-game-count">{bundled.length + live.length}</span>
            </h3>
            {bundled.length > 0 ? (
              <div className="mods-group">
                <h4 className="mods-group-label">Installed · {bundled.length}</h4>
                <div className="mods-table">
                  {bundled.map((mod) => (
                    <article className="mod-row" key={mod.id}>
                      <div>
                        <h4>{mod.name}</h4>
                        <p>{mod.summary}</p>
                      </div>
                      <span>{mod.version}</span>
                      <span>{mod.author}</span>
                      <button
                        aria-checked={mod.enabled}
                        aria-label={`Toggle ${mod.name}`}
                        className="mod-toggle"
                        role="switch"
                        type="button"
                        onClick={() => onToggleMod(mod.id)}
                      >
                        <span className="mod-toggle-knob" />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {live.length > 0 ? (
              <div className="mods-group">
                <h4 className="mods-group-label">Discovered on GitHub · {live.length}</h4>
                <div className="mods-grid">
                  {live.map((mod) => (
                    <LiveModCard
                      key={mod.id}
                      mod={mod}
                      pinned={pinnedUrls.has(mod.url.toLowerCase())}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ))
      )}
    </section>
  );
}
