import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Community guidelines", alternates: { canonical: "/guidelines" } };

export default function GuidelinesPage() {
  return (
    <LegalPage contentKey="legal.guidelines" title="Community guidelines" updated="October 2026">
      <p>This network exists so people can help each other. These guidelines keep it safe and useful for everyone.</p>
      <h2>Be honest</h2>
      <ul>
        <li>Describe resources accurately, including condition, quantity and use-by dates.</li>
        <li>Report only impact that really happened. Label estimates as estimates.</li>
        <li>Don&apos;t claim a verification or tax status you don&apos;t have.</li>
      </ul>
      <h2>Be respectful</h2>
      <ul>
        <li>No harassment, hate speech, threats or discrimination of any kind.</li>
        <li>Serve people regardless of race, religion, gender, disability, or background, as the law and basic dignity require.</li>
        <li>Faith-based organizations are welcome to share their faith; don&apos;t make help conditional on it.</li>
      </ul>
      <h2>Protect privacy</h2>
      <ul>
        <li>Don&apos;t post anyone&apos;s address, phone number, or health information in public listings or posts.</li>
        <li>Use volunteer contact details only to coordinate the activity they signed up for.</li>
      </ul>
      <h2>Keep young people safe</h2>
      <ul>
        <li>Organizations hosting volunteers under 18 must follow their own safeguarding policies, including appropriate supervision.</li>
        <li>Adults should not message minors privately outside organization-coordinated communication.</li>
      </ul>
      <h2>No selling or spam</h2>
      <p>The resource exchange is for giving and sharing, not selling. Don&apos;t use messaging for advertising.</p>
      <h2>Reporting</h2>
      <p>If something looks wrong, use the Report link. Moderators review every report. Serious or repeated violations lead to removal.</p>
    </LegalPage>
  );
}
