-- Migration script for Phase 8 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2 through 7.sql
--
-- Addresses findings from a full security/performance audit (Supabase advisors):
--   1. Pin search_path on functions predating that practice (defense against
--      search_path hijacking in SECURITY DEFINER functions).
--   2. Explicitly close off the anon (unauthenticated) role from RPC
--      functions meant only for signed-in users or trigger-only use. These
--      were already safe in practice (each one checks/scopes to auth.uid()
--      internally), but closing the surface is best practice regardless.
--   3. Add indexes on foreign key columns used in per-user queries.
--   4. Rewrite RLS policies to call (select auth.uid()) instead of
--      auth.uid() directly, so it's evaluated once per query instead of
--      once per row.
--   5. Consolidate the two invoices SELECT policies into one.

-- 1. Pin search_path
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 2. Close off anon access
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_ai_usage(NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_ai_usage(UUID, INTEGER, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_reminder_frequency(INTEGER) FROM anon;

-- 3. Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_agent_id ON orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_user_id ON order_events(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);

-- 4. RLS policies: evaluate auth.uid() once per query, not once per row
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can manage their own agents" ON agents;
CREATE POLICY "Users can manage their own agents" ON agents FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own orders" ON orders;
CREATE POLICY "Users can manage their own orders" ON orders FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own ai usage" ON ai_usage;
CREATE POLICY "Users can view their own ai usage" ON ai_usage FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own order_events" ON order_events;
CREATE POLICY "Users can manage their own order_events" ON order_events FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view audit log" ON admin_audit_log;
CREATE POLICY "Admins can view audit log" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- 5. Consolidate invoices SELECT policies (also fixes the auth_rls_initplan
-- warning for both at once)
DROP POLICY IF EXISTS "Users can view their own invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can view all invoices" ON invoices;
CREATE POLICY "Users and admins can view invoices" ON invoices FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin')
  );
