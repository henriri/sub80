import { Suspense } from "react";
import { Button } from "@/components/Button";
import { requireUser } from "@/lib/auth/require-user";
import { signOut } from "./actions";

async function Account() {
  const user = await requireUser();

  return (
    <>
      <p className="text-secondary">Signed in as {user.email}</p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col gap-stack-md p-inset-lg">
      <h1 className="text-heading-lg">sub80</h1>
      <Suspense fallback={<p className="text-secondary">Loading…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}
