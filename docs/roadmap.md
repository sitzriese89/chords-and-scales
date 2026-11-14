# Roadmap

Where Chords & Scales is going, in order. Each item is a GitHub issue; milestones group them.
What the app does is in [SPEC.md](../SPEC.md); design decisions are in [ADR.md](../ADR.md); the
original idea is in [ideas.md](ideas.md).

**Audience:** a public, open-source desktop app for Windows, macOS and Linux. Each milestone
from M1 on ends in a release.

## Status

The **Status** column of every table below says what is on `main`: **Done (#PR)**, **Partly
done (#PR: what)** or **Open**. Work in review isn't listed here: `gh pr list` shows it, and
each PR names its issue with `Fixes #n`.

- The PR that finishes an item sets its row to Done in the same PR, so the status is right the
  moment it merges. A PR that finishes part of an item says which part.
- A PR opened without that update: set the row when merging it.
- **Now** in "Order of work" marks the current step; move it when a step is complete.
- New scope gets a row (and an issue) before work starts.

## Order of work

1. **M0** (alone: every other item builds on the scaffold).
2. **M1**, then release **v0.1.0**. **Now**
3. **M2**, voicings (M2.11, M2.12) last, then release **v0.2.0**.
4. **M3**, then release **v0.3.0**.
5. **M4**, then release **v0.4.0**.

Items whose dependencies are done can run in parallel. The coordinator groups them into waves
of issues that don't touch the same files (`implement` skill). Suggested waves from the
dependencies alone are listed under each milestone.

## M0 · Foundation

A workspace that builds, tests and runs in the browser and in Tauri, with CI on every PR.

| Item | Issue | Depends on | Status |
|---|---|---|---|
| M0.1 Workspace scaffold and CI | [#1][1] |  | Done (#34) |

## M1 · Scales on the fretboard (v1)

Any scale, any tuning, 4–9 strings, on a fretboard and as tab. First public release.

| Item | Issue | Depends on | Status |
|---|---|---|---|
| M1.1 Pitch, interval and note-spelling model | [#2][2] | M0.1 | Done (#36) |
| M1.2 Scale catalog in TOML | [#3][3] | M1.1 | Done (#41) |
| M1.3 Tunings and fretboard mapping | [#4][4] | M1.1 | Open |
| M1.4 Scale positions: fret window and 3-notes-per-string | [#5][5] | M1.2, M1.3 | Open |
| M1.5 Fretboard SVG component | [#6][6] | M0.1 | Done (#39) |
| M1.6 Theme tokens, light and dark | [#7][7] | M0.1 | Done (#40) |
| M1.7 Storage: settings, last view and user files | [#8][8] | M0.1 | Done (#38) |
| M1.8 Scale explorer view | [#9][9] | M1.2, M1.3, M1.5, M1.7 | Open |
| M1.9 Instrument and tuning settings | [#10][10] | M1.3, M1.5, M1.6, M1.7 | Open |
| M1.10 Tab view | [#11][11] | M1.4, M1.8 | Open |
| M1.11 Custom scale editor | [#12][12] | M1.2, M1.7, M1.8 | Open |
| M1.12 Release workflow for Windows, macOS and Linux | [#13][13] | M0.1 | Done (#37) |

Suggested waves: (1) M1.1, M1.5, M1.6, M1.7, M1.12 → (2) M1.2, M1.3 → (3) M1.4, M1.8, M1.9 → (4) M1.10, M1.11.

## M2 · Chords (v2)

Chords from every input mode, harmonize, reverse lookup, audio, then generated voicings.

| Item | Issue | Depends on | Status |
|---|---|---|---|
| M2.1 Chord catalog in TOML | [#14][14] | M1.2 | Open |
| M2.2 Chord symbol parser and formatter | [#15][15] | M2.1 | Open |
| M2.3 Harmonize | [#16][16] | M2.1 | Open |
| M2.4 Reverse lookup and scale finder | [#17][17] | M2.1, M1.2 | Open |
| M2.5 Chord panel with chord-over-scale overlay | [#18][18] | M2.1, M1.8 | Open |
| M2.6 Chord symbol input and display style | [#19][19] | M2.2, M2.5 | Open |
| M2.7 Harmonize view | [#20][20] | M2.3, M2.5 | Open |
| M2.8 Reverse lookup on the fretboard | [#21][21] | M2.4, M2.5 | Open |
| M2.9 Custom chord editor | [#22][22] | M2.1, M1.11 | Open |
| M2.10 Audio playback | [#23][23] | M1.8 | Open |
| M2.11 Voicing generator | [#24][24] | M2.1, M1.3 | Open |
| M2.12 Chord diagrams and voicing browser | [#25][25] | M2.11, M2.5 | Open |

Suggested waves: (1) M2.1 → (2) M2.2, M2.3, M2.4, M2.5, M2.10, M2.11 → (3) M2.6, M2.7, M2.8, M2.9, M2.12.

## M3 · Moods and random (v3)

Filter by mood tags derived from interval rules; random picks that respect filters.

| Item | Issue | Depends on | Status |
|---|---|---|---|
| M3.1 Mood tag rules engine | [#26][26] | M2.1 | Open |
| M3.2 Tag filters | [#27][27] | M3.1, M2.5, M1.7 | Open |
| M3.3 Random scale or chord | [#28][28] | M3.2 | Open |

Suggested waves: (1) M3.1 → (2) M3.2 → (3) M3.3.

## M4 · Export and themes (v4)

Collect scales and chords on a themed sheet and export it to PDF, PNG, SVG or HTML.

| Item | Issue | Depends on | Status |
|---|---|---|---|
| M4.1 Theme system and theme picker | [#29][29] | M1.6 | Open |
| M4.2 Export sheet builder | [#30][30] | M4.1, M2.5, M1.10 | Open |
| M4.3 Export to SVG and standalone HTML | [#31][31] | M4.2 | Open |
| M4.4 Export to PNG and PDF | [#32][32] | M4.2 | Open |

Suggested waves: (1) M4.1 → (2) M4.2 → (3) M4.3, M4.4.

## Release gates

A milestone is released when all its items are Done, main is green, and the release workflow
(M1.12) produced installers for all three platforms that start and show the fretboard.

## How to work through it

- One issue per PR; each PR follows [CONTRIBUTING.md](../CONTRIBUTING.md) and the ground rules
  in [AGENTS.md](../AGENTS.md).
- Core items come with their own WASM bindings module, so UI items can start as soon as the
  core item they need is merged.
- UI items can be built against fixture data before the core lands (as M1.5 does).
- When a decision here changes, update this file and add or supersede an ADR.

[1]: https://github.com/sitzriese89/chords-and-scales/issues/1
[2]: https://github.com/sitzriese89/chords-and-scales/issues/2
[3]: https://github.com/sitzriese89/chords-and-scales/issues/3
[4]: https://github.com/sitzriese89/chords-and-scales/issues/4
[5]: https://github.com/sitzriese89/chords-and-scales/issues/5
[6]: https://github.com/sitzriese89/chords-and-scales/issues/6
[7]: https://github.com/sitzriese89/chords-and-scales/issues/7
[8]: https://github.com/sitzriese89/chords-and-scales/issues/8
[9]: https://github.com/sitzriese89/chords-and-scales/issues/9
[10]: https://github.com/sitzriese89/chords-and-scales/issues/10
[11]: https://github.com/sitzriese89/chords-and-scales/issues/11
[12]: https://github.com/sitzriese89/chords-and-scales/issues/12
[13]: https://github.com/sitzriese89/chords-and-scales/issues/13
[14]: https://github.com/sitzriese89/chords-and-scales/issues/14
[15]: https://github.com/sitzriese89/chords-and-scales/issues/15
[16]: https://github.com/sitzriese89/chords-and-scales/issues/16
[17]: https://github.com/sitzriese89/chords-and-scales/issues/17
[18]: https://github.com/sitzriese89/chords-and-scales/issues/18
[19]: https://github.com/sitzriese89/chords-and-scales/issues/19
[20]: https://github.com/sitzriese89/chords-and-scales/issues/20
[21]: https://github.com/sitzriese89/chords-and-scales/issues/21
[22]: https://github.com/sitzriese89/chords-and-scales/issues/22
[23]: https://github.com/sitzriese89/chords-and-scales/issues/23
[24]: https://github.com/sitzriese89/chords-and-scales/issues/24
[25]: https://github.com/sitzriese89/chords-and-scales/issues/25
[26]: https://github.com/sitzriese89/chords-and-scales/issues/26
[27]: https://github.com/sitzriese89/chords-and-scales/issues/27
[28]: https://github.com/sitzriese89/chords-and-scales/issues/28
[29]: https://github.com/sitzriese89/chords-and-scales/issues/29
[30]: https://github.com/sitzriese89/chords-and-scales/issues/30
[31]: https://github.com/sitzriese89/chords-and-scales/issues/31
[32]: https://github.com/sitzriese89/chords-and-scales/issues/32
