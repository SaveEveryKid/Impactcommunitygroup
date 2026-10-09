import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, createTestDatabase, TestDb } from "./db";

const run = ADMIN_URL ? describe : describe.skip;

run("database security & workflows", () => {
  let db: TestDb;
  let alice: string; // owner of Harvest Pantry (giver)
  let bob: string; // owner of Family Shelter (receiver)
  let carol: string; // owner of a third org
  let dave: string; // ordinary volunteer
  let erin: string; // second volunteer
  let minor: string; // volunteer under 18
  let admin: string; // platform admin
  let outsider: string;
  let giver: string;
  let receiver: string;
  let third: string;

  beforeAll(async () => {
    db = await createTestDatabase(`cin_sec_${process.pid}`);
    alice = await db.createUser("alice@example.org");
    bob = await db.createUser("bob@example.org");
    carol = await db.createUser("carol@example.org");
    dave = await db.createUser("dave@example.org");
    erin = await db.createUser("erin@example.org");
    minor = await db.createUser("teen@example.org", { adult: false });
    admin = await db.createUser("admin@example.org");
    outsider = await db.createUser("outsider@example.org");
    await db.makePlatformAdmin(admin);
    giver = await db.createApprovedOrg(alice, "harvest-pantry");
    receiver = await db.createApprovedOrg(bob, "family-shelter");
    third = await db.createApprovedOrg(carol, "third-org");
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  // ------------------------------------------------------------------ orgs
  describe("organizations", () => {
    it("forces new organizations to pending and makes creator owner", async () => {
      const [org] = await db.as<{ id: string; status: string; verification_level: string }>(
        dave,
        `insert into organizations (slug, name, org_type, created_by, status, verification_level)
         values ('sneaky-org', 'Sneaky', 'nonprofit', $1, 'approved', 'tax_exempt_verified')
         returning id, status, verification_level`,
        [dave],
      );
      expect(org.status).toBe("pending");
      expect(org.verification_level).toBe("unverified");
      const [m] = await db.sql(`select role from organization_members where org_id=$1 and user_id=$2`, [org.id, dave]);
      expect(m.role).toBe("owner");
    });

    it("hides pending organizations from the public", async () => {
      const rows = await db.as(null, `select id from organizations where slug='sneaky-org'`);
      expect(rows).toHaveLength(0);
      const pub = await db.as(null, `select id from organizations where slug='harvest-pantry'`);
      expect(pub).toHaveLength(1);
    });

    it("prevents org admins from self-approving", async () => {
      await expect(db.as(dave, `update organizations set status='approved' where slug='sneaky-org'`)).rejects.toThrow(
        /platform administrators/,
      );
    });

    it("prevents creating an org on behalf of someone else", async () => {
      await expect(
        db.as(dave, `insert into organizations (slug, name, org_type, created_by) values ('x-org', 'X', 'nonprofit', $1)`, [
          alice,
        ]),
      ).rejects.toThrow();
    });

    it("lets only platform admins decide verification, and tax-exempt needs explicit check", async () => {
      const [org] = await db.sql(`select id from organizations where slug='sneaky-org'`);
      const [req] = await db.as<{ id: string }>(
        dave,
        `insert into verification_requests (org_id, submitted_by, requested_level, ein)
         values ($1, $2, 'tax_exempt_verified', '12-3456789') returning id`,
        [org.id, dave],
      );
      await expect(db.as(dave, `select decide_verification($1, 'approved', 'ok')`, [req.id])).rejects.toThrow(
        /Platform administrator/,
      );
      await expect(db.as(admin, `select decide_verification($1, 'approved', 'ok', false)`, [req.id])).rejects.toThrow(
        /IRS status check/,
      );
      await db.as(admin, `select decide_verification($1, 'approved', 'EIN matched IRS TEOS', true)`, [req.id]);
      const [o] = await db.sql(`select status, verification_level, tax_exempt_checked_by from organizations where id=$1`, [org.id]);
      expect(o.status).toBe("approved");
      expect(o.verification_level).toBe("tax_exempt_verified");
      expect(o.tax_exempt_checked_by).toBe(admin);
      const audit = await db.sql(`select action from audit_logs where target_id=$1`, [req.id]);
      expect(audit.map((a) => a.action)).toContain("verification.approved");
    });
  });

  // --------------------------------------------------------- membership
  describe("membership & role escalation", () => {
    it("blocks direct writes to organization_members", async () => {
      await expect(
        db.as(outsider, `insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')`, [giver, outsider]),
      ).rejects.toThrow(/permission denied/);
    });

    it("invitation flow: admin invites, invitee with matching email accepts", async () => {
      const [{ create_invitation: token }] = await db.as<{ create_invitation: string }>(
        alice,
        `select create_invitation($1, 'erin@example.org', 'coordinator')`,
        [giver],
      );
      await expect(db.as(outsider, `select accept_invitation($1)`, [token])).rejects.toThrow(/different email/);
      await db.as(erin, `select accept_invitation($1)`, [token]);
      const [m] = await db.sql(`select role from organization_members where org_id=$1 and user_id=$2`, [giver, erin]);
      expect(m.role).toBe("coordinator");
      await expect(db.as(erin, `select accept_invitation($1)`, [token])).rejects.toThrow(/invalid or has expired/);
    });

    it("coordinators cannot promote themselves; owners cannot be orphaned", async () => {
      await expect(db.as(erin, `select set_member_role($1, $2, 'owner')`, [giver, erin])).rejects.toThrow(
        /Insufficient/,
      );
      await expect(db.as(alice, `select set_member_role($1, $2, 'member')`, [giver, alice])).rejects.toThrow(
        /at least one owner/,
      );
      await expect(db.as(alice, `select create_invitation($1, 'x@example.org', 'owner')`, [giver])).rejects.toThrow();
    });

    it("members of one org cannot read another org's roster", async () => {
      const rows = await db.as(bob, `select * from organization_members where org_id=$1`, [giver]);
      expect(rows).toHaveLength(0);
    });
  });

  // ------------------------------------------------------- resources
  describe("resource exchange", () => {
    let resourceId: string;

    it("publishes a listing with private pickup details", async () => {
      const [r] = await db.as<{ id: string; quantity_available: string }>(
        alice,
        `insert into resources (org_id, title, category, quantity_total, quantity_available, unit, status, is_perishable, expires_at)
         values ($1, 'Surplus vegetables', 'food', 200, 5, 'lbs', 'published', true, now() + interval '3 days')
         returning id, quantity_available`,
        [giver],
      );
      resourceId = r.id;
      expect(Number(r.quantity_available)).toBe(200); // client value ignored
      await db.as(alice, `insert into resource_private_details (resource_id, pickup_address) values ($1, '123 Dock St')`, [
        resourceId,
      ]);
    });

    it("hides the pickup address from non-participants", async () => {
      await expect(db.as(null, `select * from resource_private_details`)).rejects.toThrow(/permission denied/);
      expect(await db.as(bob, `select * from resource_private_details where resource_id=$1`, [resourceId])).toHaveLength(0);
      expect(await db.as(carol, `select * from resource_private_details where resource_id=$1`, [resourceId])).toHaveLength(0);
    });

    it("prevents tampering with quantity_available", async () => {
      await db.as(alice, `update resources set quantity_available = 9999 where id=$1`, [resourceId]).catch(() => {});
      const [r] = await db.sql(`select quantity_available from resources where id=$1`, [resourceId]);
      expect(Number(r.quantity_available)).toBe(200);
    });

    it("blocks requests by non-members and over-quantity", async () => {
      await expect(db.as(dave, `select request_resource($1, $2, 10)`, [resourceId, receiver])).rejects.toThrow(/coordinator/);
      await expect(db.as(bob, `select request_resource($1, $2, 500)`, [resourceId, receiver])).rejects.toThrow(/between/);
      await expect(db.as(alice, `select request_resource($1, $2, 5)`, [resourceId, giver])).rejects.toThrow(/own listing/);
    });

    let reqB: string;
    let reqC: string;
    it("never allocates more than available under concurrent approvals", async () => {
      [{ request_resource: reqB }] = await db.as(bob, `select request_resource($1, $2, 150)`, [resourceId, receiver]);
      [{ request_resource: reqC }] = await db.as(carol, `select request_resource($1, $2, 150)`, [resourceId, third]);

      // Two coordinators approve concurrently from separate connections.
      const s1 = await db.openSession(alice);
      const s2 = await db.openSession(erin);
      const p1 = s1.query(`select decide_resource_request($1, true)`, [reqB]).then(
        async () => (await s1.query("commit"), "ok"),
        async (e) => (await s1.query("rollback"), String(e.message)),
      );
      const p2 = s2.query(`select decide_resource_request($1, true)`, [reqC]).then(
        async () => (await s2.query("commit"), "ok"),
        async (e) => (await s2.query("rollback"), String(e.message)),
      );
      const results = await Promise.all([p1, p2]);
      s1.release();
      s2.release();
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results.find((r) => r !== "ok")).toMatch(/remain available/);

      const [r] = await db.sql(`select quantity_available, status from resources where id=$1`, [resourceId]);
      expect(Number(r.quantity_available)).toBe(50);
      const [{ total }] = await db.sql(`select coalesce(sum(quantity),0) as total from resource_transfers where resource_id=$1`, [
        resourceId,
      ]);
      expect(Number(total)).toBe(150);
    });

    it("supports partial fulfillment of the losing request", async () => {
      const pending = (await db.sql(`select id, status from resource_requests where status='pending' and resource_id=$1`, [resourceId]))[0];
      await db.as(alice, `select decide_resource_request($1, true, 50, 'Partial — all we have left')`, [pending.id]);
      const [r] = await db.sql(`select quantity_available, status from resources where id=$1`, [resourceId]);
      expect(Number(r.quantity_available)).toBe(0);
      expect(r.status).toBe("fully_reserved");
      const [q] = await db.sql(`select status, quantity_approved from resource_requests where id=$1`, [pending.id]);
      expect(q.status).toBe("partially_approved");
    });

    it("reveals the pickup address to the approved receiver only", async () => {
      expect(await db.as(bob, `select pickup_address from resource_private_details where resource_id=$1`, [resourceId])).toHaveLength(1);
      expect(await db.as(dave, `select pickup_address from resource_private_details where resource_id=$1`, [resourceId])).toHaveLength(0);
    });

    it("enforces the transfer state machine and records verified impact once", async () => {
      const [t] = await db.sql(`select id from resource_transfers where to_org_id=$1 and resource_id=$2`, [receiver, resourceId]);
      await expect(db.as(outsider, `select transition_transfer($1, 'completed')`, [t.id])).rejects.toThrow(/not a participant/);
      await expect(db.as(bob, `select transition_transfer($1, 'completed')`, [t.id])).rejects.toThrow(/not allowed/);
      await db.as(alice, `select transition_transfer($1, 'collected')`, [t.id]);
      await expect(db.as(alice, `select transition_transfer($1, 'completed')`, [t.id])).rejects.toThrow(/not allowed/);
      await db.as(bob, `select transition_transfer($1, 'completed', 'Received in good condition')`, [t.id]);
      await expect(db.as(bob, `select transition_transfer($1, 'completed')`, [t.id])).rejects.toThrow(/not allowed/);
      const impact = await db.sql(`select metric, quantity, verification from impact_records where source_id=$1 order by metric`, [t.id]);
      expect(impact).toHaveLength(2);
      expect(impact.every((i) => i.verification === "verified")).toBe(true);
      const events = await db.sql(`select to_status from resource_transfer_events where transfer_id=$1 order by id`, [t.id]);
      expect(events.map((e) => e.to_status)).toEqual(["reserved", "collected", "completed"]);
    });

    it("cancelling a reservation returns quantity to the listing", async () => {
      const [t] = await db.sql(`select id, quantity from resource_transfers where to_org_id=$1 and resource_id=$2`, [third, resourceId]);
      await db.as(carol, `select transition_transfer($1, 'cancelled', 'No longer needed')`, [t.id]);
      const [r] = await db.sql(`select quantity_available, status from resources where id=$1`, [resourceId]);
      expect(Number(r.quantity_available)).toBe(Number(t.quantity));
      expect(r.status).toBe("published");
    });

    it("hides transfers from unrelated users", async () => {
      expect(await db.as(outsider, `select * from resource_transfers`)).toHaveLength(0);
    });
  });

  // ------------------------------------------------------- volunteers
  describe("volunteers", () => {
    let opp: string;
    it("handles capacity, waitlist and promotion", async () => {
      [{ id: opp }] = await db.as(
        alice,
        `insert into volunteer_opportunities (org_id, title, capacity, requires_approval, status, starts_at, ends_at)
         values ($1, 'Sort produce', 1, false, 'published', now() + interval '2 days', now() + interval '2 days 3 hours') returning id`,
        [giver],
      );
      const [{ apply_to_opportunity: s1 }] = await db.as(dave, `select apply_to_opportunity($1)`, [opp]);
      const [{ apply_to_opportunity: s2 }] = await db.as(outsider, `select apply_to_opportunity($1)`, [opp]);
      expect(s1).toBe("approved");
      expect(s2).toBe("waitlisted");
      await expect(db.as(dave, `select apply_to_opportunity($1)`, [opp])).rejects.toThrow(/already signed up/);
      const [app] = await db.sql(`select id from volunteer_applications where user_id=$1 and opportunity_id=$2`, [dave, opp]);
      await db.as(dave, `select cancel_volunteer_application($1)`, [app.id]);
      const [promoted] = await db.sql(`select status from volunteer_applications where user_id=$1 and opportunity_id=$2`, [outsider, opp]);
      expect(promoted.status).toBe("approved");
    });

    it("protects minors", async () => {
      await expect(db.as(minor, `select apply_to_opportunity($1)`, [opp])).rejects.toThrow(/adult volunteers/);
      const [{ id: kidOpp }] = await db.as(
        alice,
        `insert into volunteer_opportunities (org_id, title, allows_minors, status) values ($1, 'Family day', true, 'published') returning id`,
        [giver],
      );
      await expect(db.as(minor, `select apply_to_opportunity($1)`, [kidOpp])).rejects.toThrow(/guardian/);
      await db.as(minor, `select apply_to_opportunity($1, null, null, 'Pat Parent', 'pat@example.org', true)`, [kidOpp]);
    });

    it("records and verifies hours; volunteers cannot verify their own", async () => {
      const [app] = await db.sql(`select id from volunteer_applications where user_id=$1 and opportunity_id=$2`, [outsider, opp]);
      await expect(db.as(outsider, `select record_volunteer_attendance($1, true, 3)`, [app.id])).rejects.toThrow(/Coordinator/);
      const [{ record_volunteer_attendance: hid }] = await db.as(alice, `select record_volunteer_attendance($1, true, 3)`, [app.id]);
      await db.as(erin, `select verify_volunteer_hours($1, true)`, [hid]);
      const [imp] = await db.sql(`select quantity from impact_records where source_id=$1 and metric='volunteer_hours'`, [hid]);
      expect(Number(imp.quantity)).toBe(3);
      // Re-recording resets verification and removes impact until re-verified
      await db.as(alice, `select record_volunteer_attendance($1, true, 4)`, [app.id]);
      expect(await db.sql(`select 1 from impact_records where source_id=$1`, [hid])).toHaveLength(0);
    });

    it("does not let one volunteer see another's applications or the roster", async () => {
      expect(await db.as(dave, `select * from volunteer_applications where user_id <> $1`, [dave])).toHaveLength(0);
      await expect(db.as(dave, `select * from opportunity_roster($1)`, [opp])).rejects.toThrow(/Coordinator/);
      const roster = await db.as(alice, `select * from opportunity_roster($1)`, [opp]);
      expect(roster.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------ events
  describe("events", () => {
    let ev: string;
    it("enforces capacity with waitlist and check-in permissions", async () => {
      [{ id: ev }] = await db.as(
        bob,
        `insert into events (org_id, slug, title, starts_at, ends_at, capacity, status)
         values ($1, 'community-meal', 'Community meal', now() + interval '1 day', now() + interval '1 day 2 hours', 2, 'published') returning id`,
        [receiver],
      );
      const r1 = (await db.as(dave, `select (register_for_event($1)).*`, [ev]))[0];
      const r2 = (await db.as(erin, `select (register_for_event($1)).*`, [ev]))[0];
      const r3 = (await db.as(outsider, `select (register_for_event($1)).*`, [ev]))[0];
      expect([r1.status, r2.status, r3.status]).toEqual(["confirmed", "confirmed", "waitlisted"]);
      // idempotent
      const again = (await db.as(dave, `select (register_for_event($1)).*`, [ev]))[0];
      expect(again.id).toBe(r1.id);

      await expect(db.as(dave, `select check_in_registration($1, $2)`, [ev, r2.ticket_code])).rejects.toThrow(/Coordinator/);
      await db.as(bob, `select check_in_registration($1, $2)`, [ev, r1.ticket_code]);
      await db.as(erin, `select cancel_event_registration($1)`, [r2.id]);
      const [p] = await db.sql(`select status from event_registrations where id=$1`, [r3.id]);
      expect(p.status).toBe("confirmed");
    });

    it("prevents users from reading other attendees' registrations", async () => {
      expect(await db.as(dave, `select * from event_registrations where user_id <> $1`, [dave])).toHaveLength(0);
    });

    it("paid events hold a seat pending payment", async () => {
      const [{ id }] = await db.as(
        bob,
        `insert into events (org_id, slug, title, starts_at, ends_at, capacity, price_cents, status)
         values ($1, 'gala', 'Gala', now() + interval '5 days', now() + interval '5 days 3 hours', 1, 2500, 'published') returning id`,
        [receiver],
      );
      const r = (await db.as(dave, `select (register_for_event($1)).*`, [id]))[0];
      expect(r.status).toBe("pending_payment");
      const r2 = (await db.as(erin, `select (register_for_event($1)).*`, [id]))[0];
      expect(r2.status).toBe("waitlisted");
      await expect(db.as(bob, `update events set price_cents = 100 where id=$1`, [id])).rejects.toThrow(/Price cannot change/);
    });

    it("completing an event records verified attendance impact", async () => {
      await db.sql(`update events set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where id=$1`, [ev]);
      await db.as(bob, `select complete_event($1)`, [ev]);
      const rows = await db.sql(`select metric, quantity from impact_records where source_id=$1 order by metric::text`, [ev]);
      expect(rows.map((r) => [r.metric, Number(r.quantity)])).toEqual([
        ["event_attendance", 1],
        ["event_completed", 1],
      ]);
    });
  });

  // --------------------------------------------------------- messaging
  describe("messaging", () => {
    let conv: string;
    it("org-to-org conversation is visible only to participants", async () => {
      [{ start_conversation: conv }] = await db.as(
        bob,
        `select start_conversation('organization', 'Pickup', $1, null, $2, 'Can we pick up Tuesday?')`,
        [receiver, giver],
      );
      expect(await db.as(alice, `select body from messages where conversation_id=$1`, [conv])).toHaveLength(1);
      expect(await db.as(erin, `select body from messages where conversation_id=$1`, [conv])).toHaveLength(1);
      expect(await db.as(carol, `select body from messages where conversation_id=$1`, [conv])).toHaveLength(0);
      expect(await db.as(outsider, `select * from conversations where id=$1`, [conv])).toHaveLength(0);
      await expect(
        db.as(carol, `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'hi')`, [conv, carol]),
      ).rejects.toThrow(/row-level security/);
    });

    it("prevents spoofing the sender", async () => {
      await expect(
        db.as(alice, `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')`, [conv, bob]),
      ).rejects.toThrow(/row-level security/);
    });

    it("notifies the recipients", async () => {
      const n = await db.as(alice, `select type from notifications where type='message'`);
      expect(n.length).toBeGreaterThan(0);
      expect(await db.as(carol, `select * from notifications where type='message'`)).toHaveLength(0);
    });

    it("respects blocks", async () => {
      const [{ start_conversation: dm }] = await db.as(
        alice,
        `select start_conversation('direct', null, null, $1, null, 'Hi Erin')`,
        [erin],
      );
      await db.as(erin, `insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [erin, alice]);
      await expect(
        db.as(alice, `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'again')`, [dm, alice]),
      ).rejects.toThrow(/row-level security/);
      await expect(db.as(alice, `select start_conversation('direct', null, null, $1, null, 'x')`, [erin])).rejects.toThrow(
        /not accepting/,
      );
    });

    it("individuals cannot cold-message arbitrary users", async () => {
      await expect(db.as(outsider, `select start_conversation('direct', null, null, $1, null, 'hey')`, [dave])).rejects.toThrow(
        /message organizations/,
      );
    });
  });

  // ---------------------------------------------------------- payments
  describe("payments", () => {
    it("clients cannot create or read others' donations or webhook events", async () => {
      await expect(
        db.as(dave, `insert into donations (amount_cents, status) values (5000, 'succeeded')`),
      ).rejects.toThrow(/permission denied/);
      await db.sql(
        `insert into donations (org_id, donor_user_id, donor_name, donor_email, amount_cents, status, donor_visibility, succeeded_at)
         values ($1, $2, 'Erin', 'erin@example.org', 5000, 'succeeded', 'anonymous', now())`,
        [giver, erin],
      );
      expect(await db.as(dave, `select * from donations`)).toHaveLength(0);
      expect(await db.as(erin, `select * from donations`)).toHaveLength(1);
      await expect(db.as(dave, `select * from stripe_events`)).rejects.toThrow(/permission denied/);
    });

    it("masks anonymous donors from organizations", async () => {
      const rows = await db.as(alice, `select donor_display, donor_email from org_donations($1)`, [giver]);
      expect(rows[0].donor_display).toBe("Anonymous donor");
      expect(rows[0].donor_email).toBeNull();
      await expect(db.as(bob, `select * from org_donations($1)`, [giver])).rejects.toThrow(/admin required/);
    });

    it("campaigns cannot go live without verification + Stripe onboarding", async () => {
      const [{ id }] = await db.as(
        alice,
        `insert into fundraising_campaigns (org_id, slug, title, status) values ($1, 'winter-coats', 'Winter coats', 'active') returning id`,
        [giver],
      );
      const [c] = await db.sql(`select status from fundraising_campaigns where id=$1`, [id]);
      expect(c.status).toBe("draft");
      await expect(db.as(alice, `update fundraising_campaigns set status='active' where id=$1`, [id])).rejects.toThrow(/platform review/);
      await expect(db.as(admin, `select approve_campaign($1, true, 'ok')`, [id])).rejects.toThrow(/Stripe onboarding/);
    });
  });

  // ------------------------------------------------------------- impact
  describe("impact reporting", () => {
    it("excludes demo data from public totals", async () => {
      const before = await db.as(null, `select * from public_impact_summary()`);
      const demoOrg = await db.createApprovedOrg(admin, "demo-org");
      await db.sql(`update organizations set is_demo = true where id=$1`, [demoOrg]);
      await db.sql(
        `insert into impact_records (org_id, metric, quantity, unit, verification, source_type, is_demo)
         values ($1, 'volunteer_hours', 1000, 'hours', 'verified', 'manual', true)`,
        [demoOrg],
      );
      const after = await db.as(null, `select * from public_impact_summary()`);
      const sum = (rows: Record<string, unknown>[], m: string) =>
        rows.filter((r) => r.metric === m).reduce((a, r) => a + Number(r.total), 0);
      expect(sum(after, "volunteer_hours")).toBe(sum(before, "volunteer_hours"));
      expect(sum(after, "organizations_registered")).toBe(sum(before, "organizations_registered"));
    });

    it("orgs can only add self-reported (not verified) manual impact", async () => {
      await expect(
        db.as(
          alice,
          `insert into impact_records (org_id, metric, quantity, unit, verification, source_type, recorded_by)
           values ($1, 'people_served', 500, 'people', 'verified', 'manual', $2)`,
          [giver, alice],
        ),
      ).rejects.toThrow(/row-level security/);
      await db.as(
        alice,
        `insert into impact_records (org_id, metric, quantity, unit, verification, source_type, recorded_by, method_note)
         values ($1, 'people_served', 500, 'people', 'self_reported', 'manual', $2, 'Sign-in sheets')`,
        [giver, alice],
      );
    });

    it("demo reset removes only demo rows", async () => {
      const [{ reset_demo_data: res }] = await db.sql(`select reset_demo_data()`);
      expect(res.organizations_deleted).toBe(1);
      expect(await db.sql(`select 1 from organizations where slug='harvest-pantry'`)).toHaveLength(1);
      await expect(db.as(admin, `select reset_demo_data()`)).rejects.toThrow(/permission denied/);
    });
  });

  // ------------------------------------------------------------- misc
  describe("profiles & admin", () => {
    it("users cannot flag themselves as demo or edit others", async () => {
      await db.as(dave, `update profiles set is_demo = true, display_name='Dave D' where id=$1`, [dave]);
      const [p] = await db.sql(`select is_demo, display_name from profiles where id=$1`, [dave]);
      expect(p.is_demo).toBe(false);
      expect(p.display_name).toBe("Dave D");
      const res = await db.as(dave, `update profiles set display_name='hacked' where id=$1 returning id`, [erin]);
      expect(res).toHaveLength(0);
    });

    it("non-admins cannot grant platform admin or read audit logs", async () => {
      await expect(db.as(dave, `insert into platform_admins (user_id, role) values ($1, 'super_admin')`, [dave])).rejects.toThrow();
      expect(await db.as(outsider, `select * from audit_logs`)).toHaveLength(0);
      expect((await db.as(admin, `select * from audit_logs`)).length).toBeGreaterThan(0);
    });

    it("moderation is limited to platform staff", async () => {
      const [{ id: post }] = await db.as(alice, `insert into posts (org_id, body) values ($1, 'We have extra produce!') returning id`, [giver]);
      await expect(db.as(dave, `select moderate_content('post', $1, 'remove', 'x')`, [post])).rejects.toThrow(/Moderator/);
      await db.as(admin, `select moderate_content('post', $1, 'hide', 'Reviewing report')`, [post]);
      expect(await db.as(null, `select * from posts where id=$1`, [post])).toHaveLength(0);
      // Author cannot un-hide moderated post by setting status
      await db.as(alice, `update posts set status='published' where id=$1`, [post]);
      const [p] = await db.sql(`select status from posts where id=$1`, [post]);
      expect(p.status).toBe("hidden");
    });
  });
});
