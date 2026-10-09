-- ============================================================================
-- DEMONSTRATION DATA — FICTIONAL. NEVER LOAD INTO PRODUCTION.
--
-- Every person, organization, number and story below is invented for
-- presentations. Every row is flagged is_demo = true, so it is excluded from
-- public impact figures and can be removed with public.reset_demo_data().
--
-- Refuses to run unless platform_settings.environment = "demo".
-- Run against a SEPARATE Supabase project used only for demos:
--   psql "$DEMO_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/demo.sql
--
-- Demo sign-in (all accounts): password  DemoPass2026!
--   demo.admin@demo.example.org      platform super admin
--   demo.pantry@demo.example.org     owner, Riverbend Community Pantry
--   demo.shelter@demo.example.org    owner, Hearthstone Family Shelter
--   demo.volunteer@demo.example.org  volunteer with verified hours
-- ============================================================================

do $$
begin
  if coalesce((select value #>> '{}' from public.platform_settings where key = 'environment'), 'production') <> 'demo' then
    raise exception 'Refusing to seed: platform_settings.environment is not "demo". This seed is for a separate demo project only.';
  end if;
end $$;

-- Everything below runs in one transaction: all or nothing.
begin;

-- Start clean (only demo rows are touched).
select public.reset_demo_data();

create temporary table demo_ids (k text primary key, id uuid not null) on commit drop;

do $$
declare
  pw text := extensions.crypt('DemoPass2026!', extensions.gen_salt('bf'));
  u record;
  v_id uuid;
begin
  for u in select * from (values
    ('admin', 'demo.admin@demo.example.org', 'Avery Demo (Admin)', true),
    ('pantry', 'demo.pantry@demo.example.org', 'Marisol Reyes', true),
    ('shelter', 'demo.shelter@demo.example.org', 'Daniel Okafor', true),
    ('church', 'demo.church@demo.example.org', 'Pastor Lena Whitfield', true),
    ('closet', 'demo.closet@demo.example.org', 'Joanne Pike', true),
    ('tutor', 'demo.tutor@demo.example.org', 'Samir Haddad', true),
    ('hardware', 'demo.hardware@demo.example.org', 'Cal Brennan', true),
    ('volunteer', 'demo.volunteer@demo.example.org', 'Priya Nair', true),
    ('v2', 'demo.v2@demo.example.org', 'Marcus Lee', true),
    ('v3', 'demo.v3@demo.example.org', 'Hannah Cole', true),
    ('v4', 'demo.v4@demo.example.org', 'Tomás Ortega', true),
    ('v5', 'demo.v5@demo.example.org', 'Grace Kim', true),
    ('v6', 'demo.v6@demo.example.org', 'Elijah Brooks', true),
    ('teen', 'demo.teen@demo.example.org', 'Jordan Demo (age 16)', false)
  ) as t(k, email, name, adult) loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email, pw, now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name, 'is_adult', u.adult), now() - interval '120 days', now());
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true), 'email', now(), now());
    update public.profiles set is_demo = true, general_location = 'Shoals area, AL' where id = v_id;
    insert into demo_ids values (u.k, v_id);
  end loop;
  insert into public.platform_admins (user_id, role) select id, 'super_admin' from demo_ids where k = 'admin';
end $$;

-- Organizations ---------------------------------------------------------------
do $$
declare
  o record;
  v_org uuid;
begin
  for o in select * from (values
    ('o_pantry', 'pantry', 'riverbend-community-pantry-demo', 'Riverbend Community Pantry', 'nonprofit', 'Fresh food for every family in the Shoals, no questions asked.', array['physical','social']::public.wellbeing_pillar[], array['food pantry','meal kits'], 'Florence', 'tax_exempt_verified', true, 34.7998, -87.6773),
    ('o_shelter', 'shelter', 'hearthstone-family-shelter-demo', 'Hearthstone Family Shelter', 'nonprofit', 'Safe, dignified emergency housing for families with children.', array['physical','mental']::public.wellbeing_pillar[], array['shelter','case management'], 'Florence', 'tax_exempt_verified', true, 34.8070, -87.6650),
    ('o_church', 'church', 'grace-harbor-fellowship-demo', 'Grace Harbor Fellowship', 'faith_based', 'A church family that serves its neighbors with open hands.', array['spiritual','social']::public.wellbeing_pillar[], array['community meals','prayer support'], 'Muscle Shoals', 'identity_verified', false, 34.7448, -87.6675),
    ('o_closet', 'closet', 'second-chance-closet-demo', 'Second Chance Closet', 'nonprofit', 'Interview clothes, school uniforms and winter coats at no cost.', array['physical','financial']::public.wellbeing_pillar[], array['clothing','job readiness'], 'Sheffield', 'identity_verified', true, 34.7651, -87.6986),
    ('o_tutor', 'tutor', 'lantern-street-tutoring-demo', 'Lantern Street Tutoring Collective', 'community_group', 'Free homework help and a calm place to learn after school.', array['mental','social']::public.wellbeing_pillar[], array['tutoring','mentoring'], 'Tuscumbia', 'identity_verified', false, 34.7312, -87.7025),
    ('o_hardware', 'hardware', 'copperline-hardware-demo', 'Copperline Hardware & Supply', 'small_business', 'A family hardware store donating tools, lumber and know-how.', array['financial']::public.wellbeing_pillar[], array['tools','home repair'], 'Florence', 'identity_verified', false, 34.8000, -87.6700)
  ) as t(k, owner, slug, name, typ, mission, pillars, cats, city, level, featured, lat, lng) loop
    insert into public.organizations (slug, name, org_type, mission, description, pillars, service_categories, service_area, city, region, approx_lat, approx_lng,
      public_email, website_url, status, verification_level, tax_exempt_checked_at, is_featured, is_demo, created_by, approved_at, created_at)
    values (o.slug, o.name, o.typ::public.org_type, o.mission,
      'This is a fictional organization created for demonstrations of the platform. ' || o.mission,
      o.pillars, o.cats, 'Lauderdale and Colbert counties', o.city, 'AL', o.lat, o.lng,
      replace(o.slug, '-demo', '') || '@demo.example.org', 'https://example.org/' || o.slug,
      'approved', o.level::public.verification_level, case when o.level = 'tax_exempt_verified' then now() - interval '90 days' end,
      o.featured, true, (select id from demo_ids where k = o.owner), now() - interval '100 days', now() - interval '110 days')
    returning id into v_org;
    insert into demo_ids values (o.k, v_org);
  end loop;
  -- Extra team members
  insert into public.organization_members (org_id, user_id, role) values
    ((select id from demo_ids where k='o_pantry'), (select id from demo_ids where k='volunteer'), 'coordinator'),
    ((select id from demo_ids where k='o_shelter'), (select id from demo_ids where k='v2'), 'coordinator');
end $$;

-- Resources and transfers ----------------------------------------------------
do $$
declare
  d record;
  v_res uuid;
  v_req uuid;
  v_tr uuid;
  r record;
begin
  for r in select * from (values
    ('veg', 'o_pantry', 'offer', 'Fresh vegetables from a farm surplus', 'food', 200, 'lbs', true, 3),
    ('coats', 'o_closet', 'offer', 'Winter coats, children''s sizes', 'clothing', 60, 'coats', false, 30),
    ('lumber', 'o_hardware', 'offer', 'Pressure-treated lumber offcuts', 'equipment', 40, 'boards', false, 45),
    ('beds', 'o_shelter', 'need', 'Twin mattresses for family rooms', 'furniture', 8, 'mattresses', false, 60),
    ('hygiene', 'o_shelter', 'need', 'Hygiene kits for new arrivals', 'hygiene', 100, 'kits', false, 40),
    ('school', 'o_tutor', 'need', 'Backpacks and school supplies', 'school_supplies', 50, 'backpacks', false, 20)
  ) as t(k, org, kind, title, cat, qty, unit, perish, days) loop
    insert into public.resources (org_id, kind, title, description, category, pillars, quantity_total, quantity_available, unit, general_location,
      fulfillment, is_perishable, expires_at, handling_requirements, status, published_at, is_demo, created_at)
    values ((select id from demo_ids where k = r.org), r.kind::public.resource_kind, r.title, 'Fictional demo listing.', r.cat::public.resource_category,
      array['physical']::public.wellbeing_pillar[], r.qty, r.qty, r.unit, 'Florence, AL', 'either', r.perish, now() + make_interval(days => r.days),
      case when r.perish then 'Keep refrigerated below 41°F. Use within three days.' end, 'published', now() - interval '20 days', true, now() - interval '20 days')
    returning id into v_res;
    insert into public.resource_private_details (resource_id, pickup_address, contact_name, contact_phone)
      values (v_res, '100 Demo Loading Dock, Florence, AL', 'Demo Contact', '256-555-0100');
    insert into demo_ids values ('r_' || r.k, v_res);
  end loop;

  -- Completed and in-progress transfers (status set directly; no real people involved).
  for d in select * from (values
    ('r_veg', 'o_pantry', 'o_shelter', 120, 'lbs', 'completed', 12),
    ('r_veg', 'o_pantry', 'o_church', 50, 'lbs', 'completed', 10),
    ('r_coats', 'o_closet', 'o_shelter', 25, 'coats', 'completed', 8),
    ('r_beds', 'o_hardware', 'o_shelter', 4, 'mattresses', 'completed', 6),
    ('r_hygiene', 'o_church', 'o_shelter', 60, 'kits', 'scheduled', 1),
    ('r_school', 'o_hardware', 'o_tutor', 20, 'backpacks', 'reserved', 0)
  ) as t(res, from_org, to_org, qty, unit, status, days_ago) loop
    insert into public.resource_requests (resource_id, requesting_org_id, quantity_requested, quantity_approved, status, decided_at, message, created_at)
    values ((select id from demo_ids where k = d.res),
            (select id from demo_ids where k = case when (select kind from public.resources where id = (select id from demo_ids where k = d.res)) = 'need' then d.from_org else d.to_org end),
            d.qty, d.qty, 'approved', now() - make_interval(days => d.days_ago + 1), 'Demo request.', now() - make_interval(days => d.days_ago + 2))
    returning id into v_req;
    update public.resources set quantity_available = greatest(0, quantity_available - d.qty) where id = (select id from demo_ids where k = d.res);
    insert into public.resource_transfers (request_id, resource_id, from_org_id, to_org_id, quantity, unit, status, is_demo, created_at, pickup_window_start)
    values (v_req, (select id from demo_ids where k = d.res), (select id from demo_ids where k = d.from_org), (select id from demo_ids where k = d.to_org),
            d.qty, d.unit, 'reserved', true, now() - make_interval(days => d.days_ago + 1), now() + interval '2 days')
    returning id into v_tr;
    if d.status = 'completed' then
      update public.resource_transfers set status = 'completed', collected_at = now() - make_interval(days => d.days_ago),
        delivered_at = now() - make_interval(days => d.days_ago), completed_at = now() - make_interval(days => d.days_ago) where id = v_tr;
    elsif d.status = 'scheduled' then
      update public.resource_transfers set status = 'scheduled' where id = v_tr;
    end if;
  end loop;
  update public.resources set status = 'fully_reserved' where is_demo and quantity_available = 0;
end $$;

-- Volunteer opportunities, applications and verified hours --------------------
do $$
declare
  o record;
  v_opp uuid;
  v_app uuid;
  vol text;
begin
  for o in select * from (values
    ('opp_sort', 'o_pantry', 'Saturday produce sorting', 'Sort and bag fresh produce for Monday distribution.', array['physical','social']::public.wellbeing_pillar[], 12, -14, 3.0, false),
    ('opp_meal', 'o_church', 'Wednesday community meal servers', 'Serve a hot dinner and sit down with guests.', array['social','spiritual']::public.wellbeing_pillar[], 8, -7, 2.5, true),
    ('opp_tutor', 'o_tutor', 'After-school math tutors', 'Help middle schoolers with homework, one table at a time.', array['mental','social']::public.wellbeing_pillar[], 6, -3, 2.0, false),
    ('opp_drive', 'o_shelter', 'Move-in day helpers', 'Help families carry belongings and set up rooms.', array['physical']::public.wellbeing_pillar[], 5, 9, 0, false),
    ('opp_coats', 'o_closet', 'Coat drive sorting', 'Sort donated coats by size for the winter giveaway.', array['physical','financial']::public.wellbeing_pillar[], 10, 16, 0, true)
  ) as t(k, org, title, summary, pillars, cap, day_offset, hours, minors) loop
    insert into public.volunteer_opportunities (org_id, title, summary, description, pillars, skills_required, general_location, starts_at, ends_at,
      capacity, requires_approval, allows_minors, min_age, status, is_demo, created_at)
    values ((select id from demo_ids where k = o.org), o.title, o.summary, 'Fictional demo opportunity. ' || o.summary, o.pillars,
      array['teamwork','lifting'], 'Florence, AL', now() + make_interval(days => o.day_offset), now() + make_interval(days => o.day_offset, hours => 3),
      o.cap, false, o.minors, case when o.minors then 14 end, 'published', true, now() - interval '30 days')
    returning id into v_opp;
    insert into demo_ids values (o.k, v_opp);
    foreach vol in array array['volunteer','v3','v4','v5','v6'] loop
      insert into public.volunteer_applications (opportunity_id, user_id, status, is_demo, created_at)
      values (v_opp, (select id from demo_ids where k = vol), case when o.day_offset < 0 then 'completed' else 'approved' end::public.application_status, true, now() - interval '20 days')
      returning id into v_app;
      if o.day_offset < 0 then
        insert into public.volunteer_hours (application_id, user_id, org_id, attended, hours, status, verified_by, verified_at, is_demo)
        values (v_app, (select id from demo_ids where k = vol), (select id from demo_ids where k = o.org), true, o.hours, 'verified',
                (select id from demo_ids where k = 'admin'), now() + make_interval(days => o.day_offset + 1), true);
      end if;
    end loop;
  end loop;
end $$;

-- Events -----------------------------------------------------------------------
do $$
declare
  e record;
  v_ev uuid;
  att text;
  i int;
begin
  for e in select * from (values
    ('ev_fair', 'o_pantry', 'fall-harvest-food-drive-demo', 'Fall harvest food drive', 'food_drive', -21, 150, 0, 'completed'),
    ('ev_supper', 'o_church', 'neighbors-supper-demo', 'Neighbors'' supper', 'community_meal', -5, 80, 0, 'completed'),
    ('ev_budget', 'o_closet', 'budgeting-basics-workshop-demo', 'Budgeting basics workshop', 'workshop', 6, 30, 0, 'published'),
    ('ev_gala', 'o_shelter', 'hearthstone-benefit-dinner-demo', 'Hearthstone benefit dinner', 'fundraiser', 24, 120, 4000, 'published'),
    ('ev_wellness', 'o_tutor', 'family-wellness-morning-demo', 'Family wellness morning', 'wellness', 12, 60, 0, 'published')
  ) as t(k, org, slug, title, typ, day_offset, cap, price, final_status) loop
    insert into public.events (org_id, slug, title, summary, description, event_type, pillars, starts_at, ends_at, venue_name, venue_address, general_location,
      visibility, capacity, price_cents, status, is_demo, created_at)
    values ((select id from demo_ids where k = e.org), e.slug, e.title, 'A fictional demo event.', 'Fictional event created for demonstrations.',
      e.typ::public.event_type, array['social','physical']::public.wellbeing_pillar[], now() + make_interval(days => e.day_offset),
      now() + make_interval(days => e.day_offset, hours => 3), 'Demo Community Hall', '1 Demo Plaza, Florence, AL', 'Florence, AL',
      'public', e.cap, e.price, 'published', true, now() - interval '40 days')
    returning id into v_ev;
    insert into demo_ids values (e.k, v_ev);
    i := 0;
    foreach att in array array['volunteer','v2','v3','v4','v5','v6'] loop
      i := i + 1;
      insert into public.event_registrations (event_id, user_id, status, amount_cents, checked_in_at, is_demo, created_at)
      values (v_ev, (select id from demo_ids where k = att),
        case when e.final_status = 'completed' and i <= 5 then 'checked_in' else 'confirmed' end::public.registration_status,
        e.price, case when e.final_status = 'completed' and i <= 5 then now() + make_interval(days => e.day_offset) end, true, now() - interval '10 days');
    end loop;
    if e.final_status = 'completed' then
      update public.events set status = 'completed' where id = v_ev;
    end if;
  end loop;
end $$;

-- Posts, partnerships, campaign and donations ---------------------------------
do $$
declare
  v_c uuid;
  v_d uuid;
  amt int;
  n int := 0;
begin
  insert into public.posts (org_id, author_id, kind, title, body, pillars, is_demo, created_at) values
    ((select id from demo_ids where k='o_pantry'), (select id from demo_ids where k='pantry'), 'success_story', '170 lbs of produce, zero waste',
      'Thanks to two partner organizations, every pound of last week''s farm surplus reached a family table before it spoiled. (Demo post.)', array['physical']::public.wellbeing_pillar[], true, now() - interval '9 days'),
    ((select id from demo_ids where k='o_shelter'), (select id from demo_ids where k='shelter'), 'community_need', 'We need twin mattresses',
      'Four families arrive next month. We still need four twin mattresses. See our listing on the resource exchange. (Demo post.)', array['physical']::public.wellbeing_pillar[], true, now() - interval '4 days'),
    ((select id from demo_ids where k='o_tutor'), (select id from demo_ids where k='tutor'), 'volunteer_request', 'Math tutors wanted',
      'Two hours a week makes a real difference. No teaching degree required. (Demo post.)', array['mental']::public.wellbeing_pillar[], true, now() - interval '2 days');

  insert into public.partnerships (requester_org_id, target_org_id, message, status, decided_at, is_demo) values
    ((select id from demo_ids where k='o_pantry'), (select id from demo_ids where k='o_shelter'), 'Weekly produce for shelter families.', 'pending', null, true),
    ((select id from demo_ids where k='o_church'), (select id from demo_ids where k='o_pantry'), 'Shared volunteers for Wednesday meals.', 'pending', null, true);
  update public.partnerships set status = 'accepted', decided_at = now() - interval '15 days' where is_demo;

  insert into public.org_payment_accounts (org_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, livemode)
  values ((select id from demo_ids where k='o_shelter'), 'acct_demo_shelter', true, true, true, false);

  insert into public.fundraising_campaigns (org_id, slug, title, summary, story, goal_cents, status, is_demo, approved_at, created_at)
  values ((select id from demo_ids where k='o_shelter'), 'family-room-fund-demo', 'Family room fund',
    'Furnish four family rooms before winter. (Demo campaign: donations here are not real.)',
    'This is a fictional campaign used for demonstrations. No real money is collected in the demo environment.',
    800000, 'active', true, now() - interval '20 days', now() - interval '25 days')
  returning id into v_c;

  foreach amt in array array[2500, 5000, 10000, 2500, 25000, 5000, 7500, 15000] loop
    n := n + 1;
    insert into public.donations (campaign_id, org_id, donor_name, donor_email, donor_visibility, amount_cents, status, succeeded_at,
      stripe_checkout_session_id, livemode, is_demo, created_at)
    values (v_c, (select id from demo_ids where k='o_shelter'), 'Demo Donor ' || n, 'donor' || n || '@demo.example.org',
      case when n % 3 = 0 then 'anonymous' when n % 2 = 0 then 'public' else 'organization_only' end::public.donor_visibility,
      amt, 'succeeded', now() - make_interval(days => 20 - n), 'cs_demo_' || n, false, true, now() - make_interval(days => 20 - n))
    returning id into v_d;
    update public.donations set receipt_number = 'DEMO-' || lpad(n::text, 4, '0') where id = v_d;
  end loop;
end $$;

select jsonb_build_object(
  'organizations', (select count(*) from public.organizations where is_demo),
  'people', (select count(*) from public.profiles where is_demo),
  'impact_records', (select count(*) from public.impact_records where is_demo)
) as demo_seed_summary;

commit;
