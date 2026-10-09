/**
 * Cloudflare Worker entry. Wraps the OpenNext-generated Next.js handler and
 * adds Cron Triggers (see "triggers" in wrangler.jsonc). Scheduled runs call the
 * app's own authenticated cron endpoints through the self-reference binding.
 */
// @ts-expect-error: generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

type Env = { WORKER_SELF_REFERENCE: Fetcher; CRON_SECRET?: string; NEXT_PUBLIC_SITE_URL?: string };

const JOBS: Record<string, string[]> = {
  "*/5 * * * *": ["/api/cron/emails"],
  "*/15 * * * *": ["/api/cron/maintenance"],
};

export default {
  fetch: handler.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (!env.CRON_SECRET) {
      console.error("[cron] CRON_SECRET is not set; skipping scheduled jobs");
      return;
    }
    const base = env.NEXT_PUBLIC_SITE_URL ?? "https://localhost";
    for (const path of JOBS[controller.cron] ?? []) {
      ctx.waitUntil(
        env.WORKER_SELF_REFERENCE.fetch(new Request(`${base}${path}`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }))
          .then(async (r) => console.log(`[cron] ${path} -> ${r.status} ${await r.text()}`))
          .catch((e) => console.error(`[cron] ${path} failed`, e)),
      );
    }
  },
} satisfies ExportedHandler<Env>;
