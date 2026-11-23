/**
 * Preview of how a purchase total splits across its items, before saving.
 * Mirrors public.item_costs: an explicit allocation is used as is; items left
 * blank share what remains equally (rounded to the penny).
 *
 * The saved figures always come from the database view; this is only for the form.
 */
export interface SplitResult {
  shares: number[];
  allocated: number;
  remaining: number;
  overAllocated: boolean;
}

export function splitCost(total: number, allocations: (number | null)[]): SplitResult {
  const allocated = round2(allocations.reduce<number>((sum, a) => sum + (a ?? 0), 0));
  const remaining = round2(total - allocated);
  const blanks = allocations.filter((a) => a === null).length;
  const each = blanks > 0 ? round2(remaining / blanks) : 0;
  return {
    shares: allocations.map((a) => (a === null ? each : a)),
    allocated,
    remaining,
    overAllocated: allocated > total + 0.0001,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
