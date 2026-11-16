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

Files are hand-editable and shareable; the UI offers import/export of them.

- One file per document, directly in the app-data folder (e.g. `settings.toml`). In a plain
  browser (development) the same documents live in localStorage (ADR-4, ADR-17).
- `settings.toml` holds the display preferences (sharps/flats, dot labels, theme,
  left-handed), the last instrument (kind, string count, tuning, fret count, capo) and the
  last view (root, scale) and the tab view's position (system, 3NPS pattern, fret window,
  direction, highlight; ADR-25) and the sound (volume 0–100, mute; ADR-28). It is created with
  the defaults on first start, read once at start and saved on every change.
- The user's own scales and tunings are `scales.toml` and `tunings.toml`, in the format of the
  built-in catalogs (§4.2, §5.1). They are read at start; a broken item is skipped and listed
  in a collapsed note in the window, and the rest load (ADR-23). The tuning and scale editors
  rewrite `tunings.toml` and `scales.toml` when they save (comments are not kept); if the file
  had items that didn't load, the old file is first kept as `tunings-backup.toml` or
  `scales-backup.toml` (ADR-24, ADR-26).
- A value the app doesn't understand falls back to its default and the app shows a warning
  naming it. A file that can't be used at all (not TOML, missing or unsupported version) is
  kept as `settings-backup.toml`, the defaults are used, and the app says so. It never
  crashes on a bad file.
- Export saves a document through a save dialog (a download in the browser); import picks a
  TOML file through an open dialog (an upload in the browser) and refuses files that aren't
  valid TOML.

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
  built-in it replaced, or the default scale.

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
- **Display style** is a setting (`chord_symbols` in `[display]`, chosen in the chord panel,
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
  - Dimmed notes (e.g. the scale behind a chord) drawn smaller
  - Inlay markers at frets 3, 5, 7, 9, 12 (and octave repeats; double at 12 and 24)
  - Realistic fret spacing; the neck scales to the window width
  - Accessible palette; never rely on color alone (shape/label redundancy)
- **Interaction:** click a position, or use the keyboard: Tab reaches the
  fretboard, arrow keys move between positions, Enter/Space activate. Every
  position has a spoken name (string, fret, note). (ADR-18)
- **Dot labels (toggle):** note names / intervals (scale degrees: 1, ♭3, 5…) / none.
- **Scale explorer** (the main view, ADR-23): pick or type a root and pick a scale from a
  list grouped by family, with a search over names and aliases; the neck shows every note of
  the scale across all frets of the current instrument, the root as a square, with the scale
  spelled out above it. The label and sharp/flat toggles sit next to the neck; interval
  labels are the scale's own (`♯4` in Lydian). Root, scale, labels and sharps/flats are saved
  on every change and come back at the next start. The window has regions for the picker,
  the neck, the instrument settings and the docked chord panel (§5.3); on a narrow window
  they stack.
- **Instrument panel** (the `settings` region, ADR-24): string count 4–9, the tuning presets
  for that count grouped by kind (guitar, bass) with the user's own tunings in a group of
  their own, fret count (12–27), capo (below the last fret; a shorter neck moves it down),
  left-handed and theme. Changing the string count picks that count's standard preset.
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

- Displayed in a **docked panel** (resizable/collapsible) in the main window,
  not a separate OS window.
- **Display:** all chord tones highlighted across the whole neck.
- **Input modes:**
  1. Root + quality
  2. From scale/mode + degree (e.g. iv of D Dorian)
  3. **Reverse lookup:** click notes on the fretboard → matching chord names
     (including slash chords / inversions, and chords with the 5th left out; §5.4)
  4. **Typed symbol:** e.g. `F#m7b5`, parsed per §4.4
- **Chord-over-scale overlay:** when a chord comes from a scale (input mode 2
  or harmonize), the parent scale is shown dimmed with chord tones emphasized.
  No general multi-layer comparison.
- **The panel** (ADR-32): collapsed to its title bar with a button, and resized by dragging
  its top edge (or with the arrow keys, Home and End when the edge has focus). Both are saved
  in `settings.toml` (`[chord_panel]`: `collapsed`, `height` in pixels, 96–640) and come back
  at the next start.
  - **Root and quality:** pick a root and a chord from the catalog (grouped by family). The
    neck shows the chord's tones alone, the root as a square.
  - **Degree of the scale:** pick a degree of the scale in the explorer and triads or 7th
    chords; the chord on that degree comes from harmonize (§5.5). The neck shows the scale
    dimmed with the chord's tones emphasized (degree V of C major as 7th chords: G7 over
    C major). The chord follows the explorer's scale. Where no chord forms on a degree (some
    pentatonic degrees), the panel says so and the neck shows the scale alone.
  - The panel lists the chord's notes (spelled by the sharp/flat setting; the root keeps its
    spelling) and has **Strum**, which plays the chord through the audio engine (§5.9) as one
    note per string, lowest string first, stacked upward from the lowest root on the neck.
    **Clear chord** returns to the plain scale. The chosen chord is not saved.
  - **Typed symbol:** type a chord symbol (`F#m7b5`, `CΔ7`, `Am7/G`); it is read as you type
    by the parser (§4.4), in either style, and the neck shows the chord's tones alone, the
    root as typed. A symbol that can't be read shows no chord: the field is marked invalid
    and the typed text is repeated with the first unreadable character underlined (the end,
    if the symbol stops too early), with the parser's reason and the character's number. An
    empty field is no error. A slash chord's bass is written in the name (`Am7/G`, "Minor
    seventh, bass G"); the neck shows the chord's own tones and does not add the bass.
  - **Chord names** (ADR-33): every chord name in the app, in the panel, its title bar and
    the neck's label, is written by the symbol formatter (§4.4) in the display style chosen
    in the panel: Standard (`Cmaj7`, `Cm7♭5`) or Jazz (`CΔ7`, `Cø`), each choice showing
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
- **In the app** (ADR-34): a **Harmonize** button next to the scale's notes in the explorer
  opens a row with the chord on every degree of the current scale, its Roman numeral above
  its symbol (D Dorian as 7th chords: i7 Dm7, ii7 Em7, IIImaj7 Fmaj7, IV7 G7, v7 Am7,
  viø7 Bm7♭5, VIImaj7 Cmaj7; in the Jazz style FΔ7, Bø and CΔ7). The row has its own
  **Triads** / **7th chords** toggle, which is the chord panel's size (§5.3): changing one
  changes the other. A degree where no chord forms shows its note and *no chord*. Clicking a
  chord chooses it in the chord panel by its degree (whatever input the panel was on), so the
  neck shows it over the dimmed scale (the chord-over-scale overlay, §5.3), and expands the
  panel if it was collapsed; the chosen chord is marked in the row. The row follows the
  explorer's scale, root, sharp/flat setting and chord name style. Whether it is open is not
  saved.

### 5.6 Voicing generator (Q28)

Algorithmic (works for any tuning and 4–9 strings; no static shape library).

- **Constraints (user-adjustable):**
  - Max fret span (default 4, up to 6; open strings don't count)
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

### 5.7 Mood/category tags (Q6, Q14, Q31)

- Tags (sad, evil, melancholic, dissonant, jazzy, bright, exotic, …) are
  **derived by rules**, not hand-assigned.
- Rules are **weighted scores** defined in a TOML file: each interval feature
  contributes a weight per tag (e.g. ♭2 → +evil, ♭3 → +sad, ♯4 → +bright,
  tritone → +dissonant, 7th/9th extensions → +jazzy). A tag applies when its
  score exceeds a threshold.
- **Multiple tags per item.**
- Users can **override weights and add new tags** via a user rules file in the
  app-data directory (§3.2). No in-app rule editor; the format is documented.
- Scales and chords can be **filtered by tag**.

### 5.8 Random (Q21)

- Picks a random root + scale **or** chord, depending on the active view.
- **Respects active tag filters** (e.g. "random sad scale").

### 5.9 Audio (Q22)

- **Synthesized plucked-string sound** via Web Audio (e.g. Karplus-Strong). No
  sample files.
- Click a dot (or press Enter or Space on it) to hear the note at its real pitch, from the
  tuning and fret. **Play**, next to the tab, plays the position the tab shows, in its
  direction (up, down, or up and back down). Chords get a strum from the chord panel (§5.3)
  through the same engine; it takes the notes lowest string first.
- **Sound** in the settings region: a volume slider (0–100) and **Mute**. Both are saved in
  `settings.toml` (`[audio]`) and come back at the next start. Muted, nothing plays.
- Nothing is made audible, and no audio is set up, until the first click, touch or key press
  in the window (browsers require it); a play call before then does nothing (ADR-28).

### 5.10 Export (Q23)

- **Sheet builder:** collect multiple scales/chords onto an export sheet.
- **Formats:** PDF (via webview print), PNG, SVG, standalone HTML.
- **Themes:** selectable; see §5.11.

### 5.11 Theming (Q30)

- One shared **CSS theme system** used for both the app UI and exports.
- Light/dark, following the OS by default; a setting can force either one.
- Tokens and their contrast rules: [docs/theme-tokens.md](docs/theme-tokens.md) (ADR-19).
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
