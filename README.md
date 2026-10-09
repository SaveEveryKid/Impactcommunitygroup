# Kindred Commons (working name)

A community collaboration network that connects the people who want to help with the organizations, resources and opportunities that make helping possible. It's organized around five well-being pillars: mental, physical, social, spiritual and financial.

Nonprofits, churches, small businesses and community groups can:

- **Share resources**: list surplus or post needs, approve requests (in full or in part), and track each handoff from reserved to delivered. Pickup addresses stay private until approval.
- **Run volunteer programs**: opportunities with shifts, capacity, waitlists, youth consent, attendance and verified hours.
- **Run events**: free or paid registration, waitlists, ticket-code check-in, cancellation with automatic refunds.
- **Coordinate**: org-to-org messaging, partnerships, a community feed, notifications by email and in-app.
- **Raise money**: Stripe Checkout donations (one-time and recurring) and tickets, paid out to each organization through Stripe Connect.
- **Prove impact**: verified metrics recorded only when activity is confirmed, with CSV exports and a printable funder report.

Platform administrators get a console for verification, moderation, campaigns, payments reconciliation, content, settings and the audit log.

## Status

Feature-complete code with passing automated tests (database security, unit, browser + accessibility). **Not yet deployed.** It needs the client's Cloudflare, Supabase, Stripe and Resend accounts. See [`docs/ACCEPTANCE_REPORT.md`](docs/ACCEPTANCE_REPORT.md) for exactly what is verified and what is blocked.

## Stack

Next.js 15 (App Router, TypeScript strict) · Tailwind CSS v4 · Supabase (Postgres + RLS, Auth, Storage) · Stripe Checkout + Connect · Resend · Cloudflare Workers via OpenNext · Vitest · Playwright + axe · GitHub Actions

## Quick start

```bash
npm install
cp .env.example .env.local     # add a Supabase dev project's URL and anon key
npm run dev                    # http://localhost:3000
```

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm test` | Unit tests + database security tests (needs `TEST_DATABASE_ADMIN_URL` for the DB suite) |
| `npm run test:e2e` | Playwright browser, accessibility and mobile tests (after `npm run build`) |
| `npm run cf:preview` | Build and run under the Cloudflare runtime locally |
| `npm run cf:deploy` | Manual deploy (normally done by GitHub Actions) |
| `npm run db:seed:demo` | Load fictional demo data into a **demo** project (`DEMO_DATABASE_URL`) |

## Documentation

| Doc | For |
|---|---|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Accounts, API tokens, GitHub secrets, first deploy, going live with payments, demo environment |
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Day-to-day platform administration (non-technical) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, security model, data model, workflow guarantees |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Backups, recovery runbooks, monitoring, maintenance |
| [`docs/MOBILE.md`](docs/MOBILE.md) | PWA today; iOS/Android packaging with Capacitor |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Transferring ownership of every account to the client |
| [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) | Everything to verify before going public |
| [`docs/ACCEPTANCE_REPORT.md`](docs/ACCEPTANCE_REPORT.md) | Test results, known limitations, external dependencies |
| [`docs/CONTINUATION.md`](docs/CONTINUATION.md) | Prioritized next tasks |

## Principles

- Permissions are enforced in the database (row-level security and security-definer functions), and every rule has a test.
- No fabricated numbers: impact counts only confirmed activity; demo data is isolated and labelled.
- Collect only what's needed. No health data, private details revealed only to the people involved, minors protected by default.
- Payments never touch our servers, and live mode needs three explicit switches.
