-- Migration script for Phase 3 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2.sql

-- Ensure gen_random_uuid() is available (Supabase enables this by default,
-- but this makes the migration self-contained on any Postgres instance).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Data integrity: refund/spend amounts can never be negative.
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_spent_nonnegative CHECK (amount_spent IS NULL OR amount_spent >= 0);
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_refunded_nonnegative CHECK (amount_refunded IS NULL OR amount_refunded >= 0);

-- Keep updated_at accurate automatically instead of relying on every caller to set it.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Audit log for admin actions (role changes, deletions, bootstrap).
-- No FK on target_user_id so the log entry survives a deleted user's account.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Writes to admin_audit_log are performed with the service-role key from
-- server actions, which bypasses RLS, so no INSERT policy is needed here.
