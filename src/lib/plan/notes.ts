/**
 * What counts as a note on a planned workout. Pure and framework free.
 *
 * Trimming and the empty-to-null rule are here rather than in the form or the
 * Server Action because "no notes" must have exactly one representation in the
 * column: otherwise clearing a note could store `''` one day and `null` the
 * next, and undo would restore a difference the athlete never made.
 *
 * The length is counted after trimming, so trailing whitespace can never be
 * what pushes a note over the limit.
 */

export const MAX_NOTES_LENGTH = 2000;

/** Trimmed; empty becomes null, so "no notes" is always null. */
export function normaliseNotes(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function notesTooLong(raw: string): boolean {
  return raw.trim().length > MAX_NOTES_LENGTH;
}

/** How many characters are left, for the count beside the field. */
export function notesRemaining(raw: string): number {
  return MAX_NOTES_LENGTH - raw.trim().length;
}

/**
 * Whether saving would change anything.
 *
 * Same reasoning as `validateStatus`: an accepted change writes the one event
 * that may be undone, so saving an unchanged note would bury the previous
 * change under an undo that restores nothing.
 */
export function notesChanged(raw: string, stored: string | null): boolean {
  return normaliseNotes(raw) !== stored;
}
