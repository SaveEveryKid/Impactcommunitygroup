import type { Metadata } from "next";
import { Container } from "@/components/ui/misc";
import { AdminNav } from "@/components/admin-nav";
import { requirePlatformStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Platform admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePlatformStaff("moderator");
  return (
    <>
      <div className="border-b border-line bg-ink text-white">
        <Container className="pt-6">
          <p className="text-sm text-white/60">Signed in as {user.displayName}, {user.platformRole?.replace("_", " ")}</p>
          <h1 className="mt-1 text-2xl font-bold">Platform admin</h1>
          <AdminNav role={user.platformRole!} />
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </>
  );
}
