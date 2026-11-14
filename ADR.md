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
| 19 | [Theme tokens are hand-written CSS, checked by tests](#adr-19-theme-tokens-are-hand-written-css-checked-by-tests) | Accepted |

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
