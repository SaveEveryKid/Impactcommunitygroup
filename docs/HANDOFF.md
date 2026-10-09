# Ownership and handoff

The client (Toni's organization) should own every account. Nothing in the code is tied to the developer's personal accounts. All identity and credentials come from environment variables and GitHub secrets.

## Accounts the client should own

| Asset | Owner action |
|---|---|
| **Domain** | Registered to the organization; DNS hosted in the organization's Cloudflare account |
| **GitHub repository** | Transfer: Settings → General → Danger zone → Transfer ownership to the organization's GitHub account or org. Then re-add the repository secrets (secrets don't transfer). Keep the repository **private**. |
| **Cloudflare** | Organization-owned account; add the developer as a member with limited roles if needed, and remove them at handoff |
| **Supabase** | Create the project inside an organization-owned Supabase organization; invite developers as members; transfer billing |
| **Stripe** | The platform account must be in the organization's legal name and bank account. Developers get restricted team roles (Developer), never Owner. |
| **Resend** | Organization-owned; sending domain on the organization's domain |
| **Apple / Google developer accounts** (if apps are built) | Enrolled as the organization (requires a D-U-N-S number for Apple) |

## Transfer steps (from a developer-owned setup)

1. Client creates their own accounts (above) and invites the developer.
2. Developer adds the client as Owner/Admin everywhere, then the client removes the developer's elevated roles.
3. Rotate every secret after transfer (see OPERATIONS.md, "Leaked secret"): Supabase keys, Stripe keys, Resend key, CRON_SECRET, Cloudflare token. Update GitHub secrets; re-run Deploy.
4. Supabase: Project → Settings → General → "Transfer project" to the client's organization, or create a fresh project in the client's org and migrate with `pg_dump`/`pg_restore` plus storage copy.
5. Stripe Connect accounts belong to each organization already; the platform account must be the client's from day one (Stripe accounts can't be transferred between legal entities).
6. Update `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, brand variables and the `name` in `wrangler.jsonc` if changed.
7. Grant Toni `super_admin` (DEPLOYMENT.md §4) and remove developer platform roles in Admin → Users.

## What another developer needs to know

Start with `README.md` → `docs/ARCHITECTURE.md` → `docs/CONTINUATION.md`. The database migrations are the source of truth for permissions; read them before changing any access rule, and add a test in `supabase/tests/security.test.ts` for every rule you change.
