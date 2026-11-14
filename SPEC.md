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
  last view (root, scale). It is created with the defaults on first start, read once at start
  and saved on every change.
- The user's own scales and tunings are `scales.toml` and `tunings.toml`, in the format of the
  built-in catalogs (§4.2, §5.1). They are read at start; a broken item is skipped and listed
  in a collapsed note in the window, and the rest load (ADR-23). The tuning editor rewrites
  `tunings.toml` when it saves (comments are not kept); if the file had items that didn't
  load, the old file is first kept as `tunings-backup.toml` (ADR-24).
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
  within the octave. Labels are kept as written: write `#4` for Lydian, `b5` for Locrian.
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

### 4.4 Chord symbols (Q25)

- **Parser** accepts all common spellings: `maj7` / `M7` / `Δ7`, `m` / `min` / `-`,
  `ø` / `m7b5`, `°` / `dim`, slash chords, etc.
- **Display style** is a setting:
  - *Standard*: `Cmaj7`, `Cm7♭5`, `Cdim7`
  - *Jazz*: `CΔ7`, `Cø`, `C°7`

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

### 5.3 Chords (Q5, Q16, Q19, Q26)

- Displayed in a **docked panel** (resizable/collapsible) in the main window,
  not a separate OS window.
- **Display:** all chord tones highlighted across the whole neck.
- **Input modes:**
  1. Root + quality
  2. From scale/mode + degree (e.g. iv of D Dorian)
  3. **Reverse lookup:** click notes on the fretboard → matching chord names
     (including slash chords / inversions)
  4. **Typed symbol:** e.g. `F#m7b5`, parsed per §4.4
- **Chord-over-scale overlay:** when a chord comes from a scale (input mode 2
  or harmonize), the parent scale is shown dimmed with chord tones emphasized.
  No general multi-layer comparison.

### 5.4 Reverse lookup → scale finder (Q29)

Clicked notes also produce a list of **scales/modes containing all of them**,
ranked by fewest extra notes. Shares logic with reverse chord lookup.

### 5.5 Harmonize (Q18)

- Select a scale → *Harmonize* → show all chords of that scale.
- Toggle: **triads** / **7th chords**, built by stacking every other scale tone.
- **Roman numerals** displayed (I, ii, iii, …).
- **Non-heptatonic scales** (pentatonic, whole-tone, bebop, …): stack the
  in-scale thirds where possible; degrees where no valid chord forms are marked
  *no chord*.

### 5.6 Voicing generator (Q28)

Algorithmic (works for any tuning and 4–9 strings; no static shape library).

- **Constraints (user-adjustable):**
  - Max fret span (default 4)
  - Allow/forbid open strings
  - Allow/forbid inversions
  - Allow/forbid muted strings
- **Required tones:** root and 3rd; the 5th may be omitted.
- **Ranking:** span, number of played strings, position on the neck.
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
- Click a dot to hear the note; play-buttons for scales and chords.

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
