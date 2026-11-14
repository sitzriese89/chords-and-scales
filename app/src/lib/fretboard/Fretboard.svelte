<!--
  @component
  A horizontal fretboard drawn as SVG (ADR-3). Presentational: it draws the dots it is given
  and reports which position was activated; it knows no music theory.

  - Strings are numbered from 1 = the highest-pitched string, drawn at the top, to `strings` =
    the lowest, drawn at the bottom. Dots use the same numbering.
  - Frets are absolute: 0 is the open string (drawn left of the nut, right of it when
    left-handed). With a capo, frets below it are shaded and not playable; the capo fret holds
    the "open" notes.
  - Fret spacing is realistic (each fret 2^(1/12) narrower than the one before). The drawing
    scales to the width of its container.
  - Every playable position is a cell of an ARIA grid with one tab stop: arrow keys move
    (left/right follow the drawing, so they are mirrored when left-handed), Home/End jump to
    the first/last fret, Enter or Space activate. Click activates too. Each cell has a name
    such as "String 2, fret 5, C, root".
  - Colours come from the theme tokens `--fretboard-*` and `--degree-0` … `--degree-11`
    (ADR-11), with light-theme fallbacks.
-->
<script lang="ts">
  import { INLAY_RADIUS, STRING_GAP, fretboardLayout } from './geometry';
  import type { FretboardDot, FretPosition } from './types';

  interface Props {
    /** Number of strings (4–9 in the app). */
    strings: number;
    /** Number of frets (12–27 in the app). */
    frets: number;
    /** Capo fret; 0 = no capo. */
    capo?: number;
    /**
     * Notes to show. Dots outside the neck or below the capo are not drawn; of two dots on one
     * position, the last wins.
     */
    dots?: FretboardDot[];
    /** Mirror the neck: nut on the right. */
    leftHanded?: boolean;
    /** Colour root and tone dots by `degree` (`--degree-<n>`) instead of the plain dot colours. */
    colorByDegree?: boolean;
    /** Accessible name of the whole fretboard. */
    ariaLabel?: string;
    /** Called when a position is clicked or activated with Enter/Space. */
    onactivate?: (position: FretPosition) => void;
  }

  let {
    strings,
    frets,
    capo = 0,
    dots = [],
    leftHanded = false,
    colorByDegree = false,
    ariaLabel = 'Fretboard',
    onactivate,
  }: Props = $props();

  // Fallbacks for the degree palette until the theme defines it (ADR-11).
  const DEGREE_FALLBACKS = [
    '#c0392b',
    '#7d3c98',
    '#d35400',
    '#1f618d',
    '#1e8449',
    '#9a7d0a',
    '#6c3483',
    '#117a65',
    '#a04000',
    '#2874a6',
    '#7e5109',
    '#922b21',
  ];

  const stringCount = $derived(Math.max(1, Math.floor(strings)));
  const fretCount = $derived(Math.max(1, Math.floor(frets)));
  const capoFret = $derived(Math.min(Math.max(0, Math.floor(capo)), fretCount - 1));
  const layout = $derived(fretboardLayout({ strings: stringCount, frets: fretCount, leftHanded }));

  const fretWires = $derived(Array.from({ length: fretCount }, (_, i) => i + 1));
  const stringNumbers = $derived(Array.from({ length: stringCount }, (_, i) => i + 1));
  /** Playable frets, low to high. */
  const playableFrets = $derived(
    Array.from({ length: fretCount - capoFret + 1 }, (_, i) => capoFret + i),
  );

  const key = (string: number, fret: number) => `${string}:${fret}`;
  const inRange = (p: FretPosition) =>
    p.string >= 1 && p.string <= stringCount && p.fret >= capoFret && p.fret <= fretCount;

  const visibleDots = $derived(dots.filter(inRange));
  const dotAt = $derived(new Map(visibleDots.map((d) => [key(d.string, d.fret), d])));
  // One dot per position; for duplicates the last one wins.
  const drawnDots = $derived([...dotAt.values()]);

  function clamp(p: FretPosition): FretPosition {
    return {
      string: Math.min(Math.max(1, p.string), stringCount),
      fret: Math.min(Math.max(capoFret, p.fret), fretCount),
    };
  }

  // The cell that holds the grid's single tab stop. Until the user moves it, it starts on the
  // first root (or the first dot).
  let chosen = $state<FretPosition | null>(null);
  const active = $derived(
    clamp(
      chosen ??
        visibleDots.find((d) => d.role === 'root') ??
        visibleDots[0] ?? { string: 1, fret: capoFret },
    ),
  );

  let svg: SVGSVGElement | undefined = $state();

  function cellName(string: number, fret: number): string {
    const parts = [`String ${string}`, fret === 0 ? 'open' : `fret ${fret}`];
    const dot = dotAt.get(key(string, fret));
    if (dot) {
      if (dot.label) parts.push(dot.label);
      if (dot.role === 'root') parts.push('root');
      else if (dot.role === 'dim') parts.push('dimmed');
      else if (!dot.label) parts.push('note');
    }
    return parts.join(', ');
  }

  function activate(string: number, fret: number) {
    chosen = { string, fret };
    onactivate?.({ string, fret });
  }

  function moveTo(p: FretPosition) {
    chosen = clamp(p);
    const { string, fret } = chosen;
    svg?.querySelector<SVGElement>(`[data-cell="${key(string, fret)}"]`)?.focus();
  }

  function onkeydown(event: KeyboardEvent, string: number, fret: number) {
    const right = leftHanded ? -1 : 1;
    switch (event.key) {
      case 'ArrowRight':
        moveTo({ string, fret: fret + right });
        break;
      case 'ArrowLeft':
        moveTo({ string, fret: fret - right });
        break;
      case 'ArrowUp':
        moveTo({ string: string - 1, fret });
        break;
      case 'ArrowDown':
        moveTo({ string: string + 1, fret });
        break;
      case 'Home':
        moveTo({ string, fret: capoFret });
        break;
      case 'End':
        moveTo({ string, fret: fretCount });
        break;
      case 'Enter':
      case ' ':
        activate(string, fret);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function dotFill(dot: FretboardDot): string | undefined {
    if (!colorByDegree || dot.role === 'dim') return undefined;
    const degree = ((Math.round(dot.degree) % 12) + 12) % 12;
    return `var(--degree-${degree}, ${DEGREE_FALLBACKS[degree]})`;
  }

  const capoShade = $derived(
    capoFret > 0
      ? (() => {
          const open = layout.fretSpan(0);
          const last = layout.fretSpan(capoFret - 1);
          const left = Math.min(open.x, last.x);
          const right = Math.max(open.x + open.width, last.x + last.width);
          return { x: left, width: right - left };
        })()
      : null,
  );
  const capoBar = $derived(
    capoFret > 0
      ? (() => {
          const span = layout.fretSpan(capoFret);
          const w = Math.min(8, span.width / 3);
          // Just behind the fret wire, like a real capo.
          return { x: leftHanded ? span.x + 2 : span.x + span.width - w - 2, width: w };
        })()
      : null,
  );
</script>

<svg
  bind:this={svg}
  class="fretboard"
  class:degrees={colorByDegree}
  viewBox="0 0 {layout.width} {layout.height}"
  width="100%"
  role="grid"
  aria-label={ariaLabel}
  aria-rowcount={stringCount}
  aria-colcount={fretCount - capoFret + 1}
  style:--label-size="{(layout.dotRadius * 0.95).toFixed(2)}px"
>
  <rect
    class="board"
    x={layout.board.x}
    y={layout.boardTop}
    width={layout.board.width}
    height={layout.boardBottom - layout.boardTop}
  />

  {#each layout.inlays as inlay (inlay.fret)}
    {#each inlay.ys as y, i (i)}
      <circle class="inlay" data-fret={inlay.fret} cx={inlay.x} cy={y} r={INLAY_RADIUS} />
    {/each}
    <text class="fret-number" x={inlay.x} y={layout.numbersY}>{inlay.fret}</text>
  {/each}

  {#each fretWires as f (f)}
    <line
      class="fret"
      data-fret={f}
      x1={layout.fretWireX(f)}
      x2={layout.fretWireX(f)}
      y1={layout.boardTop}
      y2={layout.boardBottom}
    />
  {/each}

  <rect
    class="nut"
    x={layout.nut.x}
    y={layout.boardTop}
    width={layout.nut.width}
    height={layout.boardBottom - layout.boardTop}
  />

  {#each stringNumbers as s (s)}
    <line
      class="string"
      data-string={s}
      x1={Math.min(layout.fretSpan(0).x, layout.board.x) + 2}
      x2={Math.max(
        layout.fretSpan(0).x + layout.fretSpan(0).width,
        layout.board.x + layout.board.width,
      ) - 2}
      y1={layout.stringY(s)}
      y2={layout.stringY(s)}
      stroke-width={1 + (stringCount > 1 ? ((s - 1) / (stringCount - 1)) * 1.8 : 0)}
    />
  {/each}

  {#if capoShade && capoBar}
    <rect
      class="capo-shade"
      x={capoShade.x}
      y={layout.boardTop}
      width={capoShade.width}
      height={layout.boardBottom - layout.boardTop}
    />
    <rect
      class="capo"
      x={capoBar.x}
      y={layout.boardTop - 4}
      width={capoBar.width}
      height={layout.boardBottom - layout.boardTop + 8}
      rx="3"
    />
  {/if}

  {#each drawnDots as dot (key(dot.string, dot.fret))}
    {@const cx = layout.fretCenterX(dot.fret)}
    {@const cy = layout.stringY(dot.string)}
    <g
      class="dot {dot.role}"
      data-string={dot.string}
      data-fret={dot.fret}
      data-role={dot.role}
      style:--dot-fill={dotFill(dot)}
    >
      {#if dot.role === 'root'}
        <rect
          class="shape"
          x={cx - layout.dotRadius}
          y={cy - layout.dotRadius}
          width={2 * layout.dotRadius}
          height={2 * layout.dotRadius}
          rx="2.5"
        />
      {:else}
        <circle
          class="shape"
          {cx}
          {cy}
          r={dot.role === 'dim' ? layout.dimRadius : layout.dotRadius}
        />
      {/if}
      {#if dot.label}
        <text class="label" x={cx} y={cy}>{dot.label}</text>
      {/if}
    </g>
  {/each}

  {#each stringNumbers as s (s)}
    <g role="row" aria-rowindex={s}>
      {#each playableFrets as f, i (f)}
        {@const span = layout.fretSpan(f)}
        <rect
          class="cell"
          role="gridcell"
          tabindex={active.string === s && active.fret === f ? 0 : -1}
          aria-colindex={i + 1}
          aria-label={cellName(s, f)}
          data-cell={key(s, f)}
          x={span.x}
          y={layout.stringY(s) - STRING_GAP / 2}
          width={span.width}
          height={STRING_GAP}
          rx="4"
          onclick={() => activate(s, f)}
          onkeydown={(e) => onkeydown(e, s, f)}
        />
      {/each}
    </g>
  {/each}
</svg>

<style>
  .fretboard {
    display: block;
    height: auto;
    user-select: none;
    font-family: inherit;
  }

  .board {
    fill: var(--fretboard-wood, #ead7b7);
  }

  .inlay {
    fill: var(--fretboard-inlay, #c8b088);
  }

  .fret-number {
    fill: currentColor;
    opacity: 0.6;
    font-size: 10px;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .fret {
    stroke: var(--fretboard-fret, #9b9182);
    stroke-width: 2;
  }

  .nut {
    fill: var(--fretboard-nut, #3b3326);
  }

  .string {
    stroke: var(--fretboard-string, #6d6a65);
  }

  .capo-shade {
    fill: var(--fretboard-capo, #2b2b2b);
    fill-opacity: 0.25;
  }

  .capo {
    fill: var(--fretboard-capo, #2b2b2b);
  }

  .dot .shape {
    fill: var(--dot-fill, var(--fretboard-dot, #2f3e57));
  }

  .dot.root .shape {
    fill: var(--dot-fill, var(--fretboard-root, #c0392b));
  }

  .dot.dim .shape {
    fill: var(--fretboard-dim, #bdb6aa);
  }

  .label {
    fill: var(--fretboard-dot-text, #ffffff);
    font-size: var(--label-size);
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }

  .dot.root .label {
    fill: var(--fretboard-root-text, #ffffff);
  }

  /* --fretboard-dot-text is the label colour on every --degree-* colour, the root's included. */
  .degrees .dot:not(.dim) .label {
    fill: var(--fretboard-dot-text, #ffffff);
  }

  .dot.dim .label {
    fill: var(--fretboard-dim-text, #4a4640);
    font-size: calc(var(--label-size) * 0.75);
    font-weight: 500;
  }

  .cell {
    fill: transparent;
    cursor: pointer;
    outline: none;
  }

  .cell:hover {
    fill: var(--fretboard-focus, #1a73e8);
    fill-opacity: 0.12;
  }

  .cell:focus-visible {
    stroke: var(--fretboard-focus, #1a73e8);
    stroke-width: 2.5;
  }
</style>
