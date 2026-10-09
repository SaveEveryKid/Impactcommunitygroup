import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { requireOrg } from "@/lib/auth";
import { VERIFICATION_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { VerificationForm } from "./verification-form";

export default async function VerificationPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { orgId } = await params;
  const { welcome } = await searchParams;
  const { org, supabase } = await requireOrg(orgId, "admin");
  const { data: requests } = await supabase
    .from("verification_requests")
    .select("id, requested_level, status, decision_note, created_at, decided_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  const open = (requests ?? []).find((r) => ["submitted", "in_review", "needs_info"].includes(r.status));
  const needsInfo = open?.status === "needs_info";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {welcome ? (
          <FormMessage tone="success">
            {org.name} is created and you&apos;re its owner. Submit it for review below so it can go live, then finish your profile and invite your team.
          </FormMessage>
        ) : null}
        <div>
          <h2 className="text-2xl font-semibold">Verification</h2>
          <p className="mt-2 text-ink-soft">
            Current level: <strong>{VERIFICATION_LABEL[org.verification_level]}</strong>
          </p>
        </div>
        {open && !needsInfo ? (
          <FormMessage tone="info">Your request is {open.status.replace("_", " ")}. We&apos;ll notify you when there&apos;s a decision.</FormMessage>
        ) : org.verification_level === "tax_exempt_verified" ? (
          <FormMessage tone="success">Your organization is fully verified.</FormMessage>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
            {needsInfo ? (
              <div className="mb-6">
                <FormMessage tone="error">Our reviewers need more information: {open?.decision_note}</FormMessage>
              </div>
            ) : null}
            <VerificationForm orgId={orgId} allowIdentity={org.verification_level === "unverified"} />
          </div>
        )}
        {requests?.length ? (
          <section>
            <h3 className="text-lg font-semibold">History</h3>
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
              {requests.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.status === "approved" ? "teal" : r.status === "rejected" ? "danger" : "neutral"}>{r.status.replace("_", " ")}</Badge>
                    <span className="text-sm text-ink-muted">
                      {VERIFICATION_LABEL[r.requested_level as keyof typeof VERIFICATION_LABEL]}, submitted {formatDate(r.created_at)}
                    </span>
                  </div>
                  {r.decision_note ? <p className="mt-2 text-ink-soft">{r.decision_note}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <aside className="space-y-4 text-[0.95rem] text-ink-soft">
        <h3 className="font-display text-lg font-semibold text-ink">What we check</h3>
        <p>
          <strong>Verified organization:</strong> a reviewer confirms the organization exists and operates as described, using your website,
          public records, and any documents you provide.
        </p>
        <p>
          <strong>Tax-exempt status checked:</strong> additionally, a reviewer looks up your EIN in the IRS Tax Exempt Organization Search. Only then do
          donors see that your status was checked.
        </p>
        <p>Documents are stored privately and seen only by your organization&apos;s admins and our review team.</p>
      </aside>
    </div>
  );
}
