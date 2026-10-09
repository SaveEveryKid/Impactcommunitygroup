import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { endAnnouncement } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { AnnouncementForm, ContentForm } from "./forms";

const BLOCKS = [
  { key: "about.story", label: "About page story", hint: "Replaces the About page body. Title replaces the page heading.", json: false },
  { key: "partners.sponsors", label: "Sponsors list", hint: 'Structured data, e.g. {"sponsors":[{"name":"Acme Co","tier":"Founding sponsor","url":"https://acme.example"}]}. List only confirmed sponsors.', json: true },
  { key: "legal.privacy", label: "Privacy policy (final)", hint: "Paste the counsel-approved policy to replace the draft.", json: false },
  { key: "legal.terms", label: "Terms of service (final)", hint: "Paste the counsel-approved terms to replace the draft.", json: false },
  { key: "legal.guidelines", label: "Community guidelines (final)", hint: "Replaces the built-in guidelines.", json: false },
];

export default async function AdminContent() {
  const { supabase } = await requirePlatformStaff("admin");
  const [{ data: blocks }, { data: anns }] = await Promise.all([
    supabase.from("site_content").select("key, title, body, data, updated_at"),
    supabase.from("site_announcements").select("id, title, severity, is_active, starts_at, ends_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const byKey = new Map((blocks ?? []).map((b) => [b.key, b]));
  return (
    <div className="space-y-12">
      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold">Site announcement</h2>
          <p className="mt-1 text-sm text-ink-muted">Shown in a bar above the header on every page.</p>
          <div className="mt-4 rounded-[var(--radius-lg)] border border-line bg-surface p-6"><AnnouncementForm /></div>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Recent announcements</h3>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
            {(anns ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 p-3">
                <span><strong>{a.title}</strong> <Badge tone={a.is_active ? "teal" : "neutral"}>{a.is_active ? "active" : "ended"}</Badge>{a.ends_at ? <span className="text-sm text-ink-muted"> until {formatDate(a.ends_at)}</span> : null}</span>
                {a.is_active ? <form action={endAnnouncement}><input type="hidden" name="id" value={a.id} /><Button type="submit" size="sm" variant="ghost">End</Button></form> : null}
              </li>
            ))}
            {!anns?.length ? <li className="p-3 text-ink-muted">None yet.</li> : null}
          </ul>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Editable pages</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {BLOCKS.map((b) => {
            const cur = byKey.get(b.key);
            return (
              <div key={b.key} className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
                <h3 className="text-lg font-semibold">{b.label}</h3>
                <p className="mt-1 text-sm text-ink-muted">{b.hint}{cur ? ` Last updated ${formatDate(cur.updated_at)}.` : " Using built-in text."}</p>
                <ContentForm contentKey={b.key} json={b.json} title={cur?.title ?? ""} body={cur?.body ?? ""} data={cur?.data && Object.keys(cur.data).length ? JSON.stringify(cur.data, null, 2) : ""} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
