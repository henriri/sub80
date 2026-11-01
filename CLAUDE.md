# sub80

A training app for one athlete (the owner) aiming at a half marathon under 1:20 in spring 2028 (race date 2028-04-16), with PRs on 5k (about 17:25) and 10k (under 37:00) on the way. It is also a sport-tech portfolio project, so code quality, design-system discipline and a readable git history matter.

The full plan lives in the Claude Docs page "sub80: Project Plan". This file is the short version Claude Code must follow.

## Stack
- Next.js (App Router) + TypeScript (strict), deployed on Vercel
- Supabase: Postgres with row-level security, Auth (email one-time codes), Storage for raw FIT files, EU region
- Tailwind v4, Radix primitives, dnd-kit for drag and drop (touch and keyboard must work)
- pnpm, Node 26 LTS (check Vercel's supported versions before changing)
- FIT parsing with Garmin's FIT SDK for JavaScript, in server routes only
- Android-first PWA. The phone is not used during workouts.

## Commands
Fill these in as soon as the scaffold exists, and keep them current:
- `pnpm dev` start the dev server
- `pnpm lint` lint
- `pnpm typecheck` TypeScript check
- `pnpm test` unit tests
- `pnpm build` production build

Before opening a PR, `pnpm lint && pnpm typecheck && pnpm test` must pass.

## Git workflow (non-negotiable)
- Never commit or push to `main`. Work on a branch named `feat/...`, `fix/...` or `chore/...`, push it, and open a pull request. Vercel builds a preview link per PR.
- Small, focused commits with imperative messages.
- Never edit `.env*` files, never print secrets, never commit secrets. Add new variable names to `.env.example` with empty values.
- Database changes are migration files in `supabase/migrations`. Never change the schema by hand in the dashboard.
- No health data or personal data in the repo, fixtures included. Use synthetic data.

## Design system rules
- Three token layers as CSS variables: primitives, semantic, component. All live in one tokens file.
- Root attributes drive theming: `data-theme`, `data-palette`, `data-radius`, `data-type`, `data-density`. Every new component must work under all of them.
- Components may not contain literal colours, radii, font families or spacing values. Use tokens only. A lint rule enforces this, so do not disable it.
- A hidden `/design` page shows every token and component in every mode. Add new components there.
- Token names mirror Figma variables one to one. Do not rename a token without saying so in the PR.

## Domain rules
- Units: metric. Pace in min/km. Time zone Europe/Paris. Interface language English.
- Pace engine is the Daniels/Gilbert VDOT model. Keep it a pure, tested module with no framework imports. A 1:20 half is about VDOT 58.4.
- Training load: 3 weeks up, 1 down. Running volume is capped at 60 km/week (pubalgia history). This ceiling is a safety limit.
- Pace-based training, not heart-rate-based. Heart rate is secondary and shown late.
- Every activity stores `hr_source` (`strap` or `wrist`). Never mix or average the two.

## Coach architecture
Plain code measures and validates. The LLM only proposes and explains.
1. Safety limits: 60 km ceiling, adductor pain flag, ramp cap. Never overridable. The coach may only reduce load.
2. Plan rules: overridable only when a hard-coded discrepancy trigger fires.
3. Triggers (in code, unit tested): fitness gap of 1.5 VDOT or more for two weeks, two key sessions missed, fatigue pattern, objective drift, "not feeling it".
4. Proposals: the user always accepts or rejects. Every change is a `plan_events` row and can be undone.
Never let model output write to the plan directly. It must pass validation first.

## Code conventions
- TypeScript strict, no `any`. Validate all external input (forms, FIT files, webhooks) with a schema.
- Server components by default. Client components only for interaction.
- Business logic goes in `src/lib`, not in components. Pure functions get unit tests.
- Every table has row-level security. Say so in the migration when adding one.
- Accessibility: keyboard reachable, visible focus, labels on every control, touch targets of at least 44px.

## Working with me
- The owner is a product designer. Explain decisions briefly, and flag trade-offs rather than silently choosing.
- Do one phase at a time, as in the roadmap. Do not build ahead.
- If a request conflicts with this file, say so before acting.
