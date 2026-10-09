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
