const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbpWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** £1,234.50 */
export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : gbp.format(value);
}

/** £1,235, for list figures. */
export function moneyWhole(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : gbpWhole.format(value);
}

/** 23 Nov 2026, from a yyyy-mm-dd date column. */
export function date(value: string | null | undefined): string {
  if (!value) return '—';
  return shortDate.format(parseDate(value));
}

/** Whole days from a yyyy-mm-dd date to today. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = startOfToday().getTime() - parseDate(value).getTime();
  return Math.round(ms / 86_400_000);
}

/** Today as yyyy-mm-dd in local time, for date inputs. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ~3.5 h, from minutes. */
export function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} h`;
}

/**
 * Parses a money input such as "£1,250.5" to 1250.5. Blank gives null; anything
 * unparseable gives NaN so the form can flag it.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** Value for a money input from a stored number. */
export function moneyInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : value.toFixed(2);
}

function parseDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
