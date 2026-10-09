import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/supabase/server";
import { SignUpForm } from "../forms";

export const metadata: Metadata = {
  title: "Join the network",
  description: "Create a free account to volunteer, attend events, or register your organization.",
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  const type = sp.type === "organization" ? "organization" : "individual";
  if (await getCurrentUser()) redirect(type === "organization" ? "/dashboard/organizations/new" : "/dashboard");
  return (
    <AuthCard
      title="Join the network"
      lede="Free for individuals and organizations. We only ask for what we need to run the platform."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-strong underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm defaultType={type} />
    </AuthCard>
  );
}
