# Acceptance report

_Status as of 9 October 2026. Working name: "Kindred Commons" (placeholder until the client's brand is final)._

**Bottom line:** the platform's code is functionally complete for the scope in the brief and passes all automated tests. It is **not yet production-ready**, because it has **not been deployed** and **has not been exercised against real Supabase, Stripe, Resend or Cloudflare accounts**. No credentials for those services were available in the build environment. Every acceptance criterion that depends on them is marked **Blocked** below, with the exact step that unblocks it.

## 1. Final acceptance criteria (brief §28)

| Criterion | Status | Evidence / what unblocks it |
|---|---|---|
| Real users can register and authenticate | **Blocked: needs Supabase project** | Sign-up, confirm, sign-in, reset and sign-out are implemented with server actions and validated (unit tests, browser test of server-side validation). Unblock: deploy (DEPLOYMENT.md §1–4), then sign up. |
| Organizations can register and be approved | **Implemented; blocked on deploy** | DB tests: creation forced to pending, owner membership, admin-only verification, tax-exempt attestation. Admin UI built. |
| Org staff can manage profiles | **Implemented; blocked on deploy** | Profile editing, image upload, team roles and invitations. DB tests: role escalation blocked, last owner protected. |
| Users can discover organizations and opportunities | **Implemented** | Directory, volunteer, events, resources and search pages with filters and pagination; render verified in browser tests (empty-state data). |
| Orgs can publish and transfer resources | **Implemented; blocked on deploy** | DB tests: concurrent approvals cannot over-allocate, partial approval, private address visibility, state machine, cancellation returns quantity, need-listing direction, impact recorded once. |
| Volunteers can register and participate | **Implemented; blocked on deploy** | DB tests: capacity, waitlist promotion, minors/guardian consent, attendance, verification (no self-verification). |
| Orgs can create and operate events | **Implemented; blocked on deploy** | DB tests: capacity, waitlist, idempotent registration, check-in permissions, paid holds, completion impact, cancellation. |
| Authorized users can communicate | **Implemented; blocked on deploy** | DB tests: non-participants can't read or post, sender spoofing blocked, blocks enforced, no cold messaging of individuals. |
| Notifications delivered through providers | **Blocked: needs Resend** | In-app notifications created by DB triggers (tested). Email worker built (atomic claim tested); not sent to a real inbox. |
| Payment flows work with live accounts | **Blocked: needs Stripe (test mode first)** | Checkout, Connect onboarding, webhooks, refunds implemented. Webhook signature handling unit-tested; finalization idempotency and oversell protection DB-tested. Not run against Stripe. Live mode is triple-gated off. |
| Administrators can manage the platform | **Implemented; blocked on deploy** | Full admin console. DB tests: non-admins can't moderate, grant roles, read audit logs or reset demo data. |
| Impact metrics reflect actual recorded activity | **Implemented** | Impact written only on confirmed events; unique per source; demo excluded from public totals (DB-tested). |
| Security and permission tests pass | **Pass** | 46 database security/workflow tests, 22 unit tests, 52 browser tests. |
| Critical workflows work on mobile | **Partially verified** | Public pages tested on a phone viewport (overflow, menu, tap targets, axe). Authenticated flows on mobile need a deployed backend. |
| Production deployment is successful | **Blocked: needs accounts and secrets** | Cloudflare build and local workerd run succeed; deploy workflow written. Unblock: add GitHub secrets (DEPLOYMENT.md §3). |
| Monitoring and recovery documented | **Done** | OPERATIONS.md |

## 2. Automated test results (this commit)

| Suite | Result | Covers |
|---|---|---|
| Database security & workflows (`supabase/tests`) | **46 / 46 pass** | RLS on every sensitive table, cross-org access, role escalation, concurrency on allocation, privacy of addresses/EIN, payments write-protection, donor anonymity, demo isolation, maintenance jobs |
| Unit (`src/**/*.test.ts`) | **22 / 22 pass** | Validation, redirects (open-redirect protection), slugs, currency, distance, time zones across DST, CSV injection protection, matching rules, Stripe webhook signature handling (platform + Connect), live-key refusal |
| Browser (`e2e/`, Playwright, desktop + Pixel 7) | **52 pass, 2 skipped (mobile-only tests on desktop)** | 19 public pages: render, single h1, no horizontal overflow, **axe WCAG 2.2 AA: zero serious/critical violations**; canonical tags, skip link, protected-route redirects, server-side form validation, robots/sitemap/manifest, security headers, cron/webhook endpoints reject anonymous calls, mobile menu behavior and tap targets |
| Type check / lint / build | **Pass** | `tsc --noEmit`, ESLint, `next build`, `opennextjs-cloudflare build`, `wrangler deploy --dry-run` (~2 MB gzipped) |

Database tests run on PostgreSQL 16 with a shim reproducing Supabase's `auth` schema, roles and `auth.uid()`. They have **not** been run against a real Supabase instance. The first deploy's `supabase db push` is the first real-Supabase run (see §5).

## 3. Manual verification performed

- Visual review at 1366 px and 390 px: home, sign-up, directory. Layout, type and spacing reviewed; mobile footer reflowed after review.
- The Worker ran locally under `wrangler dev` (workerd). Public pages returned 200; `/api/cron/*` returned 401 without a secret; the Stripe webhook returned 503 when unconfigured.
- Demo seed applied locally: 6 organizations, 14 people, 37 impact records. Public impact stayed at zero (isolation confirmed); reseed is idempotent; reset removes everything.
- **Not manually verified** (needs a backend): every signed-in screen (dashboards, admin, inbox, forms that write).

## 4. Known defects and limitations

| # | Item | Impact | Suggested fix |
|---|---|---|---|
| 1 | Signed-in screens have never rendered against real data | Possible runtime query errors (for example a PostgREST embed name) that type-checking can't catch | First task after deploy: click through every dashboard and admin page with the demo dataset; add authenticated Playwright tests against the demo project |
| 2 | Distance search has no coordinates | `approx_lat/lng` are never populated, so distance-based matching never triggers and there is no "within X miles" filter. Text city filters work. | Add a ZIP-centroid table or geocoding on save |
| 3 | Refunds of **recurring** donations aren't auto-reconciled | `charge.refunded` matches one-time donations and tickets; renewal refunds won't update the donation row | Store the invoice's payment intent on renewal rows, or match on `charge.invoice` |
| 4 | Browser/native push notifications | Not sent; schema and preferences exist | Web Push (VAPID) or Capacitor push; see MOBILE.md |
| 5 | Messaging isn't live-updating | New messages appear on refresh or navigation (deliberately, to avoid heavy realtime subscriptions) | Supabase Realtime on the open conversation only |
| 6 | PDF export uses browser print | Works ("Save as PDF") but isn't a generated file | Server-side PDF if funders need attachments |
| 7 | Event check-in uses typed codes | No QR scanning | QR on tickets plus camera scanner (also helps app-store review) |
| 8 | Rate limiting is app-level only for contact and donations | Auth endpoints rely on Supabase's built-in limits | Cloudflare WAF rate-limit rules on `/login`, `/signup` |
| 9 | CSP allows inline scripts | Needed by Next.js without nonces | Nonce-based CSP via middleware |
| 10 | Admin member search is by display name | Email isn't exposed to the API by design | Service-role search action for super admins |
| 11 | Policy pages are drafts | Must not launch as-is | Counsel review; paste final text in Admin → Site content |
| 12 | Branding is a placeholder | Name, colors and logo are a working identity | Swap tokens in `globals.css`, `NEXT_PUBLIC_BRAND_NAME`, icons via `scripts/render-icons.mjs` |
| 13 | Performance not measured on a live site | No Lighthouse or Core Web Vitals numbers yet | Run Lighthouse against production after deploy |
| 14 | Header renders per request for signed-in state | Pages can't be statically cached | Move the account and unread badge to a small client island if traffic grows |
| 15 | Offline mode | Not supported | See MOBILE.md |

## 5. External configuration required

Detailed in `DEPLOYMENT.md`:

1. Cloudflare account, domain and API token (Workers Paid recommended)
2. Supabase project (Pro for production) and access token, DB password
3. Stripe platform account with Connect enabled (test mode), plus Connect branding
4. Resend account with a verified sending domain
5. GitHub repository secrets and variables (6 secrets, 7 variables)
6. Bootstrap the first super admin (one SQL statement)
7. Legal review of privacy, terms, guidelines, fundraising and receipt language

**First-deploy watch items:** `supabase db push` is the first run against real Supabase. If a migration fails (most likely areas: storage policies in 0005, the `auth.users` trigger in 0001), the deploy stops before touching the site. Fix with a follow-up migration.

## 6. Security considerations

- Authorization lives in Postgres (RLS + security-definer functions); the app server isn't trusted to enforce it alone.
- Service-role key is server-only (`server-only` import guard), used in a short, audited list of places.
- No card data handled (Stripe Checkout); webhooks verified and idempotent; live payments triple-gated.
- Minors: self-attested age at sign-up, guardian consent per opportunity, private-by-default profiles, adults-only by default for opportunities. **Age is self-attested and not verified**; organizations remain responsible for safeguarding.
- No health or diagnosis data is collected; forms warn against entering it.
- Remaining hardening: items 8, 9 above; add Cloudflare WAF managed rules; enable Supabase leaked-password protection and MFA for platform admins.

## 7. Deployment status

**Not deployed.** The pipeline is in place and skips deployment with a warning until the secrets in DEPLOYMENT.md §3 are added.

## 8. App-packaging readiness

Ready for a Capacitor shell that loads the live site. Before store submission you'd need: Universal/App Links, native push, native share, a QR check-in scanner, and store privacy disclosures. See `MOBILE.md`. Not started.
