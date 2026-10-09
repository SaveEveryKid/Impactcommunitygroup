import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { resetDemoData, saveSetting } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { appEnv } from "@/lib/env";
import { isStripeConfigured } from "@/lib/stripe";

const LABELS: Record<string, string> = {
  "registration.open": "Allow new sign-ups",
  "organizations.require_verification_for_fundraising": "Require verification before fundraising",
  "payments.live_enabled": "Live payments enabled",
  "payments.platform_fee_bps": "Platform fee on organization payments (basis points, 100 = 1%)",
  environment: "Environment label",
};

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requirePlatformStaff("admin");
  const { data } = await supabase.from("platform_settings").select("key, value, description, updated_at").order("key");
  const checks = [
    ["Database", true],
    ["Service role key (server)", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)],
    ["Stripe", isStripeConfigured()],
    ["Stripe webhook secret", Boolean(process.env.STRIPE_WEBHOOK_SECRET)],
    ["Email (Resend)", Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)],
    ["Scheduled jobs secret", Boolean(process.env.CRON_SECRET)],
  ] as const;
  return (
    <div className="space-y-10">
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <section>
        <h2 className="text-2xl font-semibold">Connections</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map(([l, ok]) => (
            <li key={l} className={`rounded-[var(--radius-md)] border p-4 ${ok ? "border-teal/30 bg-teal-wash" : "border-warn/30 bg-warn-wash"}`}><strong>{l}</strong><span className="block text-sm">{ok ? "Configured" : "Not configured"}</span></li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Platform settings</h2>
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {(data ?? []).map((s) => (
            <li key={s.key} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl"><p className="font-semibold">{LABELS[s.key] ?? s.key}</p><p className="text-sm text-ink-muted">{s.description}</p></div>
              <form action={saveSetting} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="key" value={s.key} />
                {typeof s.value === "boolean" ? (
                  <select name="value" defaultValue={String(s.value)} aria-label={LABELS[s.key] ?? s.key} className="h-9 rounded-[8px] border border-line-strong px-2"><option value="true">On</option><option value="false">Off</option></select>
                ) : s.key === "environment" ? (
                  <select name="value" defaultValue={String(s.value)} aria-label="Environment" className="h-9 rounded-[8px] border border-line-strong px-2"><option value="production">Production</option><option value="demo">Demo</option></select>
                ) : (
                  <input name="value" defaultValue={String(s.value)} aria-label={LABELS[s.key] ?? s.key} className="h-9 w-24 rounded-[8px] border border-line-strong px-2" />
                )}
                {s.key === "payments.live_enabled" ? <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="confirm" className="h-4 w-4" /> Legal and Stripe review done</label> : null}
                <Button type="submit" size="sm" variant="secondary" disabled={s.key === "payments.live_enabled" && user.platformRole !== "super_admin"}>Save</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      {appEnv === "demo" && user.platformRole === "super_admin" ? (
        <section className="rounded-[var(--radius-lg)] border border-danger/30 bg-surface p-6">
          <h2 className="text-xl font-semibold text-danger">Reset demonstration data</h2>
          <p className="mt-1 text-ink-soft">Deletes every organization, person and record flagged as demo. Then run the seed script to recreate them.</p>
          <form action={resetDemoData} className="mt-3 flex flex-wrap gap-2"><input name="confirm" placeholder="Type RESET" aria-label="Type RESET to confirm" className="h-10 rounded-[8px] border border-line-strong px-2" /><Button type="submit" variant="danger">Reset demo data</Button></form>
        </section>
      ) : null}
    </div>
  );
}
