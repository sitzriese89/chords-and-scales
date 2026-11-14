# Theme tokens

The app and its exports are styled by one set of CSS custom properties, the theme tokens
(ADR-11, ADR-19). They are defined in [`app/src/styles/tokens.css`](../app/src/styles/tokens.css),
which holds the values for both built-in themes; this page says what each token is for.

**The names are a contract.** Export themes and user themes (v4) set these properties.
Adding a token is fine; renaming or removing one is a breaking change and needs an ADR.

## Themes

| Theme | Selected when |
|---|---|
| Light | Default; also `data-theme="light"` on the root element |
| Dark | The OS prefers dark (`prefers-color-scheme: dark`) and `data-theme` is not `light`; or `data-theme="dark"` |

`applyTheme()` in [`app/src/styles/theme.ts`](../app/src/styles/theme.ts) sets or clears
`data-theme` for a `'system' | 'light' | 'dark'` preference. Each theme also sets
`color-scheme`, so scrollbars and native form controls match.

## Rules for values

- Every value is an opaque `#rrggbb` colour. Translucent colours would make the contrast
  depend on what is underneath.
- `--x-text` is the colour of text drawn on the fill `--x`; `--text-*` are text colours on the
  surfaces.
- The contrast pairs below are checked by `app/src/styles/tokens.test.ts` in both themes.
  A theme that changes a value has to keep passing it.
  - **Text, 4.5:1** (WCAG 1.4.3 AA): each `--text-*` on each `--surface*`; `--accent-text` on
    `--accent` and `--accent-hover`; `--fretboard-dot-text` on `--fretboard-dot` and on every
    `--degree-*`; `--fretboard-root-text` on `--fretboard-root`; `--fretboard-dim-text` on
    `--fretboard-dim`.
  - **Graphics, 3:1** (WCAG 1.4.11 AA): `--border-strong`, `--accent` and `--focus-ring` on
    each `--surface*`; the nut, frets, strings, capo, dots, root, focus ring and every
    `--degree-*` on `--fretboard-wood`.
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
