import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { brandName } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage contentKey="legal.privacy" title="Privacy policy" updated="October 2026">
      <p>
        This policy explains what {brandName} (&quot;we&quot;) collects, why, who can see it, and the choices you have. We collect only what we need to run
        the platform. We do not sell personal information.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, password (stored only as a secure hash by our authentication provider), and whether you are 18 or older.</li>
        <li><strong>Profile details you choose to add:</strong> a photo, a short bio, a general location, volunteer interests, skills and availability.</li>
        <li><strong>Activity on the platform:</strong> organizations you belong to or follow, volunteer sign-ups and verified hours, event registrations, messages, and resource requests.</li>
        <li><strong>Guardian details</strong> for volunteers under 18: the guardian&apos;s name, email and consent, per opportunity.</li>
        <li><strong>Payments:</strong> donations and ticket payments are processed by Stripe. We receive the amount, status, and the name and email you provide, but never your full card number.</li>
        <li><strong>Technical data:</strong> basic logs needed for security, such as hashed network identifiers for rate limiting.</li>
      </ul>
      <h2>What we don&apos;t collect</h2>
      <p>
        Although the platform is organized around well-being, we don&apos;t ask for medical diagnoses, health histories, or other sensitive wellness
        information. Please don&apos;t put that kind of information in messages or listings.
      </p>
      <h2>Who can see what</h2>
      <ul>
        <li>Approved organization profiles, published events, opportunities and listings are public.</li>
        <li>Your profile visibility is yours to set: public, members only, or private.</li>
        <li>When you sign up to volunteer or register for an event, the hosting organization&apos;s coordinators can see your name and email so they can coordinate with you.</li>
        <li>Pickup addresses on the resource exchange are visible only to the organizations and assigned volunteer involved in an approved transfer.</li>
        <li>Messages are visible only to conversation participants. Platform moderators may review reported messages.</li>
        <li>Donors choose whether their name is public, visible only to the organization, or anonymous.</li>
      </ul>
      <h2>Service providers</h2>
      <p>We use Supabase (database and authentication), Vercel (hosting), Stripe (payments) and Resend (email). They process data on our behalf under their own security and privacy terms.</p>
      <h2>Your choices</h2>
      <ul>
        <li>Edit your profile and notification preferences at any time in Account settings.</li>
        <li>Request deletion of your account from Account settings. We remove personal information within 30 days, except records we must keep for legal or financial reasons (for example, donation receipts).</li>
        <li>Unsubscribe from non-essential email using the link in any email.</li>
      </ul>
      <h2>Children</h2>
      <p>People under 13 may not create accounts. Volunteers aged 13 to 17 need guardian consent for each opportunity, and their profiles default to private.</p>
      <h2>Security</h2>
      <p>Data is encrypted in transit, access is restricted by role and enforced in the database itself, and administrative actions are logged.</p>
      <h2>Contact</h2>
      <p>Questions about privacy? Use the contact form and choose &quot;General question&quot;.</p>
    </LegalPage>
  );
}
