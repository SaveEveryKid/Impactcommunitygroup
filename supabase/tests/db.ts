/**
 * Test harness for database security & workflow tests.
 *
 * Creates a throwaway database, applies the Supabase shim + every migration in
 * order, and exposes helpers to run SQL as `anon`, as an `authenticated` user
 * (with JWT claims, exactly like PostgREST does), or as the trusted server.
 *
 * Requires TEST_DATABASE_ADMIN_URL pointing at a Postgres server where we may
 * create/drop databases, e.g. postgres://postgres@localhost:54322/postgres
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = join(__dirname, "..");

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

export async function createTestDatabase(name: string) {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL!);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 6 });

  const shim = readFileSync(join(ROOT, "tests", "supabase_shim.sql"), "utf8");
  await pool.query(shim);
  const dir = join(ROOT, "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
  return new TestDb(pool, name);
}

export class TestDb {
  constructor(
    public pool: pg.Pool,
    public name: string,
  ) {}

  /** Trusted server context (like service_role / migrations). */
  async sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
    return (await this.pool.query<T>(text, params)).rows;
  }

  async createUser(email: string, opts: { adult?: boolean; name?: string } = {}) {
    const rows = await this.sql<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ($1, now(), $2) returning id`,
      [email, JSON.stringify({ display_name: opts.name ?? email.split("@")[0], is_adult: opts.adult ?? true })],
    );
    return rows[0].id;
  }

  async makePlatformAdmin(userId: string, role = "admin") {
    await this.sql(`insert into public.platform_admins (user_id, role) values ($1, $2)`, [userId, role]);
  }

  /** Run statements as an authenticated user inside a transaction (rolled back on error). */
  async as<T extends pg.QueryResultRow = pg.QueryResultRow>(
    userId: string | null,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (userId) {
        await client.query("set local role authenticated");
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
      } else {
        await client.query("set local role anon");
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
      }
      const res = await client.query<T>(text, params);
      await client.query("commit");
      return res.rows;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Hold a transaction open as a user — for concurrency tests. */
  async openSession(userId: string) {
    const client = await this.pool.connect();
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    return client;
  }

  /** Create an approved organization owned by userId (bypasses review, test only). */
  async createApprovedOrg(ownerId: string, slug: string, extra: Record<string, unknown> = {}) {
    const [org] = await this.as<{ id: string }>(
      ownerId,
      `insert into public.organizations (slug, name, org_type, created_by, city)
       values ($1, $2, 'nonprofit', $3, 'Florence') returning id`,
      [slug, `Org ${slug}`, ownerId],
    );
    await this.sql(`update public.organizations set status='approved', verification_level='identity_verified', approved_at=now() where id=$1`, [
      org.id,
    ]);
    for (const [k, v] of Object.entries(extra)) {
      await this.sql(`update public.organizations set ${k} = $2 where id = $1`, [org.id, v]);
    }
    return org.id;
  }

  async close() {
    await this.pool.end();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${this.name} with (force)`);
    await admin.end();
  }
}
