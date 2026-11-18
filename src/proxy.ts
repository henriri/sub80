import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /*
   * Skip static assets, image optimisation and the install surface.
   *
   * The install files are what Chrome fetches with no cookies -- a manifest it
   * is answered with the login page's HTML counts as no manifest at all -- so
   * they are skipped here rather than merely allowed through: no redirect and
   * no session work. The list has to stay in step with `publicFiles` in
   * `src/lib/supabase/public-paths.ts`, which it cannot import, because Next
   * reads this matcher statically. `src/proxy.test.ts` holds the two together.
   *
   * The icons need no rule of their own: `png` is already in the extension
   * list. Every dot is escaped twice, once for the string and once for the
   * regex -- a single backslash is dropped by the string literal, which would
   * leave `.` matching any character and skip the proxy on a lookalike path.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
