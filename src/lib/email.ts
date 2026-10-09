import "server-only";
import { brandName, siteUrl } from "@/lib/env";

export type EmailResult = { ok: true; id: string } | { ok: false; error: string; skipped?: boolean };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, accessible HTML email layout (single column, inline styles). */
export function renderEmail({ heading, body, ctaLabel, ctaUrl, footer }: { heading: string; body: string; ctaLabel?: string; ctaUrl?: string; footer?: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3b4a5f">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="margin:24px 0"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#0b7a6a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${esc(ctaLabel)}</a></p>`
      : "";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#eef0ea;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 24px;font-weight:700;color:#13233a;font-size:15px">${esc(brandName)}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#13233a">${esc(heading)}</h1>
${paragraphs}${cta}
<p style="margin:32px 0 0;font-size:13px;color:#5d6a7c">${footer ? esc(footer) : `You received this because you have an account on ${esc(brandName)}. <a href="${siteUrl}/settings/notifications" style="color:#5d6a7c">Email preferences</a>.`}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail({ to, subject, html, text, idempotencyKey }: { to: string; subject: string; html: string; text: string; idempotencyKey?: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email provider not configured", skipped: true };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !json.id) return { ok: false, error: json.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function sendInvitationEmail({ to, orgName, inviterName, token, role }: { to: string; orgName: string; inviterName: string; token: string; role: string }) {
  const url = `${siteUrl}/invite/${token}`;
  const body = `${inviterName} invited you to join ${orgName} on ${brandName} as a ${role}.\n\nThe invitation expires in 14 days. If you weren't expecting it, you can ignore this email.`;
  const res = await sendEmail({
    to,
    subject: `Join ${orgName} on ${brandName}`,
    html: renderEmail({ heading: `You're invited to join ${orgName}`, body, ctaLabel: "Accept invitation", ctaUrl: url, footer: `Sent on behalf of ${orgName}.` }),
    text: `${body}\n\nAccept: ${url}`,
    idempotencyKey: `invite-${token.slice(0, 16)}`,
  });
  if (!res.ok && !("skipped" in res && res.skipped)) console.error("[email] invitation failed", res.error);
  return res.ok;
}
