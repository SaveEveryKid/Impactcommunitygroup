-- ============================================================================
-- 0006 OPERATIONS: contact inbox, database-backed rate limiting
-- ============================================================================

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 200),
  topic text not null check (topic in ('general', 'organization', 'volunteer', 'sponsor', 'press', 'safety')),
  message text not null check (char_length(message) between 10 and 4000),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed', 'spam')),
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
alter table public.contact_messages enable row level security;
create policy contact_messages_staff on public.contact_messages for all
  using (public.is_platform_staff()) with check (public.is_platform_staff());
grant select, update on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

-- Fixed-window rate limiter. Keys are hashed by the server (never raw IPs).
create table public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_buckets enable row level security;  -- no policies: service role only

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limit_buckets (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;
  -- opportunistic cleanup
  if random() < 0.01 then
    delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
grant all on public.rate_limit_buckets to service_role;

-- ---------------------------------------------------------------------------
-- Column-level privacy for organizations: EIN and internal reviewer/creator
-- ids are not readable through the public API. Org admins and platform staff
-- read them through org_private_fields().
-- ---------------------------------------------------------------------------
revoke select on public.organizations from anon, authenticated;
grant select (
  id, slug, name, org_type, mission, description, logo_path, cover_path, pillars, service_categories,
  service_area, city, region, postal_code, approx_lat, approx_lng, public_email, public_phone, website_url,
  social_links, status, verification_level, tax_exempt_checked_at, is_featured, is_demo, approved_at,
  created_at, updated_at, deleted_at
) on public.organizations to anon, authenticated;
-- created_by is needed by the insert RLS policy check, but is not exposed for reading.

create or replace function public.org_private_fields(p_org uuid)
returns table (ein text, created_by uuid, tax_exempt_checked_by uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, 'admin') and not public.is_platform_staff() then
    raise exception 'Organization admin required' using errcode = '42501';
  end if;
  return query select o.ein, o.created_by, o.tax_exempt_checked_by from public.organizations o where o.id = p_org;
end $$;

-- ---------------------------------------------------------------------------
-- Foreign keys to profiles so the API can embed display names
-- (profiles.id = auth.users.id, so these never conflict with the auth FKs).
-- ---------------------------------------------------------------------------
alter table public.organization_members add constraint organization_members_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.volunteer_applications add constraint volunteer_applications_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.volunteer_hours add constraint volunteer_hours_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.event_registrations add constraint event_registrations_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.messages add constraint messages_sender_profile_fk foreign key (sender_id) references public.profiles(id) on delete set null;
alter table public.posts add constraint posts_author_profile_fk foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.post_comments add constraint post_comments_author_profile_fk foreign key (author_id) references public.profiles(id) on delete cascade;
alter table public.resource_transfers add constraint resource_transfers_volunteer_profile_fk foreign key (volunteer_user_id) references public.profiles(id) on delete set null;
alter table public.conversation_participants add constraint conversation_participants_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.resource_transfer_events add constraint resource_transfer_events_actor_profile_fk foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.verification_requests add constraint verification_requests_submitter_profile_fk foreign key (submitted_by) references public.profiles(id) on delete set null;
alter table public.audit_logs add constraint audit_logs_actor_profile_fk foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.content_reports add constraint content_reports_reporter_profile_fk foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.donations add constraint donations_donor_profile_fk foreign key (donor_user_id) references public.profiles(id) on delete set null;

-- Teammates can always see each other's display names, even with private profiles.
create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;
create policy profiles_select_teammates on public.profiles for select using (public.shares_org_with(id));
