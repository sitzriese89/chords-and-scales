# chords-and-scales
Chords and scales visualization tool for different guitar tunings and other useful features.

What it does: [SPEC.md](SPEC.md). Plan and status: [docs/roadmap.md](docs/roadmap.md).
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · design decisions: [ADR.md](ADR.md).

## Quick start

Early development: there are no releases yet. To run it from source you need Rust (with the
`wasm32-unknown-unknown` target), Node.js LTS with pnpm, and the Tauri 2 system dependencies;
[CONTRIBUTING.md](CONTRIBUTING.md#development-setup) has the details.

```bash
pnpm --dir app install
pnpm --dir app dev         # in a browser: http://localhost:1420
pnpm --dir app tauri dev   # as a desktop app
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
