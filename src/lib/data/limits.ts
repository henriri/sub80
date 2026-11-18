/**
 * The row limit every read has to reckon with, and the guard that refuses to
 * work around it quietly.
 *
 * PostgREST answers at most `db-max-rows` rows and says nothing about the rest:
 * there is no error and no flag, just a shorter array. For a total that is the
 * worst possible failure -- a truncated year reads as a year in which the
 * athlete ran less than they did, and nothing on the screen would look wrong.
 *
 * So a read that could grow asks for the limit explicitly and calls this. No
 * `server-only` import here on purpose: it is arithmetic, and it is tested.
 */

/** PostgREST's default `db-max-rows`, which Supabase does not raise. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Throws when a read came back full, because a full read may have been cut
 * short.
 *
 * It cannot tell a page that is exactly full from one that was truncated, and
 * deliberately does not try: both mean the read has outgrown one request, and
 * the answer is paging or an aggregate rather than a bigger number here.
 */
export function assertAllRows(
  count: number,
  what: string,
  limit: number = POSTGREST_MAX_ROWS,
): void {
  if (count < limit) return;

  throw new Error(
    `${what} came back with ${count} rows, the ${limit}-row limit. ` +
      "The total would be wrong, so this refuses rather than truncating.",
  );
}
