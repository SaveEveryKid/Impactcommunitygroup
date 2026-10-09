# Operations: maintenance, backups, recovery, monitoring

## Backups

| What | How | Retention |
|---|---|---|
| Database | Supabase Pro daily backups (automatic). Enable **Point-in-Time Recovery** for minute-level restore if budget allows. | 7 days (Pro), longer with PITR |
| Database (off-platform copy) | Monthly: `supabase db dump --linked -f backup-YYYY-MM.sql` and `--data-only`. Store in the organization's own encrypted storage. | 12 months |
| Uploaded files | Supabase Storage (`media` public, `documents` private). Export monthly with `supabase storage` CLI or an rclone S3 sync. | 12 months |
| Code | GitHub (every commit) | Permanent |
| Payments | Stripe is the system of record; the `payment_records` table mirrors it | Stripe retains indefinitely |

**Test a restore every quarter** to a scratch Supabase project, and check that sign-in, organization pages and impact totals look right.

## Recovery runbooks

**Bad deploy (site broken).** Cloudflare → Workers & Pages → `kindred-commons` → Deployments → roll back to the previous version (one click). Then fix forward with a new commit.

**Bad migration.** Migrations are forward-only. Write a new migration that reverses the change, push, and let the pipeline apply it. If data was damaged, restore with PITR to a new project, copy the affected rows back, and verify. Never edit an already-applied migration file. See `supabase/rollbacks/README.md`.

**Leaked secret.** Rotate immediately:
- Supabase service role / JWT secret: Project Settings → API → roll keys, then re-run the Deploy workflow (it re-reads keys)
- Stripe: Developers → API keys → roll; update the GitHub secret; re-run Deploy. For webhook secrets, delete the endpoint in Stripe and re-run Deploy (it recreates the endpoint and stores the new secret)
- Resend / Cloudflare / CRON_SECRET: regenerate, update the GitHub secret, re-run Deploy
- Review **Admin → Audit log** and Supabase logs for misuse

**Payment events stuck.** Admin → Campaigns and payments lists unprocessed events. Fix the cause, then in Stripe → Webhooks → the event → **Resend**. Handlers are idempotent, so resending is safe.

**Supabase outage.** Public pages render a "database isn't connected" notice instead of crashing. Check status.supabase.com. No action is needed on our side.

## Monitoring

- **Cloudflare Workers Observability** (enabled in `wrangler.jsonc`): request logs, errors, cron runs. Set an email alert for error rate.
- **Supabase**: Reports → API and database health; set usage alerts.
- **Stripe**: Developers → Webhooks shows delivery failures. Turn on email alerts for failed webhooks.
- **Uptime**: add an external monitor (for example UptimeRobot or Better Stack, free tier) for `/` and `/organizations`, alerting the organization's ops email.
- Server errors are logged with a `[area]` prefix (for example `[stripe webhook]`, `[cron:maintenance]`, `[db]`), so they're easy to search in logs.

## Routine maintenance

| Frequency | Task |
|---|---|
| Daily | Admin queue (verification, reports, contact inbox) |
| Weekly | Review Cloudflare error logs; check that the email cron is sending (Resend → Logs) |
| Monthly | Reconcile payment ledger with Stripe; off-platform DB dump; `npm outdated` and patch updates via PR (CI must pass) |
| Quarterly | Restore test; access review (who has platform roles, Cloudflare/Supabase/Stripe/GitHub members); rotate CRON_SECRET |
| Yearly | Legal review of policies; renew Apple/Google developer accounts if mobile apps exist |

## Data retention and deletion

- Account deletion requests are processed in Admin → Users within 30 days. Deleting the auth user cascades to profile, memberships, messages sent (sender set to null), applications and registrations. Donations remain with the donor link removed, for accounting.
- `rate_limit_buckets` older than one day are cleaned up automatically.
- `stripe_events` payloads can be pruned after 18 months:
  `delete from stripe_events where processed_at < now() - interval '18 months';`
