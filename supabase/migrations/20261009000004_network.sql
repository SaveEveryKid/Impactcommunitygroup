-- ============================================================================
-- 0004 NETWORKING: messaging, notifications, feed, follows, partnerships,
-- blocking and content reports.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Conversations. Participants are either individual users or whole orgs
-- (all members of a participating org can read; coordinators+ can send).
-- ---------------------------------------------------------------------------
create type public.conversation_kind as enum ('direct', 'organization', 'resource_transfer', 'event', 'partnership', 'support');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null default 'direct',
  subject text check (char_length(subject) <= 200),
  resource_transfer_id uuid references public.resource_transfers(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  is_locked boolean not null default false,   -- set by moderators
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index conversations_last_idx on public.conversations (last_message_at desc);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  added_at timestamptz not null default now(),
  left_at timestamptz,
  constraint participant_one_kind check ((user_id is null) <> (org_id is null))
);
create unique index conversation_participants_user_uq on public.conversation_participants (conversation_id, user_id) where user_id is not null;
create unique index conversation_participants_org_uq on public.conversation_participants (conversation_id, org_id) where org_id is not null;
create index conversation_participants_user_idx on public.conversation_participants (user_id) where user_id is not null;
create index conversation_participants_org_idx on public.conversation_participants (org_id) where org_id is not null;

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_org_id uuid references public.organizations(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  hidden_at timestamptz,          -- moderation
  hidden_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create or replace function public.is_conversation_participant(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conv and cp.left_at is null
      and (cp.user_id = auth.uid() or (cp.org_id is not null and public.is_org_member(cp.org_id)))
  )
$$;

create or replace function public.can_send_in_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conv and cp.left_at is null
      and (cp.user_id = auth.uid() or (cp.org_id is not null and public.has_org_role(cp.org_id, 'coordinator')))
  )
  and not exists (select 1 from public.conversations c where c.id = p_conv and c.is_locked)
  -- Not blocked by any individual participant
  and not exists (
    select 1 from public.conversation_participants cp
    join public.user_blocks b on b.blocker_id = cp.user_id and b.blocked_id = auth.uid()
    where cp.conversation_id = p_conv
  )
$$;

-- Start (or reuse) a conversation. p_from_org: send on behalf of an org.
create or replace function public.start_conversation(
  p_kind public.conversation_kind, p_subject text, p_from_org uuid,
  p_to_user uuid, p_to_org uuid, p_body text,
  p_transfer uuid default null, p_event uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if (p_to_user is null) = (p_to_org is null) then
    raise exception 'Choose exactly one recipient' using errcode = '22023';
  end if;
  if p_from_org is not null and not public.has_org_role(p_from_org, 'coordinator') then
    raise exception 'You cannot send on behalf of this organization' using errcode = '42501';
  end if;
  if p_to_user is not null and exists (select 1 from public.user_blocks where blocker_id = p_to_user and blocked_id = auth.uid()) then
    raise exception 'This person is not accepting messages from you' using errcode = '42501';
  end if;
  if p_to_user = auth.uid() then raise exception 'You cannot message yourself' using errcode = '22023'; end if;
  if p_to_org is not null and not public.org_is_active(p_to_org) then
    raise exception 'That organization is not available' using errcode = 'P0002';
  end if;
  -- Individuals (not acting for an org) may only message orgs, or users they share an org with.
  if p_from_org is null and p_to_user is not null and not exists (
    select 1 from public.organization_members a join public.organization_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_to_user
  ) and not public.is_platform_staff() then
    raise exception 'You can message organizations, or people in organizations you belong to' using errcode = '42501';
  end if;
  if p_transfer is not null and not public.is_transfer_party(p_transfer) then
    raise exception 'Not a participant in that transfer' using errcode = '42501';
  end if;

  insert into public.conversations (kind, subject, created_by, resource_transfer_id, event_id)
  values (p_kind, p_subject, auth.uid(), p_transfer, p_event) returning id into v_conv;

  if p_from_org is not null then
    insert into public.conversation_participants (conversation_id, org_id) values (v_conv, p_from_org);
  else
    insert into public.conversation_participants (conversation_id, user_id) values (v_conv, auth.uid());
  end if;
  if p_to_org is not null then
    insert into public.conversation_participants (conversation_id, org_id) values (v_conv, p_to_org) on conflict do nothing;
  else
    insert into public.conversation_participants (conversation_id, user_id) values (v_conv, p_to_user) on conflict do nothing;
  end if;

  insert into public.messages (conversation_id, sender_id, sender_org_id, body) values (v_conv, auth.uid(), p_from_org, p_body);
  insert into public.conversation_reads (conversation_id, user_id) values (v_conv, auth.uid()) on conflict do nothing;
  return v_conv;
end $$;

create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create type public.notification_type as enum (
  'message', 'resource_request', 'resource_request_decided', 'transfer_update', 'volunteer_application',
  'volunteer_decision', 'volunteer_reminder', 'event_registration', 'event_reminder', 'event_update',
  'org_invitation', 'partnership_request', 'partnership_update', 'donation_receipt', 'verification_update',
  'account', 'moderation', 'announcement'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link_path text check (link_path is null or link_path ~ '^/'),
  dedupe_key text,
  read_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  email_attempts int not null default 0,
  email_error text,
  push_status text not null default 'skipped' check (push_status in ('pending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_queue_idx on public.notifications (created_at) where email_status = 'pending';

create table public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  in_app boolean not null default true,
  email boolean not null default true,
  push boolean not null default false,
  primary key (user_id, type)
);

create table public.email_unsubscribes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  all_marketing boolean not null default true,
  created_at timestamptz not null default now()
);

-- Future native/web push.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  endpoint text not null,
  keys jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- Internal: create notification honoring preferences + dedupe.
create or replace function public.notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text, p_link text, p_dedupe text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pref public.notification_preferences;
  v_id uuid;
begin
  if p_user is null then return null; end if;
  select * into v_pref from public.notification_preferences where user_id = p_user and type = p_type;
  if v_pref.user_id is not null and not v_pref.in_app and not v_pref.email then
    return null;
  end if;
  insert into public.notifications (user_id, type, title, body, link_path, dedupe_key, email_status)
  values (p_user, p_type, p_title, p_body, p_link, p_dedupe,
          case when coalesce(v_pref.email, true)
                    and not exists (select 1 from public.email_unsubscribes u where u.user_id = p_user and p_type = 'announcement')
               then 'pending' else 'skipped' end)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.notify(uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;

-- Notify every coordinator+ of an org.
create or replace function public.notify_org(
  p_org uuid, p_type public.notification_type, p_title text, p_body text, p_link text, p_dedupe text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.organization_members
           where org_id = p_org and public.org_role_rank(role) >= 2 and user_id is distinct from auth.uid() loop
    perform public.notify(r.user_id, p_type, p_title, p_body, p_link, case when p_dedupe is null then null else p_dedupe || ':' || r.user_id end);
  end loop;
end $$;
revoke all on function public.notify_org(uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- Notification triggers ------------------------------------------------------
create or replace function public.trg_notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct coalesce(cp.user_id, m.user_id) as uid
    from public.conversation_participants cp
    left join public.organization_members m on m.org_id = cp.org_id
    where cp.conversation_id = new.conversation_id and cp.left_at is null
  loop
    if r.uid is not null and r.uid <> coalesce(new.sender_id, '00000000-0000-0000-0000-000000000000'::uuid) then
      -- One unread "new message" notification per conversation per user until read.
      perform public.notify(r.uid, 'message', 'New message', left(new.body, 140), '/inbox/' || new.conversation_id,
        'msg:' || new.conversation_id || ':' || coalesce((select last_read_at::text from public.conversation_reads cr
          where cr.conversation_id = new.conversation_id and cr.user_id = r.uid), 'never'));
    end if;
  end loop;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.trg_notify_message();

create or replace function public.trg_notify_resource_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_res public.resources;
begin
  select * into v_res from public.resources where id = new.resource_id;
  if tg_op = 'INSERT' then
    perform public.notify_org(v_res.org_id, 'resource_request', 'New request for "' || v_res.title || '"',
      'Requested: ' || new.quantity_requested || ' ' || v_res.unit, '/dashboard/org/' || v_res.org_id || '/resources/' || v_res.id,
      'rr:' || new.id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'partially_approved', 'declined') then
    perform public.notify_org(new.requesting_org_id, 'resource_request_decided',
      'Your request for "' || v_res.title || '" was ' || replace(new.status::text, '_', ' '),
      new.decision_note, '/dashboard/org/' || new.requesting_org_id || '/transfers', 'rrd:' || new.id);
  end if;
  return new;
end $$;
create trigger resource_requests_notify after insert or update on public.resource_requests
  for each row execute function public.trg_notify_resource_request();

create or replace function public.trg_notify_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_org(new.from_org_id, 'transfer_update', 'Transfer ' || new.status, null,
      '/transfers/' || new.id, 'tr:' || new.id || ':' || new.status || ':from');
    perform public.notify_org(new.to_org_id, 'transfer_update', 'Transfer ' || new.status, null,
      '/transfers/' || new.id, 'tr:' || new.id || ':' || new.status || ':to');
  end if;
  if new.volunteer_user_id is not null and new.volunteer_user_id is distinct from old.volunteer_user_id then
    perform public.notify(new.volunteer_user_id, 'transfer_update', 'You were assigned a resource pickup', null,
      '/transfers/' || new.id, 'trv:' || new.id || ':' || new.volunteer_user_id);
  end if;
  return new;
end $$;
create trigger resource_transfers_notify after update on public.resource_transfers
  for each row execute function public.trg_notify_transfer();

create or replace function public.trg_notify_volunteer_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_opp public.volunteer_opportunities;
begin
  select * into v_opp from public.volunteer_opportunities where id = new.opportunity_id;
  if tg_op = 'INSERT' then
    perform public.notify_org(v_opp.org_id, 'volunteer_application', 'New volunteer for "' || v_opp.title || '"', null,
      '/dashboard/org/' || v_opp.org_id || '/volunteers/' || v_opp.id, 'va:' || new.id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'declined', 'waitlisted') then
    perform public.notify(new.user_id, 'volunteer_decision',
      case new.status when 'approved' then 'You''re confirmed for "' || v_opp.title || '"'
                      when 'declined' then 'Update on "' || v_opp.title || '"'
                      else 'You''re on the waitlist for "' || v_opp.title || '"' end,
      null, '/dashboard/volunteer', 'vd:' || new.id || ':' || new.status);
  end if;
  return new;
end $$;
create trigger volunteer_applications_notify after insert or update on public.volunteer_applications
  for each row execute function public.trg_notify_volunteer_application();

create or replace function public.trg_notify_event_registration() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_e public.events;
begin
  select * into v_e from public.events where id = new.event_id;
  if (tg_op = 'INSERT' or new.status is distinct from old.status) and new.status in ('confirmed', 'waitlisted') then
    perform public.notify(new.user_id, 'event_registration',
      case new.status when 'confirmed' then 'You''re registered: ' || v_e.title else 'Waitlisted: ' || v_e.title end,
      'Ticket code ' || new.ticket_code, '/events/' || v_e.id, 'er:' || new.id || ':' || new.status);
  end if;
  return new;
end $$;
create trigger event_registrations_notify after insert or update on public.event_registrations
  for each row execute function public.trg_notify_event_registration();

create or replace function public.trg_notify_event_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select distinct user_id from public.event_registrations where event_id = new.id loop
      perform public.notify(r.user_id, 'event_update', 'Cancelled: ' || new.title, new.cancelled_reason,
        '/events/' || new.id, 'ec:' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger events_notify_cancel after update on public.events
  for each row execute function public.trg_notify_event_cancelled();

create or replace function public.trg_notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_org(new.org_id, 'verification_update', 'Verification ' || replace(new.status::text, '_', ' '),
      new.decision_note, '/dashboard/org/' || new.org_id || '/settings', 'vr:' || new.id || ':' || new.status);
  end if;
  return new;
end $$;
create trigger verification_requests_notify after update on public.verification_requests
  for each row execute function public.trg_notify_verification();

-- ---------------------------------------------------------------------------
-- Follows, feed, comments, reactions
-- ---------------------------------------------------------------------------
create table public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index follows_org_idx on public.follows (org_id);

create type public.post_kind as enum ('update', 'announcement', 'success_story', 'volunteer_request', 'community_need', 'event', 'partnership');
create type public.content_status as enum ('published', 'hidden', 'removed');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  kind public.post_kind not null default 'update',
  title text check (char_length(title) <= 160),
  body text not null check (char_length(body) between 1 and 5000),
  pillars public.wellbeing_pillar[] not null default '{}',
  image_path text,
  event_id uuid references public.events(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  opportunity_id uuid references public.volunteer_opportunities(id) on delete set null,
  status public.content_status not null default 'published',
  moderated_by uuid references auth.users(id),
  moderation_note text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create index posts_feed_idx on public.posts (status, created_at desc);
create index posts_org_idx on public.posts (org_id, created_at desc);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('support', 'thanks', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

-- Post authors cannot change moderation fields.
create or replace function public.guard_post_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_platform_staff() then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid(); new.status := 'published'; new.is_demo := false;
    new.moderated_by := null; new.moderation_note := null;
    if not public.org_is_active(new.org_id) then
      raise exception 'Your organization must be approved before posting' using errcode = '42501';
    end if;
  else
    new.org_id := old.org_id; new.author_id := old.author_id; new.is_demo := old.is_demo;
    new.moderated_by := old.moderated_by; new.moderation_note := old.moderation_note;
    if old.status = 'removed' or (new.status is distinct from old.status and new.status <> 'hidden') then
      new.status := old.status;
    end if;
  end if;
  return new;
end $$;
create trigger posts_guard before insert or update on public.posts for each row execute function public.guard_post_columns();

-- ---------------------------------------------------------------------------
-- Partnerships
-- ---------------------------------------------------------------------------
create type public.partnership_status as enum ('pending', 'accepted', 'declined', 'ended');

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  requester_org_id uuid not null references public.organizations(id) on delete cascade,
  target_org_id uuid not null references public.organizations(id) on delete cascade,
  message text check (char_length(message) <= 2000),
  status public.partnership_status not null default 'pending',
  requested_by uuid references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint partnership_distinct check (requester_org_id <> target_org_id)
);
create unique index partnerships_pair_active on public.partnerships
  (least(requester_org_id, target_org_id), greatest(requester_org_id, target_org_id))
  where status in ('pending', 'accepted');

create or replace function public.request_partnership(p_from uuid, p_to uuid, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_org_role(p_from, 'admin') then raise exception 'Organization admin required' using errcode = '42501'; end if;
  if not public.org_is_active(p_from) or not public.org_is_active(p_to) then
    raise exception 'Both organizations must be approved' using errcode = '22023';
  end if;
  insert into public.partnerships (requester_org_id, target_org_id, message, requested_by)
  values (p_from, p_to, p_message, auth.uid()) returning id into v_id;
  perform public.notify_org(p_to, 'partnership_request', 'New partnership request', p_message,
    '/dashboard/org/' || p_to || '/partnerships', 'pr:' || v_id);
  return v_id;
exception when unique_violation then
  raise exception 'A partnership request already exists between these organizations' using errcode = '23505';
end $$;

create or replace function public.decide_partnership(p_id uuid, p_status public.partnership_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.partnerships;
begin
  select * into v_p from public.partnerships where id = p_id for update;
  if v_p.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if p_status in ('accepted', 'declined') then
    if v_p.status <> 'pending' or not public.has_org_role(v_p.target_org_id, 'admin') then
      raise exception 'Only the invited organization''s admins can respond' using errcode = '42501';
    end if;
  elsif p_status = 'ended' then
    if v_p.status not in ('accepted', 'pending')
       or not (public.has_org_role(v_p.target_org_id, 'admin') or public.has_org_role(v_p.requester_org_id, 'admin')) then
      raise exception 'Insufficient permissions' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.partnerships set status = p_status, decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform public.notify_org(v_p.requester_org_id, 'partnership_update', 'Partnership ' || p_status, null,
    '/dashboard/org/' || v_p.requester_org_id || '/partnerships', 'pu:' || p_id || ':' || p_status);
  perform public.write_audit('partnership.' || p_status::text, 'partnership', p_id::text, v_p.target_org_id, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Content reports & moderation
-- ---------------------------------------------------------------------------
create type public.report_target as enum ('post', 'comment', 'message', 'organization', 'user', 'resource', 'event', 'opportunity');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'fraud', 'unsafe', 'privacy', 'inappropriate', 'other')),
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  resolved_by uuid references auth.users(id),
  resolution text check (char_length(resolution) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index content_reports_status_idx on public.content_reports (status, created_at);
create unique index content_reports_one_open_per_reporter on public.content_reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');

create or replace function public.moderate_content(p_type public.report_target, p_id uuid, p_action text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_staff() then raise exception 'Moderator role required' using errcode = '42501'; end if;
  if p_action not in ('hide', 'remove', 'restore') then raise exception 'Invalid action' using errcode = '22023'; end if;
  if p_type = 'post' then
    update public.posts set status = case p_action when 'hide' then 'hidden'::public.content_status when 'remove' then 'removed'::public.content_status else 'published'::public.content_status end,
      moderated_by = auth.uid(), moderation_note = p_note where id = p_id;
  elsif p_type = 'comment' then
    update public.post_comments set status = case p_action when 'hide' then 'hidden'::public.content_status when 'remove' then 'removed'::public.content_status else 'published'::public.content_status end
      where id = p_id;
  elsif p_type = 'message' then
    update public.messages set hidden_at = case when p_action = 'restore' then null else now() end,
      hidden_by = case when p_action = 'restore' then null else auth.uid() end where id = p_id;
  else
    raise exception 'Use organization/user admin tools for this content type' using errcode = '22023';
  end if;
  perform public.write_audit('moderation.' || p_action, p_type::text, p_id::text, null, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.email_unsubscribes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.partnerships enable row level security;
alter table public.content_reports enable row level security;

create policy conversations_select on public.conversations for select
  using (public.is_conversation_participant(id) or public.is_platform_staff());
create policy conversation_participants_select on public.conversation_participants for select
  using (public.is_conversation_participant(conversation_id) or public.is_platform_staff());
create policy conversation_reads_own on public.conversation_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_conversation_participant(conversation_id));

create policy messages_select on public.messages for select using (
  (public.is_conversation_participant(conversation_id) and hidden_at is null) or public.is_platform_staff()
);
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and public.can_send_in_conversation(conversation_id)
  and (sender_org_id is null or (
        public.has_org_role(sender_org_id, 'coordinator')
        and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.org_id = sender_org_id)))
  and hidden_at is null and hidden_by is null
);

create policy user_blocks_own on public.user_blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy notifications_own_select on public.notifications for select using (user_id = auth.uid());
create policy notification_preferences_own on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy email_unsubscribes_own on public.email_unsubscribes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy follows_select on public.follows for select using (user_id = auth.uid() or public.is_org_member(org_id));
create policy follows_insert on public.follows for insert with check (user_id = auth.uid() and public.org_is_active(org_id));
create policy follows_delete on public.follows for delete using (user_id = auth.uid());

create policy posts_select on public.posts for select using (
  (status = 'published' and public.org_is_active(org_id)) or public.is_org_member(org_id) or public.is_platform_staff()
);
create policy posts_insert on public.posts for insert with check (public.has_org_role(org_id, 'coordinator'));
create policy posts_update on public.posts for update
  using (public.has_org_role(org_id, 'coordinator')) with check (public.has_org_role(org_id, 'coordinator'));
create policy posts_delete on public.posts for delete using (public.has_org_role(org_id, 'admin'));

create policy post_comments_select on public.post_comments for select using (
  (status = 'published' and exists (select 1 from public.posts p where p.id = post_id)) or author_id = auth.uid() or public.is_platform_staff()
);
create policy post_comments_insert on public.post_comments for insert with check (
  author_id = auth.uid() and status = 'published'
  and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
);
create policy post_comments_delete on public.post_comments for delete using (author_id = auth.uid());

create policy post_reactions_select on public.post_reactions for select using (true);
create policy post_reactions_insert on public.post_reactions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
);
create policy post_reactions_delete on public.post_reactions for delete using (user_id = auth.uid());

create policy partnerships_select on public.partnerships for select using (
  (status = 'accepted' and public.org_is_active(requester_org_id) and public.org_is_active(target_org_id))
  or public.is_org_member(requester_org_id) or public.is_org_member(target_org_id) or public.is_platform_staff()
);

create policy content_reports_insert on public.content_reports for insert with check (
  reporter_id = auth.uid() and status = 'open' and resolved_by is null
);
create policy content_reports_select on public.content_reports for select using (reporter_id = auth.uid() or public.is_platform_staff());
create policy content_reports_update on public.content_reports for update
  using (public.is_platform_staff()) with check (public.is_platform_staff());

grant select on public.posts, public.post_comments, public.post_reactions, public.partnerships to anon;
grant select on public.conversations, public.conversation_participants, public.notifications to authenticated;
grant select, insert, update, delete on public.conversation_reads, public.user_blocks, public.notification_preferences,
  public.email_unsubscribes, public.push_subscriptions to authenticated;
grant select, insert on public.messages, public.content_reports to authenticated;
grant update on public.content_reports to authenticated;
grant select, insert, delete on public.follows, public.post_comments, public.post_reactions to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select on public.partnerships to authenticated;
grant all on public.conversations, public.conversation_participants, public.conversation_reads, public.messages,
  public.user_blocks, public.notifications, public.notification_preferences, public.email_unsubscribes,
  public.push_subscriptions, public.follows, public.posts, public.post_comments, public.post_reactions,
  public.partnerships, public.content_reports to service_role;
