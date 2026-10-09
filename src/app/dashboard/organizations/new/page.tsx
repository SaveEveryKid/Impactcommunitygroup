import type { Metadata } from "next";
import { OrgForm } from "@/components/org-form";
import { Container } from "@/components/ui/misc";
import { createOrganization } from "@/app/actions/organizations";

export const metadata: Metadata = { title: "Register an organization" };

export default function NewOrganizationPage() {
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Register your organization</h1>
      <p className="mt-3 text-lg text-ink-soft">
        You&apos;ll be the owner. Your profile stays private to your team until a person on our review team approves it, usually within a few business days.
      </p>
      <div className="mt-10 rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <OrgForm action={createOrganization} submitLabel="Create organization" />
      </div>
    </Container>
  );
}
