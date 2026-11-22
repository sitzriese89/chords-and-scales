# Theme tokens

The app and its exports are styled by one set of CSS custom properties, the theme tokens
(ADR-11, ADR-19). A **theme** is a CSS file that sets them, for a light scheme, a dark scheme
or both (ADR-40). This page describes the theme file format, where user themes go, and what
each token is for.

**The names are a contract.** Built-in, user and (v4) export themes set these properties.
Adding a token is fine; renaming or removing one is a breaking change and needs an ADR.

## Themes and schemes

The **Appearance** section of the settings has two choices, both saved in `settings.toml`:

- **Theme** (`display.theme_id`): which theme. Built-in first, then *Your themes*.
- **Light or dark** (`display.theme`): `system` (follow the OS), `light` or `dark`. A theme
  that has only one scheme always shows that one; the choice is kept for the next theme.

| Built-in theme | Id | Schemes | File |
|---|---|---|---|
| Default | `default` | light, dark | [`default.css`](../app/src/styles/themes/default.css) |
| High contrast | `high-contrast` | light, dark | [`high-contrast.css`](../app/src/styles/themes/high-contrast.css) |
| Atom One | `atom-one` | light (One Light), dark (One Dark) | [`atom-one.css`](../app/src/styles/themes/atom-one.css) |
| Catppuccin | `catppuccin` | light (Latte), dark (Mocha) | [`catppuccin.css`](../app/src/styles/themes/catppuccin.css) |
| Dracula | `dracula` | light (Alucard), dark (Dracula) | [`dracula.css`](../app/src/styles/themes/dracula.css) |
| Nord | `nord` | light (Snow Storm), dark (Polar Night) | [`nord.css`](../app/src/styles/themes/nord.css) |
| Print | `print` | light | [`print.css`](../app/src/styles/themes/print.css): white paper, black ink, a white fingerboard |

The app parses the chosen theme, writes it into one `<style>` element and sets
`data-scheme="light"` or `"dark"` on the root element (`applyTheme()` in
[`app/src/lib/themes/apply.ts`](../app/src/lib/themes/apply.ts)). With *System* it follows
`prefers-color-scheme` as it changes. The generated stylesheet also sets `color-scheme`, so
scrollbars and native form controls match. Exports can reuse the same stylesheet
(`themeCss()`): it styles whatever element carries `data-scheme`.

## Theme file format

```css
/* Comments are fine anywhere. */
:root {
  --theme-name: 'Solar';
}

[data-scheme='light'] {
  --surface: #fdf6e3;
  --text: #073642;
  /* … any of the tokens below … */
}

[data-scheme='dark'] {
  --surface: #002b36;
  --text: #eee8d5;
}
```

- `--theme-name` in a `:root` block is the name in the picker (up to 48 characters). Without
  it the name comes from the file name: `theme-solar-flare.css` is "Solar flare".
- One `[data-scheme='light']` block, one `[data-scheme='dark']` block, or both. The quotes
  around `light`/`dark` may be single, double or none.
- Inside them only theme tokens, each an opaque `#rrggbb` (any case). `color-scheme` is
  allowed and ignored (the app sets it from the scheme).
- No other selectors, no at-rules (`@media`, `@import`, …), no nesting. Anything else is
  ignored with a warning; a nested block makes the file unusable.

The easiest start is to copy a built-in file from the table above and change values.

### Where user themes go

A user theme is the file **`theme-<id>.css`** in the app-data folder, next to
`settings.toml`: for example `theme-solar.css`, id `solar`. The `<id>` is 1–64 lowercase
letters, digits, `-` or `_`, starting with a letter or digit. Theme files are read when the
app starts. A user theme with a built-in's id (`theme-print.css`) replaces that built-in.

| OS | App-data folder |
|---|---|
| Windows | `%APPDATA%\io.github.sitzriese89.chords-and-scales\` |
| macOS | `~/Library/Application Support/io.github.sitzriese89.chords-and-scales/` |
| Linux | `~/.local/share/io.github.sitzriese89.chords-and-scales/` |

In a plain browser (development) the same document is the localStorage entry
`chords-and-scales:document:theme-solar.css` (ADR-4, ADR-17).

### What happens with a broken or incomplete theme

Everything below is listed under the theme picker ("N problems with your theme files"):

- **Not a theme file** (no scheme block, a block not closed, a nested block, text outside a
  block): the file is left out of the picker.
- **A token missing or not `#rrggbb`:** the theme loads; that token takes the Default
  theme's value in the same scheme.
- **Unknown token, other selector or at-rule:** ignored.
- **A contrast rule failed** (below): the theme loads as written, since it is the user's
  choice; each failing pair is listed. Built-in themes must pass every rule.
- **The saved theme is gone** (file deleted or renamed): the Default theme is shown, the
  picker says so, and the setting is kept until another theme is picked.

## Rules for values

- Every value is an opaque `#rrggbb` colour. Translucent colours would make the contrast
  depend on what is underneath.
- `--x-text` is the colour of text drawn on the fill `--x`; `--text-*` are text colours on the
  surfaces.
- The contrast pairs below are checked for every scheme of every built-in theme by
  `app/src/lib/themes/tokens.test.ts`, and for user themes when they load
  (`app/src/lib/themes/contrast.ts`). A built-in theme that changes a value has to keep
  passing them.
  - **Text, 4.5:1** (WCAG 1.4.3 AA): each `--text-*` on each `--surface*`; `--accent-text` on
    `--accent` and `--accent-hover`; `--fretboard-dot-text` on `--fretboard-dot` and on every
    `--degree-*`; `--fretboard-root-text` on `--fretboard-root`; `--fretboard-dim-text` on
    `--fretboard-dim`.
  - **Graphics, 3:1** (WCAG 1.4.11 AA): `--border-strong`, `--accent` and `--focus-ring` on
    each `--surface*`; the nut, frets, strings, capo, dots, root, focus ring, selection ring
    and every `--degree-*` on `--fretboard-wood`.
  - **Degree palette:** any two `--degree-*` colours stay apart (OKLab distance at least 0.09,
    and at least 0.045 with simulated protanopia, deuteranopia and tritanopia).
- Colour is never the only cue (ADR-11): the root also differs by shape, and dots carry labels.

## App

| Token | Use |
|---|---|
| `--surface` | Window background |
| `--surface-raised` | Panels, cards, menus, dialogs: anything on top of `--surface` |
| `--surface-sunken` | Inputs, wells and list backgrounds set into a surface |
| `--border` | Dividers and decorative outlines (no contrast requirement) |
| `--border-strong` | Outlines that identify a control, such as an input's border |
| `--text` | Body text and headings |
| `--text-muted` | Secondary text: hints, captions, fret numbers |
| `--text-link` | Links and text-styled buttons |
| `--text-danger` | Error and validation messages |
| `--accent` | Fill of primary buttons, selected items, active toggles |
| `--accent-hover` | `--accent` while hovered or pressed |
| `--accent-text` | Text and icons on `--accent` and `--accent-hover` |
| `--focus-ring` | Keyboard focus outline around app controls |

## Fretboard

Also used by the tab view and chord diagrams (ADR-3).

| Token | Use |
|---|---|
| `--fretboard-wood` | The fingerboard |
| `--fretboard-nut` | The nut |
| `--fretboard-fret` | Fret wires |
| `--fretboard-string` | Strings |
| `--fretboard-inlay` | Inlay markers (decorative, deliberately low contrast) |
| `--fretboard-dot` | Note dots when degree colouring is off |
| `--fretboard-dot-text` | Dot labels on `--fretboard-dot` and on every `--degree-*` |
| `--fretboard-root` | Root note dots (same colour as `--degree-0` in the built-in themes) |
| `--fretboard-root-text` | Labels on `--fretboard-root` |
| `--fretboard-dim` | De-emphasised dots, such as scale notes outside an overlaid chord (deliberately low contrast to the wood) |
| `--fretboard-dim-text` | Labels on `--fretboard-dim` |
| `--fretboard-focus` | Keyboard focus ring around a fretboard position |
| `--fretboard-capo` | The capo bar; also the shade over the frets behind the capo, drawn at 25% opacity |
| `--fretboard-selected` | The ring around a position selected for reverse lookup |

## Degree palette

Dot colours when degree colouring is on, indexed by semitones above the root. The hues run
round the colour wheel in semitone order, starting from red at the root; lightness varies as
well, so neighbouring hues stay apart for colour-blind viewers.

| Token | Semitones | Interval |
|---|---|---|
| `--degree-0` | 0 | Root (1) |
| `--degree-1` | 1 | ♭2 |
| `--degree-2` | 2 | 2 |
| `--degree-3` | 3 | ♭3 |
| `--degree-4` | 4 | 3 |
| `--degree-5` | 5 | 4 |
| `--degree-6` | 6 | ♯4 / ♭5 |
| `--degree-7` | 7 | 5 |
| `--degree-8` | 8 | ♯5 / ♭6 |
| `--degree-9` | 9 | 6 |
| `--degree-10` | 10 | ♭7 |
| `--degree-11` | 11 | 7 |
