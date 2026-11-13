# Notes for AI coding agents

Chords & Scales: a Rust + Tauri 2 desktop app (Svelte + TypeScript UI) that shows scales,
modes and chords on a 2D fretboard for guitars and basses with 4–9 strings. What it does is
specified in [SPEC.md](SPEC.md). Read [ADR.md](ADR.md) before changing direction;
[CONTRIBUTING.md](CONTRIBUTING.md) has the full developer guide.

Scope, order and status are in [docs/roadmap.md](docs/roadmap.md): one GitHub issue per item,
worked one issue per PR. Before picking or starting work, read its Status section and the
**Now** marker, and run `gh pr list` for what is already in review.

Issues are implemented by background workers, one per issue in its own worktree and PR, with
this session as coordinator: use the `implement` skill.

## Ground rules

- `crates/theory` is pure music theory: no IO, no UI, no `wasm-bindgen`, no Tauri. Everything
  it knows is unit-testable with `cargo test` (ADR-2).
- `crates/theory-wasm` is a thin binding layer: one module per core area
  (`notes.rs`, `scales.rs`, `fretboard.rs`, …). No theory logic in it.
- The frontend never does music theory (no interval math, no spelling, no chord naming in TS).
  It calls the core through WASM.
- Tauri commands exist only for filesystem work (user files, export output). Anything the app
  stores goes through the TypeScript `Storage` interface, which has a Tauri and a browser
  implementation that pass the same test suite (ADR-4).
- Catalogs and rules are data: scales, chords, tunings and mood-tag rules live in TOML under
  `crates/theory/data/`, embedded at build time. Add a scale by editing TOML, not code (ADR-5).
- 12-TET only. Spelling follows the global sharp/flat preference; only the root keeps the
  spelling the user typed or picked (ADR-6).
- English only for UI text and note names.
- Significant design decisions get a new ADR in `ADR.md` (append; supersede, don't rewrite).

## Before you finish

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm --dir app check      # svelte-check + tsc
pnpm --dir app lint
pnpm --dir app test       # vitest
pnpm --dir app build      # also builds the WASM package
```

New core behaviour needs tests that fail without the change; catalog data needs to pass the
catalog validation tests. New WASM exports need a TS-side test that calls them. A PR that
finishes a roadmap item sets its Status row in `docs/roadmap.md` (rules in its Status section).

## Checking UI changes

- Browser: `pnpm --dir app dev`, open http://localhost:1420. The full app runs there with the
  browser `Storage` implementation (ADR-4).
- Real app window: `pnpm --dir app tauri dev`.
- On Windows, if linking fails with `LNK1104`, set `CARGO_TARGET_DIR` to a short path.
