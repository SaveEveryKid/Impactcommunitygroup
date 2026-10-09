"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Spinner } from "@/components/ui/button";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

/**
 * Uploads directly to Supabase Storage as the signed-in user. Storage RLS
 * restricts writes to `org/{orgId}/...` for that org's coordinators, and the
 * bucket enforces MIME type and size server-side; the checks here are for
 * fast feedback only.
 */
export function FileUpload({
  label,
  hint,
  bucket = "media",
  prefix,
  name,
  max = 1,
  initial = [],
  kind = "image",
  onChange,
}: {
  label: string;
  hint?: string;
  bucket?: "media" | "documents";
  prefix: string;
  name?: string;
  max?: number;
  initial?: string[];
  kind?: "image" | "document";
  onChange?: (paths: string[]) => void | Promise<void>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [paths, setPaths] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const types = kind === "image" ? IMAGE_TYPES : DOC_TYPES;
  const maxBytes = bucket === "media" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - paths.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    for (const f of list) {
      if (!types.includes(f.type)) return setError(kind === "image" ? "Use a JPG, PNG, WebP or AVIF image." : "Use a PDF, JPG or PNG file.");
      if (f.size > maxBytes) return setError(`Files must be under ${maxBytes / 1024 / 1024} MB.`);
    }
    setBusy(true);
    try {
      const sb = getBrowserSupabase();
      const added: string[] = [];
      for (const f of list) {
        const ext = f.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${prefix.replace(/\/$/, "")}/${crypto.randomUUID()}.${ext}`;
        const { error: e } = await sb.storage.from(bucket).upload(path, f, { contentType: f.type, upsert: false, cacheControl: "31536000" });
        if (e) throw new Error(e.message);
        added.push(path);
      }
      const next = [...paths, ...added];
      setPaths(next);
      await onChange?.(next);
    } catch (e) {
      setError(e instanceof Error && /row-level/.test(e.message) ? "You don't have permission to upload here." : "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(p: string) {
    const next = paths.filter((x) => x !== p);
    setPaths(next);
    await onChange?.(next);
    // Best-effort cleanup; ignore failures (object may be referenced elsewhere).
    getBrowserSupabase().storage.from(bucket).remove([p]).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[0.95rem] font-semibold">
        {label}
      </span>
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      {name ? paths.map((p) => <input key={p} type="hidden" name={name} value={p} />) : null}
      <div className="flex flex-wrap gap-3">
        {paths.map((p) => (
          <div key={p} className="relative">
            {kind === "image" && bucket === "media" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicUrl(p)} alt="" className="h-24 w-24 rounded-[12px] border border-line object-cover" />
            ) : (
              <span className="flex h-24 w-40 items-center rounded-[12px] border border-line bg-paper p-2 text-xs break-all">{p.split("/").pop()}</span>
            )}
            <button
              type="button"
              onClick={() => remove(p)}
              className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-danger shadow"
              aria-label="Remove file"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {paths.length < max ? (
          <label
            htmlFor={id}
            className="grid h-24 w-24 cursor-pointer place-items-center rounded-[12px] border-2 border-dashed border-line-strong text-ink-muted hover:border-teal hover:text-teal has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-teal/30"
          >
            {busy ? <Spinner className="h-6 w-6" /> : <ImagePlus className="h-7 w-7" aria-hidden="true" />}
            <span className="sr-only">Add file</span>
            <input
              id={id}
              ref={input}
              type="file"
              accept={types.join(",")}
              multiple={max - paths.length > 1}
              aria-labelledby={`${id}-label`}
              className="sr-only"
              disabled={busy}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
