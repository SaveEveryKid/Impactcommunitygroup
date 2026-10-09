-- DESTRUCTIVE — NON-PRODUCTION ONLY. Removes every object created by migrations 0001-0005.
-- Usage: psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/teardown_all.down.sql
do $$ begin
  if exists (select 1 from public.platform_settings where key = 'environment' and value = '"production"')
     and current_setting('cin.allow_teardown', true) is distinct from 'yes' then
    raise exception 'Refusing to tear down a database marked as production';
  end if;
end $$;

drop policy if exists media_read on storage.objects;
drop policy if exists media_write_org on storage.objects;
drop policy if exists media_write_user on storage.objects;
drop policy if exists media_delete on storage.objects;
drop policy if exists documents_read on storage.objects;
drop policy if exists documents_write on storage.objects;
delete from storage.buckets where id in ('media', 'documents');

drop trigger if exists on_auth_user_created on auth.users;
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
