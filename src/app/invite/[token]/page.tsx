import type { Metadata } from "next";
import { MailOpen } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { acceptInvitation } from "@/app/actions/organizations";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organization invitation", robots: { index: false } };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const valid = /^[0-9a-f]{64}$/.test(token);
  return (
    <AuthCard title="You've been invited">
      <div className="flex flex-col gap-4">
        <MailOpen className="h-10 w-10 text-teal" aria-hidden="true" />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {!valid ? (
          <p>This invitation link isn&apos;t valid. Ask the organization to send a new one.</p>
        ) : !user ? (
          <>
            <p>Sign in, or create an account with the email address the invitation was sent to, then come back to this link.</p>
            <LinkButton href={`/login?next=/invite/${token}`}>Sign in</LinkButton>
            <LinkButton href="/signup" variant="secondary">
              Create an account
            </LinkButton>
          </>
        ) : (
          <form action={acceptInvitation} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <p>
              You&apos;re signed in as <strong>{user.email}</strong>. Accept to join the organization&apos;s team.
            </p>
            <Button type="submit" size="lg">
              Accept invitation
            </Button>
          </form>
        )}
      </div>
    </AuthCard>
  );
}
