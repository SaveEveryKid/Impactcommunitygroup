import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Sign in, or request a new link.",
  "not-configured": "Sign-in isn't available until the database is connected.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeRedirectPath(sp.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Welcome back"
      lede="Sign in to manage your volunteering, organizations and messages."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-teal-strong underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={next} notice={sp.error ? NOTICES[sp.error] : undefined} />
    </AuthCard>
  );
}
