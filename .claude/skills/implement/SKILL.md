---
name: implement
description: Coordinate implementing roadmap items and GitHub issues through background workers, one per issue, each in its own git worktree and PR. Use when the user asks to implement or fix an issue ("implement #12"), to work on the next roadmap items, or to merge the resulting PRs.
---

# Implementing issues: coordinator and workers

This session is the **coordinator**. It picks issues, dispatches one **worker** per issue,
reviews each worker's PR and merges with the user's approval. Workers do the coding; the
coordinator keeps the overview and stays out of the files workers are editing.

## 1. Pick

1. Read the Status section and the **Now** marker in `docs/roadmap.md`, and run `gh pr list`.
2. `gh issue view <n>` for each candidate. Note its "Done when", its dependencies and the files
   it will touch.
3. Group into **waves**. Issues in one wave touch disjoint files and don't depend on each other.
   Known shared files: `crates/theory/src/lib.rs` and `crates/theory-wasm/src/lib.rs` (one-line
   `mod`/`pub use` additions; fine in parallel, resolved at merge), `app/src/App.svelte` and the
   app layout, the settings schema, `app/package.json` / `Cargo.toml` dependency lists. Anything
   heavier on a shared file waits for the earlier issue to merge.

Done when: every chosen issue is in a wave, and the user knows the waves.

## 2. Dispatch

Per issue in the current wave, start an `Agent` with `isolation: "worktree"` and
`run_in_background: true`, using the brief in [WORKER.md](WORKER.md) with its placeholders
filled in. Give each worker its own `CARGO_TARGET_DIR` (`C:\t\c<issue>`) so parallel builds
don't lock each other.

While workers run, the coordinator does work outside their files: docs, the roadmap, answering
the user. It never predicts a worker's result before its notification arrives.

## 3. Review

When a worker reports:

1. Read the PR diff (`gh pr diff <n>`) against the issue's "Done when" and the ground rules in
   AGENTS.md. Check: tests that would fail without the change; no theory logic in
   `theory-wasm` or the frontend; no IO in `crates/theory`; catalog changes are TOML, not code;
   stored data goes through `Storage` and works in both implementations; roadmap Status row set;
   ADR for a design decision; README/SPEC for user-facing changes.
2. UI changes: run `pnpm --dir app dev` in the worker's worktree (or on the PR branch) and look
   at it in the browser.
3. CI green (`gh pr checks <n>`). A red check caused by the toolchain, not the PR, gets its own
   small fix PR first.
4. Problems go back to the same worker via `SendMessage`, so it keeps its context.

Done when: each PR is either ready or sent back with concrete fixes.

## 4. Merge

Merging is the user's call: present the ready PRs, the order, and ask.

1. When several PRs touch the same files, merge them all into a scratch branch from
   `origin/main` first and run the full check list from AGENTS.md on the combination.
   Text-clean merges can still break the build (two `mod` lines, two dependency bumps).
2. Merge in order with `gh pr merge <n> --merge`, checking `mergeStateStatus` is `CLEAN`
   before each.
3. Watch main's CI after the last merge.
4. Then: start the next wave, and move the **Now** marker when a roadmap milestone is complete.

Done when: main is green, roadmap Status matches what merged, and the user has a short summary
(PRs, what each does, what to try in the app, what's next).

## Gotchas

- Use the Bash tool for `gh`/`git` commands with quotes or `--jq`; PowerShell splits the
  arguments. Commit with `git commit -F <file>` and a message file in the scratchpad.
- Each worktree needs its own `pnpm install` (the pnpm store is shared, so it's fast).
- Runs stuck "queued" with 0 jobs after a GitHub outage can't be cancelled or deleted; ignore
  them. The next push starts a fresh run.
- The runners use the latest stable Rust. Run `rustup update stable` locally when CI's clippy
  disagrees with yours.
