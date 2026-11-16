"use client";

import { Button } from "@/components/Button";
import { formatKm, lightenActionLabel } from "@/lib/calendar";
import type { LightenFraction } from "@/lib/plan";

/** One reduction, with the distance it would actually store. */
export type LightenOption = { by: LightenFraction; toM: number };

type LightenActionsProps = {
  workoutId: string;
  /** Only the fractions `offeredFractions` allows, so none can be refused. */
  options: readonly LightenOption[];
  /** The planned distance to put back, or null when the day is not lighter. */
  restoreToM: number | null;
  /** One sentence instead of buttons, when the day cannot be changed at all. */
  withheld: string | null;
  lighten: (formData: FormData) => void;
  restore: (formData: FormData) => void;
  pending: boolean;
};

/**
 * Making a day lighter, and putting the plan's distance back.
 *
 * The buttons say the distance they would give, computed with the same
 * `lightenedDistance` the Server Action uses, so the athlete is never told
 * 20% and handed a rounding they did not expect.
 *
 * A day already at -40% is offered no reduction at all: -20% of the plan is
 * more than the day now holds, and putting distance back is restore's job
 * because restore is the one that checks the 60 km ceiling. The sentence says
 * so rather than leaving a button that would refuse.
 *
 * Withheld entirely for a past day or a session already done or skipped. What
 * happened has happened; `validateLighten` says the same, and this is only the
 * interface agreeing with it in advance.
 */
export function LightenActions({
  workoutId,
  options,
  restoreToM,
  withheld,
  lighten,
  restore,
  pending,
}: LightenActionsProps) {
  if (withheld !== null) {
    return <p className="text-small text-secondary">{withheld}</p>;
  }

  return (
    <div className="flex flex-col gap-stack-sm">
      <div className="flex flex-wrap gap-inline-sm">
        {options.map((option) => (
          <form key={option.by} action={lighten}>
            <input type="hidden" name="workoutId" value={workoutId} />
            <input type="hidden" name="by" value={option.by} />
            <Button type="submit" disabled={pending}>
              {lightenActionLabel(option.by, option.toM)}
            </Button>
          </form>
        ))}

        {restoreToM === null ? null : (
          <form action={restore}>
            <input type="hidden" name="workoutId" value={workoutId} />
            <Button type="submit" disabled={pending}>
              Restore {formatKm(restoreToM)}
            </Button>
          </form>
        )}
      </div>

      {options.length === 0 && restoreToM !== null ? (
        <p className="text-small text-secondary">
          This day is as light as it goes. Restore the planned distance to change
          it again.
        </p>
      ) : null}
    </div>
  );
}
