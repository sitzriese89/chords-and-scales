<!--
  @component
  The toolbar's instrument button (ADR-51): a summary of the neck ("6-string guitar · Standard
  · 24 frets · capo 2") that opens the full instrument settings, `InstrumentPanel`, in a
  popover. One instrument for the whole app; the summary follows every change at once.
-->
<script lang="ts">
  import { Popover } from '../panels';
  import { getSettings } from '../settings';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import InstrumentPanel from './InstrumentPanel.svelte';
  import { instrumentSummary } from './tuning';

  const settings = getSettings();
  const catalogs = getUserCatalogs();

  const summary = $derived.by(() => {
    // A user tuning can be renamed (ADR-24).
    void catalogs.revision;
    return instrumentSummary(settings.current.instrument);
  });
</script>

<Popover id="instrument-popover" label="Instrument" buttonLabel="Instrument: {summary}">
  {#snippet button()}
    <span class="summary">{summary}</span>
  {/snippet}
  <InstrumentPanel />
</Popover>

<style>
  .summary {
    overflow-wrap: anywhere;
  }
</style>
