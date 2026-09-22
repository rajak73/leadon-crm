// Locale-aware formatting helpers. Everything uses the browser locale via Intl.

const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  value: number | null | undefined,
  currency: string,
  opts?: { compact?: boolean },
): string {
  if (value === null || value === undefined) return '—';
  const key = `${currency}:${opts?.compact ? 'c' : 'f'}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: opts?.compact ? 'compact' : 'standard',
        minimumFractionDigits: 0,
        maximumFractionDigits: opts?.compact ? 1 : 2,
      });
    } catch {
      // Unknown currency code: fall back to a plain number with the code.
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
      return `${f.format(value)} ${currency}`;
    }
    moneyFormatters.set(key, f);
  }
  return f.format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(ratio: number, digits = 0): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(
    ratio,
  );
}

const dateFmt = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const shortDateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

const toDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d);

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  return date.getFullYear() === new Date().getFullYear()
    ? shortDateFmt.format(date)
    : dateFmt.format(date);
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return dateTimeFmt.format(toDate(d));
}

export function formatTime(d: string | Date): string {
  return timeFmt.format(toDate(d));
}

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago", "in 2 days", "just now". */
export function formatRelative(
  d: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!d) return '—';
  const diffSec = (toDate(d).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(Math.round(diffSec / 60), 'minute');
}

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Tomorrow", "Yesterday" or a short date — for due dates. */
export function formatDueDate(d: string | null): string {
  if (!d) return 'No due date';
  const date = new Date(d);
  const today = startOfDay();
  const day = startOfDay(date);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const time = hasTime ? `, ${formatTime(date)}` : '';
  if (diffDays === 0) return `Today${time}`;
  if (diffDays === 1) return `Tomorrow${time}`;
  if (diffDays === -1) return `Yesterday${time}`;
  return `${formatDate(date)}${time}`;
}

/** Value for <input type="datetime-local"> from an ISO string. */
export function toDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for <input type="date"> from an ISO string. */
export function toDateInput(iso: string | null | undefined): string {
  return toDateTimeInput(iso).slice(0, 10);
}

/** Converts a date/datetime-local input value into an ISO string (or null when blank). */
export function fromDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function personName(
  p: { firstName: string; lastName?: string | null } | null | undefined,
): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** Change vs. the previous period as a ratio, or null when there is no baseline. */
export function changeRatio(value: number, previous: number): number | null {
  if (previous === 0) return value === 0 ? 0 : null;
  return (value - previous) / previous;
}
