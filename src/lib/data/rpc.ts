import "server-only";

/**
 * How a database function's error is read.
 *
 * The functions in supabase/migrations raise with a message written for the
 * athlete, prefixed by their own name, and with one of two error codes for a
 * deliberate refusal. Anything else is a fault: a refusal is passed through to
 * the interface, a fault throws.
 *
 * Shared by every data module rather than copied into each one. The shaping
 * rule below is a contract with the SQL -- `'<function_name>: <sentence>'` --
 * and two copies of it would be free to disagree about where the sentence
 * starts.
 */

/** Raised deliberately by a function for something the athlete can act on. */
export const RAISE_EXCEPTION = "P0001";
/** The row is not there, or is not the caller's, which RLS makes the same thing. */
export const NO_DATA_FOUND = "P0002";

/** Whether an error is a refusal the interface should word, or a fault. */
export function isRefusal(code: string | undefined): boolean {
  return code === RAISE_EXCEPTION || code === NO_DATA_FOUND;
}

/**
 * `move_planned_workout: the workout is completed, not planned` -> the tail,
 * as a sentence: `The workout is completed, not planned.`
 */
export function refusal(message: string): string {
  const [, detail] = message.split(/^[a-z_]+: /);
  const sentence = (detail ?? message).trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}
