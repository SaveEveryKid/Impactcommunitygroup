# Production launch checklist

Tick every item before announcing publicly. Items marked **(blocker)** must be done.

## Accounts and infrastructure
- [ ] **(blocker)** Client-owned Cloudflare, Supabase (Pro), Stripe, Resend and GitHub accounts (HANDOFF.md)
- [ ] **(blocker)** All GitHub secrets and variables set; Deploy workflow green
- [ ] **(blocker)** Custom domain attached to the Worker; HTTPS working; `NEXT_PUBLIC_SITE_URL` matches
- [ ] Resend domain verified (SPF, DKIM, DMARC records in Cloudflare DNS)
- [ ] Supabase: leaked-password protection on; MFA enforced for platform admins; PITR decision made
- [ ] Cloudflare: WAF managed rules on; rate-limit rules for `/login`, `/signup`, `/forgot-password`
- [ ] Uptime monitor and Cloudflare/Stripe/Supabase alerts going to the ops inbox
- [ ] Repository set to private

## Data and people
- [ ] **(blocker)** Toni bootstrapped as super admin; second admin appointed
- [ ] **(blocker)** Production project has **no demo data** (`select count(*) from organizations where is_demo` returns 0)
- [ ] Demo environment deployed separately (optional, for funder presentations)

## End-to-end verification on production (test mode)
- [ ] Sign up, confirm email, sign in, reset password, sign out
- [ ] Register an organization → submit verification → approve in Admin → appears in directory
- [ ] Invite a coordinator by email → accept → role works
- [ ] Publish an offer; second org requests; approve partially; pickup address visible only to the right people; schedule; collect; confirm receipt → impact appears
- [ ] Publish an opportunity with capacity 1; two volunteers → second waitlisted; first cancels → second confirmed and notified; record attendance; verify hours
- [ ] Free event: register, check in by code, complete → attendance impact
- [ ] Paid event (Stripe test card 4242…): pay, confirmed; cancel event → refunded
- [ ] Connect onboarding for one org (test mode) → campaign → admin approval → donate one-time and monthly → receipts → refund from Stripe → donation shows refunded
- [ ] Messaging between two orgs; report a message; moderator hides it
- [ ] Emails arrive (confirmation, invitation, notification); unsubscribe link works
- [ ] Repeat key flows on an iPhone and an Android phone

## Legal and content
- [ ] **(blocker)** Privacy policy, terms and community guidelines approved by counsel and published in Admin → Site content (removes "draft" banners)
- [ ] **(blocker)** Fundraising, receipt and tax-deductibility wording reviewed (state charitable solicitation registration if the platform itself fundraises)
- [ ] Final brand name, logo and colors applied
- [ ] About page story written; sponsors listed only if confirmed

## Payments go-live
- [ ] Stripe live activation complete; Connect branding set
- [ ] Platform fee decided and disclosed (default 0%)
- [ ] Switch `STRIPE_SECRET_KEY` to live, `STRIPE_ALLOW_LIVE=true`, redeploy; enable "Live payments" in Admin → Settings
- [ ] One real $1 donation and refund completed and reconciled

## After launch (first week)
- [ ] Lighthouse/Core Web Vitals measured on key pages; fix anything under 90 for accessibility
- [ ] Review Cloudflare error logs daily
- [ ] First monthly backup export scheduled
