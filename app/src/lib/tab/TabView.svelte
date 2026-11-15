<!--
  @component
  Tablature drawn as SVG (ADR-3, ADR-25). Presentational: one horizontal line per string,
  string 1 (the highest) on top, each labelled with its open note; one column per note, left to
  right in playing order, holding its fret number.

  - Fret numbers are absolute (ADR-18), also with a capo: a capo is named above the tab
    ("Capo 3"), and its fret is written as 3, not as 0.
  - Tab is read left to right for every player, so it is not mirrored when left-handed.
  - The root's numbers are bold and in the root colour (`--fretboard-root`); weight, not only
    colour, sets them apart. Lines and numbers use the theme tokens (ADR-11).
  - Screen readers get the notes as a list ("String 6, fret 3, root") under the drawing.
-->
<script lang="ts">
  import type { TabString } from './position';

  interface TabNote {
    string: number;
    fret: number;
    /** Draw as the root. */
    root?: boolean;
  }

  interface Props {
    /** The lines, top to bottom (string 1 first). */
    strings: TabString[];
    /** The notes in playing order. */
    notes: TabNote[];
    /** Capo fret; 0 = no capo. */
    capo?: number;
    /** Accessible name of the tab. */
    ariaLabel?: string;
  }

  let { strings, notes, capo = 0, ariaLabel = 'Tab' }: Props = $props();

  const LINE_GAP = 22;
  const COLUMN = 30;
  const LABEL_WIDTH = 34;
  const PAD = 14;
  const TOP = 14;

  const rowY = (index: number) => TOP + index * LINE_GAP;
  const columnX = (index: number) => LABEL_WIDTH + PAD + COLUMN / 2 + index * COLUMN;

  const rows = $derived(new Map(strings.map((s, index) => [s.string, index])));
  const width = $derived(LABEL_WIDTH + 2 * PAD + Math.max(notes.length, 4) * COLUMN);
  const height = $derived(TOP * 2 + Math.max(strings.length - 1, 0) * LINE_GAP);
  const lineStart = LABEL_WIDTH;
  const lineEnd = $derived(width - 1);
  const placed = $derived(
    notes
      .map((note, index) => ({ ...note, index, row: rows.get(note.string) }))
      .filter((note): note is typeof note & { row: number } => note.row !== undefined),
  );
</script>

<figure class="tab">
  {#if capo > 0}
    <figcaption class="capo">Capo {capo} (fret numbers are absolute)</figcaption>
  {/if}
  <svg
    class="tab-drawing"
    role="img"
    aria-label={ariaLabel}
    viewBox="0 0 {width} {height}"
    {width}
    {height}
  >
    {#each strings as line, index (line.string)}
      <text class="string-label" x={LABEL_WIDTH - 8} y={rowY(index)}>{line.label}</text>
      <line
        class="string-line"
        data-string={line.string}
        x1={lineStart}
        x2={lineEnd}
        y1={rowY(index)}
        y2={rowY(index)}
      />
    {/each}
    {#if strings.length > 0}
      <line class="bar" x1={lineStart} x2={lineStart} y1={rowY(0)} y2={rowY(strings.length - 1)} />
      <line class="bar" x1={lineEnd} x2={lineEnd} y1={rowY(0)} y2={rowY(strings.length - 1)} />
    {/if}
    {#each placed as note (note.index)}
      <g
        class="note"
        class:root={note.root}
        data-string={note.string}
        data-fret={note.fret}
        data-column={note.index}
      >
        <rect
          class="knockout"
          x={columnX(note.index) - COLUMN / 2 + 3}
          y={rowY(note.row) - 8}
          width={COLUMN - 6}
          height="16"
        />
        <text class="fret" x={columnX(note.index)} y={rowY(note.row)}>{note.fret}</text>
      </g>
    {/each}
  </svg>
  <ol class="visually-hidden" aria-label="{ariaLabel}, notes in playing order">
    {#each notes as note, index (index)}
      <li>
        String {note.string}, {note.fret === 0 ? 'open' : `fret ${note.fret}`}{note.root
          ? ', root'
          : ''}
      </li>
    {/each}
  </ol>
</figure>

<style>
  .tab {
    margin: 0;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--surface-raised);
    overflow-x: auto;
  }

  .capo {
    margin: 0 0 0.25rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  svg {
    display: block;
    font-family: inherit;
  }

  .string-line,
  .bar {
    stroke: var(--border-strong);
    stroke-width: 1;
  }

  .string-label {
    fill: var(--text-muted);
    font-size: 12px;
    text-anchor: end;
    dominant-baseline: central;
  }

  .knockout {
    fill: var(--surface-raised);
  }

  .fret {
    fill: var(--text);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .root .fret {
    fill: var(--fretboard-root);
    font-weight: 700;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
