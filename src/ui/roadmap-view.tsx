import { Check, Loader } from 'lucide-react';

// What Classicomp does today and what is coming. No funding tiers and no
// donation ask: this is a product plan, not a pitch.

type Status = 'shipped' | 'building' | 'planned' | 'blocked';

interface Item {
  title: string;
  detail: string;
  status: Status;
}

const STATUS_LABEL: Record<Status, string> = {
  shipped: 'Shipped',
  building: 'In progress',
  planned: 'Planned',
  blocked: 'Blocked',
};

// Everything marked shipped is something the app does today; nothing here is
// aspirational relabelled as done.
const SHIPPED: Item[] = [
  {
    title: 'A catalogue that maintains itself',
    detail:
      '151 tracked projects, rescanned on a rotation, with box art and screenshots pulled automatically. New releases appear without anyone editing a list.',
    status: 'shipped',
  },
  {
    title: 'Download, install, play',
    detail:
      'Picks the build matching your OS and CPU, unpacks nested archives, registers Flatpaks, finds the real executable among the helpers, and launches it.',
    status: 'shipped',
  },
  {
    title: 'Dependencies handled without root',
    detail:
      'Games needing .NET get it provisioned into the app’s own directory — no package manager, no sudo. Windows-only builds run through Wine in a per-game prefix.',
    status: 'shipped',
  },
  {
    title: 'Updates that keep your saves',
    detail:
      'Installed games update in the background. Saves, settings and mods are lifted out before the old build is replaced and restored afterwards — including when an update fails.',
    status: 'shipped',
  },
];

const PLANNED: Item[] = [
  {
    title: 'Big Picture mode',
    detail:
      'A full-screen, controller-first layout for playing on a TV or a handheld — navigation, library and store all reachable without a mouse.',
    status: 'planned',
  },
  {
    title: 'Remote install',
    detail:
      'Queue a game from anywhere and have the machine at home download and install it, so it is ready when you sit down.',
    status: 'planned',
  },
  {
    title: 'Mobile app',
    detail:
      'Browse the catalogue, manage your library and trigger remote installs from a phone.',
    status: 'planned',
  },
  {
    title: 'Cloud saves',
    detail:
      'The save-preservation machinery already knows where each game keeps its progress. Syncing it between machines is the next step from there.',
    status: 'planned',
  },
  {
    title: 'Friends list',
    detail:
      'See who is online and what they are playing, across the recompilation catalogue rather than a single game.',
    status: 'planned',
  },
  {
    title: 'Multiplayer connectivity',
    detail:
      'Join a friend’s session directly from their profile, with the netplay and lobby handling these ports each do differently smoothed into one flow.',
    status: 'planned',
  },
  {
    title: 'Built-in workshop',
    detail:
      'Browse, install and update mods without leaving the app, and share the setup that made a game work for you.',
    status: 'planned',
  },
];

const KNOWN_ISSUES: Item[] = [
  {
    title: 'Games needing a system library nobody ships any more',
    detail:
      'Morrowind wants an FFmpeg version modern systems have moved past, and OpenMW publishes no self-contained build. Pinned per-user runtime bundles would close that whole class of failure.',
    status: 'blocked',
  },
];

function StatusPill({ status }: { status: Status }) {
  return (
    <span className="roadmap-status" data-status={status}>
      {status === 'shipped' ? <Check aria-hidden="true" size={11} /> : null}
      {status === 'building' ? <Loader aria-hidden="true" size={11} /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

function Section({ id, title, summary, items }: { id: string; title: string; summary: string; items: Item[] }) {
  return (
    <section aria-labelledby={id} className="roadmap-phase">
      <div className="roadmap-phase-head">
        <h3 id={id}>{title}</h3>
      </div>
      <p className="roadmap-summary">{summary}</p>
      <ul className="roadmap-items">
        {items.map((item) => (
          <li key={item.title}>
            <div className="roadmap-item-head">
              <span className="roadmap-item-title">{item.title}</span>
              <StatusPill status={item.status} />
            </div>
            <p>{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoadmapView() {
  return (
    <section aria-labelledby="roadmap-heading" className="roadmap-view">
      <header className="roadmap-head">
        <h2 id="roadmap-heading">Roadmap</h2>
        <p>
          Classicomp is a storefront for open-source recompilations and source ports — the
          projects that rebuild classic games to run natively on modern machines. It ships no
          game content: every game here needs your own original copy.
        </p>
      </header>

      <Section
        id="roadmap-shipped"
        items={SHIPPED}
        summary="The store works end to end: it finds the projects, picks the right build for your machine, installs it, and launches it."
        title="Working today"
      />

      <Section
        id="roadmap-planned"
        items={PLANNED}
        summary="Where Classicomp goes next — the parts that turn a working installer into a platform."
        title="Coming next"
      />

      <Section
        id="roadmap-known"
        items={KNOWN_ISSUES}
        summary="Things that are broken for reasons outside the app, tracked here rather than quietly ignored."
        title="Known issues"
      />
    </section>
  );
}
