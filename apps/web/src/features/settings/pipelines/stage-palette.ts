/**
 * Preset stage colours. This is the only place in the app where hex values are
 * allowed (stage colours are data stored by the API, not theme tokens).
 */
export const STAGE_COLORS = [
  { name: 'Charcoal', hex: '#57534E' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Sky', hex: '#0284C7' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Lime', hex: '#65A30D' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Pink', hex: '#DB2777' },
  { name: 'Purple', hex: '#9333EA' },
  { name: 'Slate', hex: '#64748B' },
] as const;

export function colorName(hex: string | null | undefined): string {
  if (!hex) return 'No colour';
  return (
    STAGE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? 'Custom colour'
  );
}
