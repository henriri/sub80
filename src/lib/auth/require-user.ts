import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the signed-in user's id, or redirects to /login. Reads cookies, so
 * call it inside a <Suspense> boundary (Cache Components). The proxy also
 * redirects, but this is the check that sits next to the data.
 */
export async function requireUser() {
  // getClaims() can read Date.now() to check token expiry. Opt into request
  // time first so prerendering never evaluates it.
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  return { id: data.claims.sub, email: data.claims.email };
}
