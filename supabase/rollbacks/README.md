# Rollback plan

Migrations are forward-only in normal operation. Each release must follow this procedure:

1. **Before applying a migration to production**, take a backup:
   - Supabase Pro and above: confirm a recent daily backup exists, or enable PITR (Point-in-Time Recovery).
   - Any plan: `supabase db dump --linked -f backup-$(date +%Y%m%d%H%M).sql` and `supabase db dump --linked --data-only -f data-$(date +%Y%m%d%H%M).sql`
2. Apply to a **staging** project first (`supabase db push --linked` against staging) and run the test suite.
3. Apply to production.

## Reverting

- **Additive changes** (new tables/columns/functions): write a new forward migration that drops them. Never edit an applied migration.
- **Destructive changes** (dropping or retyping columns): must ship in two releases. First release stops reading/writing the column. Second release drops it after a verified backup.
- **Full reset of a non-production project only:** `teardown_all.down.sql` removes every object these migrations create. It is **destructive**. Never run it against production.
