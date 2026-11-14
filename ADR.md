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
| 21 | [Tunings list strings low to high; positions come out in fretboard coordinates](#adr-21-tunings-list-strings-low-to-high-positions-come-out-in-fretboard-coordinates) | Accepted |

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
  in TypeScript by a custom section; labels and note names are Unicode.

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
  object back (validated again), so the core keeps no state.

**Consequences.**
- The scale explorer passes positions to the fretboard without remapping; only the core
  converts between "low string first" and "string 1 on top".
- A user can override a preset by reusing its id, and a typo in one user tuning hides only
  that tuning, with a message saying which and why.
- Instrument kind doesn't restrict string count or range; the UI decides what to offer.
- Positions don't carry spellings: the UI spells `pitchClass` through the note functions with
  the sharp/flat preference, so the mapping doesn't depend on the root's spelling.
