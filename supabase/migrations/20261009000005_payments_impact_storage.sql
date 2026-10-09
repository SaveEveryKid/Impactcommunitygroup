-- ============================================================================
-- 0005 PAYMENTS, IMPACT TRACKING, STORAGE, DEMO DATA CONTROLS
--
-- Payment state is written ONLY by the server (service role) after verifying
-- Stripe webhooks. Clients can never insert or update payment rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Stripe Connect accounts for organizations
-- ---------------------------------------------------------------------------
create table public.org_payment_accounts (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due text[] not null default '{}',
  livemode boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create type public.campaign_status as enum ('draft', 'pending_review', 'active', 'paused', 'completed', 'cancelled');

create table public.fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  -- NULL org_id = platform-operated campaign (funds go to the platform's own Stripe account)
  org_id uuid references public.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 140),
  summary text check (char_length(summary) <= 300),
  story text check (char_length(story) <= 10000),
  cover_path text,
  pillars public.wellbeing_pillar[] not null default '{}',
  goal_cents bigint check (goal_cents is null or goal_cents >= 100),
  currency text not null default 'usd',
  allow_recurring boolean not null default true,
  suggested_amounts_cents int[] not null default '{2500,5000,10000,25000}',
  starts_at timestamptz,
  ends_at timestamptz,
  status public.campaign_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger fundraising_campaigns_updated_at before update on public.fundraising_campaigns
  for each row execute function public.set_updated_at();
create index fundraising_campaigns_status_idx on public.fundraising_campaigns (status, created_at desc);

create type public.donation_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'canceled');
create type public.donor_visibility as enum ('public', 'organization_only', 'anonymous');

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.fundraising_campaigns(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,   -- null = platform
  donor_user_id uuid references auth.users(id) on delete set null,
  donor_name text check (char_length(donor_name) <= 120),
  donor_email text check (char_length(donor_email) <= 200),
  donor_visibility public.donor_visibility not null default 'organization_only',
  amount_cents bigint not null check (amount_cents >= 100),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  currency text not null default 'usd',
  is_recurring boolean not null default false,
  recurring_interval text check (recurring_interval in ('month', 'year')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text unique,
  stripe_subscription_id text,
  stripe_account_id text,
  status public.donation_status not null default 'pending',
  receipt_number text unique,
  message text check (char_length(message) <= 500),
  livemode boolean not null default false,
  is_demo boolean not null default false,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_le_amount check (refunded_cents <= amount_cents)
);
create trigger donations_updated_at before update on public.donations for each row execute function public.set_updated_at();
create index donations_campaign_idx on public.donations (campaign_id, status);
create index donations_org_idx on public.donations (org_id, created_at desc);
create index donations_donor_idx on public.donations (donor_user_id, created_at desc);
create index donations_subscription_idx on public.donations (stripe_subscription_id) where stripe_subscription_id is not null;

create sequence public.receipt_seq start 1000;

-- Every money movement (charge, refund, event ticket) as an immutable ledger row.
create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('donation', 'event_ticket', 'refund', 'dispute')),
  donation_id uuid references public.donations(id) on delete set null,
  event_registration_id uuid references public.event_registrations(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  amount_cents bigint not null,      -- negative for refunds
  currency text not null default 'usd',
  stripe_object_id text not null,
  stripe_event_id text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  unique (kind, stripe_object_id)
);
create index payment_records_org_idx on public.payment_records (org_id, created_at desc);

-- Webhook idempotency: each Stripe event is processed at most once.
create table public.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb not null
);

-- Campaign progress (net of refunds), public-safe.
create or replace function public.campaign_progress(p_campaign uuid)
returns table (raised_cents bigint, donor_count bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents - refunded_cents), 0)::bigint, count(distinct coalesce(donor_user_id::text, donor_email, id::text))
  from public.donations
  where campaign_id = p_campaign and status in ('succeeded', 'partially_refunded')
$$;

-- Donations visible to an org, with donor identity masked per donor preference.
create or replace function public.org_donations(p_org uuid, p_limit int default 100, p_offset int default 0)
returns table (id uuid, campaign_id uuid, donor_display text, donor_email text, amount_cents bigint, refunded_cents bigint,
               status public.donation_status, is_recurring boolean, receipt_number text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, 'admin') and not public.is_platform_admin() then
    raise exception 'Organization admin required' using errcode = '42501';
  end if;
  return query
    select d.id, d.campaign_id,
      case when d.donor_visibility = 'anonymous' then 'Anonymous donor' else coalesce(d.donor_name, 'Donor') end,
      case when d.donor_visibility = 'anonymous' then null else d.donor_email end,
      d.amount_cents, d.refunded_cents, d.status, d.is_recurring, d.receipt_number, d.created_at
    from public.donations d where d.org_id = p_org
    order by d.created_at desc limit least(p_limit, 500) offset p_offset;
end $$;

-- Public donor wall: only donors who chose "public".
create or replace function public.campaign_public_donors(p_campaign uuid, p_limit int default 20)
returns table (donor_name text, amount_cents bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(donor_name, 'Supporter'), amount_cents, created_at from public.donations
  where campaign_id = p_campaign and donor_visibility = 'public' and status = 'succeeded'
  order by created_at desc limit least(p_limit, 100)
$$;

-- Can this org accept live donations? (approved + identity verified + Stripe ready)
create or replace function public.org_can_fundraise(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations o
    join public.org_payment_accounts a on a.org_id = o.id
    where o.id = p_org and o.status = 'approved' and o.deleted_at is null
      and o.verification_level in ('identity_verified', 'tax_exempt_verified')
      and a.charges_enabled and a.details_submitted
  )
$$;

create or replace function public.guard_campaign_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_platform_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.org_id is null then raise exception 'Only platform admins create platform campaigns' using errcode = '42501'; end if;
    new.created_by := auth.uid(); new.is_demo := false; new.approved_by := null; new.approved_at := null;
    if new.status not in ('draft', 'pending_review') then new.status := 'draft'; end if;
  else
    new.org_id := old.org_id; new.is_demo := old.is_demo; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.created_by := old.created_by;
    -- Orgs may submit for review, pause/resume an approved campaign, or complete it.
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status = 'pending_review') or
      (old.status = 'pending_review' and new.status = 'draft') or
      (old.status = 'active' and new.status in ('paused', 'completed')) or
      (old.status = 'paused' and new.status in ('active', 'completed'))
    ) then
      raise exception 'Campaign status change requires platform review' using errcode = '42501';
    end if;
    if new.status = 'active' and old.status = 'paused' and not public.org_can_fundraise(new.org_id) then
      raise exception 'Payment onboarding must be complete before resuming' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger fundraising_campaigns_guard before insert or update on public.fundraising_campaigns
  for each row execute function public.guard_campaign_columns();

create or replace function public.approve_campaign(p_campaign uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_c public.fundraising_campaigns;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode = '42501'; end if;
  select * into v_c from public.fundraising_campaigns where id = p_campaign for update;
  if v_c.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if p_approve and v_c.org_id is not null and not public.org_can_fundraise(v_c.org_id) then
    raise exception 'Organization must be verified and finish Stripe onboarding before a campaign goes live' using errcode = '22023';
  end if;
  update public.fundraising_campaigns
    set status = case when p_approve then 'active'::public.campaign_status else 'draft'::public.campaign_status end,
        approved_by = case when p_approve then auth.uid() end, approved_at = case when p_approve then now() end
    where id = p_campaign;
  perform public.write_audit(case when p_approve then 'campaign.approved' else 'campaign.returned' end,
    'campaign', p_campaign::text, v_c.org_id, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- IMPACT RECORDS
-- One row per (source, metric) — the unique key prevents double counting.
-- verification:
--   verified       – confirmed by a counter-party or coordinator inside the platform
--   self_reported  – entered by an organization without platform confirmation
--   estimated      – derived/estimated figure, always labelled as such
-- ---------------------------------------------------------------------------
create type public.impact_metric as enum (
  'resource_transfer_completed', 'resource_quantity_redistributed', 'volunteer_hours',
  'event_completed', 'event_attendance', 'partnership_formed', 'donation_processed', 'people_served'
);
create type public.impact_verification as enum ('verified', 'self_reported', 'estimated');

create table public.impact_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  metric public.impact_metric not null,
  quantity numeric(14, 2) not null check (quantity >= 0),
  unit text not null,
  resource_category public.resource_category,
  pillars public.wellbeing_pillar[] not null default '{}',
  verification public.impact_verification not null,
  method_note text check (char_length(method_note) <= 500),
  source_type text not null check (source_type in ('resource_transfer', 'volunteer_hours', 'event', 'partnership', 'donation', 'manual')),
  source_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, metric)
);
create index impact_records_metric_idx on public.impact_records (metric, occurred_at);
create index impact_records_org_idx on public.impact_records (org_id, occurred_at);

create or replace function public.trg_impact_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_res public.resources;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into v_res from public.resources where id = new.resource_id;
    insert into public.impact_records (org_id, metric, quantity, unit, resource_category, pillars, verification, method_note,
      source_type, source_id, occurred_at, is_demo)
    values
      (new.from_org_id, 'resource_transfer_completed', 1, 'transfers', v_res.category, v_res.pillars, 'verified',
       'Receipt confirmed in-platform by the receiving organization', 'resource_transfer', new.id, new.completed_at, new.is_demo),
      (new.from_org_id, 'resource_quantity_redistributed', new.quantity, new.unit, v_res.category, v_res.pillars, 'verified',
       'Quantity confirmed by the receiving organization; unit as listed by the giver', 'resource_transfer', new.id, new.completed_at, new.is_demo)
    on conflict (source_type, source_id, metric) do nothing;
  end if;
  return new;
end $$;
create trigger resource_transfers_impact after update on public.resource_transfers
  for each row execute function public.trg_impact_transfer();

create or replace function public.trg_impact_hours() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and new.attended and new.hours > 0 then
    insert into public.impact_records (org_id, metric, quantity, unit, verification, method_note, source_type, source_id, occurred_at, recorded_by, is_demo)
    values (new.org_id, 'volunteer_hours', new.hours, 'hours', 'verified',
      'Attendance recorded and hours verified by an organization coordinator', 'volunteer_hours', new.id, coalesce(new.verified_at, now()), new.verified_by, new.is_demo)
    on conflict (source_type, source_id, metric) do update set quantity = excluded.quantity, occurred_at = excluded.occurred_at;
  else
    delete from public.impact_records where source_type = 'volunteer_hours' and source_id = new.id;
  end if;
  return new;
end $$;
create trigger volunteer_hours_impact after insert or update on public.volunteer_hours
  for each row execute function public.trg_impact_hours();

create or replace function public.trg_impact_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_attended int;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select count(*) into v_attended from public.event_registrations where event_id = new.id and status = 'checked_in';
    insert into public.impact_records (org_id, metric, quantity, unit, pillars, verification, method_note, source_type, source_id, occurred_at, is_demo)
    values
      (new.org_id, 'event_completed', 1, 'events', new.pillars, 'verified', 'Event marked completed by organizer after start time', 'event', new.id, new.ends_at, new.is_demo),
      (new.org_id, 'event_attendance', v_attended, 'attendees', new.pillars, 'verified', 'Count of attendees checked in at the event', 'event', new.id, new.ends_at, new.is_demo)
    on conflict (source_type, source_id, metric) do nothing;
  end if;
  return new;
end $$;
create trigger events_impact after update on public.events
  for each row execute function public.trg_impact_event();

create or replace function public.trg_impact_partnership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.impact_records (org_id, metric, quantity, unit, verification, method_note, source_type, source_id, is_demo)
    values (new.target_org_id, 'partnership_formed', 1, 'partnerships', 'verified', 'Partnership accepted by both organizations', 'partnership', new.id, new.is_demo)
    on conflict (source_type, source_id, metric) do nothing;
  end if;
  return new;
end $$;
create trigger partnerships_impact after update on public.partnerships
  for each row execute function public.trg_impact_partnership();

create or replace function public.trg_impact_donation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('succeeded', 'partially_refunded') then
    insert into public.impact_records (org_id, metric, quantity, unit, verification, method_note, source_type, source_id, occurred_at, is_demo)
    values (new.org_id, 'donation_processed', (new.amount_cents - new.refunded_cents) / 100.0, new.currency, 'verified',
      'Net amount confirmed by payment processor webhook', 'donation', new.id, coalesce(new.succeeded_at, now()), new.is_demo)
    on conflict (source_type, source_id, metric) do update set quantity = excluded.quantity;
  elsif new.status in ('refunded', 'failed', 'canceled') then
    delete from public.impact_records where source_type = 'donation' and source_id = new.id;
  end if;
  return new;
end $$;
create trigger donations_impact after insert or update on public.donations
  for each row execute function public.trg_impact_donation();

-- Public, aggregate-only impact numbers. Demo data is ALWAYS excluded here.
create or replace function public.public_impact_summary()
returns table (metric text, verification public.impact_verification, total numeric, records bigint)
language sql stable security definer set search_path = public as $$
  select metric::text, verification, sum(quantity), count(*)
  from public.impact_records where not is_demo and metric <> 'donation_processed'
  group by metric, verification
  union all
  select 'organizations_registered', 'verified'::public.impact_verification, count(*), count(*)
  from public.organizations where status = 'approved' and deleted_at is null and not is_demo
  union all
  select 'active_volunteers_12mo', 'verified'::public.impact_verification, count(distinct user_id), count(distinct user_id)
  from public.volunteer_hours where status = 'verified' and attended and not is_demo and verified_at > now() - interval '12 months'
$$;

-- Same aggregation for the clearly-labelled demonstration environment.
create or replace function public.demo_impact_summary()
returns table (metric text, verification public.impact_verification, total numeric, records bigint)
language sql stable security definer set search_path = public as $$
  select metric::text, verification, sum(quantity), count(*)
  from public.impact_records where is_demo
  group by metric, verification
$$;

-- Org-scoped impact report for dashboards and funder exports.
create or replace function public.org_impact_summary(p_org uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (metric text, verification public.impact_verification, unit text, total numeric, records bigint)
language sql stable security definer set search_path = public as $$
  select metric::text, verification, unit, sum(quantity), count(*)
  from public.impact_records
  where org_id = p_org
    and (p_from is null or occurred_at >= p_from) and (p_to is null or occurred_at < p_to)
    and (metric <> 'donation_processed' or public.has_org_role(p_org, 'admin') or public.is_platform_admin())
  group by metric, verification, unit
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.org_payment_accounts enable row level security;
alter table public.fundraising_campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.payment_records enable row level security;
alter table public.stripe_events enable row level security;
alter table public.impact_records enable row level security;

create policy org_payment_accounts_select on public.org_payment_accounts for select
  using (public.has_org_role(org_id, 'admin') or public.is_platform_admin());

create policy fundraising_campaigns_select on public.fundraising_campaigns for select using (
  (status in ('active', 'paused', 'completed') and (org_id is null or public.org_is_active(org_id)))
  or (org_id is not null and public.has_org_role(org_id, 'admin'))
  or public.is_platform_staff()
);
create policy fundraising_campaigns_insert on public.fundraising_campaigns for insert
  with check ((org_id is not null and public.has_org_role(org_id, 'admin')) or public.is_platform_admin());
create policy fundraising_campaigns_update on public.fundraising_campaigns for update
  using ((org_id is not null and public.has_org_role(org_id, 'admin')) or public.is_platform_admin())
  with check ((org_id is not null and public.has_org_role(org_id, 'admin')) or public.is_platform_admin());

create policy donations_select on public.donations for select
  using (donor_user_id = auth.uid() or public.is_platform_admin());

create policy payment_records_select on public.payment_records for select
  using ((org_id is not null and public.has_org_role(org_id, 'admin')) or public.is_platform_admin());

-- stripe_events: no policies => only service_role.

create policy impact_records_select on public.impact_records for select using (
  (org_id is not null and public.is_org_member(org_id)) or public.is_platform_staff()
);
create policy impact_records_manual_insert on public.impact_records for insert with check (
  source_type = 'manual' and verification in ('self_reported', 'estimated')
  and org_id is not null and public.has_org_role(org_id, 'coordinator')
  and recorded_by = auth.uid() and is_demo = false
);
create policy impact_records_manual_delete on public.impact_records for delete using (
  source_type = 'manual' and org_id is not null and public.has_org_role(org_id, 'admin')
);

grant select on public.fundraising_campaigns to anon;
grant select on public.org_payment_accounts, public.donations, public.payment_records to authenticated;
grant select, insert, update on public.fundraising_campaigns to authenticated;
grant select, insert, delete on public.impact_records to authenticated;
grant all on public.org_payment_accounts, public.fundraising_campaigns, public.donations, public.payment_records,
  public.stripe_events, public.impact_records to service_role;
grant usage on sequence public.receipt_seq to service_role;

-- ---------------------------------------------------------------------------
-- STORAGE
--   media (public read): org/{org_id}/..., user/{user_id}/...
--   documents (private): org/{org_id}/verification/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_write_org on storage.objects for insert with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = 'org'
  and public.has_org_role(((storage.foldername(name))[2])::uuid, 'coordinator')
);
create policy media_write_user on storage.objects for insert with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = auth.uid()::text
);
create policy media_delete on storage.objects for delete using (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] = 'org' and public.has_org_role(((storage.foldername(name))[2])::uuid, 'coordinator'))
    or ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = auth.uid()::text)
  )
);
create policy documents_read on storage.objects for select using (
  bucket_id = 'documents' and (
    public.is_platform_staff()
    or ((storage.foldername(name))[1] = 'org' and public.has_org_role(((storage.foldername(name))[2])::uuid, 'admin'))
  )
);
create policy documents_write on storage.objects for insert with check (
  bucket_id = 'documents' and (storage.foldername(name))[1] = 'org'
  and public.has_org_role(((storage.foldername(name))[2])::uuid, 'admin')
);

-- ---------------------------------------------------------------------------
-- DEMO DATA RESET (service role only). Deletes every row flagged is_demo.
-- ---------------------------------------------------------------------------
create or replace function public.reset_demo_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orgs int; v_users int;
begin
  delete from public.impact_records where is_demo;
  delete from public.payment_records where donation_id in (select id from public.donations where is_demo);
  delete from public.donations where is_demo;
  delete from public.fundraising_campaigns where is_demo;
  delete from public.resource_transfers where is_demo;
  delete from public.partnerships where is_demo;
  delete from public.conversations where is_demo;
  delete from public.organizations where is_demo;
  get diagnostics v_orgs = row_count;
  delete from auth.users where id in (select id from public.profiles where is_demo);
  get diagnostics v_users = row_count;
  return jsonb_build_object('organizations_deleted', v_orgs, 'users_deleted', v_users);
end $$;
revoke all on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;
