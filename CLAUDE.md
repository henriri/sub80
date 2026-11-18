# sub80

A training app for one athlete (the owner) aiming at a half marathon under 1:20 in spring 2028 (race date 2028-04-16), with PRs on 5k (about 17:25) and 10k (under 37:00) on the way. It is also a sport-tech portfolio project, so code quality, design-system discipline and a readable git history matter.

The full plan lives in the Claude Docs page "sub80: Project Plan". This file is the short version Claude Code must follow.

## Stack
- Next.js (App Router) + TypeScript (strict), deployed on Vercel. `next` and
  `eslint-config-next` are pinned to an exact version and move together — the lint config is
  versioned with the framework it checks. The version lives in `package.json` and nowhere else,
  so it is never written down twice. `next build` **fails** on a version with a known advisory,
  once, then succeeds on retry: that is the signal to patch, not something to work around.
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
- An activity stores `hr_source` (`strap` or `wrist`) if and only if it has an `avg_hr`. Never mix or average the two. Enforced in SQL by `activities_hr_source_present_check` and in TypeScript by `validateRun` (`src/lib/runs/rules.ts`), in both directions: a reading with no source is refused, and so is a source with no reading.
- Logging a run is a **fact**, not a plan change. `log_run`, `update_run` and `delete_run` write no `plan_events` row and are outside the undo stack: there is nothing to propose and nothing to reverse. Only the plan is undoable.
- A session is **completed if and only if a run is linked to it**. Completion is a consequence of logging, never something the athlete ticks: `completed` is written by `log_run` and `update_run` in SQL and by nothing else. There is no "Mark done" and no `done` status action — `STATUS_ACTIONS` is `skipped` and `planned`. `set_workout_status` in SQL still takes all three values, deliberately, because `undo_plan_event` has to restore `completed` on an event recorded before this rule existed. Deleting the only run on a session puts that session back to planned, which is `resetsLinkedSession` (`src/lib/runs/deleting.ts`) and not a question the athlete is asked. Anything reading "is this done" reads the linked runs, never the status column: a legacy row can say `completed` with nothing behind it, and that is a session still waiting for its run.
- **What a session offers** is decided in one pure function, `sessionActions` (`src/lib/plan/session-actions.ts`), from the session, its linked runs and `today`. The detail page, the calendar card and the drag layer render from it and nothing else decides. `canMove` and `canLighten` are derived from the validators the Server Actions re-run — `isSourceInPast` out of `validateMove`, `canLighten` out of `validateLighten` — so nothing offered can be refused. It is deliberately **stricter** than the server for a session dated today: that session is offered Log run rather than Move. The tests assert that one direction only.
- An **imported run's measurements cannot be edited by hand**. A run whose `source` is not `manual` refuses any change to its date, start time, distance, duration, heart rate or heart-rate source; `rpe`, `notes` and `planned_workout_id` stay editable for every source. Enforced in SQL by `update_run` (`20261117190000_update_run_source_guard.sql`, `P0001`) and in TypeScript by `refusesStatsEdit` (`src/lib/runs/source-guard.ts`), which the Server Action re-runs and the form renders those fields read-only from. Compared field by field with `is not distinct from`, never refused outright: a form re-sends every field on every submit, so changing only the note must succeed.
- **Notes live on the run**, in `activities.notes`, written in the log and edit form and shown in the linked-run summary. A session has no notes editor: logging a run from a session prefills its note into the run's. `planned_workouts.notes` and `set_workout_notes` remain for the events already recorded against them.

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

There are now **two** TypeScript-only writers of the ceiling.
`restore_planned_distance` puts a lightened day back to its planned distance, which can
take a week over 60 km if a run was moved into the headroom the lightening freed, so it is
checked by `validateRestore` (`src/lib/plan/lighten.ts`) and not in SQL. Lightening itself
cannot raise a week total and needs no check: `lighten_planned_workout` refuses a distance
that is not strictly lighter. `set_workout_notes` and `set_workout_status` do not touch load.

That is acceptable while the only caller is the athlete's own session. Add a database-level
guard — a deferred constraint trigger summing distance per `(user_id, week_index)`, not a
PL/pgSQL copy of the rule — **before the coach is allowed to write plan changes**. A safety
limit with one definition and one caller is fine; a safety limit with two writers and no
guarantee is not.

### What CI cannot check
The `database` job runs the migrations and the pgTAP tests; neither goes through
PostgREST. So no test anywhere covers how a **resource embed** comes back — and
`activities.planned_workout_id` is half of a composite foreign key
(`(user_id, planned_workout_id)` -> `(user_id, id)`), where PostgREST may infer either
a to-one or a to-many. `storedRunSchema` therefore accepts the embedded session as an
object *or* as an array of one and normalises it, rather than guessing and having a page
fail on a row the database answered correctly. Treat any new embed the same way, or
verify it against a running stack first.

There are now **two** such embeds, in both directions over the same key.
`storedWorkoutWithRunsSchema` (`src/lib/plan/rows-schema.ts`) is the other: the calendar
reads each session's runs, because "is this day done" cannot be answered from the status
column. It accepts an array, a single object, `null` and an absent field, and normalises
all four to an array. Neither embed is covered by any test against a real PostgREST.

### Run logging and the undo stack
`log_run` sets a linked session to `completed`, and `delete_run` can set it back to
`planned`, both without writing a `plan_events` row. One visible consequence: mark a
session skipped (which *is* an undoable event), then log a run against it, and the Undo
offered for that status change will refuse with *"the workout has changed since that
change"* — `undo_plan_event` checks the row still matches the event's `after` snapshot
before it writes. That is the safe behaviour, not a bug: the undo would otherwise
overwrite a fact with a stale plan state. It needs no code, only this note.

Neither function touches distance, so the 60 km ceiling gains no third TypeScript-only
writer.

### No change history
`plan_events` is written by every plan change, `undo_plan_event` reverses the newest one,
and the **undo toast** after a change is how that is reached. There is no list of recent
changes and no history button: the component, its per-row Undo and the loader that read
the table are gone, and nothing reads `plan_events` any more. Do not reintroduce a
standing history without being asked — and note the consequence, which is written on
`UndoToast`: the toast is now the only route to an undo, so a change not reversed before
its countdown runs out stands, even though the event is still there and the database
would still accept it.

## Screens
- `/` the calendar. `/workouts/[id]` one planned session. `/design` the hidden
  specimen page.
- `/runs` the whole logbook, newest first, 20 to a page. `/runs/new` logs one by hand.
  `/runs/[id]` views, edits and deletes one. Reached from the calendar header and from
  a session's own page, which also lists the runs logged against it.
- A session page offers **Log run** when the day has come and nothing is logged, and the
  run's summary with **Edit run** once something is. Nothing else: no Skip, no lighter
  day and no drag handle on a session that happened. `/runs/new?workout=<id>` is the
  log-from-session entry — it reads that session by id, prefills the day, the planned
  distance and the session's note, and shows a read-only line instead of the picker. The
  generic entry keeps the picker and the soft "already has a run" warning. Unlinking
  exists only on the run's own page.
- Rules live in `src/lib/runs` and are the same functions the Server Actions re-run, so
  the form and the server never disagree about why a run is refused. Copy lives in
  `src/lib/runs/messages.ts`, apart from the rules, as the move rules keep theirs in
  `src/lib/calendar`.
- A **warning** is confirmed, never refused: an odd pace or a second run on one session
  is the athlete's call. The dialog asks and sends each warning's code; the server
  re-runs the rules and refuses any warning it was not given a code for.

## PWA
Installable on Android Chrome: `src/app/manifest.ts`, `display: "standalone"`, the icons in
`public/icons`, and `viewportFit: "cover"` with the safe-area insets reserved once on `<body>`.

**No service worker, and no offline caching.** Not an omission — a decision. Every page is one
athlete's health data behind auth, and a cache that serves a stale week, or a response from
another session, is a worse failure than no offline support at all. **Offline or push needs a
design decision before any code**: what may be cached, how it is scoped to a user, and how it is
invalidated when the plan changes.

What that costs: Chrome will not *promote* the install, because the automatic prompt still wants
a `fetch()` handler. Installing from the ⋮ menu does not, and has not since Chrome 108 on
mobile, so the athlete installs once by hand. For one user that is the right trade.

- A manifest cannot read a CSS variable, so its colours are literal hex in
  `src/lib/design/manifest-theme.ts`, derived from `--color-bg-canvas` through `resolveToken`
  and `srgbHex` and locked by a test that re-runs the derivation. Never type a colour in there.
- `theme_color` is **light only**, because `<html>` is pinned to `defaultModes`. Add the dark
  media variant when a theme switcher exists — until then it would darken the status bar over a
  light page on a phone set to dark mode.
- The icons are a **placeholder** from `tools/icons/generate.mts`, run by hand with the outputs
  committed. The Figma pass replaces them.
- The app is private: `src/app/robots.ts` disallows everything and the layout sets
  `robots: { index: false, follow: false }`.
- The **install files are public by design** and must stay that way:
  `/manifest.webmanifest`, `/robots.txt`, `/favicon.ico` and `/icons/*`. Chrome fetches a
  manifest **without cookies**, so anything auth-gated there is answered with the login page's
  HTML — which shows up as a manifest "Line: 1, column: 1, Syntax error" and a failed install,
  never as an auth problem. They are listed twice, deliberately: in the matcher in
  `src/proxy.ts`, which skips them so no session work runs, and in `publicFiles` in
  `src/lib/supabase/public-paths.ts`, which is the pure decision `isPublicPath` makes for
  anything the proxy does see. A matcher cannot import the list, so `src/proxy.test.ts` asserts
  the two agree. `isPublicPath` normalises before matching: a traversal is judged by where it
  lands, so `/icons/../runs` is `/runs` and stays private.

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
