# Classic recompilation and decompilation landscape

- **Observed:** August 13, 2026
- **Scope:** Methods, tools, notable projects, legal constraints, the existing local tracker, and a recommended direction for Classicomp.
- **Evidence rule:** Ecosystem status is time-sensitive. Follow the linked first-party sources and verify current releases before relying on a maturity or compatibility claim.

## Executive summary

“Classic recomp/decomp” is not one technique. It is an ecosystem of related approaches:

| Category | What it does | Best use |
| --- | --- | --- |
| Matching decompilation | Reconstructs human-readable source that compiles byte-for-byte to the original binary | Preservation, understanding, and durable source ports |
| Non-matching decompilation | Reconstructs equivalent, readable code without requiring identical output | Faster reverse engineering and portability |
| Static recompilation | Translates original machine code ahead of time into C/C++ and then native host code | A faster route to a native port |
| Reverse-engineered reimplementation | Recreates the original behavior in new code | Portable replacement engines |
| Source port | Adapts recovered, reconstructed, or officially released source to modern platforms | A finished end-user experience |

Dynamic recompilation is different: it translates instructions while a game runs and is normally part of an emulator. Static recompilation produces a title-specific executable before runtime.

There is no single complete catalog. The broadest structured source found, the [Game Translation Index](https://github.com/LampaGJ/game-translation-index), had conflicting totals across its description, README, and generated data. Its August 2 manifest contained 1,088 rows and 613 game rollups:

- 607 code-translation projects
- 111 reconstructions
- 186 repackaging or conventional ports
- 27 emulation entries
- 34 infrastructure projects
- 123 unclassified entries

These numbers include false positives, infrastructure, modern games, and projects whose method was inferred from repository metadata. Exact totals matter less than method, evidence quality, activity, and demonstrated playability. The broader [awesome-game-decompilations list](https://github.com/CharlotteCross1998/awesome-game-decompilations) is valuable for discovery but similarly mixes early experiments, complete decomps, ports, recompilers, and AI-assisted projects.

## How matching decompilation works

A typical matching decompilation proceeds as follows:

1. A contributor supplies their own original game binary.
2. Tools split it into code, data, overlays, symbols, and assets.
3. Ghidra or another disassembler identifies functions, types, call graphs, and structures.
4. Contributors determine the original compiler and flags.
5. Assembly functions are manually reconstructed as C or C++.
6. The reconstructed function is compiled and compared with the original.
7. The process repeats until the generated binary matches.

A byte-perfect match is valuable because equivalence becomes objectively testable. It does not recover original variable names, comments, or formatting, but it demonstrates that the reconstructed program behaves like the retail binary. [decomp.me’s FAQ](https://www.decomp.me/faq) provides a clear practical explanation.

Matching is sensitive to details that normal software development rarely needs to preserve: compiler version, optimization flags, register allocation, instruction scheduling, object boundaries, link order, relocations, padding, and data layout. That is why projects recover historical compilers and develop specialized comparison tools instead of relying only on a modern decompiler’s pseudocode.

## How static recompilation works

Static recompilation takes a shorter but more mechanical route:

1. Locate functions, symbols, overlays, relocations, and indirect branches.
2. Translate each guest instruction into literal C/C++ operations.
3. Compile that generated code for x86-64 or ARM64.
4. Implement the original console’s operating-system services, memory model, audio, input, graphics, and storage in a runtime.
5. Add title-specific patches and a modern renderer or user interface.

[N64Recomp](https://github.com/N64Recomp/N64Recomp) demonstrates this model. It can avoid waiting for a complete decompilation, but decompilation work remains extremely useful for symbols, patches, documentation, and enhancements. The generated code generally is not pleasant human-authored source.

The CPU translator is only part of the problem. Graphics processors, DSPs, console operating systems, overlays, dynamically loaded code, timing assumptions, and self-modifying code require emulation, high-level replacements, interpreters, or manual patches. A successful port also needs practical host integrations such as input, save paths, display modes, audio, configuration, packaging, and asset verification.

## Important toolchains

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra) — general disassembly, decompilation, scripting, function analysis, and collaborative reverse engineering across many CPU families.
- [splat](https://github.com/ethteck/splat) — binary splitting for N64, PS1, PS2, and PSP projects.
- [decomp-toolkit](https://github.com/encounter/decomp-toolkit) — particularly mature GameCube/Wii matching-decomp infrastructure, including DOL/REL analysis, relocations, object splitting, and CodeWarrior linking.
- [decomp.me](https://www.decomp.me/faq) — browser-based collaborative function matching.
- [objdiff](https://github.com/encounter/objdiff) — local whole-object comparison and progress reporting for ARM, MIPS, PowerPC, SuperH, and x86 projects.
- [m2c](https://github.com/matt-kempster/m2c) — generates starting-point C from MIPS, ARM, and PowerPC assembly.
- [old-gcc](https://github.com/decompals/old-gcc) — reproducible builds of historic GCC versions needed for matching.
- [N64Recomp](https://github.com/N64Recomp/N64Recomp) and [N64ModernRuntime](https://github.com/N64Recomp/N64ModernRuntime) — the most proven reusable static-recomp stack in this survey.
- [XenonRecomp](https://github.com/hedge-dev/XenonRecomp) and [XenosRecomp](https://github.com/hedge-dev/XenosRecomp) — Xbox 360 PowerPC and shader translation, proven by Sonic Unleashed.
- [PS2Recomp](https://github.com/ran-j/PS2Recomp) — promising but explicitly experimental; graphics, VU1, and hardware support were incomplete when observed.
- [NWiiRecomp](https://github.com/BlackLineInteractive/NWiiRecomp) — early GameCube/Wii recompilation research with boot progress, not yet a mature game-port platform when observed.
- [PSXRecomp](https://github.com/mstan/psxrecomp) — experimental PS1 framework combining static code, cached recompilation of overlays, and interpreter fallback.

## Notable usable results

### Nintendo 64

Nintendo 64 had the most mature console recomp/decomp scene in this survey.

- [Zelda 64: Recompiled](https://github.com/Zelda64Recomp/Zelda64Recomp) — released Majora’s Mask static recompilation with Linux, Windows, macOS, Steam Deck, widescreen, modern frame-rate support, gyro, autosaving, mods, and texture packs.
- [Banjo: Recompiled](https://github.com/BanjoRecomp/BanjoRecomp) — released Banjo-Kazooie native port for Windows, Linux, and macOS with RT64, modern controls, enhancements, and mod support.
- [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright) — mature Ocarina of Time source port derived from the matching decompilation. Its April 2026 release line supported Linux AppImage, Windows, macOS, and Switch.
- [Perfect Dark PC port](https://github.com/perfect-dark-pc-port/perfect_dark) — mostly functional single-player and split-screen multiplayer, with Linux support, widescreen, mouse aiming, modern controls, and mod foundations.
- [Starship](https://github.com/HarbourMasters/Starship) — Star Fox 64 source port with Linux AppImage and modern graphics backends.
- Other active families included 2Ship2Harkinian, SpaghettiKart, Ghostship, BattleShip, Bomberman recomps, Harvest Moon 64 Recomp, Pokémon Stadium Recomp, Quest 64 Recomp, Dinosaur Planet Recompiled, and several wrestling-game recompilations.

### Xbox 360

[Unleashed Recompiled](https://github.com/hedge-dev/UnleashedRecomp) was the strongest proof found that static recompilation scales beyond N64. It converts Sonic Unleashed’s PowerPC code and shaders, supports Windows and Linux, supplies a custom modern renderer, ultrawide output, high-frame-rate options, low-latency input, asynchronous shader preparation, and mod support.

Ace Combat 6, Blue Dragon, Crackdown, Banjo-Kazooie: Nuts & Bolts, Viva Piñata, Test Drive Unlimited, Halo 3, Rock Band 3, and other Xbox 360 projects existed, but their maturity varied enormously. Repository activity must not be mistaken for a finished port.

### PlayStation 2

[OpenGOAL](https://github.com/open-goal/jak-project) was the standout. It decompiles Naughty Dog’s GOAL language, implements a new compiler and runtime, and targets Windows, Linux, and macOS. Its [official FAQ](https://opengoal.dev/docs/faq/) said Jak 1, Jak II, and Jak 3 were feature-complete and completable, although portions of the repository README still described Jak 3 as unfinished. That disagreement demonstrates why Classicomp needs evidence dates and explicit source-conflict records.

General-purpose PS2 static recompilation remained experimental.

### GameCube and Wii

[Dusklight](https://github.com/TwilitRealm/dusklight) was a major milestone: a released reverse-engineered Twilight Princess reimplementation based on completed decompilation work, with desktop and mobile support. GameCube/Wii matching decomps are supported by an especially strong toolchain built around decomp-toolkit, objdiff, decomp.me, and recovered Metrowerks compilers.

Generic GameCube/Wii ahead-of-time recompilers remained research projects rather than replacements for Dolphin.

### PC and other systems

- [LEGO Island Portable](https://github.com/isledecomp/isle-portable) is derived from a functionally complete decompilation and targets many desktop, mobile, console, and web platforms, although its release builds were still described as developer-oriented.
- [DevilutionX](https://github.com/diasurgical/DevilutionX) is a mature modern Diablo/Hellfire port built from reconstructed source and requiring original game data.
- [OpenRCT2](https://github.com/OpenRCT2/OpenRCT2) is a mature reimplementation, not a decompilation or static recompilation.
- The Pokémon reverse-engineering community maintains matching disassemblies and decompilations across Game Boy, GBA, N64, DS, and Wii through [pret](https://github.com/pret/pret.github.io).
- ZeldaRET maintains projects spanning N64, GameCube, Wii, DS, GBA, and 3DS.

## What maturity labels should mean

A tracker should separate dimensions that are often collapsed into one vague status:

- **Reverse-engineering completion:** How much original code or data has been understood or matched?
- **Build reproducibility:** Can a documented toolchain rebuild the expected binary?
- **Runtime completeness:** Can the game be completed, including saves, audio, menus, cutscenes, and edge cases?
- **Port quality:** Are input, display, audio, configuration, and platform integration reliable?
- **Distribution readiness:** Is there a packaged, user-facing release rather than only developer source?
- **Platform verification:** Has a specific release actually been tested on Linux, Windows, macOS, Steam Deck, or another target?
- **Enhancement support:** Are widescreen, higher resolutions, alternative frame rates, mods, or texture packs supported and stable?
- **Evidence confidence:** Is the claim from first-party documentation, a release artifact, source inspection, or an inferred third-party listing?

“100% decompiled” does not automatically mean that a polished source port exists. A static recomp can be highly playable without producing clean source. A release artifact can exist without the game being completable. These should be modeled independently.

## Legal and distribution reality

This section is informational and is not legal advice.

In the United States, [17 U.S.C. § 1201(f)](https://www.law.cornell.edu/uscode/text/17/1201) permits limited circumvention for interoperability by someone who lawfully obtained the program. [17 U.S.C. § 117](https://www.law.cornell.edu/uscode/text/17/117) permits certain owner-made essential-step and archival copies. *Sega v. Accolade* held that necessary intermediate copying during reverse engineering could be fair use. These rules do not create a general right to distribute copyrighted game code or assets, and the current video-game preservation exemption is largely limited to discontinued server access and eligible libraries, archives, and museums. See the [current exemption text](https://www.law.cornell.edu/cfr/text/37/201.40).

The UAE position is more conservative. Federal Decree-Law No. 38 of 2021 provides a narrow lawful-possessor exception for a single software backup or adaptation within the licensed purpose, while Article 40 penalizes unlawful technological-protection circumvention and unauthorized software storage or use. See the [official UAE copyright law](https://uaelegislation.gov.ae/en/legislations/1534/download).

The safest project pattern is therefore:

- Never bundle ROMs, disc images, BIOS files, proprietary assets, or leaked source.
- Require a user-supplied lawful copy.
- Hash and accept only documented revisions.
- Store extracted assets locally.
- Distribute original tooling, patches, runtimes, and documentation.
- Treat generated recompiled binaries as legally less settled than clean-room runtimes or patch-only systems.
- Obtain specialist UAE advice before public or commercial distribution.

## Local project and tracker audit

At the time of the research, the Classicomp workspace was an otherwise empty Git repository. A separate, previously planned product had become a substantial implementation in a sibling checkout outside this repository.

The following results were directly observed on August 13, 2026:

- The production build succeeded.
- All 108 tests across 25 test files passed.
- The bundled source registry held 116 projects covering 98 games.
- The live SQLite catalog held 124 projects covering 105 games.
- Catalog composition was 51 matching decomps, 38 static recomps, 19 source ports, 13 other decomps, and 3 hybrids.
- Every record had at least one evidence row, totaling 419 evidence records.
- Only two entries had numeric completion percentages.
- 95 of 124 entries still said “Catalogued; verification queued.”
- 83 entries had unknown stability.
- The application was not running.
- The latest scan was August 11 at 08:00 Dubai time and completed with four AI-fetch warnings.
- Five scheduled refreshes had subsequently been missed.
- Every record still had `is_stale = false`, showing that staleness handled source failures but not a stopped scheduler.
- The existing tracker worktree contained 38 modified tracked files and 15 untracked paths. None were changed during the audit.

The catalog also contained already-obsolete semantic data: it labeled Jak 3 experimental even though OpenGOAL’s current FAQ called it feature-complete, and it did not recognize the completed Twilight Princess decompilation behind Dusklight. This confirms that commit activity and repository existence are insufficient evidence for maturity.

These audit numbers are a dated snapshot, not a statement about the tracker’s current state after August 13, 2026.

## Recommended direction for Classicomp

The separate tracker is a strong technical base, but its discovery coverage is much better than its verification depth. Classicomp should adopt the following architecture and operating rules:

1. Adopt the Game Translation Index’s five-tier method taxonomy.
2. Import broad indexes only as discovery feeds.
3. Treat each project’s repository, documentation, and release assets as authoritative evidence.
4. Separate game, reverse-engineering project, derived port, runtime, and installer into different entities.
5. Add explicit fields for playable-build availability, Linux packaging, supported asset revisions, renderer, mods, texture packs, AI involvement, and legal asset model.
6. Make staleness age-based as well as failure-based.
7. Use a persistent systemd user timer so scans continue while the UI is closed.
8. Record evidence conflicts instead of silently choosing one source.
9. Never infer “playable” from recent commits, stars, screenshots, or a release tag alone.
10. Keep a compact verified catalog for installation alongside a much larger research index.

### Suggested entity boundaries

| Entity | Examples of fields |
| --- | --- |
| Game | Title, release year, original platforms, publisher, pre-PS4-era eligibility |
| Reverse-engineering project | Method, repository, target revision, completion evidence, compiler/toolchain |
| Derived port | Parent project, supported hosts, runtime completeness, enhancements |
| Runtime/toolchain | Supported guest architecture, renderer, limitations, license |
| Release artifact | Version, date, platform, package type, checksum, first-party URL |
| Asset requirement | Required original edition/revision, hash, extraction method, locally stored paths |
| Evidence record | Claim, source, observed date, confidence, conflict state, reviewer notes |
| Verification result | Exact artifact tested, host environment, outcome, failures, verification date |

### Recommended status rules

- `discovered`: Listed by a broad index but not yet verified from a first-party source.
- `verified-project`: Repository and method confirmed.
- `building`: Reproducible build confirmed, but no complete runtime verification.
- `playable`: Meaningful gameplay verified from a documented artifact.
- `completable`: A trustworthy first-party or direct test states the game can be completed.
- `release-ready`: Packaged release plus documented asset flow and platform support.
- `stale`: Verification is older than the configured evidence window, even if the last fetch did not fail.
- `conflicted`: First-party sources disagree on a material status field.

## Research sources

### Indexes

- [Game Translation Index](https://github.com/LampaGJ/game-translation-index)
- [Awesome Game Decompilations](https://github.com/CharlotteCross1998/awesome-game-decompilations)

### Methods and infrastructure

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra)
- [splat](https://github.com/ethteck/splat)
- [decomp-toolkit](https://github.com/encounter/decomp-toolkit)
- [decomp.me FAQ](https://www.decomp.me/faq)
- [objdiff](https://github.com/encounter/objdiff)
- [m2c](https://github.com/matt-kempster/m2c)
- [old-gcc](https://github.com/decompals/old-gcc)
- [N64Recomp](https://github.com/N64Recomp/N64Recomp)
- [N64ModernRuntime](https://github.com/N64Recomp/N64ModernRuntime)
- [XenonRecomp](https://github.com/hedge-dev/XenonRecomp)
- [XenosRecomp](https://github.com/hedge-dev/XenosRecomp)
- [PS2Recomp](https://github.com/ran-j/PS2Recomp)
- [NWiiRecomp](https://github.com/BlackLineInteractive/NWiiRecomp)
- [PSXRecomp](https://github.com/mstan/psxrecomp)

### Representative projects

- [Zelda 64: Recompiled](https://github.com/Zelda64Recomp/Zelda64Recomp)
- [Banjo: Recompiled](https://github.com/BanjoRecomp/BanjoRecomp)
- [Ship of Harkinian](https://github.com/HarbourMasters/Shipwright)
- [Perfect Dark PC port](https://github.com/perfect-dark-pc-port/perfect_dark)
- [Starship](https://github.com/HarbourMasters/Starship)
- [Unleashed Recompiled](https://github.com/hedge-dev/UnleashedRecomp)
- [OpenGOAL](https://github.com/open-goal/jak-project) and its [official FAQ](https://opengoal.dev/docs/faq/)
- [Dusklight](https://github.com/TwilitRealm/dusklight)
- [LEGO Island Portable](https://github.com/isledecomp/isle-portable)
- [DevilutionX](https://github.com/diasurgical/DevilutionX)
- [OpenRCT2](https://github.com/OpenRCT2/OpenRCT2)
- [pret](https://github.com/pret/pret.github.io)

### Law and exemptions

- [17 U.S.C. § 1201](https://www.law.cornell.edu/uscode/text/17/1201)
- [17 U.S.C. § 117](https://www.law.cornell.edu/uscode/text/17/117)
- [37 C.F.R. § 201.40](https://www.law.cornell.edu/cfr/text/37/201.40)
- [UAE Federal Decree-Law No. 38 of 2021](https://uaelegislation.gov.ae/en/legislations/1534/download)
