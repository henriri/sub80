import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the signed-in user's id, or redirects to /login. Reads cookies, so
 * call it inside a <Suspense> boundary (Cache Components). The proxy also
 * redirects, but this is the check that sits next to the data.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  return { id: data.claims.sub, email: data.claims.email };
}
