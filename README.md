# chords-and-scales
Chords and scales visualization tool for different guitar tunings and other useful features.

What it does: [SPEC.md](SPEC.md). Plan and status: [docs/roadmap.md](docs/roadmap.md).
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · design decisions: [ADR.md](ADR.md).

## Install

Early development: there are no releases yet. Once there are, installers for Windows, macOS
and Linux are on the [Releases](https://github.com/sitzriese89/chords-and-scales/releases)
page, with what changed in [CHANGELOG.md](CHANGELOG.md).

| OS | File |
|---|---|
| Windows 10/11 (x64) | `Chords-and-Scales_<version>_x64-setup.exe` |
| macOS 11+ (Apple silicon and Intel) | `Chords-and-Scales_<version>_universal.dmg` |
| Linux (x86_64) | `Chords-and-Scales_<version>_amd64.AppImage`, or `Chords-and-Scales_<version>_amd64.deb` for Debian/Ubuntu |

The builds are **not code-signed** yet, so your OS warns before the first start:

- **Windows:** SmartScreen says "Windows protected your PC". Click **More info**, then
  **Run anyway**.
- **macOS:** Gatekeeper says the app "cannot be opened" or "is damaged". Drag the app to
  Applications, then right-click (Control-click) it, choose **Open** and confirm. If there is no
  Open button (newer macOS), open **System Settings → Privacy & Security** and click
  **Open Anyway**, or remove the quarantine flag in a terminal:
  `xattr -dr com.apple.quarantine "/Applications/Chords & Scales.app"`.
- **Linux:** make the AppImage executable, then run it:
  `chmod +x Chords-and-Scales_*.AppImage && ./Chords-and-Scales_*.AppImage`. The deb installs
  with `sudo apt install ./Chords-and-Scales_*_amd64.deb`.

To check a download, compare it with `SHA256SUMS.txt` from the same release:
`sha256sum -c SHA256SUMS.txt --ignore-missing` (Linux), `shasum -a 256 -c SHA256SUMS.txt
--ignore-missing` (macOS) or `Get-FileHash <file>` (Windows PowerShell).

## Run from source

You need Rust (with the `wasm32-unknown-unknown` target), Node.js LTS with pnpm, and the
Tauri 2 system dependencies; [CONTRIBUTING.md](CONTRIBUTING.md#development-setup) has the
details.

```bash
pnpm --dir app install
pnpm --dir app dev         # in a browser: http://localhost:1420
pnpm --dir app tauri dev   # as a desktop app
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
