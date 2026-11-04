"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { MAX_WEEK, PLAN_SESSION_COUNT } from "@/lib/plan";
import { generatePlan, type GeneratePlanState } from "./actions";

const initialState: GeneratePlanState = {};

export function GeneratePlanForm() {
  const [state, formAction, pending] = useActionState(generatePlan, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-stack-sm">
      <p className="text-secondary">
        {PLAN_SESSION_COUNT} sessions over {MAX_WEEK} weeks, up to race day.
      </p>
      <Button
        type="submit"
        name="intent"
        value="generate"
        disabled={pending}
        className="self-start"
        aria-describedby={state.error ? "generate-plan-error" : undefined}
      >
        {pending ? "Generating…" : "Generate my plan"}
      </Button>
      {state.error ? (
        <p id="generate-plan-error" role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
