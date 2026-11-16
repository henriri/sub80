import Link from "next/link";
import { Suspense } from "react";
import { navLink } from "@/components/calendar/styles";
import { RunCard } from "@/components/runs/RunCard";
import { runPanel } from "@/components/runs/styles";
import { requireUser } from "@/lib/auth/require-user";
import { readRuns } from "@/lib/data/activities";
import { buildRunList, parseRunsPage, runsHref } from "@/lib/runs";

async function RunsSection({
  searchParams,
}: {
  searchParams: PageProps<"/runs">["searchParams"];
}) {
  const [raw, user] = await Promise.all([searchParams, requireUser()]);
  const page = parseRunsPage(raw.page);

  // Reads one row more than a page shows, which is how hasNext is known
  // without a second count query.
  const rows = await readRuns(user.id, page);
  const model = buildRunList({ rows, page });

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-inline-md">
        <h1 className="text-heading-md">All runs</h1>
        <div className="flex flex-wrap gap-inline-sm">
          <Link href="/" className={navLink}>
            Calendar
          </Link>
          <Link href="/runs/new" className={navLink}>
            Log a run
          </Link>
        </div>
      </header>

      {model.runs.length === 0 ? (
        <section className={runPanel}>
          <p className="text-body">
            {page === 1
              ? "No runs logged yet."
              : "No runs on this page. There may have been once."}
          </p>
          {page === 1 ? (
            <Link href="/runs/new" className={navLink}>
              Log your first run
            </Link>
          ) : (
            <Link href={runsHref(1)} className={navLink}>
              Back to the first page
            </Link>
          )}
        </section>
      ) : (
        <ul className="flex flex-col gap-stack-md">
          {model.runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </ul>
      )}

      {/*
        Plain links, so the list works with no JavaScript, and only the ones
        that lead somewhere: a disabled control at the end of the history would
        be a thing to tab to that does nothing.
      */}
      {model.hasPrev || model.hasNext ? (
        <nav
          aria-label="Move through the runs"
          className="flex flex-wrap items-center justify-between gap-inline-md"
        >
          {model.hasPrev ? (
            <Link href={runsHref(model.page - 1)} className={navLink} rel="prev">
              <span aria-hidden="true">←</span> Newer runs
            </Link>
          ) : (
            <span />
          )}

          <p className="text-small text-secondary">Page {model.page}</p>

          {model.hasNext ? (
            <Link href={runsHref(model.page + 1)} className={navLink} rel="next">
              Older runs <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

/** The Suspense fallback, which ships in the static shell: no dates, no rows. */
function RunsSkeleton() {
  return (
    <p className="text-small text-secondary" role="status">
      Loading your runs…
    </p>
  );
}

/**
 * Every run, newest first, twenty to a page.
 *
 * Reads the URL and the session, so it sits inside a Suspense boundary: with
 * Cache Components on, `searchParams` is a request-time API and `requireUser`
 * opts into request time before touching cookies.
 */
export default function RunsPage(props: PageProps<"/runs">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-sm md:p-inset-lg">
      <Suspense fallback={<RunsSkeleton />}>
        <RunsSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
