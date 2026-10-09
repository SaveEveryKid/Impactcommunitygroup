import { OrgForm } from "@/components/org-form";
import { updateOrganization } from "@/app/actions/organizations";
import { requireOrg } from "@/lib/auth";
import { OrgImages } from "./org-images";

export default async function OrgProfilePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase } = await requireOrg(orgId, "admin");
  const [{ data: org }, { data: priv }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, org_type, mission, description, pillars, service_categories, service_area, city, region, postal_code, public_email, public_phone, website_url, social_links, logo_path, cover_path")
      .eq("id", orgId)
      .single(),
    supabase.rpc("org_private_fields", { p_org: orgId }),
  ]);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <h2 className="mb-6 text-2xl font-semibold">Public profile</h2>
        <OrgForm action={updateOrganization} org={{ ...org!, ein: priv?.[0]?.ein ?? null }} submitLabel="Save profile" showSocial />
      </div>
      <aside className="space-y-8">
        <OrgImages orgId={orgId} logo={org!.logo_path} cover={org!.cover_path} />
      </aside>
    </div>
  );
}
