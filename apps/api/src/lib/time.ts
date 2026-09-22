/** Timezone helpers (settings.timezone) built on Intl — no extra dependencies. */

const DAY_MS = 24 * 60 * 60 * 1000;

function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const get = (type: string) => Number(fmt.formatToParts(date).find((p) => p.type === type)?.value);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour'),
    min: get('minute'),
    s: get('second'),
  };
}

/** Offset (ms) of `timeZone` from UTC at `date`. */
function offsetAt(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The UTC instant at which the calendar day containing `date` starts in `timeZone`. */
export function startOfDayIn(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const guess = Date.UTC(p.y, p.m - 1, p.d);
  const first = guess - offsetAt(new Date(guess), timeZone);
  // Re-check in case the offset differs at local midnight (DST transitions).
  return new Date(guess - offsetAt(new Date(first), timeZone));
}

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** YYYY-MM-DD of `date` in `timeZone`. */
export function dateKeyIn(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
