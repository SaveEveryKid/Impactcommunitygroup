# Technical architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI and server | Next.js 15 (App Router), React 19, TypeScript strict | Server components keep JavaScript small; server actions keep mutations on the server |
| Styling | Tailwind CSS v4 with design tokens in `src/app/globals.css` | One source of truth for color, type and radius |
| Fonts | Bricolage Grotesque (display), Atkinson Hyperlegible (body), self-hosted via Fontsource | No third-party font requests; Atkinson was designed for low-vision readers |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` | Client's chosen host; R2 for the incremental cache, the Images binding for `next/image`, Cron Triggers for jobs |
| Database / auth / files | Supabase (Postgres 15, GoTrue, Storage) | Row-level security enforces permissions in the database itself |
| Payments | Stripe Checkout + Connect Express (destination charges) | Card data never touches our servers; organizations receive funds directly |
| Email | Resend (HTTP API for notifications, SMTP for Supabase Auth emails) | |
| Tests | Vitest (unit + database), Playwright + axe (browser, accessibility, mobile) | |

Alternatives considered: Vercel (the brief's default) was replaced by Cloudflare at the client's request. All Node APIs used (`crypto` HMAC/SHA-256/timingSafeEqual, `Buffer`) are covered by Workers' `nodejs_compat`. Stripe uses its fetch HTTP client and Web Crypto webhook verification, which work on Workers.

## Security model

**The database is the security boundary.** The browser and server talk to Supabase as the signed-in user (anon key + user JWT). Every table has row-level security, and every multi-step or sensitive operation is a `security definer` function that checks the caller's role itself. The Next.js server repeats permission checks only for good error messages, never as the sole guard.

- **Org roles**: `owner > admin > coordinator > member` via `has_org_role(org, min_role)`. Role changes only go through `set_member_role` / `remove_member` (no direct writes), which prevent self-promotion and orphaned organizations.
- **Platform roles**: `moderator`, `admin`, `super_admin` in `platform_admins`, writable only with the service role (from the super-admin server action).
- **Privileged columns** (organization status/verification, `is_demo`, quantities, event status) are protected by `BEFORE` triggers that reset or reject client changes.
- **Column-level grants** hide EIN and internal reviewer IDs from the API entirely.
- **Private details** (pickup addresses, virtual event links) live in separate tables with narrower policies.
- **Service role** is used only in: Stripe webhooks, cron jobs, email delivery, contact form insert, rate limiting, and specific super-admin actions. It is never sent to the browser (`server-only` imports enforce this at build time).

## Data model (main tables)

```
profiles ─┬─ organization_members ── organizations ─┬─ verification_requests
          │                                          ├─ resources ── resource_private_details
          │                                          │     └─ resource_requests ── resource_transfers ── resource_transfer_events
          │                                          ├─ volunteer_opportunities ── volunteer_shifts
          ├─ volunteer_applications ─────────────────┘        └─ volunteer_applications ── volunteer_hours
          ├─ event_registrations ── events ── event_private_details
          ├─ conversation_participants ── conversations ── messages
          ├─ notifications, notification_preferences, push_subscriptions
          ├─ follows, posts, post_comments, post_reactions
          └─ donations ── fundraising_campaigns, payment_records, stripe_events
impact_records (unique per source + metric), content_reports, audit_logs, platform_settings, site_content
```

Migrations are in `supabase/migrations/` (applied in filename order by `supabase db push`).

## Key workflows and their guarantees

**Resource exchange.** `request_resource` → `decide_resource_request` locks the listing row (`FOR UPDATE`) and decrements `quantity_available` in the same transaction, so two simultaneous approvals can never over-allocate (tested with concurrent connections). Partial approval is supported. `transition_transfer` is an explicit state machine (`reserved → scheduled → collected → delivered → completed`, plus `cancelled`/`problem`), with per-role permissions. Cancelling returns the quantity. Every transition is logged in `resource_transfer_events`. For **need** listings, the responder is the giver.

**Volunteers and events.** Sign-ups lock the parent row and check capacity; overflow goes to a waitlist; cancellations promote the next person. Paid registrations hold a seat for 30 minutes (`pending_payment`); `finalize_event_payment` confirms idempotently, or flags a refund if the hold lapsed and the event filled.

**Impact.** Triggers write `impact_records` when something is *confirmed*: a transfer completed by the receiver, hours verified by a coordinator (never self-verified), an event completed (counting checked-in attendees), a partnership accepted, a payment confirmed by webhook. A unique key `(source_type, source_id, metric)` prevents double counting. Organizations can add `self_reported`/`estimated` records, which are always displayed separately. `public_impact_summary()` excludes demo data.

**Payments.** Checkout Sessions are created server-side with an idempotency key and a pending `donations` row. The webhook verifies the signature (platform and Connect secrets), stores the event in `stripe_events` (primary key = Stripe event ID) for idempotency, then updates state. Failed processing returns 500 so Stripe retries. Refunds update `refunded_cents` and the ledger (`payment_records`). Live keys are refused unless explicitly enabled.

**Notifications.** Database triggers call `notify()` (deduplicated by `dedupe_key`, respecting preferences). The email cron claims batches with `FOR UPDATE SKIP LOCKED`, sends through Resend with idempotency keys, and retries up to 3 times. Emails include a signed one-click unsubscribe link.

## Directory layout

```
src/app/                 routes (public pages, (auth), dashboard, admin, api)
src/app/actions/         server actions (all mutations)
src/components/          UI components (ui/ = primitives)
src/lib/                 supabase clients, auth guards, queries, payments, email, matching, validation
supabase/migrations/     schema, RLS, functions (source of truth)
supabase/tests/          database security & workflow tests (run on plain Postgres with a Supabase shim)
supabase/seed/demo.sql   fictional demo data (guarded)
scripts/                 deploy helpers (Supabase auth config, Stripe webhooks), icons, screenshots
e2e/                     Playwright tests
worker.ts, wrangler.jsonc, open-next.config.ts   Cloudflare runtime
```

## Matching

`src/lib/matching-core.ts` scores opportunities and resources with transparent rules (shared well-being areas, skills, location/distance, schedule, posted needs, expiry). Every point carries a human-readable reason, shown in the UI. No external AI services are used.

## Performance

- Server components by default; client JavaScript only for forms and menus (about 103 kB shared first load).
- Paginated lists everywhere (12 to 50 per page); large aggregates computed in SQL (`platform_impact_summary`, `campaign_progress`).
- Indexes on every foreign key used for lookups, plus GIN indexes for full-text search and pillar arrays.
- Images are served via the Cloudflare Images binding with `next/image`.

Not yet measured: Lighthouse/Core Web Vitals against a live deployment with real data. See `ACCEPTANCE_REPORT.md`.
