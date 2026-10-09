# Deployment guide

Production runs on **Cloudflare Workers** (via the OpenNext adapter), with **Supabase** for the database, auth and file storage, **Stripe** for payments, and **Resend** for email. Every push to `main` is tested and deployed automatically by GitHub Actions (`.github/workflows/deploy.yml`).

```
GitHub push → CI (lint, types, unit + DB security tests, Playwright + axe)
            → supabase db push (migrations)
            → Supabase Auth config (URLs, email templates, SMTP)
            → OpenNext build → wrangler deploy → Worker secrets
            → Stripe webhook endpoints (created once, secrets stored in Cloudflare)
            → smoke test
```

If any required secret is missing, the deploy job is **skipped with a warning**. Tests still run, and nothing half-deploys.

---

## 1. Create the accounts (client-owned)

Create every account under the organization's own email (see `HANDOFF.md`), not the developer's.

| Service | What to create | Plan notes |
|---|---|---|
| GitHub | The repository (already exists) | Free is fine |
| Cloudflare | Account and the domain (add the domain to Cloudflare DNS) | **Workers Paid ($5/mo)** is recommended. The free plan's 3 MB script limit is close to this app's size (~2 MB gzipped), and its CPU limits are tight for server rendering. |
| Supabase | A project (region: US East is closest to Alabama) | **Pro** for production: daily backups, no pausing, PITR available |
| Stripe | Platform account, with **Connect** enabled (Express accounts) | Start in **test mode** |
| Resend | Account; verify the sending domain (DNS records in Cloudflare) | Free tier covers early volume |

A second Supabase project is recommended for the **demo environment** (see section 7).

## 2. Create API tokens

**Cloudflare API token** (My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template). It needs:
- Account: Workers Scripts **Edit**, Workers R2 Storage **Edit**, Account Settings **Read**
- Zone (your domain): Workers Routes **Edit**

Also copy the **Account ID** (Workers & Pages overview, right sidebar).

**Supabase access token**: supabase.com → Account → Access Tokens → Generate. Also note:
- **Project ref**: the `xxxx` in `https://xxxx.supabase.co`
- **Database password**: the one set when creating the project (Project Settings → Database to reset it)

**Stripe secret key**: Developers → API keys → Secret key (`sk_test_...` until launch).

**Resend API key**: API Keys → Create (Sending access).

**CRON_SECRET**: any long random string, e.g. the output of `openssl rand -hex 32`.

## 3. Add them to GitHub

Repository → Settings → Secrets and variables → Actions.

**Secrets** (encrypted):

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token |
| `SUPABASE_DB_PASSWORD` | Supabase database password |
| `STRIPE_SECRET_KEY` | `sk_test_...` (switch to live only at launch) |
| `RESEND_API_KEY` | Resend key |
| `CRON_SECRET` | Random string |

**Variables** (plain):

| Name | Example |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `0123abcd...` |
| `SUPABASE_PROJECT_REF` | `abcdefghijklmnop` |
| `NEXT_PUBLIC_SITE_URL` | Optional. Leave unset to run at `https://impactcommunitygroup.<your-subdomain>.workers.dev`. Set to `https://www.yourdomain.org` once you have a domain. |
| `NEXT_PUBLIC_BRAND_NAME` | `Kindred Commons` (working name) |
| `EMAIL_FROM` | `Kindred Commons <notifications@yourdomain.org>` |
| `STRIPE_ALLOW_LIVE` | `false` until launch approval |
| `NEXT_PUBLIC_APP_ENV` | `production` (or `demo` for a demo deployment) |

The Supabase anon and service-role keys are **not** stored in GitHub. The workflow reads them from the Supabase Management API at deploy time and writes them straight to Cloudflare Worker secrets.

## 4. First deploy

1. Push to `main` (or Actions → Deploy → Run workflow).
2. The workflow applies all migrations, configures Auth, deploys the Worker, and creates the two Stripe webhook endpoints (platform and Connect). It stores their signing secrets in Cloudflare automatically on first creation.
3. **Attach your domain** (skip until you have one; the site runs on its workers.dev address meanwhile): Cloudflare → Workers & Pages → `impactcommunitygroup` → Settings → Domains & Routes → Add custom domain → `www.yourdomain.org`. It must match `NEXT_PUBLIC_SITE_URL`.
4. **Make Toni a super admin.** Toni signs up on the live site, confirms email, then in Supabase → SQL Editor runs:
   ```sql
   insert into public.platform_admins (user_id, role)
   select id, 'super_admin' from auth.users where email = 'toni@example.org';
   ```
   After that, Toni grants other staff roles from **Admin → Users**. No more SQL is needed.

## 4b. Moving from workers.dev to a custom domain later

Add the domain to Cloudflare, attach it to the Worker (step 3), set the `NEXT_PUBLIC_SITE_URL` variable, and re-run Deploy. Supabase auth URLs and the Stripe webhook endpoints are updated automatically. Afterwards you can delete the old workers.dev webhook endpoints in Stripe → Developers → Webhooks.

## 5. Things the workflow cannot do (one-time, by hand)

- **Stripe Connect settings**: Dashboard → Connect → Settings: set the platform name, icon, brand color, and support email shown to organizations during onboarding. Complete Stripe's platform profile questionnaire.
- **Resend domain verification**: add the DNS records Resend shows (in Cloudflare DNS).
- **Supabase plan / backups**: upgrade to Pro and consider PITR (see `OPERATIONS.md`).
- **Legal review**: replace the draft policies (Admin → Site content → Privacy / Terms) with counsel-approved text.

## 6. Going live with payments

Live payments are blocked by **three independent switches**, so money can't move by accident:

1. GitHub variable `STRIPE_ALLOW_LIVE` = `true`
2. GitHub secret `STRIPE_SECRET_KEY` = `sk_live_...`
3. Admin → Settings → "Live payments enabled" = On (super admin only, with confirmation)

Before flipping them: complete Stripe's live activation, confirm the platform fee (default 0%), have counsel review fundraising, receipt and refund language, and run one real $1 donation and refund end to end.

The deploy creates **new live-mode webhook endpoints** the first time it runs with a live key.

## 7. Demo environment

Use a **separate** Supabase project and a separate Worker (copy `wrangler.jsonc`, change `name`, the service binding and the bucket name; set `NEXT_PUBLIC_APP_ENV=demo`). Then:

```bash
# In the demo project's SQL editor (or psql), mark it as demo:
update public.platform_settings set value = '"demo"' where key = 'environment';
# Load fictional data (refuses to run unless marked demo):
DEMO_DATABASE_URL="postgres://postgres:...@db.<demo-ref>.supabase.co:5432/postgres" npm run db:seed:demo
```

The demo site shows a permanent "Demonstration environment" banner, labels every number as fictional, and is excluded from search engines. Demo sign-in accounts are listed at the top of `supabase/seed/demo.sql`.

## 8. Local development

```bash
cp .env.example .env.local      # fill Supabase URL/anon key (a dev project), optionally Stripe test keys
npm install
npm run dev                     # http://localhost:3000
npm run cf:preview              # run under the Cloudflare runtime locally
```

Database tests need a disposable Postgres 15+ server:

```bash
TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

For Stripe webhooks locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and put the printed `whsec_...` in `.env.local`.

## 9. Scheduled jobs

Cloudflare Cron Triggers (in `wrangler.jsonc`) call two protected endpoints through the Worker:

| Schedule | Endpoint | Does |
|---|---|---|
| every 5 min | `/api/cron/emails` | Sends queued notification emails (retries up to 3 times) |
| every 15 min | `/api/cron/maintenance` | Releases unpaid seat holds, expires old listings, sends 24-hour reminders |

Both require `Authorization: Bearer $CRON_SECRET`.
