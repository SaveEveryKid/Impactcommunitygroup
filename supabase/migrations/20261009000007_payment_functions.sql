-- ============================================================================
-- 0007 PAYMENT FINALISATION (service role only)
-- Called by the verified Stripe webhook handler. Each is idempotent.
-- ============================================================================

-- Confirm a paid registration. Returns:
--   'confirmed'        newly confirmed
--   'already'          was already confirmed/checked in (duplicate webhook)
--   'refund_required'  payment arrived but no seat remains (hold expired and
--                      the event filled) or the event was cancelled
create or replace function public.finalize_event_payment(p_reg uuid, p_session text, p_amount int)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_r public.event_registrations;
  v_e public.events;
  v_taken int;
begin
  select * into v_r from public.event_registrations where id = p_reg;
  if v_r.id is null then return 'refund_required'; end if;
  select * into v_e from public.events where id = v_r.event_id for update;
  select * into v_r from public.event_registrations where id = p_reg for update;

  if v_r.status in ('confirmed', 'checked_in') then return 'already'; end if;
  if v_e.status <> 'published' then
    update public.event_registrations set status = 'cancelled', stripe_checkout_session_id = p_session where id = p_reg;
    return 'refund_required';
  end if;
  if v_r.status = 'pending_payment' and v_r.hold_expires_at > now() then
    null; -- seat still held for this registration
  else
    -- Hold lapsed (or registration was cancelled): only confirm if a seat is free.
    select count(*) into v_taken from public.event_registrations
      where event_id = v_e.id and id <> p_reg and (
        status in ('confirmed', 'checked_in') or (status = 'pending_payment' and hold_expires_at > now()));
    if v_e.capacity is not null and v_taken >= v_e.capacity then
      update public.event_registrations set status = 'cancelled', stripe_checkout_session_id = p_session where id = p_reg;
      return 'refund_required';
    end if;
  end if;
  update public.event_registrations
    set status = 'confirmed', amount_cents = p_amount, stripe_checkout_session_id = p_session, hold_expires_at = null
    where id = p_reg;
  return 'confirmed';
end $$;
revoke all on function public.finalize_event_payment(uuid, text, int) from public, anon, authenticated;
grant execute on function public.finalize_event_payment(uuid, text, int) to service_role;

-- Release an unpaid hold when Checkout expires, then offer the seat to the waitlist.
create or replace function public.release_event_hold(p_reg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_r public.event_registrations;
begin
  select * into v_r from public.event_registrations where id = p_reg for update;
  if v_r.id is null or v_r.status <> 'pending_payment' then return; end if;
  update public.event_registrations set status = 'cancelled' where id = p_reg;
  perform public.promote_event_waitlist(v_r.event_id);
end $$;
revoke all on function public.release_event_hold(uuid) from public, anon, authenticated;
grant execute on function public.release_event_hold(uuid) to service_role;

-- Assign a human-friendly receipt number once.
create or replace function public.assign_receipt_number(p_donation uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  update public.donations
    set receipt_number = coalesce(receipt_number, 'R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0'))
    where id = p_donation
    returning receipt_number into v;
  return v;
end $$;
revoke all on function public.assign_receipt_number(uuid) from public, anon, authenticated;
grant execute on function public.assign_receipt_number(uuid) to service_role;

-- Payment-ops notification helper for the server (wraps internal notify()).
create or replace function public.server_notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text, p_link text, p_dedupe text
) returns uuid
language sql security definer set search_path = public as $$
  select public.notify(p_user, p_type, p_title, p_body, p_link, p_dedupe)
$$;
revoke all on function public.server_notify(uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;
grant execute on function public.server_notify(uuid, public.notification_type, text, text, text, text) to service_role;

insert into public.platform_settings (key, value, description) values
  ('payments.platform_fee_bps', '0', 'Platform fee on organization donations and tickets, in basis points (100 = 1%). Must be disclosed to donors.')
on conflict do nothing;
