# Classicomp

Classicomp is a documentation-first project for tracking classic-game decompilations, static recompilations, reverse-engineered reimplementations, and source ports.

The first research baseline is complete:

- [Classic recompilation and decompilation landscape — August 13, 2026](docs/research/2026-08-13-classic-recomp-decomp-landscape.md)

## Project principles

- Keep matching decomps, non-matching decomps, static recomps, reimplementations, and source ports distinct.
- Use broad indexes for discovery, then verify claims against first-party project documentation and releases.
- Record when evidence was observed and preserve conflicts between sources.
- Never infer playability from repository activity, popularity, screenshots, or the existence of a release tag.
- Keep proprietary games, assets, ROMs, disc images, BIOS files, and leaked source out of the project.
- Treat legal conclusions as jurisdiction-specific and obtain specialist advice before public or commercial distribution.

## Current state

This repository currently contains the research and product direction. The earlier local tracker implementation remains separate, in a sibling checkout outside this repository; it was audited, not copied or modified as part of this baseline.

## Remote installation targets

### Steam machine

- **Target:** `steam-box` (`deck@steam-box.local` over SSH)
- **Supported operations:** Wake, capability and status checks, preflight, install, repair, and uninstall
- **Intended use:** Install verified classic-game ports on the Steam machine from Classicomp tooling
- **Live status (August 13, 2026):** Configured, but currently unreachable; `steam-box.local` did not resolve and the machine did not advertise SSH on the local network
- **Verification rule:** Recheck reachability before every operation. Do not hard-code an IP address or report an installation as successful without a completed remote verification
