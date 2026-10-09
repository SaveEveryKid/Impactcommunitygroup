-- ============================================================================
-- 0008 SCHEDULED MAINTENANCE (service role, called by /api/cron/*)
-- ============================================================================

create or replace function public.run_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_holds int := 0;
  v_expired int := 0;
  v_vol int := 0;
  v_evt int := 0;
  r record;
begin
  -- 1. Release lapsed payment holds and offer seats to the waitlist.
  for r in select id, event_id from public.event_registrations
           where status = 'pending_payment' and hold_expires_at < now() - interval '5 minutes'
           for update skip locked loop
    update public.event_registrations set status = 'cancelled' where id = r.id;
    perform public.promote_event_waitlist(r.event_id);
    v_holds := v_holds + 1;
  end loop;

  -- 2. Expire listings past their use-by date (only if nothing is reserved against them).
  perform set_config('cin.internal', 'on', true);
  update public.resources set status = 'expired'
    where status = 'published' and expires_at is not null and expires_at < now();
  get diagnostics v_expired = row_count;
  perform set_config('cin.internal', 'off', true);

  -- 3. 24-hour reminders (deduplicated per application / registration).
  for r in
    select a.id, a.user_id, o.title, coalesce(s.starts_at, o.starts_at) as starts_at, o.id as opp_id
    from public.volunteer_applications a
    join public.volunteer_opportunities o on o.id = a.opportunity_id
    left join public.volunteer_shifts s on s.id = a.shift_id
    where a.status = 'approved' and a.reminder_sent_at is null
      and coalesce(s.starts_at, o.starts_at) between now() + interval '1 hour' and now() + interval '25 hours'
  loop
    perform public.notify(r.user_id, 'volunteer_reminder', 'Reminder: ' || r.title,
      'You''re volunteering ' || to_char(r.starts_at at time zone 'America/Chicago', 'Dy Mon DD at HH12:MI AM') || ' (Central).',
      '/volunteer/' || r.opp_id, 'vrem:' || r.id);
    update public.volunteer_applications set reminder_sent_at = now() where id = r.id;
    v_vol := v_vol + 1;
  end loop;

  for r in
    select g.id, g.user_id, e.title, e.starts_at, e.id as event_id, e.timezone
    from public.event_registrations g
    join public.events e on e.id = g.event_id
    where g.status = 'confirmed' and e.status = 'published'
      and e.starts_at between now() + interval '1 hour' and now() + interval '25 hours'
  loop
    if public.notify(r.user_id, 'event_reminder', 'Tomorrow: ' || r.title,
         'Starts ' || to_char(r.starts_at at time zone r.timezone, 'Dy Mon DD at HH12:MI AM') || '. Bring your ticket code.',
         '/events/' || r.event_id, 'erem:' || r.id) is not null then
      v_evt := v_evt + 1;
    end if;
  end loop;

  return jsonb_build_object('holds_released', v_holds, 'listings_expired', v_expired, 'volunteer_reminders', v_vol, 'event_reminders', v_evt);
end $$;
revoke all on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Email queue: claim a batch atomically so concurrent workers never double-send.
create or replace function public.claim_email_batch(p_limit int default 50)
returns table (id uuid, user_id uuid, email text, display_name text, type public.notification_type, title text, body text, link_path text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with batch as (
    select n.id from public.notifications n
    where n.email_status = 'pending' and n.email_attempts < 3
    order by n.created_at
    limit p_limit
    for update skip locked
  ), upd as (
    update public.notifications n set email_attempts = n.email_attempts + 1
    from batch where n.id = batch.id
    returning n.id, n.user_id, n.type, n.title, n.body, n.link_path
  )
  select upd.id, upd.user_id, u.email::text, p.display_name, upd.type, upd.title, upd.body, upd.link_path
  from upd join auth.users u on u.id = upd.user_id
  left join public.profiles p on p.id = upd.user_id;
end $$;
revoke all on function public.claim_email_batch(int) from public, anon, authenticated;
grant execute on function public.claim_email_batch(int) to service_role;

-- Platform-wide impact totals for administrators (aggregated in the database,
-- so totals stay correct regardless of API row limits). Demo data excluded.
create or replace function public.platform_impact_summary(p_from timestamptz default null, p_to timestamptz default null)
returns table (metric text, verification public.impact_verification, unit text, total numeric, records bigint, organizations bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;
  return query
    select r.metric::text, r.verification, r.unit, sum(r.quantity), count(*), count(distinct r.org_id)
    from public.impact_records r
    where not r.is_demo and (p_from is null or r.occurred_at >= p_from) and (p_to is null or r.occurred_at < p_to)
    group by r.metric, r.verification, r.unit
    order by r.metric::text;
end $$;

create or replace function public.platform_payment_totals()
returns table (kind text, livemode boolean, total_cents bigint, records bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  return query select p.kind, p.livemode, sum(p.amount_cents)::bigint, count(*) from public.payment_records p group by p.kind, p.livemode;
end $$;
