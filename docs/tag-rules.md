# Mood tag rules

Scales and chords get mood tags (`dark`, `jazzy`, `bright`, …) from rules, never by hand
(SPEC §5.7, ADR-9, ADR-39). Each rule weighs **features** of the item's intervals; an item gets
every tag whose **score** reaches the tag's **threshold**. The rules work on any interval set, so
your own scales and chords get tags exactly like the built-in ones.

The built-in rules are in [`crates/theory/data/tags.toml`](../crates/theory/data/tags.toml). You
can change them, or add tags, with a user rules file in the same format: it is merged over the
built-in rules (see [Your own rules](#your-own-rules)). There is no rule editor in the app.

## How a tag is scored

For an item and a tag:

1. Read the item's [features](#features): flags (1 or 0) and counts (0, 1, 2, …).
2. Multiply each feature by the tag's weight for it and add them up. Features the tag doesn't
   name count 0. Weights are whole numbers; negative weights count against the tag.
3. The item gets the tag when the score is **at least** the tag's threshold for its kind:
   `scale-threshold` for scales, `chord-threshold` for chords. A tag without a threshold for a
   kind never applies to that kind (`jazzy` has no scale threshold, so no scale is jazzy).

Scales and chords have separate thresholds because a seven-note scale holds more of almost every
feature than a three- or four-note chord.

An item can get any number of tags, or none.

## Features

Features are read from **semitones**, not from the labels the intervals are written with. A
scale written `1 2 3 b5 5 6 7` gets the tags of one written `1 2 3 #4 5 6 7`, and an item gets
the same tags on every root. Where the spelling would matter (does a tritone act as a raised 4th
or a lowered 5th?), a feature decides from the other notes instead (`sharp-4`, `flat-5`).

### Notes above the root

Flags: 1 if the item has a note this far above the root, **in any octave** (a `b9` counts as
`b2`, a `13` as `6`, a `#5` as `b6`).

| Feature | Semitones | Labels it covers |
|---|---|---|
| `b2` | 1 | b2, b9 |
| `2` | 2 | 2, 9 |
| `b3` | 3 | b3, #2, #9 |
| `3` | 4 | 3, b4 |
| `4` | 5 | 4, 11 |
| `tritone` | 6 | #4, b5, #11 |
| `5` | 7 | 5 |
| `b6` | 8 | b6, #5, b13 |
| `6` | 9 | 6, bb7, 13 |
| `b7` | 10 | b7, #6 |
| `7` | 11 | 7 |

### What the notes do together

| Feature | Kind | Value |
|---|---|---|
| `minor` | flag | a minor 3rd (3 semitones) and no major 3rd (4). `1 3 5 b7 #9` is not minor. |
| `no-third` | flag | neither a minor nor a major 3rd: sus chords, power chords, some pentatonics. |
| `sharp-4` | flag | the tritone acts as a raised 4th: there is no perfect 4th, and there is a perfect 5th or no minor 3rd. Lydian, `maj7#11`, whole tone. |
| `flat-5` | flag | the tritone acts as a lowered 5th: there is no perfect 5th, and there is a perfect 4th or a minor 3rd. Locrian, `dim`, `m7b5`. |
| `diminished` | flag | `minor`, a tritone and no perfect 5th: the diminished triad is in it. |
| `augmented` | flag | a major 3rd, 8 semitones and no perfect 5th: the augmented triad is in it. |
| `blue-notes` | count | one for a minor and a major 3rd together, one for a tritone between a perfect 4th and 5th. Blues, major blues, `7#9`. |

With both a perfect 4th and a perfect 5th around (the blues scale), the tritone is a passing
note: neither `sharp-4` nor `flat-5`.

### The shape of the whole set

These look at the item's notes as pitch classes in one octave, root included.

| Feature | Kind | Value |
|---|---|---|
| `semitone-pairs` | count | pairs of notes a semitone apart. Major: 2 (E–F, B–C). Chromatic: 12. |
| `tritone-pairs` | count | pairs of notes a tritone apart. Major: 1, `dim7`: 2, diminished scales: 4. |
| `augmented-seconds` | count | steps of three semitones between two semitone steps, going round the octave: the 1–3–1 shape of harmonic minor (in C, A♭–B lies between G–A♭ and B–C). Harmonic minor and its modes: 1, double harmonic: 2. |
| `wide-steps` | count | steps of four or more semitones between neighbouring notes. Hirajoshi: 2. (Every triad has some, so this is for scales.) |
| `symmetric` | flag | the set maps onto itself when moved up by less than an octave: whole tone, the diminished scales, augmented, chromatic, `aug`, `dim7`. |

### Chord extensions

These count only intervals an octave or more above the root, so scales (which stay within the
octave) never have them, and `add2` has no `ninth` while `add9` has.

| Feature | Kind | Value |
|---|---|---|
| `seventh` | flag | a minor or major 7th (10 or 11 semitones, any octave). |
| `ninth` | flag | a b9, 9 or #9. |
| `eleventh` | flag | an 11 or #11. |
| `thirteenth` | flag | a b13 or 13. |
| `extensions` | count | intervals an octave or more above the root. `13` (1 3 5 b7 9 13): 2. |
| `altered-extensions` | count | b9, #9, #11 and b13 among them. |

## The format

A rules file is TOML with one `[tag.<name>]` table per tag. Nothing else may be at the top
level.

```toml
[tag.dark]
scale-threshold = 3      # the score a scale needs; leave out: never on scales
chord-threshold = 3      # the score a chord needs; leave out: never on chords
[tag.dark.weights]       # feature = weight, whole numbers
b2 = 2
flat-5 = 2
b6 = 1
minor = 1
```

`weights` can also be written inline: `weights = { b2 = 2, flat-5 = 2 }`. Feature names that are
numbers (`2`, `b3`, `7`) are fine as keys.

Rules a tag must meet, checked when the file is read:

- The name is lowercase kebab-case: `dark`, `film-noir`.
- At least one of `scale-threshold` and `chord-threshold`, each 1 or more (a threshold of 0 or
  below would put the tag on everything).
- At least one positive weight (or the tag could never apply).
- Every weight names a [feature](#features) from the lists above.
- No other keys. Weights are whole numbers.

Tags are listed by name.

## Your own rules

A user rules file is merged over the built-in rules, table by table:

- **A tag that already exists is changed, not replaced.** A threshold you give replaces that
  threshold; each weight you give replaces that feature's weight. Everything you leave out stays
  as it is. A weight of `0` takes the feature out of the tag.
- **A tag that doesn't exist yet is added.** It needs everything a tag needs (a threshold and a
  positive weight).
- **A table that doesn't give a valid tag is skipped** with an error naming the tag; that tag
  stays as it was (or isn't added), and the rest of the file still applies.
- **A file that isn't TOML** gives one error and the built-in rules are used unchanged.
- **An empty file changes nothing.**

There is no way to delete a built-in tag; to switch one off, give it thresholds no item reaches
(`scale-threshold = 1000`, `chord-threshold = 1000`).

### Where the file goes

The user rules file is **`tags.toml`** in the app-data folder, next to `settings.toml` and
your `scales.toml` (the folder for each OS is in
[docs/theme-tokens.md](theme-tokens.md#where-user-themes-go)). In the browser build it is the
localStorage entry `chords-and-scales:document:tags`. The app only reads it, never writes it,
so your comments stay. A missing file means the built-in rules.

The file is read **at start**: after editing it, restart the app (or reload the page in the
browser) to see the new tags. Tables that could not be used are listed, as
`tags.toml: tag "dark": unknown feature "b9"; …`, in the note at the top of the window that
also lists broken scales, chords and tunings. The user-file import stores a picked
`tags.toml` as this file.

In the code, the core takes the file as a string (`TagRules::with_user_rules`); the WASM
binding takes it through `setUserTagRules(toml)`, which `UserCatalogs` calls at start
(ADR-41).

## A worked example

**Scoring.** The built-in `dark` tag weighs `b2` 2, `flat-5` 2, `b6` 1, `minor` 1, with a
threshold of 3 for scales and chords.

| Item | Intervals | Features weighed | Score | Dark? |
|---|---|---|---|---|
| Phrygian | 1 b2 b3 4 5 b6 b7 | `b2` 1, `b6` 1, `minor` 1 | 2 + 1 + 1 = 4 | yes |
| Locrian | 1 b2 b3 4 b5 b6 b7 | `b2`, `flat-5`, `b6`, `minor` | 2 + 2 + 1 + 1 = 6 | yes |
| Natural minor | 1 2 b3 4 5 b6 b7 | `b6`, `minor` | 1 + 1 = 2 | no |
| Minor triad | 1 b3 5 | `minor` | 1 | no |
| Diminished triad | 1 b3 b5 | `flat-5`, `minor` | 2 + 1 = 3 | yes |

**A user file.** This makes natural minor dark too, by lowering the scale threshold, and adds a
`spanish` tag for scales with a ♭2 and a major 3rd:

```toml
[tag.dark]
scale-threshold = 2

[tag.spanish]
scale-threshold = 4
[tag.spanish.weights]
b2 = 2
3 = 2
```

After merging, `dark` keeps its chord threshold (3) and all its weights; only its scale
threshold is 2. `spanish` is new: Phrygian dominant (1 b2 3 4 5 b6 b7) scores 2 + 2 = 4 and gets
it; Phrygian (no major 3rd) scores 2 and doesn't; no chord gets it, since it has no chord
threshold.

## Tuning the built-in rules

The default weights are a judgement call and are expected to change (ADR-9). To see every
built-in scale's and chord's tags after editing `tags.toml`:

```bash
cargo test -p theory print_builtin_tags -- --ignored --nocapture
```

`cargo test -p theory` checks the file (`builtin_tag_rules_are_valid`: valid, every tag on some
item of each kind it has a threshold for, none on every scale) and the anchors (Phrygian and
Locrian dark, Lydian bright, diminished chords dissonant, …).
