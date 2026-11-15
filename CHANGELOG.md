# Changelog

What changed in each release of Chords & Scales. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The release workflow copies a version's section
into its GitHub Release, and refuses to build a tag without one
([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).

## [Unreleased]

## [0.1.0] - 2026-11-15

The first release: scales on the fretboard, for guitars and basses with 4–9 strings. It runs
offline; settings and your own scales and tunings are saved as TOML files in the app-data
folder.

### Added

- **Scale explorer.** Pick or type a root (`A`, `F#`, `Db`) and one of 52 built-in scales and
  modes, searchable by name or alias. The neck shows the scale over every fret, with the root
  as a square and each degree in its own colour.
- **Labels and spelling.** Dot labels as note names, intervals (`♯4` in Lydian, not `♭5`) or
  none, and sharps or flats; the root keeps the spelling you chose.
- **Tab view.** The scale as tab in one position: a 3-notes-per-string pattern or a fret window
  with a start fret and width, played up, down or up and back down. The position is highlighted
  on the neck.
- **Instruments.** 4–9 strings, 20 built-in guitar and bass tunings, 12–27 frets, a capo and a
  left-handed (mirrored) neck. Make your own tunings, a note and octave per string, and edit or
  delete them.
- **Custom scales.** Make your own scales by picking intervals or clicking notes on the neck,
  with a name and family; edit and delete them. They appear in the picker like the built-ins.
- **Your files.** `settings.toml`, `scales.toml` and `tunings.toml` are hand-editable. A
  broken item is skipped and listed under the title; the app keeps a backup before it first
  rewrites such a file.
- **Themes.** Light, dark, or follow the system.
- **Keyboard.** The fretboard is one keyboard grid: arrow keys move between strings and frets.
- **Installers** for Windows (`.exe`), macOS (universal `.dmg`) and Linux (`.AppImage`,
  `.deb`). They are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn
  on first start.

[Unreleased]: https://github.com/sitzriese89/chords-and-scales/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sitzriese89/chords-and-scales/releases/tag/v0.1.0
