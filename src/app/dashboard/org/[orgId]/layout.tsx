import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge, Container, VerificationBadge } from "@/components/ui/misc";
import { OrgTabs } from "@/components/org-tabs";
import { requireOrg } from "@/lib/auth";

export default async function OrgDashboardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org, role } = await requireOrg(orgId);
  return (
    <>
      <div className="border-b border-line bg-paper-raised">
        <Container className="pt-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm capitalize text-ink-muted">Your role: {role}</p>
              <h1 className="mt-1 truncate text-3xl font-bold">{org.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                {org.status === "approved" ? <Badge tone="teal">Live</Badge> : org.status === "pending" ? <Badge tone="warn">Awaiting review</Badge> : <Badge tone="danger">{org.status}</Badge>}
                <VerificationBadge level={org.verification_level} />
              </div>
            </div>
            <Link href={`/organizations/${org.slug}`} className="inline-flex items-center gap-1.5 font-semibold text-teal-strong hover:underline">
              View public page <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <OrgTabs orgId={org.id} role={role} />
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </>
  );
}
