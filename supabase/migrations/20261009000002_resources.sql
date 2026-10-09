-- ============================================================================
-- 0002 COMMUNITY RESOURCE EXCHANGE
--
-- Lifecycle:
--   resource (offer | need)  --request-->  resource_request (pending)
--   owner decides            -->  approved / partially_approved / declined
--   approval creates a resource_transfer (reserved) and decrements
--   quantity_available under a row lock (no double allocation).
--   transfer: reserved -> scheduled -> collected -> delivered -> completed
--             any non-terminal -> cancelled (quantity returned) | problem
--
-- Pickup addresses live in resource_private_details and are only readable by
-- the owning org and by orgs holding an active transfer for that resource.
-- ============================================================================

create type public.resource_kind as enum ('offer', 'need');

create type public.resource_category as enum (
  'food', 'clothing', 'furniture', 'household', 'school_supplies', 'hygiene',
  'transportation', 'volunteer_labor', 'professional_services', 'equipment',
  'event_supplies', 'other'
);

create type public.resource_status as enum ('draft', 'published', 'fully_reserved', 'fulfilled', 'expired', 'cancelled');

create type public.fulfillment_method as enum ('pickup', 'delivery', 'either');

create type public.resource_request_status as enum ('pending', 'approved', 'partially_approved', 'declined', 'cancelled');

create type public.transfer_status as enum ('reserved', 'scheduled', 'collected', 'delivered', 'completed', 'cancelled', 'problem');

-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.resource_kind not null default 'offer',
  title text not null check (char_length(title) between 3 and 140),
  description text check (char_length(description) <= 4000),
  category public.resource_category not null,
  pillars public.wellbeing_pillar[] not null default '{}',
  quantity_total numeric(12, 2) not null check (quantity_total > 0),
  quantity_available numeric(12, 2) not null check (quantity_available >= 0),
  unit text not null check (char_length(unit) between 1 and 30),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 8),
  general_location text check (char_length(general_location) <= 120),
  approx_lat double precision,
  approx_lng double precision,
  fulfillment public.fulfillment_method not null default 'pickup',
  is_perishable boolean not null default false,
  expires_at timestamptz,
  handling_requirements text check (char_length(handling_requirements) <= 1000),
  special_instructions text check (char_length(special_instructions) <= 1000),
  status public.resource_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quantity_available_le_total check (quantity_available <= quantity_total),
  constraint perishable_needs_expiry check (not is_perishable or expires_at is not null)
);
create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();
create index resources_org_idx on public.resources (org_id, created_at desc);
create index resources_browse_idx on public.resources (status, kind, category, created_at desc);
create index resources_search_idx on public.resources
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Private logistics details (address, contact) — restricted visibility.
create table public.resource_private_details (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  pickup_address text check (char_length(pickup_address) <= 300),
  contact_name text check (char_length(contact_name) <= 100),
  contact_phone text check (char_length(contact_phone) <= 40),
  access_notes text check (char_length(access_notes) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.resource_requests (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  requesting_org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  quantity_requested numeric(12, 2) not null check (quantity_requested > 0),
  quantity_approved numeric(12, 2) not null default 0 check (quantity_approved >= 0),
  message text check (char_length(message) <= 2000),
  intended_use text check (char_length(intended_use) <= 1000),
  status public.resource_request_status not null default 'pending',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_le_requested check (quantity_approved <= quantity_requested)
);
create trigger resource_requests_updated_at before update on public.resource_requests
  for each row execute function public.set_updated_at();
create index resource_requests_resource_idx on public.resource_requests (resource_id, status);
create index resource_requests_org_idx on public.resource_requests (requesting_org_id, created_at desc);
create unique index resource_requests_one_pending
  on public.resource_requests (resource_id, requesting_org_id) where status = 'pending';

create table public.resource_transfers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.resource_requests(id) on delete restrict,
  resource_id uuid not null references public.resources(id) on delete restrict,
  from_org_id uuid not null references public.organizations(id) on delete restrict,
  to_org_id uuid not null references public.organizations(id) on delete restrict,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null,
  status public.transfer_status not null default 'reserved',
  volunteer_user_id uuid references auth.users(id) on delete set null,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  problem_note text check (char_length(problem_note) <= 2000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_distinct_orgs check (from_org_id <> to_org_id),
  constraint pickup_window_order check (pickup_window_end is null or pickup_window_start is null or pickup_window_end > pickup_window_start)
);
create trigger resource_transfers_updated_at before update on public.resource_transfers
  for each row execute function public.set_updated_at();
create index resource_transfers_from_idx on public.resource_transfers (from_org_id, status);
create index resource_transfers_to_idx on public.resource_transfers (to_org_id, status);
create index resource_transfers_volunteer_idx on public.resource_transfers (volunteer_user_id) where volunteer_user_id is not null;

-- Immutable history of every state change.
create table public.resource_transfer_events (
  id bigint generated always as identity primary key,
  transfer_id uuid not null references public.resource_transfers(id) on delete cascade,
  from_status public.transfer_status,
  to_status public.transfer_status not null,
  actor_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index resource_transfer_events_idx on public.resource_transfer_events (transfer_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_view_resource_private(p_resource uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resources r
    where r.id = p_resource and public.has_org_role(r.org_id, 'coordinator')
  ) or exists (
    select 1 from public.resource_transfers t
    where t.resource_id = p_resource
      and t.status in ('reserved', 'scheduled', 'collected', 'problem')
      and (public.has_org_role(t.to_org_id, 'coordinator') or t.volunteer_user_id = auth.uid())
  ) or public.is_platform_admin()
$$;

-- Breaks the resources <-> resource_requests policy cycle.
create or replace function public.has_requested_resource(p_resource uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resource_requests q
    where q.resource_id = p_resource and public.is_org_member(q.requesting_org_id)
  )
$$;

create or replace function public.is_transfer_party(p_transfer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resource_transfers t
    where t.id = p_transfer and (
      public.is_org_member(t.from_org_id) or public.is_org_member(t.to_org_id) or t.volunteer_user_id = auth.uid()
    )
  )
$$;

-- Owners may only edit draft/published listings and cannot touch quantity_available directly.
create or replace function public.guard_resource_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reserved numeric;
begin
  if auth.uid() is null then return new; end if;  -- trusted server / functions using service role
  if current_setting('cin.internal', true) = 'on' then return new; end if;  -- set by our own functions
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.quantity_available := new.quantity_total;
    new.is_demo := false;
    if new.status not in ('draft', 'published') then new.status := 'draft'; end if;
    if new.status = 'published' then
      if not public.org_is_active(new.org_id) then
        raise exception 'Your organization must be approved before publishing listings' using errcode = '42501';
      end if;
      new.published_at := now();
    end if;
    return new;
  end if;
  -- UPDATE by a user
  new.is_demo := old.is_demo;
  new.created_by := old.created_by;
  new.org_id := old.org_id;
  if new.quantity_total is distinct from old.quantity_total then
    v_reserved := old.quantity_total - old.quantity_available;
    if new.quantity_total < v_reserved then
      raise exception 'Total quantity cannot be lower than the % already reserved', v_reserved using errcode = '23514';
    end if;
    new.quantity_available := new.quantity_total - v_reserved;
  else
    new.quantity_available := old.quantity_available;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'published' and old.status in ('draft', 'expired') then
      if not public.org_is_active(new.org_id) then
        raise exception 'Your organization must be approved before publishing listings' using errcode = '42501';
      end if;
      new.published_at := coalesce(old.published_at, now());
    elsif new.status = 'cancelled' and old.status in ('draft', 'published', 'fully_reserved') then
      null;
    elsif new.status = 'draft' and old.status = 'published' and old.quantity_available = old.quantity_total then
      null;
    else
      raise exception 'Invalid listing status change from % to %', old.status, new.status using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger resources_guard before insert or update on public.resources
  for each row execute function public.guard_resource_columns();

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------

-- Request quantity from a published listing on behalf of an org.
create or replace function public.request_resource(
  p_resource uuid, p_org uuid, p_quantity numeric, p_message text default null, p_intended_use text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_res public.resources;
  v_id uuid;
begin
  if not public.has_org_role(p_org, 'coordinator') then
    raise exception 'You must be a coordinator or above in the requesting organization' using errcode = '42501';
  end if;
  if not public.org_is_active(p_org) then
    raise exception 'Your organization must be approved before requesting resources' using errcode = '42501';
  end if;
  select * into v_res from public.resources where id = p_resource;
  if v_res.id is null or v_res.status <> 'published' then
    raise exception 'This listing is not available' using errcode = 'P0002';
  end if;
  if v_res.org_id = p_org then
    raise exception 'You cannot request your own listing' using errcode = '22023';
  end if;
  if v_res.expires_at is not null and v_res.expires_at < now() then
    raise exception 'This listing has expired' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > v_res.quantity_available then
    raise exception 'Requested quantity must be between 0 and % %', v_res.quantity_available, v_res.unit using errcode = '22023';
  end if;
  insert into public.resource_requests (resource_id, requesting_org_id, requested_by, quantity_requested, message, intended_use)
  values (p_resource, p_org, auth.uid(), p_quantity, p_message, p_intended_use)
  returning id into v_id;
  perform public.write_audit('resource.requested', 'resource_request', v_id::text, p_org,
    jsonb_build_object('resource_id', p_resource, 'quantity', p_quantity));
  return v_id;
end $$;

-- Approve (fully or partially) or decline a request. Locks the resource row so
-- concurrent approvals can never allocate more than quantity_available.
create or replace function public.decide_resource_request(
  p_request uuid, p_approve boolean, p_quantity numeric default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_req public.resource_requests;
  v_res public.resources;
  v_qty numeric;
  v_transfer uuid;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if v_req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided' using errcode = '22023'; end if;

  -- Lock the listing: serialises all allocations for this resource.
  select * into v_res from public.resources where id = v_req.resource_id for update;
  if not public.has_org_role(v_res.org_id, 'coordinator') then
    raise exception 'Only coordinators of the listing organization can decide requests' using errcode = '42501';
  end if;

  perform set_config('cin.internal', 'on', true);

  if not p_approve then
    update public.resource_requests
      set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = p_note
      where id = p_request;
    perform public.write_audit('resource.request_declined', 'resource_request', p_request::text, v_res.org_id, '{}'::jsonb);
    perform set_config('cin.internal', 'off', true);
    return null;
  end if;

  if v_res.status not in ('published') then
    raise exception 'This listing is no longer accepting allocations' using errcode = '22023';
  end if;
  v_qty := coalesce(p_quantity, v_req.quantity_requested);
  if v_qty <= 0 or v_qty > v_req.quantity_requested then
    raise exception 'Approved quantity must be between 0 and the requested quantity' using errcode = '22023';
  end if;
  if v_qty > v_res.quantity_available then
    raise exception 'Only % % remain available', v_res.quantity_available, v_res.unit using errcode = '23514';
  end if;

  update public.resources
    set quantity_available = quantity_available - v_qty,
        status = case when quantity_available - v_qty = 0 then 'fully_reserved'::public.resource_status else status end
    where id = v_res.id;

  update public.resource_requests
    set status = case when v_qty = v_req.quantity_requested then 'approved'::public.resource_request_status
                      else 'partially_approved'::public.resource_request_status end,
        quantity_approved = v_qty, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
    where id = p_request;

  -- Offers flow listing org -> requester; needs flow responder -> listing org.
  insert into public.resource_transfers (request_id, resource_id, from_org_id, to_org_id, quantity, unit, is_demo)
  values (p_request, v_res.id,
          case when v_res.kind = 'need' then v_req.requesting_org_id else v_res.org_id end,
          case when v_res.kind = 'need' then v_res.org_id else v_req.requesting_org_id end,
          v_qty, v_res.unit, v_res.is_demo)
  returning id into v_transfer;

  insert into public.resource_transfer_events (transfer_id, from_status, to_status, actor_id, note)
  values (v_transfer, null, 'reserved', auth.uid(), p_note);

  perform public.write_audit('resource.request_approved', 'resource_request', p_request::text, v_res.org_id,
    jsonb_build_object('quantity', v_qty, 'transfer_id', v_transfer));
  perform set_config('cin.internal', 'off', true);
  return v_transfer;
end $$;

create or replace function public.cancel_resource_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_req public.resource_requests;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if v_req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if not public.has_org_role(v_req.requesting_org_id, 'coordinator') then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only pending requests can be withdrawn; cancel the transfer instead' using errcode = '22023';
  end if;
  update public.resource_requests set status = 'cancelled' where id = p_request;
end $$;

-- Explicit transfer state machine. Who may perform each transition:
--   scheduled  : giver coordinator (sets pickup window / volunteer)
--   collected  : giver coordinator, receiver coordinator, or assigned volunteer
--   delivered  : receiver coordinator or assigned volunteer
--   completed  : receiver coordinator (confirms receipt)
--   cancelled  : either side's coordinator before collection
--   problem    : any party
create or replace function public.transition_transfer(
  p_transfer uuid, p_to public.transfer_status, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t public.resource_transfers;
  v_giver boolean;
  v_receiver boolean;
  v_vol boolean;
  v_ok boolean := false;
begin
  select * into v_t from public.resource_transfers where id = p_transfer for update;
  if v_t.id is null then raise exception 'Transfer not found' using errcode = 'P0002'; end if;
  v_giver := public.has_org_role(v_t.from_org_id, 'coordinator');
  v_receiver := public.has_org_role(v_t.to_org_id, 'coordinator');
  v_vol := v_t.volunteer_user_id is not null and v_t.volunteer_user_id = auth.uid();

  v_ok := case
    when v_t.status = 'reserved'  and p_to = 'scheduled' then v_giver or v_receiver
    when v_t.status in ('reserved', 'scheduled') and p_to = 'collected' then v_giver or v_receiver or v_vol
    when v_t.status = 'collected' and p_to = 'delivered' then v_receiver or v_vol
    when v_t.status in ('collected', 'delivered') and p_to = 'completed' then v_receiver
    when v_t.status in ('reserved', 'scheduled') and p_to = 'cancelled' then v_giver or v_receiver
    when v_t.status = 'problem' and p_to = 'cancelled' then v_giver or v_receiver
    when v_t.status = 'problem' and p_to in ('scheduled', 'collected') then v_giver or v_receiver
    when v_t.status not in ('completed', 'cancelled') and p_to = 'problem' then v_giver or v_receiver or v_vol
    else false
  end;
  if not v_ok then
    if not (v_giver or v_receiver or v_vol or public.is_platform_admin()) then
      raise exception 'You are not a participant in this transfer' using errcode = '42501';
    end if;
    raise exception 'Transition from % to % is not allowed for your role', v_t.status, p_to using errcode = '22023';
  end if;
  if p_to = 'problem' and (p_note is null or char_length(trim(p_note)) < 5) then
    raise exception 'Please describe the problem' using errcode = '22023';
  end if;

  perform set_config('cin.internal', 'on', true);

  update public.resource_transfers set
    status = p_to,
    collected_at = case when p_to = 'collected' then now() else collected_at end,
    delivered_at = case when p_to = 'delivered' then now() when p_to = 'completed' then coalesce(delivered_at, now()) else delivered_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
    problem_note = case when p_to = 'problem' then p_note else problem_note end
  where id = p_transfer;

  -- Cancellation returns the reserved quantity to the listing.
  if p_to = 'cancelled' then
    update public.resources set
      quantity_available = least(quantity_total, quantity_available + v_t.quantity),
      status = case when status = 'fully_reserved' then 'published'::public.resource_status else status end
    where id = v_t.resource_id;
  end if;

  -- Mark listing fulfilled when nothing remains available and all transfers are terminal.
  if p_to = 'completed' then
    update public.resources r set status = 'fulfilled'
    where r.id = v_t.resource_id and r.quantity_available = 0
      and not exists (
        select 1 from public.resource_transfers x
        where x.resource_id = r.id and x.status not in ('completed', 'cancelled')
      );
  end if;

  insert into public.resource_transfer_events (transfer_id, from_status, to_status, actor_id, note)
  values (p_transfer, v_t.status, p_to, auth.uid(), p_note);
  perform public.write_audit('resource.transfer_' || p_to::text, 'resource_transfer', p_transfer::text, v_t.from_org_id,
    jsonb_build_object('from', v_t.status));
  perform set_config('cin.internal', 'off', true);
end $$;

create or replace function public.schedule_transfer(
  p_transfer uuid, p_window_start timestamptz, p_window_end timestamptz, p_volunteer uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.resource_transfers;
begin
  select * into v_t from public.resource_transfers where id = p_transfer for update;
  if v_t.id is null then raise exception 'Transfer not found' using errcode = 'P0002'; end if;
  if not (public.has_org_role(v_t.from_org_id, 'coordinator') or public.has_org_role(v_t.to_org_id, 'coordinator')) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;
  if v_t.status not in ('reserved', 'scheduled', 'problem') then
    raise exception 'This transfer can no longer be rescheduled' using errcode = '22023';
  end if;
  -- Assigned volunteer must be a member of one of the two organizations.
  if p_volunteer is not null and not exists (
    select 1 from public.organization_members
    where user_id = p_volunteer and org_id in (v_t.from_org_id, v_t.to_org_id)
  ) then
    raise exception 'The volunteer must be a member of one of the participating organizations' using errcode = '22023';
  end if;
  update public.resource_transfers
    set pickup_window_start = p_window_start, pickup_window_end = p_window_end, volunteer_user_id = p_volunteer
    where id = p_transfer;
  if v_t.status <> 'scheduled' then
    perform public.transition_transfer(p_transfer, 'scheduled', 'Pickup scheduled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.resources enable row level security;
alter table public.resource_private_details enable row level security;
alter table public.resource_requests enable row level security;
alter table public.resource_transfers enable row level security;
alter table public.resource_transfer_events enable row level security;

create policy resources_select on public.resources for select using (
  (status in ('published', 'fully_reserved', 'fulfilled') and public.org_is_active(org_id))
  or public.is_org_member(org_id)
  or public.is_platform_staff()
  or public.has_requested_resource(id)
);
create policy resources_insert on public.resources for insert
  with check (public.has_org_role(org_id, 'coordinator'));
create policy resources_update on public.resources for update
  using (public.has_org_role(org_id, 'coordinator')) with check (public.has_org_role(org_id, 'coordinator'));

create policy resource_private_select on public.resource_private_details for select
  using (public.can_view_resource_private(resource_id));
create policy resource_private_write on public.resource_private_details for all
  using (exists (select 1 from public.resources r where r.id = resource_id and public.has_org_role(r.org_id, 'coordinator')))
  with check (exists (select 1 from public.resources r where r.id = resource_id and public.has_org_role(r.org_id, 'coordinator')));

create policy resource_requests_select on public.resource_requests for select using (
  public.is_org_member(requesting_org_id)
  or exists (select 1 from public.resources r where r.id = resource_id and public.is_org_member(r.org_id))
  or public.is_platform_staff()
);

create policy resource_transfers_select on public.resource_transfers for select using (
  public.is_org_member(from_org_id) or public.is_org_member(to_org_id)
  or volunteer_user_id = auth.uid() or public.is_platform_staff()
);

create policy resource_transfer_events_select on public.resource_transfer_events for select
  using (public.is_transfer_party(transfer_id) or public.is_platform_staff());

grant select on public.resources to anon;
grant select, insert, update on public.resources to authenticated;
grant select, insert, update, delete on public.resource_private_details to authenticated;
grant select on public.resource_requests, public.resource_transfers, public.resource_transfer_events to authenticated;
grant all on public.resources, public.resource_private_details, public.resource_requests,
  public.resource_transfers, public.resource_transfer_events to service_role;
grant usage, select on all sequences in schema public to service_role;
