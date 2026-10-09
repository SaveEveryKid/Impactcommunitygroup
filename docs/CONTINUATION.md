# Continuation plan

Where to pick up, in priority order. Each item is sized so it can be finished and tested in one sitting.

## A. Unblock and verify (needs accounts)
1. **Deploy** following DEPLOYMENT.md, first to a staging Supabase project + Worker.
2. **Seed the demo project** and click through every signed-in screen (personal dashboard, all org tabs, admin tabs, inbox, transfers, campaigns). Fix any runtime query errors. Most likely: PostgREST embed names that depend on FK detection (`profiles:actor_id`, `requester:requester_org_id`, `organizations:sender_org_id`).
3. **Authenticated Playwright suite** against the demo project: sign in as each demo account (`supabase/seed/demo.sql` header) and run the launch-checklist flows automatically. Add it to CI behind a `E2E_BASE_URL` secret.
4. **Stripe test mode end to end**: Connect onboarding, one-time and recurring donations, a paid ticket, event cancellation refunds, Stripe-dashboard refunds. Use `stripe trigger` and the Stripe CLI to replay webhooks; confirm idempotency by resending events.
5. **Resend**: confirm Supabase Auth emails go through SMTP and notification emails go through the cron worker.

## B. Close known gaps (ACCEPTANCE_REPORT.md §4)
6. ZIP-centroid geocoding on organization, listing, opportunity and event save (populate `approx_lat/lng`), plus a "within N miles" filter.
7. Recurring-donation refund reconciliation (store invoice payment intent IDs on renewal rows).
8. QR codes on tickets and a camera scanner on the check-in screen.
9. Supabase Realtime for the open conversation only.
10. Web Push (VAPID) using `push_subscriptions`; respect `notification_preferences.push`.
11. Nonce-based CSP; Cloudflare WAF rate limits on auth routes.
12. Super-admin member search by email (service-role action, audited).

## C. Polish
13. Lighthouse pass on home, directory, event and dashboard pages; move the header's signed-in state into a client island so public pages can be cached at the edge.
14. Final brand: replace tokens in `src/app/globals.css`, set `NEXT_PUBLIC_BRAND_NAME`, re-render icons (`PW_CHROMIUM_PATH=... node scripts/render-icons.mjs`).
15. Server-generated PDF impact reports if funders need attachments.

## D. Mobile apps
16. Capacitor shell per MOBILE.md, with Universal/App Links, native push, share and QR scanning.

## Conventions to keep
- Every permission change ships with a test in `supabase/tests/security.test.ts`.
- New migrations only. Never edit an applied one.
- All writes go through server actions or security-definer functions; no service-role usage without an audit entry.
- Copy: sentence case, plain verbs, errors that say what to do next.
