import Link from "next/link";
import { Bell, MessageSquare } from "lucide-react";
import { BrandLink } from "@/components/brand";
import { Container } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { MobileMenu } from "@/components/mobile-menu";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";

export const PUBLIC_NAV = [
  { href: "/organizations", label: "Organizations" },
  { href: "/volunteer", label: "Volunteer" },
  { href: "/events", label: "Events" },
  { href: "/resources", label: "Resource exchange" },
  { href: "/impact", label: "Impact" },
];

async function unreadCount(userId: string) {
  const supabase = await getSupabase();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur supports-[backdrop-filter]:bg-paper/80" style={{ paddingTop: "var(--safe-top)" }}>
      <Container className="flex h-16 items-center justify-between gap-4">
        <BrandLink />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="rounded-full px-3.5 py-2 text-[0.95rem] font-semibold text-ink-soft hover:bg-ink/5 hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/inbox" className="hidden h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-ink/5 sm:grid" aria-label="Messages">
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                href="/notifications"
                className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-ink/5"
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unread ? (
                  <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[0.65rem] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
              <UserMenu name={user.displayName} isStaff={Boolean(user.platformRole)} />
            </>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-full px-4 py-2 text-[0.95rem] font-semibold text-ink hover:bg-ink/5 sm:inline-flex">
                Sign in
              </Link>
              <LinkButton href="/signup" size="sm" className="hidden sm:inline-flex">
                Join the network
              </LinkButton>
            </>
          )}
          <MobileMenu items={PUBLIC_NAV} signedIn={Boolean(user)} />
        </div>
      </Container>
    </header>
  );
}
