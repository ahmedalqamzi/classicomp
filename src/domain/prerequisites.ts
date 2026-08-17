import type { TrackedProject } from './types';

// Some builds cannot start until the player supplies their own copy of the
// original game, and cannot ask for it themselves.
//
// Most projects here do NOT belong in this table. Zelda 64: Recompiled, Ship
// of Harkinian, OpenMW and the rest open their own first-run picker and know
// far more about what they need than Classicomp does — asking twice is worse
// than not asking. This list is only for builds that die, or sit on an error
// dialog, because nothing handed them a file.
//
// Every entry is derived from evidence the build itself gave: its --help
// output, its error dialog, or its README. Nothing here is guessed.

export type Prerequisite =
  // Passed on the command line, e.g. `CrashBandicoot-Linux --run disc.cue`.
  | { kind: 'argument'; flag: string; label: string; accepts: string }
  // Copied next to the executable under a name the build looks for.
  | { kind: 'file'; names: string[]; label: string; accepts: string }
  // Run once, at setup time, to turn the disc into game data the build can
  // load. "{rom}" in args is replaced with the linked file's path. This is
  // slow — OpenGOAL extracts, decompiles and recompiles the whole game — so
  // it belongs in Set up where the player is waiting on it deliberately,
  // never on the Play button.
  | {
      kind: 'tool';
      tool: string;
      args: string[];
      label: string;
      accepts: string;
      minutes: number;
    };

// Keyed by gameKey, which is stable and shared by every project for a game.
export const LAUNCH_PREREQUISITES: Record<string, Prerequisite> = {
  // Evidence: its own --help. "graphical launcher is Windows-only", so on
  // Linux there is no in-app way to supply the disc.
  'crash-bandicoot': {
    kind: 'argument',
    flag: '--run',
    label: 'your original Crash Bandicoot disc image',
    accepts: '.cue',
  },
  // Evidence: its own error dialog, which names the files it accepts.
  'the-legend-of-zelda-the-minish-cap': {
    kind: 'file',
    names: ['baserom.gba'],
    label: 'your original Minish Cap ROM',
    accepts: '.gba',
  },
  // Evidence: README — "Place your USA rom named smw.sfc in that folder".
  'super-mario-world': {
    kind: 'file',
    names: ['smw.sfc'],
    label: 'your original Super Mario World ROM',
    accepts: '.sfc,.smc',
  },
  // Evidence: the shipped `extractor --help`, and gk's own error —
  // "data/out/jak1/fr3/GAME.fr3 cannot be opened: does not exist".
  'jak-and-daxter-the-precursor-legacy': {
    kind: 'tool',
    tool: 'extractor',
    args: ['--all', '--game', 'jak1', '{rom}'],
    label: 'your original Jak and Daxter disc image',
    accepts: '.iso',
    minutes: 30,
  },
  'jak-ii': {
    kind: 'tool',
    tool: 'extractor',
    args: ['--all', '--game', 'jak2', '{rom}'],
    label: 'your original Jak II disc image',
    accepts: '.iso',
    minutes: 40,
  },
};

export function prerequisiteFor(gameKey: string): Prerequisite | null {
  return LAUNCH_PREREQUISITES[gameKey] ?? null;
}

// The library knows games by id, not gameKey; a scanned project's id IS its
// gameKey, and a seeded one has to be looked up through its projects.
export function prerequisiteForGame(
  gameId: string,
  projects: TrackedProject[],
): Prerequisite | null {
  const direct = prerequisiteFor(gameId);
  if (direct) return direct;
  const match = projects.find(
    (project) => project.gameId === gameId || project.gameKey === gameId,
  );
  return match ? prerequisiteFor(match.gameKey) : null;
}
