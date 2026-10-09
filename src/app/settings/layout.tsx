import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/settings");
  return (
    <Container className="grid gap-8 py-10 md:grid-cols-[200px_1fr]">
      <nav aria-label="Settings" className="flex gap-2 overflow-x-auto md:flex-col">
        <Link href="/settings" className="whitespace-nowrap rounded-full px-4 py-2 font-semibold hover:bg-ink/5">Profile and account</Link>
        <Link href="/settings/notifications" className="whitespace-nowrap rounded-full px-4 py-2 font-semibold hover:bg-ink/5">Notifications</Link>
        <Link href="/dashboard/volunteer/profile" className="whitespace-nowrap rounded-full px-4 py-2 font-semibold hover:bg-ink/5">Volunteer preferences</Link>
      </nav>
      <div className="min-w-0 max-w-2xl">{children}</div>
    </Container>
  );
}
