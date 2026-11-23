// PROTOTYPE (branch prototype/style-pass): throwaway. Which style-pass variant to show,
// from `?variant=`: A = today's UI, B = the style pass, C = the style pass with bolder tabs
// and neck. Never merge to main.

export const VARIANTS = [
  { key: 'A', name: 'Current' },
  { key: 'B', name: 'Style pass' },
  { key: 'C', name: 'Style pass, bolder' },
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];

export function currentVariant(): VariantKey {
  if (typeof location === 'undefined') return 'A';
  const v = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  return VARIANTS.some((x) => x.key === v) ? (v as VariantKey) : 'A';
}

/** True for the style-pass variants (B and C). */
export const stylePass = (): boolean => currentVariant() !== 'A';

export function applyVariant(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.proto = currentVariant();
}
