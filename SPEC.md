# Chords & Scales — Specification

A desktop tool for displaying scales, modes and chords on a 2D fretboard for
guitars and basses (4–9 strings).

Derived from `IDEA.md` via a design interview. Decision IDs (Q1–Q35) refer to
that interview and are kept for traceability.

---

## 1. Product

| Topic | Decision |
|---|---|
| Audience (Q1) | Public product for musicians; open source. |
| Platforms (Q15) | Windows, macOS, Linux desktop (Tauri 2). Code signing / auto-update later. |
| License (Q15) | MIT / Apache-2.0 dual license. |
| Language (Q11) | English only: UI strings and note names (C, D, E … B; no German H, no solfège). |
| Tuning system (Q35) | 12-tone equal temperament only. No microtonal support. |

---

## 2. Architecture

### 2.1 Repository layout (Q34)

Monorepo, Cargo workspace + pnpm:

```
crates/
  theory/        # Pure Rust music-theory library. No UI/IO dependencies.
  theory-wasm/   # wasm-bindgen bindings exposing `theory` to JS/TS.
app/             # Svelte + TypeScript + Vite frontend
  src-tauri/     # Tauri 2 shell
```

### 2.2 Core boundary (Q2, Q24)

- All music theory (notes, intervals, scales, chords, harmonization, voicings,
  tag scoring, reverse lookup, symbol parsing) lives in `crates/theory`.
- The core is compiled to **WASM** and called **directly from the frontend**,
  also inside Tauri. Calls are synchronous; no IPC round-trips for theory.
- **Tauri commands are used only for filesystem work**: persistence, import/
  export of user files, writing export output.
- Consequence: a future web build needs only a replacement for the filesystem
  layer.

### 2.3 Frontend (Q8, Q9)

- Svelte + TypeScript.
- Fretboard, tab view and chord diagrams rendered as **SVG**.

### 2.4 CI (Q34)

- GitHub Actions on every PR: `cargo test`, `cargo clippy`, `cargo fmt --check`,
  frontend lint/type-check/tests.
- On tag: Tauri release builds for Windows, macOS, Linux.

### 2.5 Testing

- `theory` crate: extensive unit tests plus property-based tests (e.g. interval
  arithmetic round-trips, transposition invariants, harmonization consistency).

---

## 3. Data & persistence

### 3.1 Format (Q35)

- **TOML** for all catalog and user data: scales, chords, tunings, tag rules,
  settings, presets.
- The **built-in catalog is embedded into the binary** at build time.

### 3.2 User data (Q20)

Stored as plain TOML files in the OS app-data directory:

- Settings and last view state
- Custom scales, chords, tunings
- Saved presets
- Tag-rule overrides (see §6)
- User themes, the one kind of file that is CSS, not TOML (§5.11)

Files are hand-editable and shareable; the UI offers import/export of them.

- One file per document, directly in the app-data folder (e.g. `settings.toml`). In a plain
  browser (development) the same documents live in localStorage (ADR-4, ADR-17).
- `settings.toml` holds the display preferences (sharps/flats, dot labels, theme and
  light/dark, left-handed), the last instrument (kind, string count, tuning, fret count, capo) and the
  last view (root, scale) and the tab view's position (system, 3NPS pattern, fret window,
  direction, highlight; ADR-25), the sound (volume 0–100, mute; ADR-28), the voicing
  browser's constraints (`[voicings]`; ADR-37) and the page shown (`page = "scales" |
  "chords" | "sheet"` at the top; ADR-51). It is created with
  the defaults on first start, read once at start and saved on every change. A file without
  `page` opens on Scales. The `[scale_picker]` and `[settings_panel]` tables (ADR-50) and the
  `[chord_panel]` table (ADR-32) of older versions are skipped without a warning and left
  out on the next save (ADR-53, ADR-54).
- The user's own scales, chords and tunings are `scales.toml`, `chords.toml` and
  `tunings.toml`, in the format of the built-in catalogs (§4.2, §4.3, §5.1). They are read at
  start; a broken item is skipped and listed in a collapsed note in the window, and the rest
  load (ADR-23). The tuning, scale and chord editors rewrite `tunings.toml`, `scales.toml` and
  `chords.toml` when they save (comments are not kept); if the file had items that didn't
  load, the old file is first kept as `tunings-backup.toml`, `scales-backup.toml` or
  `chords-backup.toml` (ADR-24, ADR-26, ADR-36).
- User themes are `theme-<id>.css` files, read at start (§5.11, ADR-40).
- The export sheet is `sheet.toml` (§5.10, ADR-43): `version = 1`, `title`, `theme_id`,
  `theme` (`light` | `dark`) and one `[[item]]` per item (`kind` = `scale` | `tab` | `chord` |
  `voicing`, with `display`, `instrument`, `scale`, `tab`, `chord` and `voicings` tables as the
  kind needs). Read at start and saved on every change. A bad value falls back to its default
  with a warning; an item that can't be read is dropped with a warning and the others load; a
  file that can't be used at all is kept as `sheet-backup.toml` and the sheet starts empty.
- The user's tag rules are `tags.toml` (§5.7, [docs/tag-rules.md](docs/tag-rules.md)), read at
  start and merged over the built-in rules; a table that isn't a valid tag is skipped and listed
  in the same note as broken catalog items. The app never writes it (ADR-41).
- A value the app doesn't understand falls back to its default and the app shows a warning
  naming it. A file that can't be used at all (not TOML, missing or unsupported version) is
  kept as `settings-backup.toml`, the defaults are used, and the app says so. It never
  crashes on a bad file.
- Export saves a document through a save dialog (a download in the browser); import picks a
  TOML file through an open dialog (an upload in the browser) and refuses files that aren't
  valid TOML. The same save path writes the sheet's SVG, PNG and HTML exports (§5.10); the
  dialog's filter follows the kind of file. A file is never replaced unless the dialog asked:
  a name typed without its extension that matches an existing file opens the dialog again
  with the full name.

### 3.3 Custom items (Q12, Q17, Q32)

- Users can define custom **scales, chords and tunings** via an **in-app editor**:
  - 12-semitone interval picker, or
  - clicking notes on the fretboard,
  - then name and save.
- Custom items are stored in the user data files (§3.2) and treated identically
  to built-in items everywhere (filters, harmonize, random, export…).
- Scales (ADR-26): **New scale** under the scale list opens the editor; a user scale that is
  selected can be edited or deleted there. The editor has a 12-semitone picker (the root is
  always in) and its own neck with the current instrument and root: clicking a position adds
  or removes that note's interval. Name and family (blank = *Custom*). The core checks the
  scale when it is saved, and the message is shown in the editor: a scale needs a note
  besides the root, and no two scales (built-in or the user's) may have the same name, case
  and extra spaces ignored. A new scale's id is made from its name (`my-scale`, then
  `my-scale-2`, …) and kept when it is renamed; deleting the selected scale shows the
  built-in it replaced, or the default scale. **Save as scale** in reverse lookup (§5.4)
  opens the editor with the selected notes on the lowest one; saving shows the new scale on
  that root.
- Chords (ADR-36): **New chord** under the chord quality in the chord picker (§5.3) opens the
  same editor; a user chord that is chosen there can be edited or deleted. The picker has two
  rows of one octave each, labelled as the built-in chords write them: `1 ♭2 2 ♭3 3 4 ♭5 5 ♯5
  6 ♭7 7`, then `♭9 9 ♯9 11 ♯11 ♭13 13` above the octave (a chord tone an octave up, such as
  `10`, is written within the octave). Each note is in once: choosing `9` takes out `2`, and
  a click on the neck adds the note's lower interval or takes the note out. Besides name and
  family (blank = *Custom*), a chord has its **symbol**, the suffix after the root
  (`m7b5`, ASCII `b` and `#`), and an optional **Jazz symbol** (`ø`; blank = the symbol). The
  core checks the chord when it is saved and the message is shown in the editor: a note
  besides the root, no two notes on one pitch class, no two chords (built-in or the user's)
  with the same name (case and extra spaces ignored), no suffix that another chord already
  has (only the major triad has an empty one), and every suffix must read back as the chord
  after a root (so it can't start with `#` or `b`, and is written `b5`, not `♭5`). A new
  chord's id is made from its name and kept when it is renamed; saving a new chord chooses it.
  Deleting the chosen chord shows the built-in it replaced, or no chord. **Save as chord** in
  reverse lookup (§5.4) opens the editor with the selected notes on the lowest one. User
  chords are typeable by their suffixes (§4.4), found by reverse lookup (§5.4) and used by
  harmonize (§5.5) like built-in ones.

---

## 4. Music-theory model

### 4.1 Note spelling (Q10, Q33)

- A **global sharp/flat toggle** determines how notes are spelled.
- **Exception:** the **root** keeps the spelling the user typed or picked
  (e.g. `D♭` stays `D♭` while the toggle is on sharps); all other notes follow
  the toggle.
- Theory-correct per-key spelling is intentionally **not** implemented.
- Note names can be typed in ASCII (`C#`, `Db`) or with Unicode signs (`C♯`, `D♭`), in
  either letter case, double sharps and flats included (`F##`, `Fx`, `E𝄫`). The app shows
  ♯ and ♭.

### 4.2 Scale catalog (Q12)

Built-in, defined as interval formulas:

- Major / natural minor and the 7 diatonic modes
- Harmonic minor modes, melodic minor modes
- Pentatonics (major/minor and variants), blues
- Bebop scales
- Symmetric: whole-tone, diminished (half-whole / whole-half)
- Common "exotic" scales (e.g. Hungarian minor, Phrygian dominant, Hirajoshi…)

Plus user-defined scales (§3.3).

The catalog is `crates/theory/data/scales.toml`; user scale files use the same format
(ADR-20). One table per scale:

```toml
[[scale]]
id = "phrygian-dominant"           # lowercase kebab-case, unique; settings refer to it
name = "Phrygian dominant"
aliases = ["Spanish Phrygian"]     # optional
family = "Harmonic minor modes"    # listing group; optional for user scales ("Custom")
intervals = ["1", "b2", "3", "4", "5", "b6", "b7"]
```

- Intervals are degree labels (ASCII or Unicode) starting at `1`, strictly ascending, all
  within the octave, at least two of them. Labels are kept as written: write `#4` for Lydian,
  `b5` for Locrian.
- Unknown fields, duplicate ids and broken interval lists are errors. In a user file each bad
  item is reported (which item, why) and skipped; the others load.
- A user scale with a built-in id replaces the built-in one; other user scales are listed
  after the built-ins.

### 4.3 Chord catalog (Q17)

Built-in, defined as interval formulas in the same format as scales:

- Triads (maj, min, dim, aug), sus2/sus4, power chords
- 6ths, 7ths
- Extensions: 9, 11, 13
- Altered: 7♭9, 7♯9, 7♭5, 7♯5, etc.
- add chords (add9, add11, …)

Plus user-defined chords (§3.3).

The catalog is `crates/theory/data/chords.toml`; user chord files use the same format
(ADR-27). One table per chord:

```toml
[[chord]]
id = "min7b5"                      # lowercase kebab-case, unique; settings refer to it
name = "Half-diminished seventh"
symbol = "m7b5"                    # the suffix after the root, ASCII; "" only for major
aliases = ["-7b5", "ø"]            # other suffixes the symbol parser reads (case matters)
jazz_symbol = "ø"                  # suffix in the Jazz style; optional
family = "Sevenths"                # listing group; optional for user chords ("Custom")
intervals = ["1", "b3", "b5", "b7"]
```

- Intervals are degree labels (ASCII or Unicode) starting at `1`, strictly ascending, at least
  two, below two octaves (`9`, `♯11` and `13` are fine), and no two on one pitch class. A chord
  is its full stack: `13` is `1 3 5 ♭7 9 13`, and voicings may leave tones out (§5.6).
- Unknown fields, duplicate ids and broken interval lists are errors; in a user file each bad
  item is reported and skipped, as for scales. A user chord with a built-in id replaces the
  built-in one; others are listed after the built-ins.
- Chord tones on a root are spelled like scale notes (§4.1): the root as given, the others by
  the sharp/flat toggle.

### 4.4 Chord symbols (Q25)

- **Parser** accepts all common spellings: `maj7` / `M7` / `Δ7`, `m` / `min` / `-`,
  `ø` / `m7b5`, `°` / `dim`, slash chords, etc. (ADR-29)
  - A symbol is a root (letter A-G in either case, up to two `#`/`b`/`♯`/`♭`), a suffix and an
    optional `/bass` note. The suffix is any chord's `symbol`, `aliases` or `jazz_symbol` from
    the catalog (§4.3), so user chords are typeable and nothing about names is fixed in code.
  - Typed look-alikes are normalised: `♭ ♯`, `− –` for `-`, `△ ∆` for `Δ`, `Ø ∅` for `ø`,
    `º ˚` for `°`. If the suffix is not found as typed, spaces, parentheses and commas are
    ignored (`C7(b9)`, `Cm(add9)`), trailing alterations may come in any order (`C7#9#5` =
    `C7#5#9`), and letter case is ignored when exactly one chord fits (`CMAJ7`). An exact
    match always wins, so `CM7` (major seventh) and `Cm7` (minor seventh) stay different.
  - A slash starts the bass unless the whole suffix is a chord: `C6/9` and `Cm6/9` are chords,
    `C6/9/E` is `C6/9` over `E`. The bass is any note and keeps its spelling.
  - A symbol the catalog doesn't know (`C7b9b13` if no chord has it) is an error with the
    position of the first character it could not read; there is no guessing between chords.
- **Display style** is a setting (`chord_symbols` in `[display]`, chosen in the chord picker,
  §5.3):
  - *Standard*: `Cmaj7`, `Cm7♭5`, `Cdim7`
  - *Jazz*: `CΔ7`, `Cø`, `C°7`
  - The formatter writes the root as given (ADR-6), then the chord's suffix for the style with
    `♭`/`♯` for a `b`/`#` before a number, then `/bass` for a slash chord. Both styles read
    back as the same chord.

---

## 5. Features

### 5.1 Fretboard (Q4, Q7, Q27)

- **Instruments:** 4–9 strings, guitar and bass.
- **Tunings:** presets per string count (Standard E, Drop D, DADGAD, 7/8-string
  standard, 4/5/6-string bass standard, …) plus fully custom per-string tuning. (ADR-21)
  - Built-in presets (`crates/theory/data/tunings.toml`), ids `<kind>-<strings>-<name>`:
    - Guitar, 6 strings: standard (`guitar-6-standard`, E A D G B E), Drop D, DADGAD,
      open G, open D, open E, open C, E♭ standard, D standard, Drop C.
    - Guitar, 7 strings: standard (B E A D G B E), Drop A. 8 strings: standard
      (F♯ B E A D G B E), Drop E. 9 strings: standard (C♯ F♯ B E A D G B E).
    - Bass, 4 strings: standard (E A D G), Drop D. 5 strings: standard (B E A D G),
      high C (E A D G C). 6 strings: standard (B E A D G C).
  - Format, shared by the built-ins and the user's tunings file:

    ```toml
    [[tuning]]
    id = "guitar-6-open-c"   # lowercase kebab-case, at most 64 characters
    name = "Open C"          # shown in the UI
    kind = "guitar"          # "guitar" or "bass"
    notes = ["C2", "G2", "C3", "G3", "C4", "E4"]   # open strings, lowest string first
    ```

    4–9 notes with octaves (C4 = middle C), each from C0 to C6; they need not rise from
    string to string. A user tuning with a built-in id replaces the built-in. An invalid
    item is skipped and reported with its number and the reason; the other items still
    load. A file with other top-level keys, or that isn't TOML, is refused as a whole.
- **Fret count:** configurable, 12–27, default 24.
- **Capo:** supported as an offset: a capo on fret *c* (0 = none, below the last fret)
  hides frets below *c*; fret *c* acts as the open string and frets keep their numbers.
- **No** multiscale/fanned-fret visualization.
- **Orientation:** horizontal; **left-handed mirror toggle**.
- **Visual encoding:**
  - Root note visually emphasized: drawn as a square, other notes as circles
  - Optional per-interval/degree coloring
  - Dimmed notes (the scale's notes outside the tab position, the scale behind a chord on
    the export sheet) drawn as smaller hollow rings without a label; their spoken name still
    gives the note and "dimmed" (ADR-56, ADR-58)
  - Inlay markers at frets 3, 5, 7, 9, 12 (and octave repeats; double at 12 and 24)
  - Realistic fret spacing; the neck scales to the window width, down to a minimum width
    below which it scrolls sideways (ADR-55)
  - Accessible palette; never rely on color alone (shape/label redundancy)
- **Interaction:** click a position, or use the keyboard: Tab reaches the
  fretboard, arrow keys move between positions, Enter/Space activate. Every
  position has a spoken name (string, fret, note). (ADR-18) Activating a position plays its
  note; in reverse lookup's select mode it selects or unselects it, and a selected position
  is ringed and named "selected" (§5.4, ADR-38).
- **Dot labels (toggle):** note names / intervals (scale degrees: 1, ♭3, 5…) / none.
- **Scale explorer** (the main view, ADR-23): pick a root from a dropdown of all 17 names
  (C, C♯, D♭, D, … B♭, B in pitch order, never filtered by what is typed) or type one
  (ADR-46), and pick a scale from a list grouped by family, with a search over names and
  aliases; the neck shows every note of the scale across all frets of the current
  instrument, the root as a square, with the scale spelled out above it. The label and
  sharp/flat toggles sit in the summary row above the neck (ADR-55); interval
  labels are the scale's own (`♯4` in Lydian). Root, scale, labels and sharps/flats are saved
  on every change and come back at the next start.
- **Scales page** (ADR-55), top to bottom:
  - **Summary row:** the scale's name, then its notes on one line, each note name in bold
    with its interval after it (`A 1 · C ♭3 · D 4 · E 5 · G ♭7`), the root underlined; the
    Labels and Accidentals toggles at the right end, wrapping below on a narrow window.
  - **The neck** on a raised panel. It keeps a minimum width (about 950 px); on a narrower
    window it scrolls sideways inside the panel rather than shrinking the dots.
  - **The tool row** (§5.4, §5.5): Harmonize and Select notes on the left, "Add scale to
    sheet" at the right end; what a tool opens unfolds under the row.
  - **The tab** (§5.2), under a line: heading, Play, "Add tab to sheet" and the position
    controls on the left, the tab on the right; one column on a narrow window.
- **Layout** (ADR-51, ADR-53): one toolbar, which stays at the top while the page scrolls,
  and the page under it at the full width of the window. The toolbar holds, left to right:
  the title; the page tabs **Scales**, **Chords** and **Sheet (n)** (n items on the sheet);
  **☰ Choose scale** on the Scales page or **☰ Choose chord** on the Chords page; a gap; the
  instrument button; **⚙ Settings**. On a narrow window it wraps.
  - **Pages.** Scales: the scale explorer, its neck first (ADR-55); its neck shows the scale
    only, never a chord. Chords: no fretboard; the chosen chord's heading row and its shapes (§5.3,
    §5.6). Sheet: the export sheet (§5.10). The tabs are buttons;
    the current one has `aria-current="page"`. The page shown is saved (`page` in
    `settings.toml`, §3.2) and the app opens on it; a file without it opens on Scales.
    Scales and Chords keep their state while another page is shown.
  - **Scale picker drawer.** "Choose scale" (`aria-expanded`, `aria-controls`) slides the
    picker in from the left over the page, under the toolbar, at most as tall as the window
    below it; on a window narrower than 40rem it is full width. It closes with its ✕
    ("Close Choose scale"), Escape, a click outside it or a second click on the button;
    focus moves to its first control when it opens and back to the button when it closes
    (after a click outside, only when focus would otherwise be lost). Closed, it keeps what
    was typed in it. It is closed at start and when another page is shown, and is not saved.
    The scale editor's dialog is outside the drawer, so reverse lookup opens it while the
    drawer is closed.
  - **Chord picker drawer.** "Choose chord" on the Chords page opens the chord picker (§5.3)
    in the same kind of drawer ("Close Choose chord"), which behaves as the scale picker's.
    A chord chosen in Harmonize or reverse lookup on the Scales page switches to Chords,
    and either drawer closes on that switch.
  - **Instrument button.** A summary of the neck, "6-string guitar · Standard · 24 frets ·
    capo 2" (no capo part without a capo), named "Instrument: …". It opens the instrument
    panel in a popover under it, which closes like the drawer. One instrument for the whole
    app.
  - **⚙ Settings** opens a modal dialog with **Sound** (volume, mute; §5.9) and
    **Appearance** (theme, light/dark; §5.11). It closes with ✕, Escape or a click on its
    backdrop, and focus returns to the button. Changes are saved as they are made.
- **Instrument panel** (in the toolbar's popover, ADR-24, ADR-51): string count 4–9, the
  tuning presets for that count grouped by kind (guitar, bass) with the user's own tunings in
  a group of their own, fret count (12–27), capo (below the last fret; a shorter neck moves
  it down), left-handed. Changing the string count picks that count's standard preset.
  Every change is saved and the neck follows at once.
  - **Custom tunings:** "New tuning" opens an editor seeded with the selected tuning: a name,
    guitar or bass, and a note and octave per string (string 1, the highest, first). Saving
    writes `tunings.toml` and selects the tuning; its id is made from kind, string count and
    name (`bass-5-low-a`, `-2` if taken) and never replaces another tuning. Edit (including
    rename) keeps the id; deleting the selected tuning falls back to the standard preset.
    The core checks the tuning and the editor shows its reason when it refuses one.

### 5.2 Tab view (Q4, Q13)

A separate tablature view (horizontal string lines, fret numbers) showing a
scale played in one position. Position systems (generic for any tuning and
string count):

- **Fret window:** user-chosen start fret + span; all scale notes inside it.
- **3-notes-per-string:** generated patterns.

CAGED is **not** supported.

How positions are generated (`crates/theory/src/scale_positions.rs`, ADR-22):

- Both systems take the tuning, fret count, capo, the scale as pitch classes and its root,
  and follow the fretboard's rules for them (§5.1): frets below the capo and past the last
  fret don't exist. Positions use the fretboard's coordinates (string 1 = highest, absolute
  frets) and come in **tab order**: the lowest string first, then by fret.
- **Fret window:** frets *start* … *start* + *span* − 1. Exactly the fretboard's positions
  of the scale that fall in it; a window partly off the neck shows only the frets that exist,
  a span of 0 is empty.
- **3-notes-per-string:** one pattern per scale degree, counted up from the root (degree 0
  starts on the root, or on the first scale note above it if the root isn't in the scale). A
  pattern starts on its degree on the lowest string and walks up the scale, each note the next
  scale note above the last, three on every string, low string to high. It is placed at the
  lowest octave where every note is on the neck; if none fits, that pattern is left out rather
  than moved or folded (on 12 frets, G major in standard tuning has 5 of its 7 patterns).
- Any scale works the same way, whatever its size: a scale with fewer notes than 3 × strings
  (every common scale) continues into the next octaves, so a pentatonic scale has 5 patterns
  that climb the neck, and a scale of 1 or 2 notes spans so many frets that its patterns
  rarely fit. Duplicate pitch classes count once; an empty scale has no patterns.

How the tab is shown (`app/src/lib/tab/`, ADR-25):

- The tab sits under the neck in the scale explorer. One line per string, string 1 (the
  highest) on top, each labelled with its open note (spelled by the sharp/flat preference);
  one column per note, left to right in playing order, with its fret number. Root numbers are
  bold, in the root colour.
- Controls: the position system; for 3NPS, a pattern picker listing the patterns that fit
  ("Pattern 1 (from G)", numbered from the root's pattern); for a fret window, the start fret
  and the number of frets (1–12); the direction: up (tab order), down (its reverse), or up and
  back down (the top note once). Patterns that don't fit are named in a note; a stored pattern
  that doesn't fit shows the first one that does.
- The position's notes are highlighted on the fretboard: the scale's other notes are dimmed.
  "Highlight on the neck" turns that off. An empty position (no pattern fits, empty window)
  dims nothing.
- Fret numbers are absolute, also with a capo; the tab then says "Capo 3 (fret numbers are
  absolute)". Tab is notation and is never mirrored; the left-handed setting mirrors only the
  neck.
- The choices are settings (`[tab]` in `settings.toml`) and come back after a restart.

### 5.3 Chords (Q5, Q16, Q19, Q26)

- Shown on the **Chords** page of the main window (§5.1), not a separate OS window, and
  chosen in the **chord picker**, in the drawer behind **☰ Choose chord** (ADR-51, ADR-54).
  The page has no fretboard, and no chord or shape is drawn on the Scales page's neck.
- **Display:** a heading row with the chord's symbol (large, with **Clear chord** as a ✕
  beside it) and under it its name and its tags as chips; then its notes, the root filled in
  the root colour; then **▶ Strum** and "Add chord to sheet". Under a rule, the voicing
  constraints as one toolbar and the chord's shapes across the full width (§5.6). While no chord is chosen the page says
  how to choose one (or, for a degree with none, that no chord forms there).
- **Input modes:**
  1. Root + quality
  2. From scale/mode + degree (e.g. iv of D Dorian)
  3. **Reverse lookup:** click notes on the fretboard → matching chord names
     (including slash chords / inversions, and chords with the 5th left out; §5.4)
  4. **Typed symbol:** e.g. `F#m7b5`, parsed per §4.4
- **Chord-over-scale overlay:** a chord from a scale (input mode 2 or harmonize) added to the
  export sheet (§5.10) is drawn on a neck over its parent scale, dimmed, with the chord tones
  emphasized; a chord from root and quality or a typed symbol is drawn alone. No general
  multi-layer comparison. The app's own neck shows the scale only (ADR-54).
- **The chord picker** (ADR-32, ADR-54), in the drawer:
  - **Root and quality:** pick a root and a chord from the catalog (grouped by family), with
    the tag chips (§5.7) and **Random chord** (§5.8). **New chord**, **Edit chord** and
    **Delete chord** there make and change the user's own chords (§3.3).
  - **Degree of the scale:** pick a degree of the Scales page's scale and triads or 7th
    chords; the chord on that degree comes from harmonize (§5.5) (degree V of C major as 7th
    chords: G7, "Dominant seventh (V7) on degree 5 of C Major"). The chord follows that
    scale. Where no chord forms on a degree (some pentatonic degrees), the picker and the page
    say so.
  - The page lists the chord's notes (spelled by the sharp/flat setting; the root keeps its
    spelling) and has **Strum**, which plays the chord through the audio engine (§5.9) as one
    note per string, lowest string first, stacked upward from the lowest root on the neck;
    with a shape chosen in the voicing browser (§5.6), it plays that shape instead.
    **Clear chord** returns to no chord. The chosen chord is not saved.
  - **Typed symbol:** type a chord symbol (`F#m7b5`, `CΔ7`, `Am7/G`); it is read as you type
    by the parser (§4.4), in either style, the root as typed. A symbol that can't be read
    shows no chord: the field is marked invalid
    and the typed text is repeated with the first unreadable character underlined (the end,
    if the symbol stops too early), with the parser's reason and the character's number. An
    empty field is no error. A slash chord's bass is written in the name (`Am7/G`, "Minor
    seventh, bass G"); its shapes are the chord's own and do not add the bass (§5.6).
  - **Reverse lookup** (ADR-38): **Select notes** under the explorer's neck; the chords the
    selected notes make are listed there (§5.4). Clicking one chooses it, as root and
    quality, or as a typed symbol for a slash chord (`C/E`), so the bass is kept, and shows
    the Chords page.
  - **Chord names** (ADR-33): every chord name in the app, on the Chords page, in the
    Harmonize row and in reverse lookup, is written by the symbol formatter (§4.4) in the
    display style chosen in the picker: Standard (`Cmaj7`, `Cm7♭5`) or Jazz (`CΔ7`, `Cø`), each choice showing
    those two examples. Switching renames every visible chord at once. The style is saved in
    `settings.toml` as `chord_symbols = "standard"` or `"jazz"` in `[display]` (default
    Standard).

### 5.4 Reverse lookup → scale finder (Q29)

Clicked notes also produce a list of **scales/modes containing all of them**,
ranked by fewest extra notes. Shares logic with reverse chord lookup.

The core does both searches (ADR-31). The input is a set of pitch classes with an optional
**bass note** (the lowest clicked note).

- **Chords:** a catalog chord on a root fits when it contains every note and the only chord
  tones missing are ones players leave out: the perfect 5th, and in 11th/13th chords the
  natural 9th (and, with a 13th, the 11th). The root is never left out. A bass that is a chord
  tone but not the root gives a slash chord (`C/E`). Best first: exact fits, then inversions,
  then chords with a tone left out; ties keep catalog order. Results carry the chord id, the
  spelled root, the bass, what was left out and a score; the app writes the name in the
  chosen symbol style (§4.4). Fewer than two notes find no chord.
- **Scales:** every catalog scale or mode on every root that contains all the notes, fewest
  extra scale tones first; among equals, a scale rooted on the bass, then a root among the
  notes, then catalog order. `C D E G A` lists the major pentatonic family (C major
  pentatonic, A minor pentatonic, D Egyptian, E Man Gong, G Ritusen) before any seven-note
  scale. A scale that comes out the same on several roots (whole-tone) is listed once.
- User chords and scales are searched like the built-in ones. Root and bass are spelled by
  the sharp/flat toggle (§4.1).

**In the app** (ADR-38):

- **Select notes**, a toggle in the explorer's tool row next to Harmonize (§5.5, ADR-52),
  turns on select mode and shows its buttons and results under the row: a click (or
  Enter/Space) on a position adds that note, or takes it out if it is selected, and sounds a
  note it adds. Any position can be selected, in the scale or not. Selected positions are
  ringed on the neck, over the scale it shows; a selected note
  with no dot gets one, named by its note. The selected notes are listed with their octaves,
  lowest first; the lowest by pitch (from the core's fretboard mapping, so a re-entrant tuning
  or a capo needs no special case) is the **bass**. **Clear selection** empties the
  selection. Turning select mode off hides the selection and the results and keeps the
  selection for when it is turned on again; the selection is not saved.
- **Results** are asked again on every click: the chords (up to 12) and the scales (up to 12)
  that the core finds, best first. A chord is named in the display style (§4.4), with its
  catalog name, the bass's degree for a slash chord (`3 in the bass`) and what is left out
  (`without 5`); a scale shows its root and name and how many of its notes are not selected.
  Fewer than two different notes find nothing. Clicking a chord chooses it (§5.3) and shows
  the Chords page with it; the selection is still there on coming back. Clicking a scale makes
  it the explorer's root and scale (saved, like a pick in the scale picker) and leaves the
  chosen chord alone. The chosen chord and the scale on show are marked in the list.
- **Save as scale** and **Save as chord** open the scale or chord editor (§3.3) with the
  selection: the bass as the root, and each other note once, as its interval above the bass
  within the octave (the editor's default label for a scale, the chord editor's offered label
  for a chord: `♯5`, not `♭6`). Saving there works as for a new scale or chord; a new scale
  is shown on that root.

### 5.5 Harmonize (Q18)

- Select a scale → *Harmonize* → show all chords of that scale.
- Toggle: **triads** / **7th chords**, built by stacking every other scale tone.
- **Roman numerals** displayed (I, ii, iii, …): upper case for a major third, lower
  case for a minor one, `°` diminished, `+` augmented, `ø` half-diminished, then
  `7` or `maj7` for sevenths (`V7`, `IVmaj7`, `viiø7`, `III+maj7`). Scales of seven
  notes number their own degrees (natural minor: i ii° III iv v VI VII); other
  scales name each degree by its interval from the root, with `♭` or `♯` (minor
  pentatonic: i, ♭III).
- Chords are named by their intervals from the chord catalog (user chords included).
- **Non-heptatonic scales** (pentatonic, whole-tone, bebop, …): stack the
  in-scale thirds where possible; degrees where no valid chord forms are marked
  *no chord*. Each next chord tone is a scale tone a third above the last (3 or 4
  semitones), two scale steps up, or one step up if the first is no third.
  Examples: the minor pentatonic has Cm (and Cm7) on its root and E♭ on the ♭III
  as triads, and no chord on the other degrees; the whole tone scale has an
  augmented triad on every degree and no seventh chords (ADR-30).
- **The tool row** (ADR-52, ADR-55): **Harmonize** and **Select notes** sit side by side in
  one row that wraps on a narrow window, under the neck, with "Add scale to sheet" at the
  row's right end. What a tool opens unfolds under the row across the full width, Harmonize's first, so
  it never squeezes the other button; both can be open at once.
- **In the app** (ADR-34): the **Harmonize** button in the explorer's tool row opens, under
  the row, a row with the chord on every degree of the current scale, its Roman numeral above
  its symbol (D Dorian as 7th chords: i7 Dm7, ii7 Em7, IIImaj7 Fmaj7, IV7 G7, v7 Am7,
  viø7 Bm7♭5, VIImaj7 Cmaj7; in the Jazz style FΔ7, Bø and CΔ7). The row has its own
  **Triads** / **7th chords** toggle, which is the chord picker's size (§5.3): changing one
  changes the other. A degree where no chord forms shows its note and *no chord*. Clicking a
  chord chooses it by its degree (whatever input the chord picker was on) and switches to the
  Chords page, which shows it with its shapes (ADR-54); the neck shows no chord. The chosen
  chord is marked in the row. The row follows the
  explorer's scale, root, sharp/flat setting and chord name style. Whether it is open is not
  saved.

### 5.6 Voicing generator (Q28)

Algorithmic (works for any tuning and 4–9 strings; no static shape library).

- **Constraints (user-adjustable):**
  - Max fret span (default 4, up to 6; open strings don't count)
  - Start fret (default 0: none): every fretted note is on this fret or higher, so the list
    holds the best shapes from there up the neck. Open strings are not fretted and still ring
    when allowed. Frets are absolute (ADR-18): with a capo, a start fret at or below the capo
    changes nothing. (ADR-47)
  - Allow/forbid open strings (with a capo: the capo fret)
  - Allow/forbid inversions (default forbidden: the root is the lowest note)
  - Allow/forbid muted strings (default allowed)
- **Required tones:** root and 3rd; the 5th may be omitted. Precisely, every chord tone sounds
  except those reverse lookup also lets a voicing leave out (§5.4, ADR-31): the perfect 5th, a natural
  9th below an 11th or 13th, a natural 11th below a 13th. A sus chord keeps its 2nd or 4th, a
  power chord its 5th; a chord with more required tones than a shape can hold has no voicings.
  At least three strings sound (two for a power chord).
- **Playable:** at most four fingers, a barre on the lowest fretted fret counting as one.
- **Ranking:** span, number of played strings, position on the neck, as one score; also a
  small cost for muted strings between played ones, inversions and barres. The default list
  has the best 50 (ADR-35).
- **Output:** chord diagrams (SVG).
- **In the app** (ADR-37, ADR-54, ADR-59): the Chords page (§5.3) lists the voicings of the
  chosen chord under its heading row, on the current instrument, tuning, fret count and capo,
  best first (the best 50), as a grid of cards across the page's width (six to a row on a
  laptop-wide window, two on a phone-wide one). Each card's diagram is drawn to the card's
  width (about 200 px on a laptop-wide window; a wide shape shrinks to the same width), over
  one footer line: the shape as players write it (`x32010`, lowest string first) and, where
  they apply, its bass when it is an inversion and the tones it leaves out (`bass 3 · no 5`).
  The footer is visual only; the card's and the diagram's accessible names give the same
  (`1. x32010, bass 3`, `C: x32010`). The list is headed by the
  chord's name; a slash chord's bass is not voiced, so `Am7/G` is headed "Voicings of Am7"
  with a note that the G bass isn't voiced.
  - **Diagrams** (ADR-49, ADR-60): lying like the neck, one row per string with the lowest
    at the bottom, the nut on the left and one column per fret to the right (mirrored when
    left-handed, like the neck: the nut on the right), four fret columns or as many as the
    shape spans. A shape within the first four frets is drawn from the nut (drawn thick);
    with a capo, from the capo, numbered with the first fret above it; any other shape from
    its lowest fretted fret, with that fret written under its column as `3fr` in the text
    colour. Frets keep their numbers (ADR-18). × just beyond the nut end of a string mutes
    it, ○ plays it open (at the capo fret, with a capo). Dots carry the dot label setting
    (note names, intervals or none), the root as a square; a barre is a narrow bar in the
    dot colour, under its dots, joining them. Works for 4–9 strings, in every
    built-in theme, light and dark.
  - **Constraints:** max fret span (1–6), start fret (0 to the neck's last fret, typed like the
    tab view's), open strings, muted strings and inversions, as above; changing one updates the
    list at once. They are saved in `settings.toml` (`[voicings]`: `max_span`, `start_fret`,
    `open_strings`, `muted_strings`, `inversions`; missing keys take the defaults above).
  - **Choosing a shape** marks it in the grid (an accent-tinted card with a 2px accent ring
    and a ✓ in its footer), strums it lowest string first and enables
    **Add shape to sheet** (disabled while none is chosen); while it is chosen, the page's
    **Strum** plays it too. No neck shows it. Choosing it again unchooses it. The choice is
    not saved, and it is dropped when the chord, the instrument (tuning, fret count, capo) or
    a constraint changes, and by **Clear chord** (choosing the same chord again brings no
    shape back).

### 5.7 Mood/category tags (Q6, Q14, Q31)

- Tags (sad, evil, melancholic, dissonant, jazzy, bright, exotic, …) are
  **derived by rules**, not hand-assigned.
- Rules are **weighted scores** defined in a TOML file: each interval feature
  contributes a weight per tag (e.g. ♭2 → +evil, ♭3 → +sad, ♯4 → +bright,
  tritone → +dissonant, 7th/9th extensions → +jazzy). A tag applies when its
  score reaches its threshold; scales and chords have separate thresholds, and a
  tag can be for one kind only (exotic is for scales, jazzy for chords).
- Features are read from the semitones, not the labels, so a note's spelling never
  changes a tag, and user scales and chords are tagged exactly like built-in ones.
- Built-in tags: happy, bright, sad, melancholic, dark, evil, dissonant, mysterious,
  open, bluesy, exotic, jazzy (`crates/theory/data/tags.toml`).
- **Multiple tags per item.**
- Users can **override weights and add new tags** via a user rules file in the
  app-data directory (§3.2), merged over the built-in rules. No in-app rule editor;
  the format, the features and the merge rules are documented in
  [docs/tag-rules.md](docs/tag-rules.md).
- Scales and chords can be **filtered by tag** (ADR-41). The scale picker and the chord
  picker (root and quality) each have a row of tag chips: only the tags that can apply to that
  kind, so `exotic` is offered for scales and `jazzy` for chords. Chips that are on combine
  with AND: an item is listed when it has every one; **Clear tags** turns them off. In the
  scale picker the chips combine with the search. Every item in both lists shows its tags
  after its name (`Phrygian — dark, …`), the current scale's tags are shown under the list
  and the chosen chord's on the Chords page.
- Filtering never changes the choice: a current scale or chord without the tags stays shown
  and stays in its list, in its family, marked “(hidden by tags)”; the picker says
  why. No other item without the tags is listed. A filter that matches nothing
  says so (“No scale has all of the tags dark and happy.”).
- The chips start off at every start (they are not saved).
- The user rules file is `tags.toml` (§3.2), read at start; editing it changes the tags after
  a restart.

### 5.8 Random (Q21)

- Two buttons (ADR-42), one per picker: **Random scale** in the scale picker, under its tag
  chips, and **Random chord** in the chord picker's root and quality input, under the quality.
  Each picks a random root (one of the 12 pitch classes, spelled by the sharp/flat preference,
  §4.1) and an item, and applies them exactly as if the user had picked them: the scale and
  root are saved as the last view; the chord is chosen as root and quality.
- **Respects active tag filters** (e.g. "random sad scale"): the item comes from what the
  picker's chips let through. Random scale also keeps to the scale search, so it draws from
  exactly the scales the list shows. A current item kept in its list only because it is
  chosen (“(hidden by tags)”, §5.7) is never picked.
- It never repeats what is shown: every other root and item of the set is equally likely, but
  not the root (by pitch class) and item on screen. With one item, only the root changes.
- When nothing matches, the button is disabled, and the picker's message (“No scale has all
  of the tags dark and happy.”) says why; it is the button's accessible description too.

### 5.9 Audio (Q22)

- **Synthesized plucked-string sound** via Web Audio (e.g. Karplus-Strong). No
  sample files.
- Click a dot (or press Enter or Space on it) to hear the note at its real pitch, from the
  tuning and fret. **Play**, next to the tab, plays the position the tab shows, in its
  direction (up, down, or up and back down). Chords get a strum on the Chords page (§5.3)
  through the same engine; it takes the notes lowest string first.
- **Sound** in the ⚙ Settings dialog (§5.1): a volume slider (0–100) and **Mute**. Both are saved in
  `settings.toml` (`[audio]`) and come back at the next start. Muted, nothing plays.
- Nothing is made audible, and no audio is set up, until the first click, touch or key press
  in the window (browsers require it); a play call before then does nothing (ADR-28).

### 5.10 Export (Q23)

- **Sheet builder:** collect multiple scales/chords onto an export sheet (ADR-43).
  - **Add scale to sheet** (by the scale's notes), **Add tab to sheet** (by **Play**), **Add
    chord to sheet** (on the Chords page, by **Clear chord**) and, while a shape is chosen in
    the voicing browser, **Add shape to sheet** add: the scale on the neck with
    the tab position highlighted as on screen, the tab of the position shown, the chord on a
    neck (alone, or over the dimmed scale for a degree), or the shape as a chord diagram.
  - An item keeps what it was made from: root as typed, scale or chord id, the shape's frets,
    and the instrument and display settings at that moment (tuning, capo, frets, left-handed,
    dot labels, sharps/flats, chord-name style, tab position). Later changes in the app leave
    it as it was; it is drawn again with the app's own fretboard, tab and diagram.
  - **Sheet (n)** in the header shows the sheet page (**Explorer** goes back): a title, the
    sheet's own theme and light/dark (default *Print*, independent of the app's), the items
    with **Move up**, **Move down** and **Remove**, and the sheet itself.
  - An item whose user scale, chord or tuning no longer exists (or whose shape is no longer
    generated) shows "Missing: …" with the reason; the rest of the sheet is drawn.
  - Saved as `sheet.toml` (§3.2) on every change; one sheet for now.
- **Formats:** PDF (via webview print), PNG, SVG, standalone HTML.
  - **SVG and HTML** (ADR-44): on the sheet page, **Export sheet as SVG** and **Export sheet as
    HTML** (while the sheet has items), and **Export SVG** next to each item. They save through
    a save dialog (a download in the browser), named after the sheet or item title
    (`dorian-practice.svg`).
  - Both are built from the sheet as shown, in the sheet's theme: what is exported looks like
    the screen. Every colour and font is written into the file as a literal value on each
    element (no stylesheet, `var()` or class it depends on), so the file keeps its colours in
    a browser, Inkscape or another viewer.
  - The SVG is one valid SVG document: the sheet's title, then each item's caption and drawing
    where they are on screen; an item's SVG is its caption and drawing on the sheet's paper
    colour. The HTML is one page with the sheet, its drawings as inline SVG and no scripts,
    links, fonts, images or other requests, so it opens offline.
  - **PNG** (ADR-45): **Export sheet as PNG** and **Export PNG** next to each item, at the
    **PNG scale** picked beside them (1×, 2× or 3×; 2× by default). The PNG is the SVG export
    drawn at that scale (a 2× PNG is twice the sheet's on-screen width and height, drawn at
    that resolution, not enlarged). An image over 4096 × 4096 pixels is refused with a
    message; a smaller scale works.
  - **PDF** (ADR-45): **Print or save as PDF** opens the system print dialog, where a PDF is a
    destination. Only the sheet prints, in its own theme's colours, with a 12 mm margin on the
    paper size picked in the dialog; drawings shrink to the page width, and an item that
    doesn't fit on the page starts the next one, never split. Other pages print as they are.
- **Themes:** selectable; see §5.11.

### 5.11 Theming (Q30)

- One shared **CSS theme system** used for both the app UI and exports.
- A **theme** is a CSS file setting the tokens for a light scheme, a dark scheme or both
  (ADR-40). Built-in: **Default** (light and dark), **High contrast** (light and dark), four
  after popular editor palettes, each with the light and dark variants the original has
  (ADR-48): **Atom One** (One Light, One Dark), **Catppuccin** (Latte, Mocha), **Dracula**
  (Alucard, Dracula) and **Nord** (Snow Storm, Polar Night), and **Print** (light only: white
  paper, black ink, a white fingerboard).
- **Appearance** in the ⚙ Settings dialog (§5.1): a theme picker (built-in themes, then the user's
  under *Your themes*) and light/dark/system. System follows the OS as it changes; a theme
  with one scheme always shows it. Both are saved in `settings.toml` (`display.theme_id`,
  `display.theme`); a missing `theme_id` is the Default theme.
- **User themes** are `theme-<id>.css` files in the app-data folder, in the same format as
  the built-ins, read at start. A missing or invalid token takes the Default theme's value;
  a failed contrast rule is listed as a warning but the theme is shown as written; a file
  that isn't a theme file is left out and listed. A user theme with a built-in's id replaces
  it. A saved theme that no longer exists shows the Default theme.
- Format, file locations, tokens and their contrast rules:
  [docs/theme-tokens.md](docs/theme-tokens.md) (ADR-19, ADR-40). Every built-in theme passes
  every contrast rule in every scheme.
- An export looks like what is on screen in the chosen theme.

---

## 6. Roadmap (Q3)

| Version | Scope |
|---|---|
| **v1** | Scales & modes (full catalog + custom scale editor), tunings (presets, custom, capo, fret count), 4–9 strings, dot-label toggle, tab view (fret window + 3NPS), left-handed mirror, visual encoding, note-spelling toggle, persistence of settings/custom items. |
| **v2** | Chords (catalog + custom), docked chord panel, all four input modes, reverse lookup + scale finder, harmonize, chord-over-scale overlay, chord symbol display styles, audio. Later in v2: voicing generator. |
| **v3** | Rule-derived mood tags + user overrides, tag filtering, Random button. |
| **v4** | Export sheet builder (PDF/PNG/SVG/HTML), shared theme system for export. |

---

## 7. Out of scope

- MIDI input
- Microtonal / non-12-TET tunings
- Fanned/multiscale fret visualization
- CAGED system
- Theory-correct per-key enharmonic spelling
- Localization / non-English note naming
- Separate OS windows (pop-out)
- General multi-layer scale/chord comparison
- In-app tag-rule editor
- Sampled instrument audio

---

## 8. Known trade-offs

- **Rule-derived subjective tags** ("jazzy", "evil", …) are only as good as the
  tuned weights; expect iteration on the default rules file.
- **Global sharp/flat toggle** produces non-standard spellings in some keys
  (e.g. F♯ inside a D♭ major scale). Accepted for simplicity; the root keeps the
  user's chosen spelling.
