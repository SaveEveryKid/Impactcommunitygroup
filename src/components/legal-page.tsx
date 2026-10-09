import type { ReactNode } from "react";
import { Container, PageHeader } from "@/components/ui/misc";
import { getSiteContent } from "@/lib/content";

/**
 * Policy pages render admin-published text when available (site_content key),
 * otherwise the built-in draft below, clearly marked as pending legal review.
 */
export async function LegalPage({ contentKey, title, updated, children }: { contentKey: string; title: string; updated: string; children: ReactNode }) {
  const published = await getSiteContent(contentKey);
  return (
    <>
      <PageHeader title={published?.title ?? title} lede={published ? undefined : `Draft last revised ${updated}`} />
      <Container className="py-12">
        {published?.body ? (
          <div className="prose-body whitespace-pre-line">{published.body}</div>
        ) : (
          <>
            <div role="note" className="mb-10 max-w-[68ch] rounded-[12px] border border-warn/30 bg-warn-wash p-4 text-warn">
              <strong>Draft for legal review.</strong> This text is a working draft prepared with the platform. It must be reviewed and approved by
              qualified legal counsel before public launch.
            </div>
            <div className="prose-body">{children}</div>
          </>
        )}
      </Container>
    </>
  );
}
