import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { brandName } from "@/lib/env";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage contentKey="legal.terms" title="Terms of service" updated="October 2026">
      <p>By creating an account or using {brandName}, you agree to these terms and to our <Link href="/guidelines">community guidelines</Link>.</p>
      <h2>Accounts</h2>
      <ul>
        <li>You must be at least 13 to create an account. Users under 18 need guardian consent to volunteer.</li>
        <li>Give accurate information and keep your password secure. You are responsible for activity on your account.</li>
        <li>People who register an organization confirm they are authorized to act for it.</li>
      </ul>
      <h2>Organizations and verification</h2>
      <p>
        We review organizations before they appear publicly. &quot;Verified&quot; means a person on our team reviewed the organization&apos;s information. It does
        not mean we endorse the organization or guarantee its work. Tax-exempt status is shown only when our team has checked public IRS records,
        and even then, donors should confirm deductibility with their own tax advisor.
      </p>
      <h2>Resource exchange</h2>
      <p>
        Organizations are responsible for the accuracy, condition and safety of what they list, and for following applicable laws, including food
        handling rules. The platform coordinates exchanges but does not inspect, certify, store or transport items.
      </p>
      <h2>Volunteering and events</h2>
      <p>Organizations, not the platform, supervise their volunteers and run their events, including any screening, training and insurance they require.</p>
      <h2>Payments</h2>
      <p>
        Payments are processed by Stripe. Organization fundraising goes to the organization&apos;s own connected Stripe account. Refund decisions for event
        tickets are made by the hosting organization unless an event is cancelled, in which case paid tickets are refunded.
      </p>
      <h2>Acceptable use</h2>
      <p>Don&apos;t use the platform for spam, fraud, harassment, discrimination, or to collect other users&apos; information. We may remove content or suspend accounts that break these rules.</p>
      <h2>Liability</h2>
      <p>The platform is provided as-is. To the extent the law allows, we aren&apos;t liable for interactions, exchanges or events between users and organizations.</p>
      <h2>Changes</h2>
      <p>We&apos;ll notify users of material changes to these terms before they take effect.</p>
    </LegalPage>
  );
}
