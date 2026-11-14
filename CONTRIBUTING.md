# Contributing

Thanks for helping! Bug reports, scale and chord knowledge, and code are all welcome. Before
larger changes, read [SPEC.md](SPEC.md) (what the app does) and [ADR.md](ADR.md) (why things are
the way they are). Opening an issue to discuss is a good first step.

## Development setup

Prerequisites (all platforms):

1. [Rust](https://rustup.rs) stable, with the `wasm32-unknown-unknown` target:
   `rustup target add wasm32-unknown-unknown`.
2. [Node.js](https://nodejs.org) LTS (24) and [pnpm](https://pnpm.io) (the version is pinned in
   `app/package.json`; `corepack enable` or `npm install -g pnpm` both work).
3. Tauri 2 system dependencies ([Tauri prerequisites](https://tauri.app/start/prerequisites/)):
   on Windows the Visual Studio C++ Build Tools and WebView2; on Debian/Ubuntu
   `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libxdo-dev libssl-dev`;
   on macOS the Xcode command line tools.

Then, from the repository root:

```bash
pnpm --dir app install   # frontend tooling, including wasm-pack
pnpm --dir app dev       # builds the WASM package, serves the UI on http://localhost:1420
```

The page shows the theory core's version, read from Rust through WASM. `pnpm --dir app tauri dev`
shows the same page in a desktop window (the first build compiles Tauri and takes a few minutes).

How the pieces fit:

- The Cargo workspace (root `Cargo.toml`) holds `crates/theory`, `crates/theory-wasm` and the
  Tauri shell `app/src-tauri`.
- `pnpm --dir app wasm` runs `wasm-pack build --target web` on `crates/theory-wasm` and writes
  the package to `app/src/lib/wasm/` (generated, git-ignored). `dev`, `build`, `check` and
  `test` run it first, so you rarely call it yourself (ADR-14).
- The UI imports theory functions from `app/src/lib/theory.ts`, which loads the WASM module
  once (`initTheory()`) before the app mounts.
- Vite's dev server runs on port 1420; `app/src-tauri/tauri.conf.json` points Tauri at it in
  dev and at `app/dist` for release builds.
- CI (`.github/workflows/ci.yml`) runs the checks from [AGENTS.md](AGENTS.md) on Linux and
  clippy plus tests for the whole workspace, Tauri included, on Windows.

> **`LNK1104: cannot open file ...` while linking on Windows?** The build path is too long for
> the linker. Clone to a short path or set `CARGO_TARGET_DIR` to a short folder.

## Everyday commands

| What | Command |
|---|---|
| UI in a browser (fast iteration) | `pnpm --dir app dev` → http://localhost:1420 |
| Fretboard fixture page (dev only) | `pnpm --dir app dev` → http://localhost:1420/dev/fretboard.html |
| Desktop app | `pnpm --dir app tauri dev` |
| Rust tests | `cargo test --workspace` |
| Rust format / lint (CI fails on warnings) | `cargo fmt --all` / `cargo clippy --workspace --all-targets -- -D warnings` |
| Frontend type check / lint / tests | `pnpm --dir app check` / `pnpm --dir app lint` / `pnpm --dir app test` |
| Production build (incl. WASM) | `pnpm --dir app build` |
| Rebuild only the WASM package | `pnpm --dir app wasm` |
| Format the frontend | `pnpm --dir app format` |

## Project layout

```
crates/theory/          pure music theory (no IO, no UI)
  data/                 built-in catalogs and rules (TOML, embedded)
crates/theory-wasm/     wasm-bindgen bindings, one module per core area
app/                    Svelte + TypeScript frontend (Vite)
  dev/                  dev-only fixture pages (not built)
  src-tauri/            Tauri 2 shell: filesystem commands only
docs/                   roadmap, background
```

## Common contributions

### Add a scale, chord or tuning

Edit the TOML in `crates/theory/data/`. Run `cargo test -p theory`: the catalog validation
tests reject unknown fields, duplicate ids and malformed interval lists. Tunings
(`tunings.toml`, format in SPEC §5.1) use ids `<kind>-<strings>-<name>`, list their notes
lowest string first, and must keep a standard preset for every string count 4–9.

A scale is one `[[scale]]` table in `scales.toml` with `id`, `name`, optional `aliases`,
`family` and `intervals` (format in SPEC §4.2). Put it in its family's block; families are
listed in the order they first appear. Write the interval labels the scale means (`#4`, not
`b5`, in Lydian). Don't rename existing ids: settings and user files refer to them.

### Tune mood tags

Weights and thresholds live in the tag rules TOML in `crates/theory/data/` (ADR-9). Say in the
PR which scales/chords changed tags and why.

### UI

Svelte + TypeScript in `app/src`. Use `pnpm --dir app dev` for fast iteration. The UI calls the
theory core through the WASM package and never does theory itself. Stored data goes through the
`Storage` interface (ADR-4); a new stored document must work in both the Tauri and the browser
implementation.

Presentational components can be looked at on dev-only fixture pages in `app/dev/`, with
hand-written sample data (ADR-18). `pnpm --dir app dev` serves them; `vite build` leaves them
out.

- Fretboard (`app/src/lib/fretboard/`):
  http://localhost:1420/dev/fretboard.html. The controls set strings, frets, capo, labels,
  width, left-handed, colour by degree and a dimmed overlay; the same settings work as URL
  parameters, e.g. `?strings=9&frets=27&capo=2&left&degrees&overlay&labels=intervals`.

## Tests

- Core: unit tests plus property tests (transposition round trips, mode rotations, symbol
  parse/format round trips). New behaviour needs a test that fails without the change.
- Frontend: vitest component tests; WASM exports get a TS-side test.
- Keep `cargo fmt`, `cargo clippy -D warnings`, `svelte-check` and lint clean; CI checks them.

## Pull requests

- One topic per PR, with a short description of what and why.
- A design change? Add or supersede a record in [ADR.md](ADR.md) in the same PR.
- User-facing behaviour changed? Update README or SPEC.md.
- Finishes a roadmap item? Set its Status in [docs/roadmap.md](docs/roadmap.md) in the same PR.
- By contributing you agree that your contribution is dual-licensed under the project's
  MIT and Apache-2.0 licenses.

## Releasing

Releases are built by `.github/workflows/release.yml` when a tag `v<version>` is pushed
(ADR-16). It produces a **draft** GitHub Release; nothing is published without a person.

1. In a PR, set the new version everywhere and describe it:
   - `version` in `[workspace.package]` of the root `Cargo.toml` (the crates inherit it), then
     run `cargo check --workspace` so `Cargo.lock` follows;
   - `version` in `app/package.json` (`tauri.conf.json` has none; Tauri takes the crate's);
   - in `CHANGELOG.md`, a section `## [<version>] - <date>` with what changed for users, written
     from the PRs merged since the last tag (move what is under `[Unreleased]` into it).
2. Check locally: `node scripts/check-release.mjs v<version>` must pass. Its self-test is
   `node --test scripts/check-release.test.mjs` (CI runs it too).
3. Merge, then tag the merge commit on `main` and push the tag:
   `git tag v<version> && git push origin v<version>`.
4. The workflow checks the versions and the changelog section first and stops there on a
   mismatch. Then it builds Windows (NSIS `.exe`), macOS (universal `.dmg`) and Linux
   (`.AppImage`, `.deb`) and creates the draft with the installers, `SHA256SUMS.txt` and the
   changelog section as release notes. Versions with a pre-release part (`0.2.0-beta.1`) become
   pre-releases.
5. Download the installers, check they start and show the fretboard on each OS (the release
   gate in [docs/roadmap.md](docs/roadmap.md)), then publish the draft on GitHub.

A failed build can be re-run from the Actions page; the last job updates the existing draft.
A wrong tag: delete the draft (`gh release delete v<version> --yes`) and the tag
(`git push origin :refs/tags/v<version>`, `git tag -d v<version>`), fix, tag again.

The builds are unsigned (no code signing or notarisation yet); README's Install section says
how users open them. To try the workflow without releasing, push a branch where every version
is a pre-release such as `0.0.0-test.1`, tag it `v0.0.0-test.1`, and delete the tag, branch
and draft afterwards.

## Working with AI coding agents

Agents are welcome contributors too. [AGENTS.md](AGENTS.md) has the short version of the
conventions above. With Claude Code, the `implement` skill (`.claude/skills/implement/`) runs one
background worker per issue, each in its own git worktree and PR, and reviews and merges the PRs
with you.
