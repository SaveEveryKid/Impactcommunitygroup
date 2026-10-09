import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { decideVerification } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { ORG_TYPE_LABEL, VERIFICATION_LABEL, type OrgType } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

export default async function Verifications({ searchParams }: { searchParams: Promise<{ error?: string; all?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff("admin");
  let q = supabase
    .from("verification_requests")
    .select("id, org_id, requested_level, ein, document_paths, applicant_notes, status, decision_note, created_at, profiles:submitted_by(display_name), organizations(name, slug, org_type, city, region, website_url, public_email, mission, status)")
    .order("created_at", { ascending: true })
    .limit(100);
  if (!sp.all) q = q.in("status", ["submitted", "in_review", "needs_info"]);
  const { data } = await q;
  type R = { id: string; org_id: string; requested_level: string; ein: string | null; document_paths: string[]; applicant_notes: string | null; status: string; decision_note: string | null; created_at: string; profiles: { display_name: string } | null; organizations: { name: string; slug: string; org_type: string; city: string | null; region: string | null; website_url: string | null; public_email: string | null; mission: string | null; status: string } };
  const rows = (data ?? []) as unknown as R[];
  const docs = await Promise.all(
    rows.map(async (r) =>
      Promise.all(r.document_paths.map(async (p) => ({ path: p, url: (await supabase.storage.from("documents").createSignedUrl(p, 600)).data?.signedUrl }))),
    ),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Verification requests</h2>
        <Link href={sp.all ? "/admin/verifications" : "/admin/verifications?all=1"} className="font-semibold text-teal-strong underline">{sp.all ? "Show open only" : "Show all"}</Link>
      </div>
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      {!rows.length ? <p className="text-ink-muted">No requests waiting.</p> : null}
      {rows.map((r, i) => (
        <article key={r.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">{r.organizations.name}</h3>
              <p className="text-ink-muted">{ORG_TYPE_LABEL[r.organizations.org_type as OrgType]}, {r.organizations.city}, {r.organizations.region}. Submitted by {r.profiles?.display_name ?? "unknown"} {formatDateTime(r.created_at)}</p>
            </div>
            <div className="flex gap-2"><Badge tone="warn">{r.status.replace("_", " ")}</Badge><Badge>{VERIFICATION_LABEL[r.requested_level as keyof typeof VERIFICATION_LABEL]}</Badge></div>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm text-ink-muted">Mission</dt><dd>{r.organizations.mission}</dd></div>
            <div><dt className="text-sm text-ink-muted">Website</dt><dd>{r.organizations.website_url ? <a href={r.organizations.website_url} target="_blank" rel="noopener noreferrer" className="break-all text-teal-strong underline">{r.organizations.website_url}</a> : "None given"}</dd></div>
            <div><dt className="text-sm text-ink-muted">EIN</dt><dd>{r.ein ?? "Not provided"}{r.ein ? <> (<a href={`https://apps.irs.gov/app/eos/`} target="_blank" rel="noopener noreferrer" className="text-teal-strong underline">IRS Tax Exempt Organization Search</a>)</> : null}</dd></div>
            <div><dt className="text-sm text-ink-muted">Documents</dt><dd>{docs[i].length ? docs[i].map((d) => <a key={d.path} href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="mr-3 text-teal-strong underline">{d.path.split("/").pop()}</a>) : "None"}</dd></div>
            {r.applicant_notes ? <div className="sm:col-span-2"><dt className="text-sm text-ink-muted">Applicant notes</dt><dd className="whitespace-pre-line">{r.applicant_notes}</dd></div> : null}
          </dl>
          <Link href={`/organizations/${r.organizations.slug}`} className="mt-3 inline-block font-semibold text-teal-strong underline">Preview profile</Link>
          {["submitted", "in_review", "needs_info"].includes(r.status) ? (
            <form action={decideVerification} className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
              <input type="hidden" name="request_id" value={r.id} />
              <label className="flex flex-col gap-1 text-sm font-semibold">Note to the organization (required to request info or reject)
                <textarea name="note" rows={2} maxLength={2000} className="rounded-[10px] border border-line-strong p-3 font-normal" />
              </label>
              {r.requested_level === "tax_exempt_verified" ? (
                <label className="flex items-start gap-2"><input type="checkbox" name="tax_checked" className="mt-1 h-5 w-5" /> I looked up this EIN in IRS records and confirmed current tax-exempt status matching this organization.</label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="decision" value="approved">Approve</Button>
                <Button type="submit" name="decision" value="needs_info" variant="secondary">Request more info</Button>
                <Button type="submit" name="decision" value="in_review" variant="ghost">Mark in review</Button>
                <Button type="submit" name="decision" value="rejected" variant="danger">Reject</Button>
              </div>
            </form>
          ) : r.decision_note ? <p className="mt-3 text-ink-muted">Decision note: {r.decision_note}</p> : null}
        </article>
      ))}
    </div>
  );
}
