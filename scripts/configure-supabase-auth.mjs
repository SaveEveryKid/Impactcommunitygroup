#!/usr/bin/env node
/**
 * Configures Supabase Auth for this app through the Supabase Management API.
 * Idempotent: safe to run on every deploy.
 *
 * Sets: Site URL, allowed redirect URLs, password policy, email templates that
 * use the token_hash flow (/auth/confirm), and, when RESEND_API_KEY is
 * present, custom SMTP through Resend (Supabase's built-in mailer is heavily
 * rate-limited and not meant for production).
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, NEXT_PUBLIC_SITE_URL,
 *      NEXT_PUBLIC_BRAND_NAME (optional), RESEND_API_KEY + EMAIL_FROM (optional)
 */
const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, NEXT_PUBLIC_SITE_URL, RESEND_API_KEY, EMAIL_FROM } = process.env;
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "Kindred Commons";

for (const [k, v] of Object.entries({ SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, NEXT_PUBLIC_SITE_URL })) {
  if (!v) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }
}
const site = NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

const shell = (heading, body, cta, href) => `<!doctype html><html><body style="margin:0;background:#eef0ea;font-family:Arial,sans-serif">
<table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;padding:32px"><tr><td>
<p style="margin:0 0 24px;font-weight:700;color:#13233a">${brand}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#13233a">${heading}</h1>
<p style="font-size:16px;line-height:1.6;color:#3b4a5f">${body}</p>
<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0b7a6a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${cta}</a></p>
<p style="font-size:13px;color:#5d6a7c">If you didn't request this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;

const link = (type) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;

const config = {
  site_url: site,
  uri_allow_list: [`${site}/**`, "http://localhost:3000/**", "http://localhost:8787/**"].join(","),
  password_min_length: 10,
  password_required_characters: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,
  mailer_subjects_confirmation: `Confirm your email for ${brand}`,
  mailer_templates_confirmation_content: shell("Confirm your email", "Confirm your email address to finish creating your account.", "Confirm email", link("email")),
  mailer_subjects_recovery: `Reset your ${brand} password`,
  mailer_templates_recovery_content: shell("Reset your password", "Use the button below to choose a new password. The link expires in one hour.", "Choose a new password", link("recovery")),
  mailer_subjects_email_change: `Confirm your new email for ${brand}`,
  mailer_templates_email_change_content: shell("Confirm your new email", "Confirm this address to finish changing your account email.", "Confirm new email", link("email_change")),
  mailer_subjects_magic_link: `Your ${brand} sign-in link`,
  mailer_templates_magic_link_content: shell("Sign in", "Use this link to sign in. It expires shortly.", "Sign in", link("magiclink")),
  mailer_subjects_invite: `You're invited to ${brand}`,
  mailer_templates_invite_content: shell("You're invited", "You've been invited to create an account.", "Accept invitation", link("invite")),
};

if (RESEND_API_KEY && EMAIL_FROM) {
  const m = /<([^>]+)>/.exec(EMAIL_FROM);
  Object.assign(config, {
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: RESEND_API_KEY,
    smtp_admin_email: m ? m[1] : EMAIL_FROM,
    smtp_sender_name: brand,
    rate_limit_email_sent: 100,
  });
}

async function patch(body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 500) };
}

// GitHub annotation helpers (visible in the run summary and via the API).
const warn = (m) => console.log(`::warning title=Supabase auth config::${m.replace(/\r?\n/g, " ")}`);

let r = await patch(config);
if (!r.ok && r.status === 400) {
  warn(`Full config rejected (400): ${r.text}. Retrying with essential settings only.`);
  const essential = { site_url: config.site_url, uri_allow_list: config.uri_allow_list };
  for (const k of Object.keys(config)) if (k.startsWith("mailer_")) essential[k] = config[k];
  r = await patch(essential);
  if (!r.ok && r.status === 400) {
    warn(`Essential config also rejected (400): ${r.text}. Retrying with URLs only.`);
    r = await patch({ site_url: config.site_url, uri_allow_list: config.uri_allow_list });
  }
}
if (!r.ok) {
  const hint = r.status === 401 || r.status === 403
    ? "The Supabase access token lacks permission to change Auth settings. Give it Auth (configuration) read & write."
    : "See the response above.";
  warn(`Supabase auth config failed: HTTP ${r.status} ${r.text}. ${hint}`);
  process.exit(1);
}
console.log(`Supabase auth configured for ${site}${RESEND_API_KEY && EMAIL_FROM ? " with Resend SMTP" : " (built-in Supabase email; set RESEND_API_KEY and EMAIL_FROM for production)"}`);
