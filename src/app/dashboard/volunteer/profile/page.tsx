import { Container } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { VolunteerProfileForm } from "./profile-form";

export default async function VolunteerProfilePage() {
  const user = await requireUser("/dashboard/volunteer/profile");
  const supabase = (await getSupabase())!;
  const { data } = await supabase.from("volunteer_profiles").select("*").eq("user_id", user.id).maybeSingle();
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Volunteer preferences</h1>
      <p className="mt-3 text-lg text-ink-soft">
        We use these to recommend opportunities. They&apos;re private unless you choose to let organizations find you.
      </p>
      <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <VolunteerProfileForm profile={data} />
      </div>
    </Container>
  );
}
