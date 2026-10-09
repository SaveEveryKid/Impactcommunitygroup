# Administrator guide

This guide is for the people who run the platform day to day. You don't need a developer for anything here.

Sign in, then open **Admin** from your account menu (top right). You only see it if you have a platform role.

## Roles

| Role | Can do |
|---|---|
| **Moderator** | Review reported content, hide or remove posts, comments and messages, lock conversations, answer the contact inbox, view impact and the audit log |
| **Admin** | Everything a moderator can, plus: approve and verify organizations, suspend organizations, approve fundraising campaigns, review payments, edit site content and announcements, change platform settings, process account deletions |
| **Super admin** | Everything, plus: grant or remove platform roles, and turn on live payments |

Grant roles in **Admin → Users**. You can't change your own role, so there's always a second person who can.

## Your daily routine (10 minutes)

Open **Admin → Overview**. The **queue** at the top lists everything waiting for you. Work through it top to bottom.

### Verification requests

**Admin → Verification.** Each request shows the organization's details, website, EIN and any uploaded documents (the links expire after 10 minutes, so open them from the page).

- **Approve**: the organization goes live and gets a "Verified" badge.
- **Tax-exempt checks**: if they asked for tax-exempt verification, look up the EIN at the IRS Tax Exempt Organization Search (linked on the page). Tick the box confirming you did, then approve. Without the tick, approval is blocked, so the badge never claims something nobody checked.
- **Request more info**: write what's missing. They get a notification and can resubmit.
- **Reject**: always give a reason.

What "verified" means to the public: *a person on our team confirmed this organization is real and operating as described.* It is not an endorsement.

### Reported content

**Admin → Reports.** Each report shows the reason, the reporter's note, and the content.

- **Hide** removes it from public view and keeps it for the record. Use this when you're unsure.
- **Remove** is for clear violations.
- **Dismiss** means no action is needed.
- **Lock this conversation** stops further messages in a reported conversation.

For a problem organization, suspend it under **Organizations**. For anything involving a child's safety or a threat of violence, contact law enforcement first, then act on the platform.

### Contact inbox

**Admin → Contact inbox.** Reply from your own email (click the address), then mark the message **Closed**. Messages tagged *safety* are highlighted.

### Campaigns

**Admin → Campaigns and payments.** An organization can only ask for approval after it's verified and has connected Stripe. Read the campaign: is the goal specific and honest? Approve, or return it to draft with a note.

## Organizations

**Admin → Organizations.** Search or filter by status.

- **Feature on homepage**: shows the organization in "Featured organizations". Rotate this monthly.
- **Change status**: approve without verifying, suspend, reject, or return to pending. A reason is required and recorded in the audit log.

## Site content

**Admin → Site content.**

- **Announcement**: a bar above every page, for things like "Holiday food drive sign-ups are open". Set an end date so it disappears on its own.
- **About page story**: replaces the About page text.
- **Sponsors list**: the Partners page shows only sponsors you list here. Only add confirmed sponsors. Format:
  ```json
  {"sponsors":[{"name":"Acme Co","tier":"Founding sponsor","url":"https://acme.example","note":"Funds verification"}]}
  ```
- **Privacy / Terms / Guidelines (final)**: paste the lawyer-approved text here. It replaces the draft and removes the "draft" warning.

## Settings

**Admin → Settings** shows which services are connected (database, Stripe, email, scheduled jobs) and lets you:

- Pause new sign-ups (for example, during an incident)
- Set the platform fee (default 0%; disclose any fee to donors before charging one)
- Turn on live payments (super admin only; see `DEPLOYMENT.md` §6 first)

## Impact reporting for funders

**Admin → Impact.** Pick a date range, then:

- **CSV**: every individual record, for spreadsheets.
- **Funder report (PDF)**: opens a print-ready page; use your browser's **Print → Save as PDF**.

Numbers are **verified** only when confirmed inside the platform (a receiving organization confirmed delivery, a coordinator verified hours, attendees were checked in). Self-reported and estimated figures are always shown separately. Demo data never appears.

Each organization can produce its own report from its dashboard (**Impact** tab).

## Users and account deletion

**Admin → Users.**

- **Find a member** by name.
- **Deletion requests**: complete within 30 days. Type DELETE to confirm. If the person is the only owner of an organization, you'll be asked to have them transfer ownership first. Donation records are kept for accounting, without the profile.

## Audit log

**Admin → Audit log** records approvals, verification decisions, role changes, status changes, moderation, settings changes and more, with who and when. Filter by action (for example `verification`).

## Payments: what to watch

**Admin → Campaigns and payments** shows:

- **Reconciliation totals** from the payment ledger. Once a month, compare live totals with Stripe → Reports → Balance.
- **Payment events that failed to process.** Stripe retries for three days. If something stays here, contact your developer.

Refunds: organizations issue refunds from their own Stripe dashboard. When an event is cancelled, the platform refunds all paid tickets automatically.

## When something goes wrong

1. **Site down**: check Cloudflare → Workers & Pages → `impactcommunitygroup` → Logs, and status.supabase.com.
2. **Emails not arriving**: Admin → Settings should show Email "Configured". Check Resend → Logs.
3. **Payments failing**: check Stripe → Developers → Webhooks for failed deliveries.
4. **Suspected account compromise**: remove their platform role immediately (Admin → Users), then contact your developer to rotate keys (see `OPERATIONS.md`).
