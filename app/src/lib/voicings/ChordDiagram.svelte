<!--
  @component
  A chord diagram drawn as SVG (SPEC §5.6, ADR-3, ADR-37): the neck upright, one column per
  string (the lowest on the left, mirrored when left-handed), one row per fret. Above each
  string × marks a muted string and ○ an open one (the capo fret, with a capo); a dot marks
  each fretted note, the root as a square (ADR-18), and a barre is a bar across its strings.
  The window starts at the nut (drawn thick) or the capo, or at the shape's lowest fret with
  that fret's number beside it.

  Presentational: it draws a `ChordVoicing` from the core as given and knows no theory. Works
  for any number of strings. Colours are the theme's fretboard tokens (ADR-11).
-->
<script lang="ts">
  import type { ChordVoicing, VoicedString } from '../theory';
  import {
    DOT_RADIUS,
    ROW_HEIGHT,
    TOP,
    diagramSize,
    diagramWindow,
    fretY,
    stringIndex,
    stringX,
  } from './diagram';

  interface Props {
    voicing: ChordVoicing;
    /** Capo fret; 0 = none. Frets are absolute (ADR-18). */
    capo?: number;
    /** Mirror the diagram: the lowest string on the right. */
    leftHanded?: boolean;
    /** The text in a dot; by default the chord tone (`1`, `♭7`). */
    label?: (note: VoicedString) => string;
    /** Accessible name of the diagram. */
    ariaLabel?: string;
  }

  let {
    voicing,
    capo = 0,
    leftHanded = false,
    label = (note) => note.interval,
    ariaLabel = 'Chord diagram',
  }: Props = $props();

  const count = $derived(voicing.strings.length);
  const frame = $derived(diagramWindow(voicing, capo));
  const size = $derived(diagramSize(count, frame.rows));
  const x = (index: number) => stringX(index, count, leftHanded);
  const left = $derived(x(leftHanded ? count - 1 : 0));
  const right = $derived(x(leftHanded ? 0 : count - 1));
  const bottom = $derived(TOP + frame.rows * ROW_HEIGHT);
  const fretLines = $derived(Array.from({ length: frame.rows + 1 }, (_, i) => i));
  const columns = $derived(Array.from({ length: count }, (_, i) => i));

  const markers = $derived(
    voicing.strings.flatMap((note, index): { index: number; kind: 'muted' | 'open' }[] =>
      note === null
        ? [{ index, kind: 'muted' }]
        : note.fret === capo
          ? [{ index, kind: 'open' }]
          : [],
    ),
  );
  const dots = $derived(
    voicing.strings.flatMap((note) => (note !== null && note.fret > capo ? [note] : [])),
  );
  const barre = $derived.by(() => {
    const b = voicing.barre;
    if (!b) return null;
    const xs = [b.lowestString, b.highestString].map((s) => x(stringIndex(s, count)));
    return {
      fret: b.fret,
      x: Math.min(...xs) - DOT_RADIUS,
      width: Math.abs(xs[1] - xs[0]) + 2 * DOT_RADIUS,
      y: fretY(b.fret, frame) - DOT_RADIUS,
    };
  });
  /** The fret number sits outside the bass side of the first row. */
  const labelX = $derived(leftHanded ? right + 10 : left - 10);
</script>

<svg
  class="chord-diagram"
  role="img"
  aria-label={ariaLabel}
  width={size.width}
  height={size.height}
  viewBox="0 0 {size.width} {size.height}"
  data-top={frame.top}
  data-first-fret={frame.firstFret}
>
  <rect class="wood" x={left} y={TOP} width={right - left} height={bottom - TOP} />
  {#each fretLines as row (row)}
    <line
      class="fret"
      x1={left}
      x2={right}
      y1={TOP + row * ROW_HEIGHT}
      y2={TOP + row * ROW_HEIGHT}
    />
  {/each}
  {#each columns as index (index)}
    <line class="string" x1={x(index)} x2={x(index)} y1={TOP} y2={bottom} />
  {/each}
  {#if frame.top !== 'fret'}
    <rect class={frame.top} x={left - 1} y={TOP - 4} width={right - left + 2} height={5} />
  {/if}
  {#if frame.label !== null}
    <text
      class="fret-label"
      x={labelX}
      y={fretY(frame.firstFret, frame)}
      text-anchor={leftHanded ? 'start' : 'end'}
      dominant-baseline="central">{frame.label}</text
    >
  {/if}

  {#each markers as marker (marker.index)}
    <text
      class="marker"
      data-marker={marker.kind}
      x={x(marker.index)}
      y={TOP - 12}
      text-anchor="middle"
      dominant-baseline="central">{marker.kind === 'muted' ? '×' : '○'}</text
    >
  {/each}

  {#if barre}
    <rect
      class="barre"
      data-fret={barre.fret}
      x={barre.x}
      y={barre.y}
      width={barre.width}
      height={2 * DOT_RADIUS}
      rx={DOT_RADIUS}
    />
  {/if}

  {#each dots as note (note.string)}
    {@const cx = x(stringIndex(note.string, count))}
    {@const cy = fretY(note.fret, frame)}
    {@const root = note.interval === '1'}
    <g
      class="dot"
      data-string={note.string}
      data-fret={note.fret}
      data-role={root ? 'root' : 'tone'}
    >
      {#if root}
        <rect
          x={cx - DOT_RADIUS}
          y={cy - DOT_RADIUS}
          width={2 * DOT_RADIUS}
          height={2 * DOT_RADIUS}
          rx="1.5"
        />
      {:else}
        <circle {cx} {cy} r={DOT_RADIUS} />
      {/if}
      <text x={cx} y={cy} text-anchor="middle" dominant-baseline="central">{label(note)}</text>
    </g>
  {/each}
</svg>

<style>
  .chord-diagram {
    display: block;
    font-family: inherit;
  }

  .wood {
    fill: var(--fretboard-wood, #ecdcbc);
  }

  .fret {
    stroke: var(--fretboard-fret, #7d7364);
    stroke-width: 1.5;
  }

  .string {
    stroke: var(--fretboard-string, #5e554b);
    stroke-width: 1;
  }

  .nut {
    fill: var(--fretboard-nut, #3b332b);
  }

  .capo {
    fill: var(--fretboard-capo, #2b2724);
  }

  .fret-label,
  .marker {
    fill: var(--text-muted, #5d5952);
    font-size: 11px;
  }

  .marker {
    font-size: 12px;
  }

  .barre,
  .dot circle {
    fill: var(--fretboard-dot, #2e4057);
  }

  .dot rect {
    fill: var(--fretboard-root, #c5365f);
  }

  .dot text {
    fill: var(--fretboard-dot-text, #ffffff);
    font-size: 8px;
    font-weight: 600;
  }

  .dot[data-role='root'] text {
    fill: var(--fretboard-root-text, #ffffff);
  }
</style>
