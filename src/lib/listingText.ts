/**
 * Plain-text listing helper (no AI). Format from the spec, with empty fields
 * left out:
 *
 *   Srixon P–5 irons (5–PW)
 *   Shaft: KBS Tour
 *   Flex: Stiff
 *   Condition: Good
 *
 *   Work done:
 *   - 5 × Regrip (Golf Pride MCC)
 *   - Groove sharpen
 */

export interface ListingTextInput {
  name: string;
  contents: string | null;
  fields: { name: string; value: string }[];
  condition: string | null;
  work: { service: string; qty: number; part: string | null }[];
}

export function listingText(input: ListingTextInput): string {
  const lines: string[] = [];
  lines.push(input.contents?.trim() ? `${input.name} (${input.contents.trim()})` : input.name);
  for (const f of input.fields) {
    if (f.value.trim()) lines.push(`${f.name}: ${f.value.trim()}`);
  }
  if (input.condition?.trim()) lines.push(`Condition: ${input.condition.trim()}`);

  if (input.work.length > 0) {
    lines.push('', 'Work done:');
    for (const w of input.work) {
      const qty = w.qty > 1 ? `${w.qty} × ` : '';
      const part = w.part ? ` (${w.part})` : '';
      lines.push(`- ${qty}${w.service}${part}`);
    }
  }
  return lines.join('\n');
}
