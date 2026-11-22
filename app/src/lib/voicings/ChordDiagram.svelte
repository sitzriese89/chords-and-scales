<!--
  @component
  A chord diagram drawn as SVG (SPEC §5.6, ADR-3, ADR-37, ADR-49), lying like the neck: one
  row per string, the lowest at the bottom, the nut (drawn thick) or the capo on the left and
  one column per fret to the right; left-handed the diagram is mirrored, the nut on the right,
  as the fretboard is. At each string's nut end × marks a muted string and ○ an open one (the
  capo fret, with a capo); a dot marks each fretted note, the root as a square (ADR-18), and a
  barre is a bar across its strings. A shape higher up the neck starts at its lowest fret, with
  that fret's number under its column instead of the nut.

  Presentational: it draws a `ChordVoicing` from the core as given and knows no theory. Works
  for any number of strings. Colours are the theme's fretboard tokens (ADR-11).
-->
<script lang="ts">
  import type { ChordVoicing, VoicedString } from '../theory';
  import {
    DOT_RADIUS,
    diagramSize,
    diagramWindow,
    fretX,
    labelY,
    markerX,
    stringIndex,
    stringY,
    wireX,
  } from './diagram';

  interface Props {
    voicing: ChordVoicing;
    /** Capo fret; 0 = none. Frets are absolute (ADR-18). */
    capo?: number;
    /** Mirror the diagram: the nut on the right. */
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
  const size = $derived(diagramSize(count, frame.frets));
  const y = (index: number) => stringY(index, count);
  const x = (fret: number) => fretX(fret, frame, leftHanded);
  const wire = (column: number) => wireX(column, frame, leftHanded);
  const top = $derived(y(count - 1));
  const bottom = $derived(y(0));
  /** The board's left and right edge, whichever side the nut is on. */
  const left = $derived(Math.min(wire(0), wire(frame.frets)));
  const right = $derived(Math.max(wire(0), wire(frame.frets)));
  const wires = $derived(Array.from({ length: frame.frets + 1 }, (_, i) => i));
  const rows = $derived(Array.from({ length: count }, (_, i) => i));

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
    const ys = [b.lowestString, b.highestString].map((s) => y(stringIndex(s, count)));
    return {
      fret: b.fret,
      x: x(b.fret) - DOT_RADIUS,
      y: Math.min(...ys) - DOT_RADIUS,
      height: Math.abs(ys[1] - ys[0]) + 2 * DOT_RADIUS,
    };
  });
  /** The nut or capo: a thick bar on the starting edge, reaching a little past it. */
  const edgeX = $derived(leftHanded ? wire(0) - 1 : wire(0) - 4);
</script>

<svg
  class="chord-diagram"
  role="img"
  aria-label={ariaLabel}
  width={size.width}
  height={size.height}
  viewBox="0 0 {size.width} {size.height}"
  data-start={frame.start}
  data-first-fret={frame.firstFret}
>
  <rect class="wood" x={left} y={top} width={right - left} height={bottom - top} />
  {#each wires as column (column)}
    <line class="fret" x1={wire(column)} x2={wire(column)} y1={top} y2={bottom} />
  {/each}
  {#each rows as index (index)}
    <line class="string" x1={left} x2={right} y1={y(index)} y2={y(index)} />
  {/each}
  {#if frame.start !== 'fret'}
    <rect class={frame.start} x={edgeX} y={top - 1} width={5} height={bottom - top + 2} />
  {/if}
  {#if frame.label !== null}
    <text
      class="fret-label"
      x={x(frame.firstFret)}
      y={labelY(count)}
      text-anchor="middle"
      dominant-baseline="central">{frame.label}</text
    >
  {/if}

  {#each markers as marker (marker.index)}
    <text
      class="marker"
      data-marker={marker.kind}
      x={markerX(frame, leftHanded)}
      y={y(marker.index)}
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
      width={2 * DOT_RADIUS}
      height={barre.height}
      rx={DOT_RADIUS}
    />
  {/if}

  {#each dots as note (note.string)}
    {@const cx = x(note.fret)}
    {@const cy = y(stringIndex(note.string, count))}
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
