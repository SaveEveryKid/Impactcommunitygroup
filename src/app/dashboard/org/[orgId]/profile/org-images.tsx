"use client";

import { FileUpload } from "@/components/image-upload";
import { setOrgImage } from "@/app/actions/organizations";

export function OrgImages({ orgId, logo, cover }: { orgId: string; logo: string | null; cover: string | null }) {
  return (
    <>
      <FileUpload
        label="Logo"
        hint="Square image, at least 256 × 256 pixels."
        prefix={`org/${orgId}/logo`}
        initial={logo ? [logo] : []}
        onChange={(p) => setOrgImage(orgId, "logo_path", p[0] ?? null)}
      />
      <FileUpload
        label="Cover image"
        hint="Wide image, about 1600 × 500 pixels. Use photos you have permission to share."
        prefix={`org/${orgId}/cover`}
        initial={cover ? [cover] : []}
        onChange={(p) => setOrgImage(orgId, "cover_path", p[0] ?? null)}
      />
    </>
  );
}
