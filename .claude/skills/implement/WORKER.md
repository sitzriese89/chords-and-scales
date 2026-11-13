# Worker brief

The coordinator fills in `<…>` and passes this as the worker's prompt. Add what the
coordinator knows that the issue doesn't say: related issues, files other workers are editing
right now, what is deliberately out of scope.

---

You are implementing GitHub issue #<n> (roadmap item <id>, "<title>") in
sitzriese89/chords-and-scales, a Rust + Tauri 2 + Svelte app that shows scales and chords on a
guitar/bass fretboard. You work in your own git worktree. Do the whole job yourself and open a
PR; the coordinator reviews and merges it.

**Read first:** AGENTS.md, CONTRIBUTING.md, the SPEC.md sections and ADRs that bear on the
change, the Status section of docs/roadmap.md, and `gh issue view <n>`. The issue's scope and
"Done when" are authoritative. Then read the code you will change.

**Context from the coordinator:** <related issues, decisions already made>

**Other workers right now:** <issue: files>. Leave those files alone unless the issue can't
be done without them; if so, say so in your report. One-line `mod` / `pub use` additions in
`crates/theory/src/lib.rs` or `crates/theory-wasm/src/lib.rs` are fine.

**Out of scope:** <later issues this one must not absorb>

**Finish line**
- Tests that fail without the change and pass with it. Core: unit tests, property tests where
  an invariant exists. Catalog data: passes the validation tests. WASM exports: a TS-side
  test calling them. UI: vitest component tests.
- A design decision gets a new ADR appended to ADR.md. User-facing changes update README or
  SPEC.md.
- Run `pnpm --dir app install` once in your worktree. In bash,
  `export CARGO_TARGET_DIR='C:\t\c<n>'`, then all pass:
  `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace`, `pnpm --dir app check`, `pnpm --dir app lint`,
  `pnpm --dir app test`, `pnpm --dir app build`.
- UI changes: start `pnpm --dir app dev` and check the change in a browser.

**Git and PR**
- Branch `<type>/<short-name>`. Use the Bash tool for git and gh. Commit with
  `git commit -F msg-<n>.txt`, written fresh in your temp dir for every commit (the
  coordinator and other workers keep their own message files there). Messages end with a
  blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check
  `git log -1` before pushing: a pushed commit can't be rewritten.
- PR body: what and why, how it was tested, `Fixes #<n>`, ending with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- After `gh pr create`, set the item's row in docs/roadmap.md to `Done (#<PR>)` in a follow-up
  commit and push. Wait for CI (`gh pr checks <PR> --watch`) and fix what fails.

**Report** (short): PR URL, CI result, design choices, how you verified, what is left open or
questionable, and anything worth trying by hand in the app.
