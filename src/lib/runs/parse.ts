/**
 * Reading what the athlete typed. Pure and framework free.
 *
 * Every function here answers one question -- "is this a number, and which
 * one?" -- and answers `null` when it is not. None of them judges whether the
 * number is sensible: a 1 km run and a 300 km run both parse, and `validateRun`
 * in ./rules.ts is what refuses the second. Keeping the two apart means a typo
 * and an impossible value get different sentences, which is the difference
 * between "that is not a time" and "no run is twelve hours long".
 *
 * `parseDur` is the port of the legacy helper named in src/lib/plan/PORT-NOTES.md,
 * which parked it for "the activity-logging form, where there is input to parse".
 * This is that form.
 */

/** A blank field: the athlete has not filled it in, which is not an error. */
export function isBlank(raw: string): boolean {
  return raw.trim() === "";
}

/**
 * A duration in seconds from 'm:ss', 'h:mm:ss' or bare minutes.
 *
 * In the colon forms every field after the first must be exactly two digits.
 * '7:5' is not read as seven minutes five seconds, because nobody can tell
 * whether it was meant as 7:05 or as 7:50 and guessing wrong changes a pace by
 * forty-five seconds a kilometre. Bare minutes may carry a decimal, with a
 * comma or a dot, like every other number on this form.
 */
export function parseDur(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;

  const colon = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (colon) {
    const [, first, second, third] = colon;
    // 'h:mm:ss' when there are three fields, 'm:ss' when there are two.
    const hours = third === undefined ? 0 : Number(first);
    const minutes = third === undefined ? Number(first) : Number(second);
    const seconds = third === undefined ? Number(second) : Number(third);

    if (minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const minutes = parseDecimal(text);
  if (minutes === null) return null;
  return Math.round(minutes * 60);
}

/**
 * A decimal number written with a comma or a dot. '7,5' and '7.5' are the same
 * number: the keyboard decides which one the athlete gets, not the form.
 *
 * Only one separator, and only digits around it, so '7.5.2' and '1 000' are
 * not numbers. `Number()` alone would accept '', '0x10', 'Infinity' and
 * ' 7 ', which is why the shape is checked first.
 */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** A distance in kilometres, comma or dot. */
export function parseKm(raw: string): number | null {
  return parseDecimal(raw);
}

/**
 * Kilometres as whole metres, which is what the column stores.
 * Rounded, not truncated: 7.4999 km is 7500 m, not 7499 m.
 */
export function kmToMetres(km: number): number {
  return Math.round(km * 1000);
}

/** A whole number, for a heart rate or an effort. No decimals, no sign. */
export function parseWhole(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/** 'HH:MM' as typed into a time input, or null when it is not one. */
export function parseClock(raw: string): string | null {
  const text = raw.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  if (Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return text;
}

/** Seconds per kilometre. Infinite when there is no distance to divide by. */
export function paceSecPerKm(metres: number, seconds: number): number {
  if (metres <= 0) return Number.POSITIVE_INFINITY;
  return seconds / (metres / 1000);
}
