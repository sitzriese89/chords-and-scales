# Changelog

What changed in each release of Chords & Scales. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The release workflow copies a version's section
into its GitHub Release, and refuses to build a tag without one
([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).

## [Unreleased]

## [0.6.0] - 2026-11-22

A new layout: Scales, Chords and Sheet pages under one toolbar, the pickers in a drawer, and
the fretboard and chord shapes across the full width of the window.

### Added

- **Toolbar and pages.** One toolbar holds the title, the page tabs **Scales**, **Chords** and
  **Sheet (n)**, the page's picker button, the instrument button and ⚙ **Settings**. The app
  opens on the page it was on when it closed.
- **Instrument button.** A summary of the neck ("6-string guitar · Standard · 24 frets ·
  capo 2") that opens the instrument settings (strings, tuning, frets, capo, left-handed).
- **Settings dialog.** ⚙ Settings opens Sound (volume, mute) and Appearance (theme, light or
  dark).
- **Chords page.** The chosen chord's symbol, notes, ▶ Strum and "Add chord to sheet" at the
  top, then the voicing constraints, then the chord's shapes across the full width with larger
  diagrams. Choosing a shape marks it, strums it and enables "Add shape to sheet".

### Changed

- **Pickers in a drawer.** "☰ Choose scale" on Scales and "☰ Choose chord" on Chords slide the
  scale or chord picker in from the left. It closes with ✕, Escape or a click outside it.
- **Harmonize and Select notes** sit side by side in one row between the scale's notes and the
  neck; what each opens unfolds under the row, and both can be open at once.
- **The Scales neck shows the scale only.** A chosen chord or shape is no longer drawn on it;
  chords and their shapes are on the Chords page. Clicking a chord in Harmonize or in Select
  notes' results chooses it and opens the Chords page.

### Removed

- The side panels (scale picker, settings) and the docked chord panel, with their collapse and
  resize controls. "Show all positions" in the shape list is gone too. Settings files from
  earlier versions still open without a warning.

## [0.5.0] - 2026-11-22

Small adjustments: an easier root picker, more room for the fretboard, chord shapes higher up
the neck, chord diagrams that lie like the neck, and four new themes.

### Added

- **Start fret for chord shapes.** "Start fret" next to "Max fret span" lists only shapes whose
  fretted notes are all on that fret or higher; open strings still follow "Open strings". The
  list still fills up with shapes from there, and the setting is saved.
- **Collapsible side panels.** The scale picker and the settings (instrument, sound,
  appearance) can each be collapsed to a narrow strip, so the fretboard gets their width. On
  narrow windows a collapsed panel is a title bar. Whether each is collapsed is saved.
- **Four new themes:** Catppuccin (Latte and Mocha), Dracula (Alucard and Dracula), Nord
  (Snow Storm and Polar Night) and Atom One (One Light and One Dark), each with a light and a
  dark scheme, for the app and the export sheet. Some colours are slightly adjusted from the
  originals so every theme keeps the app's contrast rules.

### Changed

- **Root picker.** The ▾ button next to the root (or ↓ in the field) opens a list of all 17
  note names, C, C♯, D♭ … B, whatever is typed. Typing a root still works.
- **Chord diagrams lie like the neck.** Strings run across with the lowest at the bottom, the
  nut or capo on the left, and a shape higher up shows its lowest fret's number under that
  fret. Left-handed mirrors them like the neck. The fret numbers (`x32010`) under each diagram
  in the shape list are gone. The export sheet and its exports use the new diagrams.

## [0.4.1] - 2026-11-22

Fixes PNG export in the installed app.

### Fixed

- **PNG export in the installed app.** Every PNG export failed with "the SVG could not be
  drawn": the app's content security policy blocked the image the export draws from.

## [0.4.0] - 2026-11-21

Export: collect scales, tabs, chords and shapes on a sheet, and save it as SVG, HTML, PNG or
PDF in the theme you choose.

### Added

- **Export sheet.** "Add … to sheet" next to the scale, the tab, the chord and a chosen shape
  puts what you see on a sheet. **Sheet** in the header opens it: give it a title, move items
  up or down, remove them. Each item keeps the tuning, capo and display settings it was added
  with, and the sheet is saved in `sheet.toml` in the app-data folder. An item whose custom
  scale, chord or tuning you later delete shows as missing instead of breaking the sheet.
- **A theme for the sheet.** The sheet has its own theme and light/dark choice, Print by
  default, independent of the app's.
- **Export to SVG and HTML.** The whole sheet or one item as an SVG, or the whole sheet as one
  HTML page. Both files are self-contained: the theme's colours are written into them, so they
  look the same in a browser or an editor such as Inkscape, and the HTML opens offline.
- **Export to PNG** at 1×, 2× or 3×, for the whole sheet or one item.
- **Print or save as PDF.** Only the sheet prints, in its theme's colours, and an item is never
  split across pages.

### Fixed

- Saving an export under a name without its extension no longer replaces an existing file of
  that name with the extension without asking.

### Known limitations

- SVG files are large (about 135 KB for four items), because every element carries its own
  style. Text that wraps on screen stays on one line in the SVG.
- Very large sheets can't be exported as PNG at 3×; use 2×.
- Printing on Linux needs WebKitGTK 2.36 or newer, or the whole window prints.
- The installers are still not code-signed.

## [0.3.0] - 2026-11-21

Moods and themes: filter scales and chords by how they sound, let the app pick one for you,
and choose how the app looks.

### Added

- **Mood tags and tag filters.** Every scale and chord shows its mood tags (dark, bright, sad,
  jazzy, exotic, …), derived from its intervals, so your own scales and chords get them too.
  Click tag chips above the scale list or the chord quality to list only the items with every
  tag you picked. Add tags or change the rules in `tags.toml` (see
  [docs/tag-rules.md](docs/tag-rules.md)).
- **Random scale and Random chord.** A random root and scale, or root and chord, from what
  your tag chips (and, for scales, the search) leave in the list: a practice prompt within the
  mood you picked. Never the one already shown.
- **Themes.** Choose Default, High contrast or Print under **Appearance**; light, dark or
  following the system still works as before (Print is light only). Add your own as
  `theme-<id>.css` files in the app-data folder (see
  [docs/theme-tokens.md](docs/theme-tokens.md)); missing colours fall back to Default and
  contrast problems are listed under the picker.

### Changed

- `settings.toml` has a new key `display.theme_id`. Files from 0.2.0 load unchanged.

### Known limitations

- The default tag weights are a first cut: a few scales and chords (Mixolydian ♭6, Hungarian
  major, `7#5`) get no tag yet.
- Changes to `tags.toml` and theme files take effect after a restart.
- The installers are still not code-signed.

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

[Unreleased]: https://github.com/sitzriese89/chords-and-scales/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/sitzriese89/chords-and-scales/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sitzriese89/chords-and-scales/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sitzriese89/chords-and-scales/releases/tag/v0.1.0
