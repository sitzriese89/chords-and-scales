# Architecture Decision Records

The important decisions behind Chords & Scales, with the reasons and what they cost. Read this
before changing direction on any of them. If you change one, don't edit history: add a new
record that supersedes the old one and update the old one's status.

Format: **Context** (the situation), **Decision** (what we do), **Consequences** (what follows,
good and bad). Statuses: *Accepted*, *Superseded by ADR-n*, *Proposed*.

ADR-1 to ADR-13 come from the design interview behind [SPEC.md](SPEC.md) (decision IDs Q1–Q35).

| # | Decision | Status |
|---|---|---|
| 1 | [Rust core, Tauri 2 shell, Svelte + TypeScript UI](#adr-1-rust-core-tauri-2-shell-svelte--typescript-ui) | Accepted |
| 2 | [The theory core is a pure library, called as WASM from the UI](#adr-2-the-theory-core-is-a-pure-library-called-as-wasm-from-the-ui) | Accepted |
| 3 | [The fretboard and everything exportable are SVG](#adr-3-the-fretboard-and-everything-exportable-are-svg) | Accepted |
| 4 | [Storage behind one interface: Tauri files and a browser fallback](#adr-4-storage-behind-one-interface-tauri-files-and-a-browser-fallback) | Accepted |
| 5 | [Catalogs and rules are TOML data](#adr-5-catalogs-and-rules-are-toml-data) | Accepted |
| 6 | [12-TET pitch classes; spelling by a global sharp/flat preference](#adr-6-12-tet-pitch-classes-spelling-by-a-global-sharpflat-preference) | Accepted |
| 7 | [Scale positions are generic: fret window and 3-notes-per-string](#adr-7-scale-positions-are-generic-fret-window-and-3-notes-per-string) | Accepted |
| 8 | [Chord voicings are generated, not looked up](#adr-8-chord-voicings-are-generated-not-looked-up) | Accepted |
| 9 | [Mood tags are derived from weighted interval rules](#adr-9-mood-tags-are-derived-from-weighted-interval-rules) | Accepted |
| 10 | [One window with a docked chord panel](#adr-10-one-window-with-a-docked-chord-panel) | Accepted |
| 11 | [One CSS theme system for the app and for exports](#adr-11-one-css-theme-system-for-the-app-and-for-exports) | Accepted |
| 12 | [Audio is a Web Audio string synth](#adr-12-audio-is-a-web-audio-string-synth) | Accepted |
| 13 | [English only](#adr-13-english-only) | Accepted |
| 14 | [The WASM package is built by wasm-pack into the app's source tree](#adr-14-the-wasm-package-is-built-by-wasm-pack-into-the-apps-source-tree) | Accepted |
| 15 | [Notes are MIDI numbers; intervals keep their degree labels](#adr-15-notes-are-midi-numbers-intervals-keep-their-degree-labels) | Accepted |
| 16 | [Releases are unsigned drafts built by CI from a version tag](#adr-16-releases-are-unsigned-drafts-built-by-ci-from-a-version-tag) | Accepted |
| 17 | [Stored documents: flat named TOML files, versioned settings, dialogs in Rust](#adr-17-stored-documents-flat-named-toml-files-versioned-settings-dialogs-in-rust) | Accepted |
| 18 | [The fretboard component: absolute frets, string 1 on top, one keyboard grid](#adr-18-the-fretboard-component-absolute-frets-string-1-on-top-one-keyboard-grid) | Accepted |
| 19 | [Theme tokens are hand-written CSS, checked by tests](#adr-19-theme-tokens-are-hand-written-css-checked-by-tests) | Accepted |
| 20 | [The scale catalog: one shared formula type, per-item errors, user ids replace built-ins](#adr-20-the-scale-catalog-one-shared-formula-type-per-item-errors-user-ids-replace-built-ins) | Accepted |
| 21 | [Tunings list strings low to high; positions come out in fretboard coordinates](#adr-21-tunings-list-strings-low-to-high-positions-come-out-in-fretboard-coordinates) | Accepted; WASM tuning API superseded by ADR-23 |
| 22 | [Scale positions filter the fretboard mapping; 3NPS patterns take the lowest octave that fits](#adr-22-scale-positions-filter-the-fretboard-mapping-3nps-patterns-take-the-lowest-octave-that-fits) | Accepted |
| 23 | [The scale explorer: one layout, user catalogs loaded alike, labels looked up from the core](#adr-23-the-scale-explorer-one-layout-user-catalogs-loaded-alike-labels-looked-up-from-the-core) | Accepted |
| 24 | [Instrument settings: custom tunings saved by the core, stable generated ids, a catalog revision](#adr-24-instrument-settings-custom-tunings-saved-by-the-core-stable-generated-ids-a-catalog-revision) | Accepted |
| 25 | [The tab view: core positions in playing order, absolute frets, never mirrored, stored without a version bump](#adr-25-the-tab-view-core-positions-in-playing-order-absolute-frets-never-mirrored-stored-without-a-version-bump) | Accepted |
| 26 | [Custom scales: a generic interval-set editor, names unique in the catalog, checks in the core](#adr-26-custom-scales-a-generic-interval-set-editor-names-unique-in-the-catalog-checks-in-the-core) | Accepted |
| 27 | [The chord catalog: suffix symbols in the data, a full stack per chord, shared file reader](#adr-27-the-chord-catalog-suffix-symbols-in-the-data-a-full-stack-per-chord-shared-file-reader) | Accepted |

---

## ADR-1: Rust core, Tauri 2 shell, Svelte + TypeScript UI

**Context.** The owner wanted a Rust backend with an HTML/CSS frontend, possibly Tauri 2. The
app is a public product on Windows, macOS and Linux, and the UI has a lot of interactive state
(pickers, panels, filters, editors).

**Decision.** Tauri 2 desktop shell. Frontend in Svelte + TypeScript, built with Vite and pnpm.
Music theory in Rust (ADR-2). Monorepo: Cargo workspace (`crates/theory`, `crates/theory-wasm`)
plus `app/` with `app/src-tauri/`. Dual license MIT / Apache-2.0.

**Consequences.**
- Small binaries on all three platforms; builds through GitHub Actions.
- A JS toolchain is required (Node + pnpm), unlike a plain-HTML Tauri app.
- Svelte keeps interactive SVG and panel state short; the static build also runs in a browser.

## ADR-2: The theory core is a pure library, called as WASM from the UI

**Context.** The theory math (intervals, scales, chord naming, voicings) is tiny. A native
"backend" behind Tauri IPC would make every fretboard update an async round trip and would need
a second integration for a web version.

**Decision.** `crates/theory` is a pure Rust library: no IO, no UI, no `wasm-bindgen`.
`crates/theory-wasm` exposes it to the frontend with `wasm-bindgen`, one module per core area
(`notes.rs`, `scales.rs`, `fretboard.rs`, …), so parallel work rarely touches the same file.
The frontend calls the WASM package directly, also inside Tauri. The frontend does no theory
itself.

**Consequences.**
- Synchronous calls from the UI, no IPC for theory.
- A web build later needs only a different `Storage` (ADR-4).
- All theory is testable with `cargo test`; the binding layer needs only thin TS-side tests.
- Core types that cross the boundary need serde/TS-friendly shapes; keep them simple.

## ADR-3: The fretboard and everything exportable are SVG

**Context.** The fretboard has at most 9 strings × 27 frets. It must be crisp at any size,
clickable per position, themeable, and exportable to PDF, PNG, SVG and HTML (v4).

**Decision.** Fretboard, tab view and chord diagrams are SVG rendered by Svelte components,
styled with the CSS theme tokens (ADR-11).

**Consequences.** Export reuses the screen rendering instead of a second renderer. Canvas-level
performance isn't needed at this size.

## ADR-4: Storage behind one interface: Tauri files and a browser fallback

**Context.** Settings, the last view, custom scales/chords/tunings, presets and tag-rule
overrides must persist as plain, hand-editable files in the OS app-data folder. Developing the
UI in a normal browser (`pnpm dev`) is much faster than rebuilding the Tauri app.

**Decision.** The frontend talks to a TypeScript `Storage` interface that reads and writes named
TOML documents. Two implementations: Tauri (Rust commands writing atomically to the app-data
folder) and browser (localStorage), selected at startup. Both run the same test suite. Tauri
commands are used only for filesystem work; theory never goes over IPC (ADR-2).

**Consequences.**
- The whole app works in a browser during development, and a web version is a small step.
- A new stored document must work in both implementations; the shared tests enforce it.
- Corrupt or old files fall back to defaults with a visible warning, never a crash.

## ADR-5: Catalogs and rules are TOML data

**Context.** The catalog is broad (modes, harmonic/melodic minor modes, pentatonics, blues,
bebop, symmetric, exotic scales; triads to altered and extended chords), users add their own
items, and the mood-tag rules (ADR-9) need tuning without recompiling.

**Decision.** Scales, chords, tunings and tag rules live in TOML files under
`crates/theory/data/`, embedded with `include_str!`. Scales and chords share one formula format
(interval lists such as `["1", "b3", "5"]`). User files in the same format are merged on top.
Validation tests reject broken entries (unknown fields, duplicate ids, intervals out of order).

**Consequences.** Adding a scale is a data change with a test as a safety net. User items are
treated exactly like built-in ones everywhere.

## ADR-6: 12-TET pitch classes; spelling by a global sharp/flat preference

**Context.** Theory-correct spelling per key (G♭ in D♭ major, double sharps in some minors) is
complex, and many scales in the catalog have no clear key signature.

**Decision.** Notes are 12-TET pitch classes. A global sharp/flat preference spells every note,
except the root, which keeps the spelling the user typed or picked (D♭ stays D♭ with sharps on).
No microtonal support.

**Consequences.**
- Simple and predictable. Some keys show non-standard spellings (F♯ inside D♭ major). Accepted.
- Moving to per-key spelling later means a new ADR and a spelling module change, not a model
  change: pitch classes stay the base.

## ADR-7: Scale positions are generic: fret window and 3-notes-per-string

**Context.** The tab view shows a scale in one position. CAGED only makes sense for standard
6-string tuning; the app supports any tuning and 4–9 strings.

**Decision.** Two position systems: a user-chosen fret window (start fret + span), and generated
3-notes-per-string patterns. No CAGED.

**Consequences.** Both work for every tuning and string count. Players who think in CAGED
don't get it.

## ADR-8: Chord voicings are generated, not looked up

**Context.** With custom tunings and 4–9 strings, no static chord-shape library can cover every
case.

**Decision.** A voicing generator in the core searches fingerable shapes with adjustable
constraints (max fret span, default 4; open strings, inversions, muted strings allowed or not),
requires root and 3rd (the 5th may be dropped), and ranks by span, strings played and position.

**Consequences.** Works for any tuning. Ranking will need tuning against what players expect.

## ADR-9: Mood tags are derived from weighted interval rules

**Context.** Filtering by mood (sad, evil, jazzy, dissonant, …) was wanted. These are
subjective; hand-assigning them doesn't scale to custom items.

**Decision.** A TOML rule file gives each interval feature (♭2, ♭3, ♯4, tritone, ♭9, 7th/9th
extensions, …) a weight per tag. An item gets every tag whose score passes the threshold, so an
item can have several tags. A user rules file in the app-data folder can change weights and add
tags; there is no in-app rule editor.

**Consequences.** Custom scales and chords get tags automatically. Tag quality depends on the
weights; expect iteration on the default rules. The format must be documented for users.

## ADR-10: One window with a docked chord panel

**Context.** The idea mentioned chords in a "separate window".

**Decision.** Chords show in a resizable, collapsible panel docked in the main window. No
second OS window.

**Consequences.** One state, no cross-window sync, and it works the same in a browser.

## ADR-11: One CSS theme system for the app and for exports

**Context.** Exports (v4) should come in selectable themes, and the app needs light/dark.

**Decision.** Themes are sets of CSS custom properties (tokens: surfaces, text, fretboard parts,
a colour-blind-safe degree palette). The app follows the OS light/dark preference by default;
a theme can be chosen explicitly. Exports render with the same tokens, so an export looks like
the screen.

**Consequences.** The token names are a contract from v1 on; renaming one is a breaking change
for user themes. Nothing may rely on colour alone (root also differs by shape).

## ADR-12: Audio is a Web Audio string synth

**Context.** Hearing notes, scales and chords helps practice. Sampled instruments add megabytes
and licensing questions.

**Decision.** A plucked-string synth (Karplus–Strong) in Web Audio, in the frontend. No samples.

**Consequences.** Tiny, works in Tauri and the browser. It sounds like a synth, not a recorded
guitar.

## ADR-13: English only

**Context.** The app is public, but translation and alternative note naming (German H/B,
solfège) add work to every UI change.

**Decision.** UI text and note names are English. No i18n framework for now.

**Consequences.** Adding languages later means extracting strings across the UI.

## ADR-14: The WASM package is built by wasm-pack into the app's source tree

**Context.** ADR-2 has the UI call `crates/theory-wasm` as WASM. Something has to compile it,
generate the JS glue and TypeScript types, and put them where Vite, svelte-check and vitest
find them, on every OS, from a fresh clone, without a separate install step that can drift
from the `wasm-bindgen` crate version.

**Decision.** `wasm-pack build --target web` builds `crates/theory-wasm` into
`app/src/lib/wasm/` (generated, git-ignored). wasm-pack is an npm dev dependency of `app/`, so
`pnpm install` provides it (its download script is allowed in `app/pnpm-workspace.yaml`); it
fetches the `wasm-bindgen` CLI matching the crate version itself. The `wasm` script runs it,
and `dev`, `build`, `check` and `test` run `wasm` first. The `web` target needs no Vite plugin:
`app/src/lib/theory.ts` loads the module once with `initTheory()` before the app mounts, and
re-exports the bindings; components import theory functions from there. Tests pass the
module bytes to `initTheory()` from a vitest setup file, since jsdom can't fetch the file.

**Consequences.**
- One command (`pnpm --dir app install`) after the Rust and Node prerequisites; no
  `cargo install`.
- Every `dev`/`build`/`check`/`test` run rebuilds the WASM (seconds when nothing changed).
  `lint` doesn't need it.
- Loading is asynchronous once, at startup; every call after that is synchronous.
- A bundler-target build (ESM WASM imports via a Vite plugin) would drop `initTheory()`;
  switching means a new ADR.

## ADR-15: Notes are MIDI numbers; intervals keep their degree labels

**Context.** Every theory feature builds on one note model (M1.1). Pitches need an octave for
tunings and the fretboard, intervals need names for dot labels and formulas (`b3`, `#4`, `13`),
and note names arrive typed by users (`Db`, `D♭`), from TOML catalogs and from storage.

**Decision.** In `crates/theory/src/notes/`:

- A `PitchClass` is 0–11. A `Note` is a MIDI number 0–127 (C4 = 60, scientific octaves);
  transposing out of that range returns `None` rather than wrapping or saturating.
- An `Interval` is ascending: a degree (1, 2, … 13, …) plus an accidental relative to the major
  scale, its semitones following from the label. Labels are kept as given, so `#4` and `b5` are
  different intervals of 6 semitones. Where only a width is known (between two notes, a
  semitone picker) the default label is `1 b2 2 b3 3 4 b5 5 b6 6 b7 7`, plus 7 degrees per
  octave (`b9`, `13`); scales and chords that mean `#4` or `#11` say so in their own labels.
- A `NoteName` is a letter plus an accidental up to a double sharp or flat. `Spelling` applies
  ADR-6: naturals or one sharp or flat by the global preference; the root's pitch class is
  spelled as the root.
- Parsing accepts ASCII and Unicode (`b`/`♭`, `#`/`♯`, `bb`/`𝄫`, `##`/`x`/`𝄪`, either letter
  case) and returns a `ParseError` value, never panics. `Display` is ASCII (for TOML, storage
  and logs). The WASM layer returns Unicode, for display, and turns errors into thrown JS
  `Error`s.

**Consequences.**
- One integer per note and per pitch class: cheap to pass to the UI as numbers.
- Notes below C-1 or above G9 can't be represented; no guitar or bass gets near either end.
- Mood-tag rules and dot labels can tell `#4` from `b5` where a formula says which it means;
  intervals measured between notes get the default label.
- The Unicode double sharp and flat (`𝄪`, `𝄫`) need a font that has them. Only a root typed
  that way shows them, since the preference spells with single accidentals.

## ADR-16: Releases are unsigned drafts built by CI from a version tag

**Context.** Every milestone from M1 on ends in a public release for Windows, macOS and Linux
(SPEC §1, §2.4). Installers must come from CI, not from someone's machine, and the version in
the installers, the tag and the release notes must agree. Code signing needs paid
certificates (Windows) and an Apple Developer account with notarisation (macOS); SPEC §1
defers it, together with auto-update.

**Decision.** `.github/workflows/release.yml` runs on tags `v<semver>`. Its first job runs
`scripts/check-release.mjs` (Node, no dependencies, self-tested with `node --test`): the tag
minus `v` must equal the workspace version in `Cargo.toml`, every workspace crate's version
and its `Cargo.lock` entry, `app/package.json`, and `tauri.conf.json` (which has no version of
its own and inherits the Tauri crate's), and `CHANGELOG.md` must have a non-empty section for
it. Only then do the build jobs start: `tauri-apps/tauri-action` builds Windows NSIS, a
universal macOS dmg and a Linux AppImage plus deb (on the oldest supported Ubuntu, for glibc
compatibility); each job only builds and uploads its bundles as workflow artifacts. A final
job, the only one with `contents: write`, renames the files to URL-safe names, writes
`SHA256SUMS.txt` over all of them and creates a **draft** release whose body is the
`CHANGELOG.md` section (a pre-release when the version has one). A person publishes it after
checking the installers. Release notes come from the hand-written changelog, not from
GitHub's generated notes, because PR titles describe work, not what users get. Builds are
unsigned.

**Consequences.**
- A mismatched version or a missing changelog section fails within seconds, before any build.
- A release appears only when all three platforms built; no half-filled drafts.
- Releasing means one PR (versions + changelog section) and one tag; CONTRIBUTING.md has the
  steps.
- Unsigned builds trigger Windows SmartScreen and macOS Gatekeeper warnings; README explains
  how to open them. Signing, notarisation and an updater are later work and a new ADR.
- No Rust build cache in release builds: slower (one universal macOS build compiles twice),
  but nothing from earlier runs ends up in an installer.

## ADR-17: Stored documents: flat named TOML files, versioned settings, dialogs in Rust

**Context.** ADR-4 puts storage behind one interface of named TOML documents with a Tauri and
a browser implementation. That leaves open what a name may be and where it lands on disk, how
the settings file evolves without crashing on old or hand-broken files, and how import/export
reaches files outside the app-data folder without handing the webview filesystem access.

**Decision.**
- A document name is 1–64 characters of `a-z`, `0-9`, `-`, `_`, starting with a letter or
  digit, and not a Windows device name (`con`, `nul`, `com1`, …). Document `settings` is the
  file `<app-data>/settings.toml`, directly in the folder Tauri reports as `app_data_dir`; in
  the browser it is the localStorage entry `chords-and-scales:document:settings`. Names are
  checked in TypeScript and again in Rust before any path is built, against one shared list of
  cases (`app/src/lib/storage/names.fixture.json`). Lowercase only, so names can't collide on
  case-insensitive filesystems, and no separators or dots, so a name can't leave the folder.
- Writes go to a temporary file in the same folder, flushed, then renamed over the document.
- `settings.toml` has a top-level `version` (1 now) and snake_case tables `display`,
  `instrument`, `last_view`. A missing value takes its default silently, so a hand-written file
  can be minimal; an invalid or unknown value falls back to its default and is named in a
  warning. A file that isn't TOML, has no version, or has a version with no migration path
  (older without a migration step, or newer than the app) is copied to `settings-backup.toml`
  and replaced by the defaults, with a warning. Format changes bump the version and add a step
  to the `MIGRATIONS` table in `app/src/lib/settings/schema.ts`.
- Settings load once at start and are saved on every change; a missing file is created with
  the defaults so there is always a file to edit. Tuning, root and scale are stored as plain
  strings; whether they name a catalog entry is checked where the catalogs are used.
- Import and export open native dialogs from Rust (`tauri-plugin-dialog` used only on the Rust
  side). The webview gets no dialog or fs plugin permissions: it can only write to a path the
  user picked in a save dialog and read a file the user picked in an open dialog. The app's
  own commands are declared in `build.rs`, so each needs an explicit `allow-<command>` entry in
  `capabilities/default.json`. In the browser, export is a Blob download and import a file
  input. Imported files must parse as TOML and are stored under their file name, or under a
  name the caller gives.
- TOML in TypeScript is parsed and written with `smol-toml`.

**Consequences.**
- Every stored file is visible and editable in one folder; a typo costs one value, not all
  settings, and a broken file is kept rather than overwritten.
- Writing settings from the app drops comments a user added to `settings.toml` (the
  serializer writes its own header). Accepted for settings; catalog-style user files are
  rewritten only when the user saves in an editor.
- No subfolders: a future need (e.g. many presets) means a new name rule or a new ADR.
- A newer app's settings file is unusable for an older app (backed up, then defaults).

## ADR-18: The fretboard component: absolute frets, string 1 on top, one keyboard grid

**Context.** The fretboard (`app/src/lib/fretboard/`, M1.5) is built before the core can feed
it, and the scale explorer, chord overlay, settings and export all build on its props. Its
coordinates, its look at 12 and at 27 frets, and how it is used without a mouse have to be
settled once.

**Decision.**
- Presentational: it takes `strings`, `frets`, `capo`, `leftHanded`, `colorByDegree` and dots
  `{string, fret, label, role: root|tone|dim, degree}` and calls `onactivate({string, fret})`.
  Labels come computed from the core; the component knows no notes.
- String 1 is the highest-pitched string, drawn at the top. `fret` is the absolute fret on the
  neck (0 = open). With a capo the frets below it are shaded and not part of the grid, matching
  the core, which excludes them.
- Real fret spacing (1 − 2^(−n/12) of the scale length) over a drawing of fixed width, so a
  given container shows the same string spacing for any fret count. Dots shrink only when the
  last fret space can't hold a full one (27 frets).
- Root is a square, other notes circles, dimmed notes smaller circles: shape and size carry the
  meaning, colour adds to it (ADR-11). `degree` (semitones above the root) picks
  `--degree-<n>` when colouring by degree.
- Keyboard and screen readers: an ARIA grid (rows = strings, cells = playable frets) with a
  roving tab stop. Arrow keys move in drawing direction (mirrored when left-handed), Home/End
  go to the first/last fret, Enter/Space activate. Each cell is named like "String 2, fret 5,
  C, root".
- Components are looked at on dev-only fixture pages, separate Vite HTML entries in
  `app/dev/` with hand-written data. `vite build` only builds `index.html`, so they never ship.

**Consequences.**
- Callers convert to absolute frets and string-1-on-top once, in the core's mapping (M1.3).
- At 27 frets the high frets are narrow and the dots smaller than at 24; a "compressed"
  spacing would need a new prop and ADR.
- One tab stop keeps Tab moving through the app quickly; reaching a position takes arrow keys.
- Fixture data is static, so it never does theory in TypeScript, but it doesn't follow the
  user's tuning either.

## ADR-19: Theme tokens are hand-written CSS, checked by tests

**Context.** ADR-11 makes the theme tokens a contract for the app and for v4 export and user
themes. The app needs light and dark, following the OS unless the user picks one, and the
token values must meet WCAG AA contrast in both. The values have to live somewhere both the
browser and a contrast test can read, without a build step or a second copy that can drift.

**Decision.** `app/src/styles/tokens.css` is the single source: plain custom properties with
opaque `#rrggbb` values. Light is the `:root` default; a `prefers-color-scheme: dark` block
applies dark unless `data-theme="light"` is on the root element, and a
`:root[data-theme="dark"]` block applies dark regardless of the OS. `applyTheme()` in
`app/src/styles/theme.ts` sets or clears `data-theme` for a `'system' | 'light' | 'dark'`
preference. A vitest test parses `tokens.css` with the DOM's CSS parser and checks that both
themes define exactly the token list, that the two dark blocks are identical, the WCAG AA
contrast pairs (4.5:1 for text, 3:1 for graphics) and that the 12 degree colours stay apart
in OKLab, including under simulated protanopia, deuteranopia and tritanopia. Another test
checks every token has a row in `docs/theme-tokens.md`. Names follow `--<area>[-<part>]`, and
`--<fill>-text` is the text colour on the fill `--<fill>`.

**Consequences.**
- No generator and no runtime injection: exports can embed the same file, and a theme is just
  a block of the same properties.
- The dark values are written twice (CSS can't share one block between a media query and an
  attribute selector without `light-dark()`, which older WebKitGTK lacks); the test catches
  drift.
- `light-dark()`, translucent values and `var()` references between tokens are out until the
  test can resolve them.
- jsdom ignores media queries, so the OS-preference path is checked structurally and by hand,
  not by a rendering test.

## ADR-20: The scale catalog: one shared formula type, per-item errors, user ids replace built-ins

**Context.** M1.2 fixes the TOML format that scales and, later, chords (M2.1) are written in
(ADR-5). Chords need compound intervals (`9`, `#11`, `13`); scales stay within the octave.
User scale files are hand-edited (SPEC §3.2), so one broken entry must not hide the rest, and
a user may want to change a built-in scale, not only add new ones. The UI needs the catalog
as data it can list and group, without doing theory (ADR-2).

**Decision.**

- `theory::Formula` is the shared type: a list of `Interval`s (ADR-15) that starts at `1` and
  strictly ascends in semitones, labels kept as written. It knows nothing of octaves; the
  scale validation adds "every interval below 12 semitones". `Formula::rotate` gives the mode
  on a degree, with default labels.
- `crates/theory/data/scales.toml` holds `[[scale]]` tables with `id` (lowercase kebab-case,
  unique), `name`, optional `aliases`, `family` and `intervals`; unknown fields are errors.
  Families are listed in the order they first appear. A user scale without a `family` goes
  under `Custom`.
- User files use the same format and are parsed item by item: the core takes a TOML string and
  returns the valid scales plus one error per broken item (its index, its id if any, a
  readable message); a file that is not TOML, or has keys other than `scale`, gives a
  file-level error. Within a file the first item with an id wins.
- Merging: a user scale with the id of a built-in one replaces it in place (keeping its spot
  in the list unless its family differs); other user scales are added after the built-ins in
  file order. Every scale records whether it is built in or from the user.
- The WASM binding holds one current catalog: `setUserScales(toml)` replaces the user scales
  and returns the report, `listScales()`, `getScale(id)` and `scaleNotes(id, root,
  accidentals)` read it. Results are plain objects serialised with `serde-wasm-bindgen`, typed
  in TypeScript by a custom section; labels and note names are Unicode. (ADR-23 gives the
  report the shared name `UserFileReport` and loads user tunings the same way.)

**Consequences.**
- The chord catalog reuses `Formula` and the same parse-and-report pattern with its own
  rules (compound intervals allowed).
- A user can shadow a built-in scale by id, and the UI can show which ones are theirs. To get
  the original back they remove their item.
- The binding has state (the merged catalog), so the app calls `setUserScales` once at start
  and after each change to the user file; the core stays stateless.
- Built-in ids are a contract: settings and user files refer to them (`major` is the
  settings default). Renaming one needs a settings migration.

## ADR-21: Tunings list strings low to high; positions come out in fretboard coordinates

**Context.** M1.3 adds tunings and the mapping of pitch classes onto the neck. Tunings are
written the way players write them (`E A D G B E`, low string first) in a built-in TOML file
and in the user's own file, while the fretboard component (ADR-18) numbers strings from the
highest and uses absolute frets. The scale catalog (M1.2) is built at the same time, so the
mapping can't take a scale type, and the app needs to keep working when a user file has a
bad entry.

**Decision.** In `crates/theory/src/tuning.rs` and `fretboard.rs`:

- A `Tuning` is an id (lowercase kebab-case), a name, a kind (`guitar` | `bass`, a label only)
  and 4–9 open-string `Note`s, **lowest string first**, each from C0 to C6. Notes need not
  rise (re-entrant tunings). Built-in ids follow `<kind>-<strings>-<name>`
  (`guitar-6-standard`, the settings default); a test enforces it for the built-ins only.
- Built-ins and user tunings share one format (`[[tuning]]` tables with `id`, `name`, `kind`,
  `notes`, unknown fields rejected). `parse_tunings` takes a string, no file IO. An item that
  fails (missing or unknown field, bad note, invalid tuning, id repeated in the same file) is
  skipped and reported with its 1-based number, its id if any, and the reason; the others
  load. Only a document that isn't TOML or has keys other than `tuning` fails as a whole.
  `TuningCatalog::merge` puts user tunings on top: a user tuning with a built-in id replaces
  it in place, others are appended.
- `positions(tuning, frets, capo, pitch_classes, root)` takes the pitch classes as a plain
  slice and returns every matching position in **ADR-18 coordinates**: string 1 = highest,
  absolute frets, ordered by string then fret, each with its note (MIDI), its interval from
  the root (default label) and its degree (semitones, 0–11). Frets are 12–27. The capo sits
  on fret `c`, 0 for none, and must be below the last fret: frets `c` … `frets` are listed,
  so a capo on the second-to-last fret leaves two frets and one on the last fret is an error.
- The WASM layer passes records as plain objects through `serde-wasm-bindgen`, typed by a
  hand-written TypeScript section: `tuningCatalog(userToml?)` returns built-ins merged with
  the user's tunings plus the item errors, and `fretboardPositions(tuning, …)` takes a tuning
  object back (validated again), so the core keeps no state. *Superseded by ADR-23:* the
  binding now holds the tuning catalog like the scale catalog (`setUserTunings`,
  `listTunings`, `getTuning`), with the shared 0-based error shape; `fretboardPositions`
  still takes a tuning object.

**Consequences.**
- The scale explorer passes positions to the fretboard without remapping; only the core
  converts between "low string first" and "string 1 on top".
- A user can override a preset by reusing its id, and a typo in one user tuning hides only
  that tuning, with a message saying which and why.
- Instrument kind doesn't restrict string count or range; the UI decides what to offer.
- Positions don't carry spellings: the UI spells `pitchClass` through the note functions with
  the sharp/flat preference, so the mapping doesn't depend on the root's spelling.

## ADR-22: Scale positions filter the fretboard mapping; 3NPS patterns take the lowest octave that fits

**Context.** M1.4 implements the two position systems of ADR-7 for the tab view (M1.10) and,
later, the fretboard. They must work for any tuning, 4–9 strings, any fret count and capo, and
any scale, including ones without seven notes. A 3NPS pattern is a fixed sequence of notes, so
on a short neck or above a capo it may not fit where it is usually played.

**Decision.** In `crates/theory/src/scale_positions.rs`, bound in
`crates/theory-wasm/src/positions.rs`:

- Both take what `positions` takes (tuning, frets, capo, pitch classes, root) and return
  `Position`s in ADR-18 coordinates, in **tab order**: lowest string (highest number) first,
  then by fret. The scale is a pitch-class set, not a `Scale`, so user scales and any set the
  UI already has work the same way, and the binding needs no catalog.
- `fret_window(…, start, span)` is literally `positions` filtered to frets
  `start … start + span − 1`, then put in tab order; it inherits the fret and capo rules and
  errors, and adds none (a span of 0 or a window off the neck is just empty).
- `three_notes_per_string` returns one `ThreeNpsPattern { degree, positions }` per scale
  degree, degrees counted up from the root over the distinct pitch classes. A pattern is the
  `3 × strings` consecutive scale notes up from its degree on the lowest string, three per
  string, low string to high, so it is strictly ascending for every tuning, re-entrant ones
  included. Of the octaves that degree has on the lowest string, the lowest one whose notes all
  lie between the capo and the last fret is used; if none does, the pattern is **left out**
  (never shifted, folded or cut short). The list is ordered by degree, so a missing degree
  shows that its pattern doesn't fit.
- Nothing depends on the scale having seven notes: smaller scales wrap into the next octaves.
- WASM: `fretWindow(tuning, frets, capo, pitchClasses, root, start, span)` and
  `threeNotesPerString(tuning, frets, capo, pitchClasses, root)` return `NotePosition`
  records (as `fretboardPositions`) and `ScalePattern { degree, positions }`.

**Consequences.**
- The tab view can show either system without any fretboard logic, and the fretboard can
  highlight a position with the same records it already draws.
- On 12 frets or with a high capo some 3NPS patterns are missing; the UI must show that
  rather than assume one per degree. A pattern with a large reach (a pentatonic, or a tuning
  in fifths) is generated as is: playability isn't judged.
- The binding module keeps its own copy of the tuning and position records of
  `fretboard.rs`, so the two can be merged into shared helpers later.

## ADR-23: The scale explorer: one layout, user catalogs loaded alike, labels looked up from the core

**Context.** M1.8 puts the pieces together: settings (ADR-17), the scale and tuning catalogs
(ADR-20, ADR-21) and the fretboard (ADR-18). Instrument settings (M1.9), the tab view
(M1.10), the editors (M1.11) and the chord panel (M2.5, ADR-10) all build on the layout. The
two catalogs loaded user files in two different ways (a stateful `setUserScales` with 0-based
errors; a stateless `tuningCatalog(userToml?)` with 1-based errors that threw for a broken
file), and the explorer is the first code that loads both.

**Decision.**
- **Layout.** `App.svelte` is a CSS grid with four named regions: `picker` (root and scale),
  `board` (the view toggles above the fretboard and the scale summary), `settings`
  (instrument settings: M1.9 mounts its panel there; until then it shows a summary) and
  `chords` (the docked chord panel, a placeholder until M2.5). On narrow windows they stack.
  The label-mode and sharp/flat toggles belong to the view and sit in `board`, not in
  `settings`. The regions render once the settings and the user catalogs have loaded, so the
  last view appears without a flash of the defaults.
- **The view is the settings.** Root, scale, label mode and sharp/flat are read from and
  written to the settings (`last_view.root`, `last_view.scale`, `display.labels`,
  `display.accidentals`); every change saves (ADR-17), so restart restores the view. The root
  is a text field with the 17 common spellings offered as suggestions (made by the core's
  `spellPitchClass`); what is typed is checked and normalised by `formatNoteName` (`db` →
  `D♭`) and stored as shown, keeping its spelling. A stored root, scale or tuning that can't
  be used is shown as the default with a note, but not overwritten.
- **Labels are looked up, not computed.** `explorerView()` asks the core for the scale's
  notes on the root (`scaleNotes`, names by the preference, root as typed) and for the
  positions (`fretboardPositions`), then labels each position by its pitch class from the
  scale's notes: the note name, or the scale's own interval label (`♯4` in Lydian, where the
  position's default label would be `♭5`). Degree 0 is the root (a square, ADR-18).
- **User catalogs load one way.** Both catalogs are held by the binding:
  `setUserScales(toml)` and `setUserTunings(toml)` replace the user items and return a
  `UserFileReport { loaded: string[], errors: UserFileError[] }`, where an error is
  `{ item: number | null, id: string | null, message }`: `item` 0-based, `null` for the file as
  a whole. Neither throws for a bad file; it is reported and leaves the built-ins.
  `listTunings()` and `getTuning(id)` read the tuning catalog as `listScales()`/`getScale()`
  read the scales; `fretboardPositions` keeps taking a tuning object, so an unsaved custom
  tuning can be shown too. The messages keep numbering items from 1, as people count them.
- **User files.** The documents `scales` and `tunings` (`scales.toml`, `tunings.toml` in the
  app-data folder) hold the user's scales and tunings in the built-in format. The app reads
  both at start (`loadUserCatalogs`); a missing document means none. Skipped items are listed
  in a collapsed note under the title, prefixed with the file name. The editors (M1.9, M1.11)
  write these documents and call the matching `setUser…` again.

**Consequences.**
- M1.9 replaces the content of the `settings` region and needn't move the view toggles; M2.5
  fills `chords`.
- The binding holds state for both catalogs, so the app must call the setter after every
  change to a user file. The catalogs are read once when the picker mounts: the editors will
  need a way to tell the picker the catalog changed (a revision value is enough; added by
  ADR-24).
- A user who edits `scales.toml` or `tunings.toml` by hand sees the change on the next start.
- `explorerView` is plain TypeScript over WASM calls, so it is tested without the DOM, and the
  component test checks every dot of A Dorian on standard tuning.

## ADR-24: Instrument settings: custom tunings saved by the core, stable generated ids, a catalog revision

**Context.** M1.9 fills the `settings` region (ADR-23) with the instrument panel: string count,
tuning presets, a per-string editor for custom tunings that the user can save, rename and
delete, fret count, capo, left-handed and theme. Saving means writing `tunings.toml`, which
until now only the user wrote. The catalogs live in the WASM binding, so the picker and the
neck can't see a change by themselves (ADR-23 asked for a revision value).

**Decision.**
- **Writing is the core's job.** `theory::write_tunings(&[Tuning])` writes the `[[tuning]]`
  format that `parse_tunings` reads back unchanged (a round-trip test checks it; notes are
  written with sharps, `F#3`, since a tuning has no spelling). Two tunings with one id are an
  error. The binding exports `writeTunings(tunings)`, which validates every tuning with
  `Tuning::new` and throws `“<name>”: <reason>`; the editor shows that message as is. The
  editor itself only checks form state: a non-blank name and a note and an octave on every
  string. Notes cross as pitch class plus octave through `noteParts` / `noteFromParts`, so the
  UI does no MIDI arithmetic.
- **Ids are generated once and then stable.** `TuningCatalog::new_id(kind, strings, name)`
  (WASM `newTuningId`) gives `<kind>-<strings>-<slug of the name>` like the built-ins, with
  `-2`, `-3`, … when the id is in the catalog or is a built-in id, so a new tuning never
  replaces another one. Overriding a built-in stays possible by writing its id into
  `tunings.toml` by hand. Renaming or editing a tuning keeps its id, so the settings keep
  pointing at it; the id's prefix is a hint, not checked.
- **Deleting** the selected tuning falls back to the string count's standard preset (or, for a
  user tuning that overrode a built-in id, to the built-in that comes back).
- **String count.** Switching picks that count's standard preset of the current kind
  (`bass-5-standard`), else the other kind's (four strings on a guitar give the four-string
  bass), else the first preset of the count. Not the last-used tuning per count: that would
  need new settings keys for little gain. Picking a tuning sets `strings` and `kind` to the
  tuning's, so the three never disagree. Presets are grouped by kind (Guitar, Bass); the
  user's tunings form their own group, labelled with their kind.
- **Frets and capo** reuse the settings validation (`SettingsStore.update` rejects what the
  file can't hold); the panel only clamps the capo to `frets - 1` when the neck gets shorter
  and shows a message when a value is refused.
- **The catalog revision.** `UserCatalogs` (`app/src/lib/user-catalogs.svelte.ts`, a context
  next to the settings store) loads the user documents, holds the user's tunings and has a
  `revision` counter that it bumps after every load and save. Components that read a catalog
  read `revision` in the same `$derived` (the picker, the explorer, the panel). The scale
  editor (M1.11) adds `saveUserScales` beside `saveUserTunings` and gets the refresh for free.
- **Broken items are not lost silently.** The app rewrites `tunings.toml` with only the
  tunings it understood, so before the first save over a file that had broken items it keeps
  the old text as `tunings-backup.toml` and says so. Comments in a hand-edited file are not
  kept.

**Consequences.**
- No TOML is built in TypeScript and no tuning rule is duplicated there.
- A saved custom tuning is in the preset list, on the neck and in `tunings.toml` at once, and
  after a restart.
- Ids are stable but can drift from the name and kind after an edit; nothing depends on that.
- The editor's string count is the selected tuning's: to make a 7-string tuning, switch to 7
  strings first.

## ADR-25: The tab view: core positions in playing order, absolute frets, never mirrored, stored without a version bump

**Context.** M1.10 shows a scale as tab in one position (SPEC §5.2) and highlights that
position on the neck. The positions exist in the core (ADR-22) in tab order. Still open: who
orders them for a direction, how a capo and the left-handed setting show in tab, how the
neck shows the position, what happens when a stored 3NPS pattern doesn't fit the current
neck, and whether storing the choice is a settings format change (ADR-17).

**Decision.**
- **The core picks the notes; the UI only selects and orders.** `app/src/lib/tab/position.ts`
  calls `fretWindow` or `threeNotesPerString` and picks one result. Directions are list
  operations on the core's tab order, which is ascending: *up* is tab order, *down* its
  reverse, *both* up and back down with the top note played once. No pitch is compared in
  TypeScript, so no new core function is needed; if a direction ever needs pitch (say,
  re-sorting a window whose strings overlap), it goes into `scale_positions.rs`.
- **Patterns are numbered from 1 by the degree they start on** ("Pattern 1 (from G)" is
  degree 0) and only the patterns that fit are offered; the missing numbers are named in a
  note. The setting keeps the degree; when that pattern doesn't fit (a shorter neck, a capo)
  the first that does is shown and the setting is left alone, so it comes back when the neck
  allows. A fret window that holds no note says so.
- **The tab component** (`TabView.svelte`) is presentational like the fretboard (ADR-18): it
  takes the lines (string 1 on top, labelled with the open note spelled by the core by the
  sharp/flat preference) and the notes in playing order, one column each. Root numbers are
  bold in `--fretboard-root`; no new token. Screen readers get a list of the notes.
- **Capo: fret numbers stay absolute** (ADR-18), as on the neck, and a caption says
  "Capo 3 (fret numbers are absolute)". A capo-relative tab would disagree with the neck and
  with the core's positions.
- **Left-handed doesn't mirror the tab.** Tab is notation read left to right by every
  player; only the neck is mirrored.
- **Highlighting dims the rest.** The neck still shows the whole scale, with the dots outside
  the position drawn `dim` (an existing role), so the position stands out without a new prop
  or token. "Highlight on the neck" turns it off; an empty position dims nothing.
- **Stored in `[tab]` of `settings.toml`, version 1 kept**: `system` (`"3nps"` | `"window"`),
  `pattern` (0–11), `window_start` (0–27), `window_span` (1–12), `direction` and `highlight`.
  Defaults: pattern 1, frets 5–8, ascending, highlight on. Adding keys whose absence means the
  default is not a format change in ADR-17's sense: every version 1 file still reads the same.
  Bumping the version would only make an older app back up and reset the whole file instead
  of warning about one unknown table.

**Consequences.**
- The tab follows the explorer's view: changing root, scale, tuning, frets, capo or spelling
  updates it at once, for 4–9 strings.
- A window wider than the gap between two strings lists a pitch twice, in tab order; that is
  what the window holds, and the tab shows it as it is.
- Export of the tab (M4) can reuse `TabView` and `tabPosition` as they are.
- Later additive settings can follow the same rule; a renamed or reinterpreted key still needs
  a version bump and a migration.

## ADR-26: Custom scales: a generic interval-set editor, names unique in the catalog, checks in the core

**Context.** M1.11 lets users make, edit and delete their own scales, by a 12-semitone picker
or by clicking notes on the neck, saved to `scales.toml` and listed like the built-ins. The
chord editor (M2.9) needs the same kind of form. Until now only the user wrote `scales.toml`,
and a user file could hold a "scale" of one note or two scales of one name, both of which look
broken in the picker. ADR-24 set the pattern for tunings: the core writes and checks the file,
ids are generated once, `UserCatalogs` tells the views.

**Decision.**
- **The core checks and writes.** `Scale::new` checks a scale as an item of a file is checked;
  `theory::write_scales(&[Scale])` writes the `[[scale]]` format that `parse_user_scales`
  reads back unchanged (intervals as ASCII labels, kept as written; `family` always written;
  `aliases` only when there are some; a round-trip property test checks it). The binding
  exports `writeScales(scales)`, which throws `“<name>”: <reason>`, and `newScaleId(name)`.
  `UserCatalogs.saveUserScales` writes the text and reloads the catalog, as
  `saveUserTunings` does, and keeps a file with broken items as `scales-backup.toml` before
  its first rewrite. The editor checks nothing itself; it shows the core's message.
- **A scale needs two notes.** The root is always in (the editor can't take it out), so "no
  notes" means only the root: every scale, in any file, needs at least one interval besides
  `1`. A user file with a one-note scale now reports that item and skips it.
- **A duplicate name is the same display name**, not the same id: ids are generated and
  never collide (below), while the name is what the picker shows. `write_scales` refuses two
  scales with one name in the catalog the file gives (the built-ins merged with the user's
  scales), ignoring case and runs of white space. A user scale that replaces a built-in by id
  may keep its name, since only one of them is listed. Aliases don't count. Reading a
  hand-edited file doesn't check names; only saving does.
- **Ids are generated once and then stable**, as for tunings: `ScaleCatalog::new_id(name)` is
  the kebab-case slug of the name (`custom` if it has no ASCII letters or digits), at most 64
  characters, with `-2`, `-3`, … when a scale in the catalog or a built-in has it. Renaming
  keeps the id, so the settings keep pointing at the scale.
- **One editor for interval sets.** `app/src/lib/editor/IntervalSetEditor.svelte` edits a
  name, a family and a set of intervals; what it edits (`noun`, the initial draft, the family
  suggestions) is passed in, so the chord editor can reuse it. Labels are looked up, never
  computed: a semitone the edited item had keeps its label (`♯4` stays `♯4`), a new one gets
  the core's default (`intervalLabel`). It has its own `Fretboard` with the current tuning,
  frets, capo, left-handed setting and root; a click toggles the interval of that position,
  taken from `fretboardPositions` over all twelve pitch classes.
- **Where it lives.** The scale picker has **New scale**, and **Edit scale** / **Delete
  scale** (with a confirmation) when the selected scale is the user's. The editor opens in a
  modal dialog from the picker, so `App.svelte` is unchanged; Escape or Cancel closes it.
  Saving a new scale selects it. Deleting the selected scale shows the built-in it replaced,
  or else the default scale.

**Consequences.**
- No TOML and no scale rule in TypeScript; a hand-edited file and the editor are checked by
  the same code.
- A hand-edited file with two scales of one name still loads, but every save is refused until
  one is renamed (the message names the scale).
- The picker offers only intervals within the octave; the chord editor will need to extend
  it to compound intervals (`9`, `#11`, `13`).
- Built-in scale names now constrain user names: a future built-in with a user's name makes
  that user's next save fail until it is renamed.

## ADR-27: The chord catalog: suffix symbols in the data, a full stack per chord, shared file reader

**Context.** M2.1 adds the chord catalog (ADR-5, ADR-20). The symbol parser and formatter
(M2.2), harmonize (M2.3), reverse lookup (M2.4), the chord panel, the custom chord editor
(M2.9) and the voicing generator (M2.11) all build on it. Chords use the scale formula format
but reach past the octave (`9`, `#11`, `13`), and each needs the names it is written with.

**Decision.**
- **Same format, own rules.** `crates/theory/data/chords.toml` holds `[[chord]]` tables with
  `id` (kebab-case, unique), `name`, `symbol`, optional `aliases`, `jazz_symbol` and `family`,
  and `intervals`; unknown fields are errors. A user chord with no `family` goes under
  `Custom`. The intervals are a `Formula` (ADR-20) with these extra rules: at least two
  (a power chord is the smallest), every interval below two octaves (`MAX_CHORD_SEMITONES`,
  24), and no two on one pitch class (`b5` with `#11` is an error), so a chord's tones are
  always distinct notes.
- **Symbols are data.** `symbol` is the chord's suffix, the part after the root, in ASCII
  (`maj7`, `m7b5`, `7#9`; empty for the major triad only). `aliases` are the other suffixes
  the parser accepts (`M7`, `Δ7`, `-7`, `ø`); `jazz_symbol` is the suffix for the Jazz display
  style where it differs (`Δ7`, `ø`, `°7`). Suffixes are matched case-sensitively, since `M7`
  and `m7` differ, and no suffix may mean two chords in the built-in catalog (a test checks
  it). The parser still normalises what it reads (flat and sharp signs, parentheses) and the
  formatter turns `b` and `#` into `♭` and `♯`; neither belongs in the core's data. When a
  merged catalog has one suffix twice, `find_by_symbol` picks the later chord, so a user
  chord wins over a built-in one.
- **A chord is its full stack.** `13` is `1 3 5 b7 9 13` and `m13` is `1 b3 5 b7 9 11 13`: the
  natural 11 is left out where it clashes with a major third and kept where it doesn't. The
  catalog doesn't say which tones may be dropped; the voicing generator (M2.11) decides that
  and may leave out the 5th, the root or the 9th.
- **Ids are readable, not clever.** `maj7`, `dom7`, `min7b5`, `dom7sharp9`, `minadd9`: a
  quality word (`maj`, `dom`, `min`, `dim`, `aug`), the number, then `sharp`/`flat` words,
  because `-` and `#` can't be part of an id's words. Like scale ids they are a contract
  with settings and user files.
- **One file reader.** `catalog_file` is the code that scales and chords share: the TOML
  list-of-tables layout, per-item errors (`CatalogError`, now saying `chord 2 (…)` or
  `scale 2 (…)`), the first id wins, and the kebab-case rule. `ChordCatalog` mirrors
  `ScaleCatalog`: `builtin`, `get`, `families`, `with_user_chords` (replace in place by id,
  others at the end), `parse_user_chords`. Writing the user chord file and generating ids
  come with the editor (M2.9).
- **Spelling is the scale rule.** `Chord::notes(root, accidentals)` spells every tone by the
  sharp/flat preference and keeps the root as given (ADR-6); labels such as `#9` stay as
  written in the data and in the result.
- **WASM.** `chords.rs` exports `listChords`, `getChord`, `chordNotes` and `setUserChords`,
  holding one current catalog like `scales.rs`; `setUserChords` returns the shared
  `UserFileReport` (ADR-23).

**Consequences.**
- Adding a chord is a data change; the catalog test rejects a repeated suffix, name or
  interval set.
- M2.2 reads suffixes from the catalog instead of a table of its own, so a user chord with a
  symbol becomes typeable without parser changes.
- A user chord can take a suffix from a built-in chord (`m7`); the parser then reads it as the
  user's chord. That is the same shadowing as for ids, and the user can undo it by deleting
  their item.
- Chord names are not checked for duplicates when a user file is read, only (by M2.9) when
  it is saved, as for scales (ADR-26).

## ADR-28: Audio: a rendered Karplus–Strong buffer, an injectable engine, nothing before a gesture

**Context.** ADR-12 chose a Karplus–Strong string synth in Web Audio. M2.10 builds it, and the
chord panel (M2.5) and voicing browser (M2.12) will call it, so its interface has to be small
and testable without a sound card. Browsers refuse to start audio before a user gesture.

**Decision.**
- **The string is rendered to a buffer.** `renderPluck(frequency, sampleRate)` runs the
  Karplus–Strong loop (noise burst, averaging low-pass, a loss factor that gives about the
  same decay at every pitch, a first-order all-pass for the fractional delay) into a mono
  `Float32Array`, played by an `AudioBufferSourceNode`. A loop of Web Audio nodes can't be
  shorter than one 128-sample render quantum, which would put every note above about 340 Hz
  out of tune; an `AudioWorklet` needs a separate module file and is harder to test. The
  noise is seeded from the pitch, so a note always sounds the same and tests are exact. A
  buffer costs about a millisecond to render, so notes are rendered when played, not cached.
- **The frontend does no theory.** The engine takes MIDI note numbers the core already gives
  (`NotePosition.midi`, `Tuning.notes`). Converting one to hertz (`440·2^((n−69)/12)`, A4 =
  440 Hz) is signal processing for the synth, not theory, and stays in `audio/synth.ts`.
  The explorer looks a clicked dot's pitch up in a map built from `fretboardPositions`; it
  never adds a fret to an open string itself.
- **One small engine, `AudioEngine`** (`app/src/lib/audio/`), reached with `getAudio()`:
  `playNote(midi)` adds a note on top of what rings; `playSequence(midis, {interval})` plays
  notes one after another (a scale up, down, or both, in the order the caller gives, which
  for the tab is `playingOrder`); `strum(midis, {direction, spread})` plays a chord's notes
  a few milliseconds apart, lowest string first for a downstrum (the order of `Tuning.notes`,
  muted strings left out), each quieter by 1/√n so a chord doesn't clip; `stop()` fades
  everything out. A sequence or strum replaces what was playing. Timing and velocities are
  built by pure functions (`sequenceEvents`, `strumEvents`) the engine only plays.
- **Everything the engine needs from the platform is injected**: the `AudioContext` factory,
  the renderer and the user-gesture tracker. Tests run it with a fake context that records
  start times and connections.
- **No context before a user gesture.** The engine creates its `AudioContext` lazily inside
  the first play call, and only after a click, touch or key press was seen in the document
  (capture listeners, removed after the first). A play call before then, or while muted, or
  at volume 0, returns `false` and creates nothing. This also covers a later automatic
  playback: it stays silent until the user has interacted.
- **Volume and mute are settings.** `settings.toml` gets an `[audio]` table: `volume` (whole
  percent, default 70) and `muted` (default false). Absent means the default, so the format
  version stays 1 (ADR-25). They are saved through `Storage`, so both implementations keep
  them (ADR-4). A master gain node applies them; the volume slider changes the sound while
  it is dragged and is saved when released. The gain is the volume squared, so the slider
  feels even.
- **What "Play" plays.** The explorer's Play button plays the tab's position (the 3NPS
  pattern or fret window) in the tab's direction setting, so what sounds is what the tab
  shows.

**Consequences.**
- The synth sounds like a synth, as ADR-12 says; the string is fixed (no pick position,
  body or palm mute). More voices would need their own renderer behind the same `render`
  option.
- A sound cut off while ringing fades over a few milliseconds; a note stays in memory (about
  0.5 MB at 48 kHz) until it ends.
- Where the webview has no Web Audio the engine returns `false` and the app stays silent
  without errors.
- The chord panel calls `getAudio().strum(midis)` with the notes of a voicing, lowest string
  first.
