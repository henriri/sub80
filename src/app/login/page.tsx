import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · sub80",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex flex-col gap-stack-lg p-inset-lg">
      <h1 className="text-heading-lg">Sign in</h1>
      <LoginForm />
    </main>
  );
}
