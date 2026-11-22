# chords-and-scales
Chords and scales visualization tool for different guitar tunings and other useful features.

What it does: [SPEC.md](SPEC.md). Plan and status: [docs/roadmap.md](docs/roadmap.md).
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · design decisions: [ADR.md](ADR.md).

## Using it

Pick a root from the dropdown (all 17 names, both spellings of each black key) or type one
(`A`, `F#`, `Db`), and pick a scale from the list on the left (search by name or alias); the
neck shows the scale over every fret. **New scale** under the list makes
your own scale: pick intervals on the 12-semitone picker or click notes on the neck, then
give it a name and, if you like, a family. Your scales are listed with the others (under
*Custom* unless you named a family) and can be edited and deleted there. Above the neck,
switch the dot labels between note names, intervals and none, and the spelling between
sharps and flats (the root keeps the spelling you chose). On the right, pick the number of
strings (4–9) and a tuning, set the fret count and a capo, mirror the neck for left-handed
playing; under **Appearance**, pick a theme (Default, High contrast, Atom One, Catppuccin, Dracula, Nord,
Print or your own) and
light, dark or follow the system. Under the neck, the scale is shown as tab
in one position: a 3-notes-per-string pattern (those that fit the neck) or a fret window you
set with a start fret and a width, played up, down or up and back down; the position's notes
are highlighted on the neck. **New tuning** makes your own tuning, a note and octave per
string; your tunings can be edited and deleted there too. Click a dot to hear the note, or
press **Play** next to the tab to hear the position; volume and mute are under **Sound** on
the right. The **Chords** panel under the neck shows a chord on the neck: pick a root and a
chord quality, a degree of the current scale as a triad or 7th chord, which shows the chord
emphasized over the dimmed scale, or type a symbol such as `F#m7b5`, `CΔ7` or `G7/B` (a
symbol it can't read is marked where it goes wrong). **Harmonize**, next to the scale's
notes, lists the chord on every degree of the scale with its Roman numeral (triads or 7th
chords; "no chord" where none forms, as on most degrees of a pentatonic scale); click one to
show it on the neck over the scale. **Select notes**, above the neck, works the other way
round: click notes on the neck (click one again to take it out) and the chords they make
(slash chords and chords without their 5th included, the lowest note as the bass) and the
scales that contain them are listed, best first, as you click. Click a chord to show it in the
Chords panel and on the neck, or a scale to make it the scale; **Save as scale** and **Save as
chord** open the editors with your notes, on the lowest one; **Clear selection** starts again.
**Chord names** switches every chord name between
Standard (`Cmaj7`, `Cm7♭5`) and Jazz (`CΔ7`, `Cø`). **Strum** plays the chord. Under it,
**Voicings** lists the best playable shapes of the chord on your instrument, tuning and capo
as chord diagrams, best first; set the widest fret span and whether open strings, muted
strings and inversions are allowed. Click a shape to hear it and to see just that shape on
the neck; click it again (or **Show all positions**) to see the whole neck again.
**Collapse** and the panel's top edge (drag, or the arrow keys) fold and resize the panel.
**New chord**, under the chord quality, makes your own chord: pick intervals over two octaves
(`♭9`, `♯11`, `13` above the octave) or click notes on the neck, give it a name, the symbol
written after the root (`m7b5`) and, if you like, a Jazz symbol and a family. Your chords are
listed with the others (under *Custom* unless you named a family), can be typed by their
symbol, and can be edited and deleted there. Every scale and chord in the lists shows its
mood tags (`Phrygian — dark, …`); click the tag chips above the scale list or above the chord
quality to list only the items with every tag you picked (**Clear tags** shows them all
again). The tags come from the intervals, so your own scales and chords get them too.
For a practice prompt, **Random scale** (in the scale picker) and **Random chord** (with the
chord quality) pick a random root and an item from what the tags let through: a random dark
scale, a random jazzy chord.
To collect things for printing or sharing, use **Add scale to sheet**, **Add tab to sheet**,
**Add chord to sheet** and, with a voicing chosen, **Add shape to sheet**; **Sheet** at the
top shows the sheet, where you set its title and its own theme (Print by default), and move
or remove items. Each item is drawn as it was when you added it. **Export sheet as SVG**,
**Export sheet as PNG** and **Export sheet as HTML** save the whole sheet, and **Export SVG**
and **Export PNG** next to an item save just that item; the files keep the sheet's theme and
open on their own, offline, in a browser or an editor such as Inkscape. PNGs are drawn at the
**PNG scale** you pick (2× by default, sharp on high-resolution screens). **Print or save as
PDF** prints only the sheet, with no item split across pages; pick "Save as PDF" (or
"Microsoft Print to PDF") in the print dialog for a PDF.
Everything is saved and comes back at the next start. Your own scales, chords and tunings go
in `scales.toml`, `chords.toml` and `tunings.toml` next to `settings.toml` in the app-data
folder, in the format described in [SPEC.md](SPEC.md), and the sheet in `sheet.toml`; your own tag rules go in `tags.toml`
([docs/tag-rules.md](docs/tag-rules.md)). Your own themes go there too, as
`theme-<name>.css` files; the format and the folder for each OS are in
[docs/theme-tokens.md](docs/theme-tokens.md).

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
