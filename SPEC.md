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
  standard, 4/5/6-string bass standard, …) plus fully custom per-string tuning.
- **Fret count:** configurable, default 24.
- **Capo:** supported as an offset.
- **No** multiscale/fanned-fret visualization.
- **Orientation:** horizontal; **left-handed mirror toggle**.
- **Visual encoding:**
  - Root note visually emphasized
  - Optional per-interval/degree coloring
  - Inlay markers at frets 3, 5, 7, 9, 12 (and octave repeats)
  - Accessible palette; never rely on color alone (shape/label redundancy)
- **Dot labels (toggle):** note names / intervals (scale degrees: 1, ♭3, 5…) / none.

### 5.2 Tab view (Q4, Q13)

A separate tablature view (horizontal string lines, fret numbers) showing a
scale played in one position. Position systems (generic for any tuning and
string count):

- **Fret window:** user-chosen start fret + span; all scale notes inside it.
- **3-notes-per-string:** generated patterns.

CAGED is **not** supported.

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
- Light/dark, following the OS by default.
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
