# Changelog

What changed in each release of Chords & Scales. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The release workflow copies a version's section
into its GitHub Release, and refuses to build a tag without one
([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).

## [Unreleased]

### Added

- **Mood tags and tag filters.** Every scale and chord shows its mood tags (dark, bright, sad,
  jazzy, exotic, …), derived from its intervals, so your own scales and chords get them too.
  Click tag chips above the scale list or the chord quality to list only the items with every
  tag you picked. Add tags or change the rules in `tags.toml` (see
  [docs/tag-rules.md](docs/tag-rules.md)).

## [0.2.0] - 2026-11-17

Chords: pick, type, harmonize or find them on the neck, see playable shapes for any tuning,
and hear them. Make your own chords like your own scales.

### Added

- **Chord panel.** A panel under the neck, collapsible and resizable, shows a chord's tones
  across the whole neck with the root as a square. Pick a root and one of 60 built-in chords
  (triads, sixths, sevenths, ninths, elevenths, thirteenths, suspended, added-tone, altered and
  power chords), or a degree of the current scale as a triad or 7th chord: degree V of
  C major shows G7 over the dimmed scale. **Strum** plays it.
- **Typed chord symbols.** Type `F#m7b5`, `CΔ7`, `Bø` or a slash chord such as `Am7/G`; an
  invalid symbol marks the character that can't be read.
- **Chord names in two styles.** Standard (`Cmaj7`, `Cm7♭5`) or Jazz (`CΔ7`, `Cø`), applied to
  every chord name in the app and saved.
- **Harmonize.** The chord on every degree of the current scale, as triads or 7th chords, with
  Roman numerals (D Dorian: i7 ii7 IIImaj7 IV7 v7 viø7 VIImaj7). Degrees where no chord forms,
  as on most degrees of a pentatonic scale, say so. Click a chord to show it over the scale.
- **Find chords and scales on the neck.** Turn on **Select notes** and click positions on the
  fretboard; the lowest is the bass. The app lists the chords they make (slash chords and
  chords with the 5th left out included) and the scales that contain them, best first. Click a
  result to show it, or save the notes as your own scale or chord.
- **Voicings.** Playable shapes of the chosen chord for your tuning, 4–9 strings and capo
  included, best first, as chord diagrams. Set the widest stretch and whether open strings,
  muted strings and inversions are allowed; the settings are saved. Choose a shape to see it
  alone on the neck and hear it; **Strum** then plays that shape.
- **Custom chords.** Make your own chords by picking intervals (up to the 13th) or clicking
  notes on the neck, with a name, family, symbol and Jazz symbol; edit and delete them. They
  are saved in `chords.toml` and work everywhere the built-ins do: the picker, typed symbols,
  harmonize, voicings and finding chords on the neck.
- **Sound.** Click a dot to hear the note at its pitch, **Play** the tab's position, and strum
  chords, with a synthesized plucked-string sound. Volume and mute are under **Sound** and are
  saved.

### Changed

- `settings.toml` has new tables and keys for the chord panel, sound, chord-name style and
  voicing constraints. Files from 0.1.0 load unchanged; missing keys take their defaults.

### Known limitations

- The voicing list ignores a slash chord's bass: `Am7/G` lists shapes of `Am7`.
- The installers are still not code-signed.

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

[Unreleased]: https://github.com/sitzriese89/chords-and-scales/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sitzriese89/chords-and-scales/releases/tag/v0.1.0
