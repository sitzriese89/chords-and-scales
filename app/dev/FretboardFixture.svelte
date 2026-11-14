<!-- Dev-only page for looking at the fretboard with sample data (app/dev/fretboard.html). -->
<script lang="ts">
  import { Fretboard, type FretPosition } from '../src/lib/fretboard';
  import { fixtureDots, type LabelMode } from './fixture-data';

  // Initial values can come from the URL, e.g. ?strings=9&frets=27&left&degrees&overlay
  const query = new URLSearchParams(location.search);
  const num = (name: string, fallback: number) => Number(query.get(name) ?? fallback);

  let strings = $state(num('strings', 6));
  let frets = $state(num('frets', 24));
  let capo = $state(num('capo', 0));
  let leftHanded = $state(query.has('left'));
  let colorByDegree = $state(query.has('degrees'));
  let overlay = $state(query.has('overlay'));
  let labels = $state<LabelMode>((query.get('labels') as LabelMode | null) ?? 'names');
  let width = $state(query.get('width') ?? '100%');
  let last = $state<FretPosition | null>(null);

  const dots = $derived(fixtureDots(strings, labels, overlay));
</script>

<main>
  <h1>Fretboard fixture</h1>
  <p>A minor pentatonic, hand-written sample data. Dev only, not part of the build.</p>

  <form class="controls" onsubmit={(e) => e.preventDefault()}>
    <label>
      Strings
      <select bind:value={strings}>
        {#each [4, 5, 6, 7, 8, 9] as n (n)}<option value={n}>{n}</option>{/each}
      </select>
    </label>
    <label>
      Frets {frets}
      <input type="range" min="12" max="27" bind:value={frets} />
    </label>
    <label>
      Capo
      <select bind:value={capo}>
        {#each [0, 1, 2, 3, 4, 5, 7] as n (n)}<option value={n}>{n || 'none'}</option>{/each}
      </select>
    </label>
    <label>
      Labels
      <select bind:value={labels}>
        <option value="names">note names</option>
        <option value="intervals">intervals</option>
        <option value="none">none</option>
      </select>
    </label>
    <label>
      Width
      <select bind:value={width}>
        <option value="100%">100%</option>
        <option value="1200px">1200px</option>
        <option value="800px">800px</option>
        <option value="480px">480px</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={leftHanded} /> Left-handed</label>
    <label><input type="checkbox" bind:checked={colorByDegree} /> Colour by degree</label>
    <label><input type="checkbox" bind:checked={overlay} /> Am chord over the scale (dim)</label>
  </form>

  <div class="frame" style:width>
    <Fretboard
      {strings}
      {frets}
      {capo}
      {dots}
      {leftHanded}
      {colorByDegree}
      onactivate={(p) => (last = p)}
    />
  </div>

  <p aria-live="polite">
    {last
      ? `Activated string ${last.string}, fret ${last.fret}`
      : 'Click a position or use the keyboard.'}
  </p>
</main>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    margin-bottom: 1rem;
  }

  .frame {
    max-width: 100%;
    outline: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
  }
</style>
