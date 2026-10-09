import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { ResendConfirmationForm } from "../forms";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard title="Check your email">
      <div className="flex flex-col gap-4">
        <MailCheck className="h-10 w-10 text-teal" aria-hidden="true" />
        <p>
          We sent a confirmation link to <strong>{email ?? "your email address"}</strong>. Open it on this device to finish creating your
          account.
        </p>
        <p className="text-sm text-ink-muted">Nothing after a few minutes? Check your spam folder, then resend.</p>
        <ResendConfirmationForm email={email} />
      </div>
    </AuthCard>
  );
}
