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
Keep these current:
- `pnpm dev` start the dev server
- `pnpm build` production build
- `pnpm start` serve the production build
- `pnpm lint` ESLint over the whole repo
- `pnpm typecheck` generate Next route types, then `tsc --noEmit`
- `pnpm test` run Vitest once (`src/**/*.test.ts`, `tools/**/*.test.ts`)
- `pnpm test:watch` Vitest in watch mode

Before opening a PR, `pnpm lint && pnpm typecheck && pnpm test` must pass.

## Git workflow (non-negotiable)
- Never commit or push to `main`. Work on a branch named `feat/...`, `fix/...` or `chore/...`, push it, and open a pull request. Vercel builds a preview link per PR.
- Small, focused commits with imperative messages.
- Never edit `.env*` files, never print secrets, never commit secrets. Add new variable names to `.env.example` with empty values.
- Database changes are migration files in `supabase/migrations`. Never change the schema by hand in the dashboard.
- No health data or personal data in the repo, fixtures included. Use synthetic data.

## Design system rules
- Three token layers as CSS variables: primitives, semantic, component. All live in one tokens file: `src/styles/tokens.css`. Component tokens reference semantic tokens only.
- Every token is also listed in `src/lib/design/tokens.ts`. A test fails if the list and the CSS drift apart.
- Root attributes drive theming: `data-theme`, `data-palette`, `data-radius`, `data-type`, `data-density`. Every new component must work under all of them. Always set all five together on one element (`<html>`, or a preview wrapper).

  | attribute | values (default first) |
  |---|---|
  | `data-theme` | `light`, `dark` |
  | `data-palette` | `default` (blue), `forest` (green) |
  | `data-radius` | `default`, `sharp`, `round` |
  | `data-type` | `default`, `alt` (serif headings) |
  | `data-density` | `comfortable`, `compact` |

- Tailwind only knows tokens: the default palette, radii, fonts, type scale and spacing are removed in `src/app/globals.css`. Use semantic utilities (`bg-surface`, `text-secondary`, `rounded-control`, `p-inset-md`, `gap-stack-md`, `font-heading`, `text-body`). Use component tokens through the variable syntax (`bg-(--button-bg)`).
- Components may not contain literal colours, radii, font families or spacing values. Use tokens only. The `sub80/no-literal-design-values` lint rule (`tools/eslint`) enforces this in `src/components` and `src/app`, so do not disable it. Components have no CSS files of their own.
- Text and background pairs meet WCAG AA (4.5:1) in every theme and palette.
- A hidden `/design` page shows every token and component in every mode. Add new components there.
- Token names mirror Figma variables one to one: `color/neutral/100` in Figma is `--color-neutral-100` in CSS. Do not rename a token without saying so in the PR.

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

### Known limits
The 60 km ceiling and the five-runs-a-week limit are enforced in TypeScript only, in
`validateMove` (`src/lib/plan/moves.ts`), which the Server Action re-runs against fresh data
before it writes. The database does not check them: a direct call to
`move_planned_workout` would bypass both. Day capacity, plan-week bounds and ownership *are*
enforced in SQL.

That is acceptable while the only caller is the athlete's own session. Add a database-level
guard — a deferred constraint trigger summing distance per `(user_id, week_index)`, not a
PL/pgSQL copy of the rule — **before the coach is allowed to write plan changes**. A safety
limit with one definition and one caller is fine; a safety limit with two writers and no
guarantee is not.

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

## Safety hooks and CI
- `.claude/settings.json` registers a PreToolUse hook, `.claude/hooks/guard.mjs`. It blocks (exit 2): pushes to `main`, force pushes, `git commit` and `git merge` on `main` (or when the branch is unknown), Supabase commands with `--remote` or `--linked`, and any access to `.env` / `.env.*` except `.env.example` (Read, Edit, Write, Grep and shell commands like `cat`, `type`, `Get-Content`).
- The hook is a guardrail, not a replacement for the rules above. It only sees Claude Code tool calls. A bare `supabase db push` or `db pull` is not caught, so always pass `--local` or leave them to the owner.
- The decision logic is the pure `decide` function, tested in `tools/claude-hooks/guard.test.ts`. Update the tests when changing a rule.
- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`: install with a frozen lockfile, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. The build uses fake `NEXT_PUBLIC_SUPABASE_*` placeholders; they are not secrets.
