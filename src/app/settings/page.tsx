import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { cancelAccountDeletion } from "@/app/actions/profile";
import { formatDate } from "@/lib/utils";
import { DeletionForm, ProfileForm } from "./forms";

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const supabase = (await getSupabase())!;
  const [{ data: profile }, { data: deletion }] = await Promise.all([
    supabase.from("profiles").select("display_name, bio, general_location, profile_visibility").eq("id", user.id).single(),
    supabase.from("account_deletion_requests").select("status, created_at").eq("user_id", user.id).in("status", ["pending", "processing"]).maybeSingle(),
  ]);
  return (
    <div className="space-y-12">
      <section aria-labelledby="profile">
        <h1 id="profile" className="text-3xl font-bold">Profile and account</h1>
        <p className="mt-2 text-ink-soft">Signed in as {user.email}.</p>
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <ProfileForm profile={profile!} isAdult={user.isAdult} />
        </div>
      </section>
      <section aria-labelledby="pw">
        <h2 id="pw" className="text-2xl font-semibold">Password</h2>
        <p className="mt-2 text-ink-soft">We&apos;ll email you a secure link to choose a new password.</p>
        <a href="/forgot-password" className="mt-3 inline-block font-semibold text-teal-strong underline">Send a password reset link</a>
      </section>
      <section aria-labelledby="data">
        <h2 id="data" className="text-2xl font-semibold">Your data</h2>
        <p className="mt-2 text-ink-soft">Download a copy of everything we hold about your account, in JSON format.</p>
        <a href="/api/me/export" className="mt-3 inline-block font-semibold text-teal-strong underline">Download my data</a>
      </section>
      <section aria-labelledby="delete" className="rounded-[var(--radius-lg)] border border-danger/30 p-6">
        <h2 id="delete" className="text-2xl font-semibold text-danger">Delete account</h2>
        {deletion ? (
          <div className="mt-3 space-y-3">
            <p>You requested deletion on {formatDate(deletion.created_at)}. It will be completed within 30 days of that date.</p>
            {deletion.status === "pending" ? (
              <form action={cancelAccountDeletion}>
                <Button type="submit" variant="secondary">Cancel deletion request</Button>
              </form>
            ) : null}
          </div>
        ) : (
          <DeletionForm />
        )}
      </section>
    </div>
  );
}
