-- ============================================================================
-- 0003 VOLUNTEER NETWORK + EVENTS
-- Capacity is enforced inside security-definer functions that lock the parent
-- row (opportunity/shift/event), so concurrent sign-ups cannot oversubscribe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Volunteer profiles (opt-in, user-controlled)
-- ---------------------------------------------------------------------------
create table public.volunteer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests public.wellbeing_pillar[] not null default '{}',
  causes text[] not null default '{}',
  skills text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb,   -- e.g. {"weekday_evenings":true,"weekends":true}
  service_areas text[] not null default '{}',
  max_distance_miles int check (max_distance_miles between 1 and 500),
  is_discoverable boolean not null default false,     -- org coordinators may see in recommendations
  updated_at timestamptz not null default now()
);
create trigger volunteer_profiles_updated_at before update on public.volunteer_profiles
  for each row execute function public.set_updated_at();

create type public.opportunity_status as enum ('draft', 'published', 'closed', 'completed', 'cancelled');
create type public.application_status as enum ('pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'completed', 'no_show');

create table public.volunteer_opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  summary text check (char_length(summary) <= 300),
  description text check (char_length(description) <= 5000),
  pillars public.wellbeing_pillar[] not null default '{}',
  skills_required text[] not null default '{}',
  general_location text check (char_length(general_location) <= 120),
  approx_lat double precision,
  approx_lng double precision,
  is_virtual boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'America/Chicago',
  capacity int check (capacity is null or capacity > 0),
  requires_approval boolean not null default true,
  allows_minors boolean not null default false,
  min_age int check (min_age between 0 and 99),
  status public.opportunity_status not null default 'draft',
  cover_path text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opp_time_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger volunteer_opportunities_updated_at before update on public.volunteer_opportunities
  for each row execute function public.set_updated_at();
create index volunteer_opportunities_browse_idx on public.volunteer_opportunities (status, starts_at);
create index volunteer_opportunities_org_idx on public.volunteer_opportunities (org_id);
create index volunteer_opportunities_search_idx on public.volunteer_opportunities
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));

create table public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.volunteer_opportunities(id) on delete cascade,
  label text check (char_length(label) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now(),
  constraint shift_time_order check (ends_at > starts_at)
);
create index volunteer_shifts_opp_idx on public.volunteer_shifts (opportunity_id, starts_at);

create table public.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.volunteer_opportunities(id) on delete cascade,
  shift_id uuid references public.volunteer_shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.application_status not null default 'pending',
  message text check (char_length(message) <= 1500),
  -- Guardian consent captured for applicants who are not adults.
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_email text check (char_length(guardian_email) <= 200),
  guardian_consent_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  waitlist_position int,
  reminder_sent_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger volunteer_applications_updated_at before update on public.volunteer_applications
  for each row execute function public.set_updated_at();
create unique index volunteer_applications_unique_active on public.volunteer_applications
  (opportunity_id, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  where status not in ('cancelled', 'declined');
create index volunteer_applications_user_idx on public.volunteer_applications (user_id, created_at desc);
create index volunteer_applications_opp_idx on public.volunteer_applications (opportunity_id, status);

create type public.hours_status as enum ('recorded', 'verified', 'rejected');

create table public.volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.volunteer_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  attended boolean not null,
  hours numeric(6, 2) not null default 0 check (hours >= 0 and hours <= 24),
  status public.hours_status not null default 'recorded',
  recorded_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  note text check (char_length(note) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger volunteer_hours_updated_at before update on public.volunteer_hours
  for each row execute function public.set_updated_at();
create index volunteer_hours_user_idx on public.volunteer_hours (user_id);
create index volunteer_hours_org_idx on public.volunteer_hours (org_id, status);

-- ---------------------------------------------------------------------------
-- Volunteer workflow functions
-- ---------------------------------------------------------------------------
create or replace function public.opportunity_slots_taken(p_opp uuid, p_shift uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.volunteer_applications
  where opportunity_id = p_opp and shift_id is not distinct from p_shift and status in ('approved', 'completed')
$$;

create or replace function public.apply_to_opportunity(
  p_opp uuid, p_shift uuid default null, p_message text default null,
  p_guardian_name text default null, p_guardian_email text default null, p_guardian_consent boolean default false
) returns public.application_status
language plpgsql security definer set search_path = public as $$
declare
  v_opp public.volunteer_opportunities;
  v_shift public.volunteer_shifts;
  v_is_adult boolean;
  v_capacity int;
  v_taken int;
  v_status public.application_status;
  v_pos int;
begin
  if auth.uid() is null then raise exception 'Sign in to volunteer' using errcode = '42501'; end if;
  select * into v_opp from public.volunteer_opportunities where id = p_opp for update;
  if v_opp.id is null or v_opp.status <> 'published' or not public.org_is_active(v_opp.org_id) then
    raise exception 'This opportunity is not accepting volunteers' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.volunteer_shifts where opportunity_id = p_opp) and p_shift is null then
    raise exception 'Please choose a shift' using errcode = '22023';
  end if;
  if p_shift is not null then
    select * into v_shift from public.volunteer_shifts where id = p_shift and opportunity_id = p_opp for update;
    if v_shift.id is null then raise exception 'Shift not found' using errcode = 'P0002'; end if;
    if v_shift.starts_at < now() then raise exception 'This shift has already started' using errcode = '22023'; end if;
    v_capacity := v_shift.capacity;
  else
    v_capacity := v_opp.capacity;
  end if;

  select is_adult into v_is_adult from public.profiles where id = auth.uid();
  if not coalesce(v_is_adult, false) then
    if not v_opp.allows_minors then
      raise exception 'This opportunity is limited to adult volunteers' using errcode = '42501';
    end if;
    if not p_guardian_consent or coalesce(trim(p_guardian_name), '') = '' or coalesce(trim(p_guardian_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'A parent or guardian name, email and consent are required' using errcode = '22023';
    end if;
  end if;

  v_taken := public.opportunity_slots_taken(p_opp, p_shift);
  if v_capacity is not null and v_taken >= v_capacity then
    v_status := 'waitlisted';
    select coalesce(max(waitlist_position), 0) + 1 into v_pos from public.volunteer_applications
      where opportunity_id = p_opp and shift_id is not distinct from p_shift and status = 'waitlisted';
  elsif v_opp.requires_approval then
    v_status := 'pending';
  else
    v_status := 'approved';
  end if;

  insert into public.volunteer_applications
    (opportunity_id, shift_id, user_id, status, message, guardian_name, guardian_email, guardian_consent_at, waitlist_position, is_demo)
  values (p_opp, p_shift, auth.uid(), v_status, p_message,
    case when v_is_adult then null else p_guardian_name end,
    case when v_is_adult then null else p_guardian_email end,
    case when v_is_adult then null else now() end,
    v_pos, v_opp.is_demo);
  return v_status;
exception when unique_violation then
  raise exception 'You have already signed up for this opportunity' using errcode = '23505';
end $$;

create or replace function public.promote_volunteer_waitlist(p_opp uuid, p_shift uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_next uuid;
begin
  if p_shift is not null then
    select capacity into v_cap from public.volunteer_shifts where id = p_shift;
  else
    select capacity into v_cap from public.volunteer_opportunities where id = p_opp;
  end if;
  if v_cap is not null and public.opportunity_slots_taken(p_opp, p_shift) >= v_cap then
    return null;
  end if;
  select id into v_next from public.volunteer_applications
    where opportunity_id = p_opp and shift_id is not distinct from p_shift and status = 'waitlisted'
    order by waitlist_position nulls last, created_at limit 1 for update skip locked;
  if v_next is not null then
    update public.volunteer_applications set status = 'approved', waitlist_position = null, decided_at = now()
      where id = v_next;
  end if;
  return v_next;
end $$;
revoke all on function public.promote_volunteer_waitlist(uuid, uuid) from public, anon, authenticated;

create or replace function public.decide_volunteer_application(p_app uuid, p_approve boolean) returns public.application_status
language plpgsql security definer set search_path = public as $$
declare
  v_app public.volunteer_applications;
  v_opp public.volunteer_opportunities;
  v_cap int;
  v_status public.application_status;
begin
  select * into v_app from public.volunteer_applications where id = p_app;
  if v_app.id is null then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select * into v_opp from public.volunteer_opportunities where id = v_app.opportunity_id for update;
  if not public.has_org_role(v_opp.org_id, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  select * into v_app from public.volunteer_applications where id = p_app for update;
  if v_app.status not in ('pending', 'waitlisted') then
    raise exception 'This application has already been decided' using errcode = '22023';
  end if;
  if not p_approve then
    v_status := 'declined';
  else
    if v_app.shift_id is not null then
      select capacity into v_cap from public.volunteer_shifts where id = v_app.shift_id for update;
    else
      v_cap := v_opp.capacity;
    end if;
    if v_cap is not null and public.opportunity_slots_taken(v_app.opportunity_id, v_app.shift_id) >= v_cap then
      raise exception 'This opportunity is at capacity. Increase capacity or keep the volunteer waitlisted.' using errcode = '23514';
    end if;
    v_status := 'approved';
  end if;
  update public.volunteer_applications
    set status = v_status, decided_by = auth.uid(), decided_at = now(), waitlist_position = null
    where id = p_app;
  perform public.write_audit('volunteer.application_' || v_status::text, 'volunteer_application', p_app::text, v_opp.org_id, '{}'::jsonb);
  return v_status;
end $$;

create or replace function public.cancel_volunteer_application(p_app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_app public.volunteer_applications;
  v_org uuid;
begin
  select a.* into v_app from public.volunteer_applications a where a.id = p_app for update;
  if v_app.id is null then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select org_id into v_org from public.volunteer_opportunities where id = v_app.opportunity_id;
  if v_app.user_id <> auth.uid() and not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;
  if v_app.status not in ('pending', 'approved', 'waitlisted') then
    raise exception 'This sign-up can no longer be cancelled' using errcode = '22023';
  end if;
  update public.volunteer_applications set status = 'cancelled', waitlist_position = null where id = p_app;
  if v_app.status = 'approved' then
    perform public.promote_volunteer_waitlist(v_app.opportunity_id, v_app.shift_id);
  end if;
end $$;

-- Coordinator records attendance and hours; verification is a separate step
-- (may be the same coordinator, but it is explicit and audited).
create or replace function public.record_volunteer_attendance(p_app uuid, p_attended boolean, p_hours numeric, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_app public.volunteer_applications;
  v_org uuid;
  v_id uuid;
begin
  select * into v_app from public.volunteer_applications where id = p_app for update;
  if v_app.id is null then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select org_id into v_org from public.volunteer_opportunities where id = v_app.opportunity_id;
  if not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  if v_app.status not in ('approved', 'completed', 'no_show') then
    raise exception 'Attendance can only be recorded for approved volunteers' using errcode = '22023';
  end if;
  if p_hours < 0 or p_hours > 24 or (not p_attended and p_hours > 0) then
    raise exception 'Hours must be between 0 and 24 (0 when absent)' using errcode = '22023';
  end if;
  insert into public.volunteer_hours (application_id, user_id, org_id, attended, hours, recorded_by, note, is_demo)
  values (p_app, v_app.user_id, v_org, p_attended, p_hours, auth.uid(), p_note, v_app.is_demo)
  on conflict (application_id) do update
    set attended = excluded.attended, hours = excluded.hours, recorded_by = excluded.recorded_by,
        note = excluded.note, status = 'recorded', verified_by = null, verified_at = null
  returning id into v_id;
  update public.volunteer_applications set status = case when p_attended then 'completed'::public.application_status else 'no_show'::public.application_status end
    where id = p_app;
  return v_id;
end $$;

create or replace function public.verify_volunteer_hours(p_hours_id uuid, p_verify boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_h public.volunteer_hours;
begin
  select * into v_h from public.volunteer_hours where id = p_hours_id for update;
  if v_h.id is null then raise exception 'Record not found' using errcode = 'P0002'; end if;
  if not public.has_org_role(v_h.org_id, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  if v_h.user_id = auth.uid() then
    raise exception 'You cannot verify your own volunteer hours' using errcode = '42501';
  end if;
  update public.volunteer_hours
    set status = case when p_verify then 'verified'::public.hours_status else 'rejected'::public.hours_status end,
        verified_by = auth.uid(), verified_at = now()
    where id = p_hours_id;
  perform public.write_audit('volunteer.hours_' || case when p_verify then 'verified' else 'rejected' end,
    'volunteer_hours', p_hours_id::text, v_h.org_id, jsonb_build_object('hours', v_h.hours));
end $$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create type public.event_type as enum (
  'fundraiser', 'food_drive', 'outreach', 'volunteer_gathering', 'workshop',
  'charity_drive', 'community_meal', 'networking', 'wellness', 'other'
);
create type public.event_visibility as enum ('public', 'unlisted', 'private');
create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.registration_status as enum ('pending_payment', 'confirmed', 'waitlisted', 'cancelled', 'checked_in', 'refunded');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 140),
  summary text check (char_length(summary) <= 300),
  description text check (char_length(description) <= 8000),
  event_type public.event_type not null default 'other',
  pillars public.wellbeing_pillar[] not null default '{}',
  cover_path text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Chicago',
  is_virtual boolean not null default false,
  venue_name text check (char_length(venue_name) <= 140),
  venue_address text check (char_length(venue_address) <= 300),
  general_location text check (char_length(general_location) <= 120),
  approx_lat double precision,
  approx_lng double precision,
  -- Only revealed to confirmed registrants (see event_private_details)
  visibility public.event_visibility not null default 'public',
  capacity int check (capacity is null or capacity > 0),
  waitlist_enabled boolean not null default true,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status public.event_status not null default 'draft',
  cancelled_reason text,
  duplicated_from uuid references public.events(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint event_time_order check (ends_at > starts_at)
);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create index events_browse_idx on public.events (status, visibility, starts_at);
create index events_org_idx on public.events (org_id, starts_at desc);
create index events_search_idx on public.events
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')));

create table public.event_private_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  virtual_url text check (virtual_url is null or virtual_url ~* '^https://'),
  attendee_instructions text check (char_length(attendee_instructions) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.registration_status not null,
  ticket_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  amount_cents int not null default 0,
  hold_expires_at timestamptz,
  stripe_checkout_session_id text unique,
  waitlist_position int,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger event_registrations_updated_at before update on public.event_registrations
  for each row execute function public.set_updated_at();
create unique index event_registrations_one_active on public.event_registrations (event_id, user_id)
  where status not in ('cancelled', 'refunded');
create index event_registrations_event_idx on public.event_registrations (event_id, status);
create index event_registrations_user_idx on public.event_registrations (user_id, created_at desc);

-- Seats held = confirmed + checked-in + unexpired payment holds.
create or replace function public.event_seats_taken(p_event uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.event_registrations
  where event_id = p_event and (
    status in ('confirmed', 'checked_in')
    or (status = 'pending_payment' and hold_expires_at > now())
  )
$$;

create or replace function public.can_view_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e where e.id = p_event and (
      (e.status in ('published', 'completed', 'cancelled') and e.visibility in ('public', 'unlisted') and public.org_is_active(e.org_id))
      or public.is_org_member(e.org_id)
      or exists (select 1 from public.event_registrations r where r.event_id = e.id and r.user_id = auth.uid())
    )
  ) or public.is_platform_staff()
$$;

create or replace function public.register_for_event(p_event uuid) returns public.event_registrations
language plpgsql security definer set search_path = public as $$
declare
  v_e public.events;
  v_reg public.event_registrations;
  v_taken int;
  v_status public.registration_status;
  v_pos int;
begin
  if auth.uid() is null then raise exception 'Sign in to register' using errcode = '42501'; end if;
  select * into v_e from public.events where id = p_event for update;  -- serialise registrations
  if v_e.id is null or v_e.status <> 'published' or not public.org_is_active(v_e.org_id) then
    raise exception 'Registration is not open for this event' using errcode = 'P0002';
  end if;
  if v_e.visibility = 'private' and not public.is_org_member(v_e.org_id) then
    raise exception 'This is a private event' using errcode = '42501';
  end if;
  if (v_e.registration_opens_at is not null and v_e.registration_opens_at > now())
     or (v_e.registration_closes_at is not null and v_e.registration_closes_at < now())
     or v_e.starts_at < now() then
    raise exception 'Registration is closed' using errcode = '22023';
  end if;

  -- Existing active registration? Return it (idempotent).
  select * into v_reg from public.event_registrations
    where event_id = p_event and user_id = auth.uid() and status not in ('cancelled', 'refunded');
  if v_reg.id is not null then
    if v_reg.status = 'pending_payment' and v_reg.hold_expires_at <= now() then
      update public.event_registrations set status = 'cancelled' where id = v_reg.id;
    else
      return v_reg;
    end if;
  end if;

  v_taken := public.event_seats_taken(p_event);
  if v_e.capacity is not null and v_taken >= v_e.capacity then
    if not v_e.waitlist_enabled then
      raise exception 'This event is full' using errcode = '23514';
    end if;
    v_status := 'waitlisted';
    select coalesce(max(waitlist_position), 0) + 1 into v_pos from public.event_registrations
      where event_id = p_event and status = 'waitlisted';
  elsif v_e.price_cents > 0 then
    v_status := 'pending_payment';
  else
    v_status := 'confirmed';
  end if;

  insert into public.event_registrations (event_id, user_id, status, amount_cents, hold_expires_at, waitlist_position, is_demo)
  values (p_event, auth.uid(), v_status, v_e.price_cents,
          case when v_status = 'pending_payment' then now() + interval '30 minutes' end, v_pos, v_e.is_demo)
  returning * into v_reg;
  return v_reg;
end $$;

create or replace function public.promote_event_waitlist(p_event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_e public.events;
  v_next uuid;
begin
  select * into v_e from public.events where id = p_event;
  if v_e.capacity is not null and public.event_seats_taken(p_event) >= v_e.capacity then return null; end if;
  select id into v_next from public.event_registrations
    where event_id = p_event and status = 'waitlisted'
    order by waitlist_position nulls last, created_at limit 1 for update skip locked;
  if v_next is null then return null; end if;
  if v_e.price_cents > 0 then
    update public.event_registrations set status = 'pending_payment', hold_expires_at = now() + interval '24 hours', waitlist_position = null where id = v_next;
  else
    update public.event_registrations set status = 'confirmed', waitlist_position = null where id = v_next;
  end if;
  return v_next;
end $$;
revoke all on function public.promote_event_waitlist(uuid) from public, anon, authenticated;

create or replace function public.cancel_event_registration(p_reg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_r public.event_registrations;
  v_org uuid;
begin
  select * into v_r from public.event_registrations where id = p_reg;
  if v_r.id is null then raise exception 'Registration not found' using errcode = 'P0002'; end if;
  select org_id into v_org from public.events where id = v_r.event_id for update;
  select * into v_r from public.event_registrations where id = p_reg for update;
  if v_r.user_id <> auth.uid() and not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;
  if v_r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    raise exception 'This registration cannot be cancelled' using errcode = '22023';
  end if;
  -- Paid confirmed registrations are cancelled; refunds are handled by the server via Stripe.
  update public.event_registrations set status = 'cancelled', waitlist_position = null where id = p_reg;
  if v_r.status in ('confirmed', 'pending_payment') then
    perform public.promote_event_waitlist(v_r.event_id);
  end if;
end $$;

create or replace function public.check_in_registration(p_event uuid, p_ticket_code text) returns public.event_registrations
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_r public.event_registrations;
begin
  select org_id into v_org from public.events where id = p_event;
  if v_org is null or not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  select * into v_r from public.event_registrations
    where event_id = p_event and ticket_code = upper(trim(p_ticket_code)) for update;
  if v_r.id is null then raise exception 'Ticket not found for this event' using errcode = 'P0002'; end if;
  if v_r.status = 'checked_in' then return v_r; end if;
  if v_r.status <> 'confirmed' then
    raise exception 'Ticket status is %, not confirmed', v_r.status using errcode = '22023';
  end if;
  update public.event_registrations set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
    where id = v_r.id returning * into v_r;
  return v_r;
end $$;

create or replace function public.cancel_event(p_event uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_e public.events;
begin
  select * into v_e from public.events where id = p_event for update;
  if v_e.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.has_org_role(v_e.org_id, 'admin') and not public.is_platform_admin() then
    raise exception 'Organization admin required' using errcode = '42501';
  end if;
  if v_e.status in ('cancelled', 'completed') then
    raise exception 'Event is already %', v_e.status using errcode = '22023';
  end if;
  perform set_config('cin.internal', 'on', true);
  update public.events set status = 'cancelled', cancelled_reason = p_reason where id = p_event;
  perform set_config('cin.internal', 'off', true);
  -- Free registrations are cancelled immediately; paid ones are refunded by the server
  -- (it lists confirmed paid registrations for cancelled events and issues Stripe refunds).
  update public.event_registrations set status = 'cancelled'
    where event_id = p_event and status in ('waitlisted', 'pending_payment');
  update public.event_registrations set status = 'cancelled'
    where event_id = p_event and status = 'confirmed' and amount_cents = 0;
  perform public.write_audit('event.cancelled', 'event', p_event::text, v_e.org_id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.complete_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_e public.events;
begin
  select * into v_e from public.events where id = p_event for update;
  if v_e.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.has_org_role(v_e.org_id, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  if v_e.status <> 'published' or v_e.starts_at > now() then
    raise exception 'Only published events that have started can be completed' using errcode = '22023';
  end if;
  perform set_config('cin.internal', 'on', true);
  update public.events set status = 'completed' where id = p_event;
  perform set_config('cin.internal', 'off', true);
  perform public.write_audit('event.completed', 'event', p_event::text, v_e.org_id, '{}'::jsonb);
end $$;

create or replace function public.duplicate_event(p_event uuid, p_new_start timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_e public.events;
  v_id uuid;
  v_shift interval;
begin
  select * into v_e from public.events where id = p_event;
  if v_e.id is null or not public.has_org_role(v_e.org_id, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  v_shift := p_new_start - v_e.starts_at;
  insert into public.events (org_id, slug, title, summary, description, event_type, pillars, cover_path,
    starts_at, ends_at, timezone, is_virtual, venue_name, venue_address, general_location, approx_lat, approx_lng,
    visibility, capacity, waitlist_enabled, price_cents, currency, status, duplicated_from, created_by)
  values (v_e.org_id, v_e.slug || '-' || to_char(p_new_start, 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 4),
    v_e.title, v_e.summary, v_e.description, v_e.event_type, v_e.pillars, v_e.cover_path,
    p_new_start, v_e.ends_at + v_shift, v_e.timezone, v_e.is_virtual, v_e.venue_name, v_e.venue_address,
    v_e.general_location, v_e.approx_lat, v_e.approx_lng, v_e.visibility, v_e.capacity, v_e.waitlist_enabled,
    v_e.price_cents, v_e.currency, 'draft', v_e.id, auth.uid())
  returning id into v_id;
  insert into public.event_private_details (event_id, virtual_url, attendee_instructions)
    select v_id, virtual_url, attendee_instructions from public.event_private_details where event_id = p_event;
  return v_id;
end $$;

-- Users cannot set privileged event columns directly.
create or replace function public.guard_event_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.is_demo := false;
    if new.status not in ('draft', 'published') then new.status := 'draft'; end if;
  else
    new.is_demo := old.is_demo;
    new.org_id := old.org_id;
    new.created_by := old.created_by;
    if new.status is distinct from old.status and current_setting('cin.internal', true) is distinct from 'on' then
      if not (old.status = 'draft' and new.status = 'published') and not (old.status = 'published' and new.status = 'draft') then
        raise exception 'Use the cancel/complete actions to change event status' using errcode = '22023';
      end if;
    end if;
    if new.price_cents is distinct from old.price_cents and exists (
      select 1 from public.event_registrations where event_id = old.id and status in ('confirmed', 'pending_payment', 'checked_in') and amount_cents > 0
    ) then
      raise exception 'Price cannot change after paid registrations exist' using errcode = '22023';
    end if;
  end if;
  if new.status = 'published' and not public.org_is_active(new.org_id) then
    raise exception 'Your organization must be approved before publishing events' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function public.guard_event_columns();

create or replace function public.guard_opportunity_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.is_demo := false;
  else
    new.is_demo := old.is_demo;
    new.org_id := old.org_id;
    new.created_by := old.created_by;
  end if;
  if new.status = 'published' and not public.org_is_active(new.org_id) then
    raise exception 'Your organization must be approved before publishing opportunities' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger volunteer_opportunities_guard before insert or update on public.volunteer_opportunities
  for each row execute function public.guard_opportunity_columns();

-- Roster helper: returns contact info ONLY to coordinators of the organization.
create or replace function public.opportunity_roster(p_opp uuid)
returns table (application_id uuid, user_id uuid, display_name text, email text, status public.application_status,
               shift_id uuid, is_adult boolean, guardian_name text, guardian_email text, hours numeric, hours_status public.hours_status)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.volunteer_opportunities where id = p_opp;
  if v_org is null or not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  return query
    select a.id, a.user_id, p.display_name, u.email::text, a.status, a.shift_id, p.is_adult,
           a.guardian_name, a.guardian_email, h.hours, h.status
    from public.volunteer_applications a
    join public.profiles p on p.id = a.user_id
    join auth.users u on u.id = a.user_id
    left join public.volunteer_hours h on h.application_id = a.id
    where a.opportunity_id = p_opp
    order by a.created_at;
end $$;

create or replace function public.event_roster(p_event uuid)
returns table (registration_id uuid, user_id uuid, display_name text, email text, status public.registration_status,
               ticket_code text, checked_in_at timestamptz, amount_cents int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.events where id = p_event;
  if v_org is null or not public.has_org_role(v_org, 'coordinator') then
    raise exception 'Coordinator role required' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id, p.display_name, u.email::text, r.status, r.ticket_code, r.checked_in_at, r.amount_cents
    from public.event_registrations r
    join public.profiles p on p.id = r.user_id
    join auth.users u on u.id = r.user_id
    where r.event_id = p_event
    order by r.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.volunteer_profiles enable row level security;
alter table public.volunteer_opportunities enable row level security;
alter table public.volunteer_shifts enable row level security;
alter table public.volunteer_applications enable row level security;
alter table public.volunteer_hours enable row level security;
alter table public.events enable row level security;
alter table public.event_private_details enable row level security;
alter table public.event_registrations enable row level security;

create policy volunteer_profiles_own on public.volunteer_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy volunteer_opportunities_select on public.volunteer_opportunities for select using (
  (status in ('published', 'closed', 'completed') and public.org_is_active(org_id))
  or public.is_org_member(org_id) or public.is_platform_staff()
);
create policy volunteer_opportunities_insert on public.volunteer_opportunities for insert
  with check (public.has_org_role(org_id, 'coordinator'));
create policy volunteer_opportunities_update on public.volunteer_opportunities for update
  using (public.has_org_role(org_id, 'coordinator')) with check (public.has_org_role(org_id, 'coordinator'));

create policy volunteer_shifts_select on public.volunteer_shifts for select using (
  exists (select 1 from public.volunteer_opportunities o where o.id = opportunity_id)
);
create policy volunteer_shifts_write on public.volunteer_shifts for all
  using (exists (select 1 from public.volunteer_opportunities o where o.id = opportunity_id and public.has_org_role(o.org_id, 'coordinator')))
  with check (exists (select 1 from public.volunteer_opportunities o where o.id = opportunity_id and public.has_org_role(o.org_id, 'coordinator')));

create policy volunteer_applications_select on public.volunteer_applications for select using (
  user_id = auth.uid()
  or exists (select 1 from public.volunteer_opportunities o where o.id = opportunity_id and public.has_org_role(o.org_id, 'coordinator'))
  or public.is_platform_staff()
);

create policy volunteer_hours_select on public.volunteer_hours for select using (
  user_id = auth.uid() or public.has_org_role(org_id, 'coordinator') or public.is_platform_staff()
);

create or replace function public.is_registered_for_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_registrations r where r.event_id = p_event and r.user_id = auth.uid())
$$;

create policy events_select on public.events for select using (
  (status in ('published', 'completed', 'cancelled') and visibility in ('public', 'unlisted') and public.org_is_active(org_id))
  or public.is_org_member(org_id)
  or public.is_registered_for_event(id)
  or public.is_platform_staff()
);
create policy events_insert on public.events for insert with check (public.has_org_role(org_id, 'coordinator'));
create policy events_update on public.events for update
  using (public.has_org_role(org_id, 'coordinator')) with check (public.has_org_role(org_id, 'coordinator'));

create policy event_private_select on public.event_private_details for select using (
  exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id))
  or exists (select 1 from public.event_registrations r where r.event_id = event_private_details.event_id
             and r.user_id = auth.uid() and r.status in ('confirmed', 'checked_in'))
);
create policy event_private_write on public.event_private_details for all
  using (exists (select 1 from public.events e where e.id = event_id and public.has_org_role(e.org_id, 'coordinator')))
  with check (exists (select 1 from public.events e where e.id = event_id and public.has_org_role(e.org_id, 'coordinator')));

create policy event_registrations_select on public.event_registrations for select using (
  user_id = auth.uid()
  or exists (select 1 from public.events e where e.id = event_id and public.has_org_role(e.org_id, 'coordinator'))
  or public.is_platform_staff()
);

grant select on public.volunteer_opportunities, public.volunteer_shifts, public.events to anon;
grant select, insert, update, delete on public.volunteer_profiles to authenticated;
grant select, insert, update on public.volunteer_opportunities, public.events to authenticated;
grant select, insert, update, delete on public.volunteer_shifts, public.event_private_details to authenticated;
grant select on public.volunteer_applications, public.volunteer_hours, public.event_registrations to authenticated;
grant all on public.volunteer_profiles, public.volunteer_opportunities, public.volunteer_shifts,
  public.volunteer_applications, public.volunteer_hours, public.events, public.event_private_details,
  public.event_registrations to service_role;
