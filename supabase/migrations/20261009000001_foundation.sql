-- ============================================================================
-- 0001 FOUNDATION
-- Enums, helpers, profiles, organizations, memberships, invitations,
-- verification, platform admins, audit log, settings.
--
-- Rollback: see supabase/rollbacks/20261009000001_foundation.down.sql
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.wellbeing_pillar as enum ('mental', 'physical', 'social', 'spiritual', 'financial');

create type public.org_type as enum ('nonprofit', 'faith_based', 'small_business', 'community_group');

create type public.org_status as enum ('pending', 'approved', 'rejected', 'suspended');

-- Verification levels are deliberately granular. "identity_verified" means a
-- human admin reviewed the organization; it does NOT imply tax-exempt status.
-- "tax_exempt_verified" may only be set after an admin has checked IRS records.
create type public.verification_level as enum ('unverified', 'identity_verified', 'tax_exempt_verified');

create type public.org_role as enum ('member', 'coordinator', 'admin', 'owner');

create type public.platform_role as enum ('moderator', 'admin', 'super_admin');

create type public.verification_request_status as enum ('submitted', 'in_review', 'needs_info', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Contains only what users choose to show.
-- Email stays in auth.users and is never exposed through this table.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_path text,
  bio text check (char_length(bio) <= 1000),
  general_location text check (char_length(general_location) <= 120),
  -- Self-attested at signup. Minors receive conservative defaults.
  is_adult boolean not null default true,
  profile_visibility text not null default 'members'
    check (profile_visibility in ('public', 'members', 'private')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile when a Supabase auth user is created.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_adult, profile_visibility)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Member'), 80),
    coalesce((new.raw_user_meta_data ->> 'is_adult')::boolean, true),
    -- Minors default to private profiles.
    case when coalesce((new.raw_user_meta_data ->> 'is_adult')::boolean, true) then 'members' else 'private' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform administrators (separate from org roles)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_role not null default 'moderator',
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.platform_role_of(uid uuid) returns public.platform_role
language sql stable security definer set search_path = public as $$
  select role from public.platform_admins where user_id = uid
$$;

create or replace function public.is_platform_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and role in ('admin', 'super_admin')
  )
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written by security-definer functions & server)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  org_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_org_idx on public.audit_logs (org_id, created_at desc);

create or replace function public.write_audit(
  p_action text, p_target_type text, p_target_id text, p_org_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_org_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function public.write_audit(text, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  name text not null check (char_length(name) between 2 and 140),
  org_type public.org_type not null,
  mission text check (char_length(mission) <= 500),
  description text check (char_length(description) <= 5000),
  logo_path text,
  cover_path text,
  pillars public.wellbeing_pillar[] not null default '{}',
  service_categories text[] not null default '{}',
  service_area text check (char_length(service_area) <= 200),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  postal_code text check (char_length(postal_code) <= 20),
  -- Approximate coordinates (city/zip centroid) for distance search only.
  approx_lat double precision check (approx_lat between -90 and 90),
  approx_lng double precision check (approx_lng between -180 and 180),
  public_email text check (char_length(public_email) <= 200),
  public_phone text check (char_length(public_phone) <= 40),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  social_links jsonb not null default '{}'::jsonb,
  ein text check (ein is null or ein ~ '^[0-9]{2}-?[0-9]{7}$'),
  status public.org_status not null default 'pending',
  verification_level public.verification_level not null default 'unverified',
  tax_exempt_checked_at timestamptz,
  tax_exempt_checked_by uuid references auth.users(id),
  is_featured boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tax_exempt_requires_check check (
    verification_level <> 'tax_exempt_verified' or tax_exempt_checked_at is not null
  )
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create index organizations_status_idx on public.organizations (status) where deleted_at is null;
create index organizations_pillars_idx on public.organizations using gin (pillars);
create index organizations_type_idx on public.organizations (org_type);
create index organizations_search_idx on public.organizations
  using gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(mission, '') || ' ' || coalesce(description, '')));

-- ---------------------------------------------------------------------------
-- Organization membership
-- ---------------------------------------------------------------------------
create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Role rank for comparisons.
create or replace function public.org_role_rank(r public.org_role) returns int
language sql immutable as $$
  select case r when 'member' then 1 when 'coordinator' then 2 when 'admin' then 3 when 'owner' then 4 end
$$;

create or replace function public.org_role_of(p_org uuid) returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.organization_members where org_id = p_org and user_id = auth.uid()
$$;

-- True when the current user holds at least p_min in org p_org.
create or replace function public.has_org_role(p_org uuid, p_min public.org_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid()
      and public.org_role_rank(m.role) >= public.org_role_rank(p_min)
  )
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_org_role(p_org, 'member')
$$;

-- An approved, non-deleted organization is "active".
create or replace function public.org_is_active(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = p_org and status = 'approved' and deleted_at is null)
$$;

-- Creator automatically becomes owner.
create or replace function public.handle_new_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (org_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  perform public.write_audit('organization.created', 'organization', new.id::text, new.id, jsonb_build_object('name', new.name));
  return new;
end $$;
create trigger on_org_created after insert on public.organizations
  for each row execute function public.handle_new_org();

-- Prevent non-platform-admins from changing privileged columns.
create or replace function public.guard_org_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- service_role and direct DB sessions (no auth.uid) are trusted.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.verification_level := 'unverified';
    new.tax_exempt_checked_at := null;
    new.tax_exempt_checked_by := null;
    new.is_featured := false;
    new.is_demo := false;
    new.approved_at := null;
    new.created_by := auth.uid();
    return new;
  end if;
  if new.status is distinct from old.status
     or new.verification_level is distinct from old.verification_level
     or new.tax_exempt_checked_at is distinct from old.tax_exempt_checked_at
     or new.tax_exempt_checked_by is distinct from old.tax_exempt_checked_by
     or new.is_featured is distinct from old.is_featured
     or new.is_demo is distinct from old.is_demo
     or new.approved_at is distinct from old.approved_at
     or new.created_by is distinct from old.created_by
     or new.id is distinct from old.id then
    raise exception 'Only platform administrators can change organization status or verification'
      using errcode = '42501';
  end if;
  -- Changing EIN after verification resets tax-exempt verification.
  if new.ein is distinct from old.ein and old.verification_level = 'tax_exempt_verified' then
    raise exception 'EIN cannot be changed after tax-exempt verification; contact support'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_guard before insert or update on public.organizations
  for each row execute function public.guard_org_privileged_columns();

-- ---------------------------------------------------------------------------
-- Membership management functions (no direct writes to organization_members)
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.org_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor public.org_role := public.org_role_of(p_org);
  v_target public.org_role;
  v_owners int;
begin
  select role into v_target from public.organization_members where org_id = p_org and user_id = p_user;
  if v_target is null then
    raise exception 'User is not a member of this organization' using errcode = 'P0002';
  end if;
  if not public.is_platform_admin() then
    if v_actor is null or public.org_role_rank(v_actor) < public.org_role_rank('admin') then
      raise exception 'Insufficient organization permissions' using errcode = '42501';
    end if;
    -- Admins can only manage members/coordinators and cannot grant admin+.
    if v_actor = 'admin' and (public.org_role_rank(v_target) >= 3 or public.org_role_rank(p_role) >= 3) then
      raise exception 'Only owners can manage administrators and owners' using errcode = '42501';
    end if;
  end if;
  if v_target = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners from public.organization_members where org_id = p_org and role = 'owner';
    if v_owners <= 1 then
      raise exception 'An organization must keep at least one owner' using errcode = '23514';
    end if;
  end if;
  update public.organization_members set role = p_role where org_id = p_org and user_id = p_user;
  perform public.write_audit('organization.member_role_changed', 'organization_member', p_user::text, p_org,
    jsonb_build_object('from', v_target, 'to', p_role));
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor public.org_role := public.org_role_of(p_org);
  v_target public.org_role;
  v_owners int;
begin
  select role into v_target from public.organization_members where org_id = p_org and user_id = p_user;
  if v_target is null then return; end if;
  if p_user <> auth.uid() and not public.is_platform_admin() then
    if v_actor is null or public.org_role_rank(v_actor) < 3 then
      raise exception 'Insufficient organization permissions' using errcode = '42501';
    end if;
    if v_actor = 'admin' and public.org_role_rank(v_target) >= 3 then
      raise exception 'Only owners can remove administrators and owners' using errcode = '42501';
    end if;
  end if;
  if v_target = 'owner' then
    select count(*) into v_owners from public.organization_members where org_id = p_org and role = 'owner';
    if v_owners <= 1 then
      raise exception 'An organization must keep at least one owner' using errcode = '23514';
    end if;
  end if;
  delete from public.organization_members where org_id = p_org and user_id = p_user;
  perform public.write_audit('organization.member_removed', 'organization_member', p_user::text, p_org, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Invitations. Token is generated server-side; only its hash is stored.
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email extensions.citext not null,
  role public.org_role not null default 'member' check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations (org_id);
create unique index organization_invitations_open_unique
  on public.organization_invitations (org_id, email) where accepted_at is null and revoked_at is null;

-- Creates an invitation and returns the raw token (shown once, emailed by server).
create or replace function public.create_invitation(p_org uuid, p_email text, p_role public.org_role)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_actor public.org_role := public.org_role_of(p_org);
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_actor is null or public.org_role_rank(v_actor) < 3 then
    raise exception 'Insufficient organization permissions' using errcode = '42501';
  end if;
  if p_role = 'owner' or (v_actor = 'admin' and public.org_role_rank(p_role) >= 3) then
    raise exception 'Cannot invite with that role' using errcode = '42501';
  end if;
  update public.organization_invitations set revoked_at = now()
    where org_id = p_org and email = p_email::extensions.citext and accepted_at is null and revoked_at is null;
  insert into public.organization_invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, lower(trim(p_email)), p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());
  perform public.write_audit('organization.invitation_created', 'organization', p_org::text, p_org,
    jsonb_build_object('role', p_role));
  return v_token;
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_inv public.organization_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept an invitation' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.organization_invitations
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0002';
  end if;
  if lower(v_email) <> lower(v_inv.email::text) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.organization_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  perform public.write_audit('organization.invitation_accepted', 'organization', v_inv.org_id::text, v_inv.org_id, '{}'::jsonb);
  return v_inv.org_id;
end $$;

-- ---------------------------------------------------------------------------
-- Verification requests (human review)
-- ---------------------------------------------------------------------------
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  requested_level public.verification_level not null default 'identity_verified'
    check (requested_level <> 'unverified'),
  ein text check (ein is null or ein ~ '^[0-9]{2}-?[0-9]{7}$'),
  document_paths text[] not null default '{}',
  applicant_notes text check (char_length(applicant_notes) <= 2000),
  status public.verification_request_status not null default 'submitted',
  reviewer_id uuid references auth.users(id),
  decision_note text check (char_length(decision_note) <= 2000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger verification_requests_updated_at before update on public.verification_requests
  for each row execute function public.set_updated_at();
create index verification_requests_status_idx on public.verification_requests (status, created_at);
create unique index verification_requests_one_open
  on public.verification_requests (org_id) where status in ('submitted', 'in_review', 'needs_info');

-- Admin decision. Approving identity also approves the organization listing.
create or replace function public.decide_verification(
  p_request uuid, p_decision public.verification_request_status, p_note text, p_tax_exempt_checked boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.verification_requests;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if p_decision not in ('in_review', 'needs_info', 'approved', 'rejected') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  select * into v_req from public.verification_requests where id = p_request for update;
  if v_req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;

  update public.verification_requests
    set status = p_decision, reviewer_id = auth.uid(), decision_note = p_note,
        decided_at = case when p_decision in ('approved', 'rejected') then now() else null end
    where id = p_request;

  if p_decision = 'approved' then
    if v_req.requested_level = 'tax_exempt_verified' and not p_tax_exempt_checked then
      raise exception 'Tax-exempt verification requires confirming the IRS status check' using errcode = '22023';
    end if;
    update public.organizations set
      status = 'approved',
      approved_at = coalesce(approved_at, now()),
      verification_level = v_req.requested_level,
      ein = coalesce(v_req.ein, ein),
      tax_exempt_checked_at = case when v_req.requested_level = 'tax_exempt_verified' then now() else tax_exempt_checked_at end,
      tax_exempt_checked_by = case when v_req.requested_level = 'tax_exempt_verified' then auth.uid() else tax_exempt_checked_by end
    where id = v_req.org_id;
  elsif p_decision = 'rejected' then
    update public.organizations set status = 'rejected' where id = v_req.org_id and status = 'pending';
  end if;

  perform public.write_audit('verification.' || p_decision::text, 'verification_request', p_request::text, v_req.org_id,
    jsonb_build_object('note', p_note, 'level', v_req.requested_level));
end $$;

-- Admin status changes (approve without verification, suspend, reinstate).
create or replace function public.admin_set_org_status(p_org uuid, p_status public.org_status, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.organizations
    set status = p_status, approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
    where id = p_org;
  perform public.write_audit('organization.status_' || p_status::text, 'organization', p_org::text, p_org,
    jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion requests & platform settings & site content
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  processed_by uuid references auth.users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index account_deletion_one_open on public.account_deletion_requests (user_id) where status in ('pending', 'processing');

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Editable public website content blocks (homepage hero, about text, etc.)
create table public.site_content (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  body text check (char_length(body) <= 2000),
  link_url text,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('environment', '"production"', 'production | demo — demo environments display a persistent banner'),
  ('registration.open', 'true', 'Allow new account registrations'),
  ('organizations.require_verification_for_fundraising', 'true', 'Fundraising requires completed verification'),
  ('payments.live_enabled', 'false', 'Must be explicitly enabled after legal and Stripe review')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.audit_logs enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.verification_requests enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.platform_settings enable row level security;
alter table public.site_content enable row level security;
alter table public.site_announcements enable row level security;

-- Profiles
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or profile_visibility = 'public'
  or (profile_visibility = 'members' and auth.uid() is not null)
  or public.is_platform_staff()
);
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Guard: users cannot flip is_demo on themselves.
create or replace function public.guard_profile_columns() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    new.is_demo := old.is_demo;
    new.id := old.id;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- Platform admins
create policy platform_admins_select on public.platform_admins for select
  using (user_id = auth.uid() or public.is_platform_staff());
-- Writes: service role only (super admins grant via server action).

-- Audit logs: platform staff read all; org admins read their org's entries.
create policy audit_logs_select on public.audit_logs for select
  using (public.is_platform_staff() or (org_id is not null and public.has_org_role(org_id, 'admin')));

-- Organizations
create policy organizations_select on public.organizations for select using (
  (status = 'approved' and deleted_at is null)
  or created_by = auth.uid()
  or public.is_org_member(id)
  or public.is_platform_staff()
);
create policy organizations_insert on public.organizations for insert
  with check (auth.uid() is not null and created_by = auth.uid());
create policy organizations_update on public.organizations for update
  using (public.has_org_role(id, 'admin') or public.is_platform_admin())
  with check (public.has_org_role(id, 'admin') or public.is_platform_admin());

-- Members: members of the org see the roster; users see their own memberships.
create policy organization_members_select on public.organization_members for select
  using (user_id = auth.uid() or public.is_org_member(org_id) or public.is_platform_staff());

-- Invitations: org admins only.
create policy organization_invitations_select on public.organization_invitations for select
  using (public.has_org_role(org_id, 'admin') or public.is_platform_staff());
create policy organization_invitations_revoke on public.organization_invitations for update
  using (public.has_org_role(org_id, 'admin')) with check (public.has_org_role(org_id, 'admin'));

-- Verification requests
create policy verification_requests_select on public.verification_requests for select
  using (public.has_org_role(org_id, 'admin') or public.is_platform_staff());
create policy verification_requests_insert on public.verification_requests for insert
  with check (public.has_org_role(org_id, 'admin') and submitted_by = auth.uid() and status = 'submitted'
    and reviewer_id is null and decided_at is null);

-- Deletion requests
create policy account_deletion_select on public.account_deletion_requests for select
  using (user_id = auth.uid() or public.is_platform_admin());
create policy account_deletion_insert on public.account_deletion_requests for insert
  with check (user_id = auth.uid() and status = 'pending');
create policy account_deletion_cancel on public.account_deletion_requests for update
  using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid() and status = 'cancelled');

-- Settings: public read for non-sensitive keys; admin write.
create policy platform_settings_select on public.platform_settings for select using (true);
create policy platform_settings_write on public.platform_settings for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy site_content_select on public.site_content for select using (true);
create policy site_content_write on public.site_content for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy site_announcements_select on public.site_announcements for select
  using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_platform_staff());
create policy site_announcements_write on public.site_announcements for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.organizations, public.platform_settings,
  public.site_content, public.site_announcements to anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select on public.organization_members, public.platform_admins, public.audit_logs to authenticated;
grant select, update on public.organization_invitations to authenticated;
grant select, insert on public.verification_requests to authenticated;
grant select, insert, update on public.account_deletion_requests to authenticated;
grant select, insert, update, delete on public.platform_settings, public.site_content, public.site_announcements to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
