import type { WorkoutKind } from "@/lib/plan";

/**
 * The semantic kind tokens, as Tailwind utilities. Spelled out one by one
 * because Tailwind cannot build a class name at runtime, and exhaustive
 * because `Record<WorkoutKind, …>` will not compile otherwise: a kind added to
 * the plan has to be given a colour here.
 */
export const KIND_CLASSES: Record<WorkoutKind, string> = {
  easy: "bg-kind-easy text-on-kind-easy",
  long: "bg-kind-long text-on-kind-long",
  hills: "bg-kind-hills text-on-kind-hills",
  steady: "bg-kind-steady text-on-kind-steady",
  sweet: "bg-kind-sweet text-on-kind-sweet",
  threshold: "bg-kind-threshold text-on-kind-threshold",
  interval: "bg-kind-interval text-on-kind-interval",
  tt: "bg-kind-tt text-on-kind-tt",
  race: "bg-kind-race text-on-kind-race",
  rest: "bg-kind-rest text-on-kind-rest",
};
