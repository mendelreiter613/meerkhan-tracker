-- Migration script for Phase 7 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2 through 6.sql
--
-- Records a monthly account statement per user (AI usage cost + order
-- spend/refund summary), generated and emailed by the send-monthly-invoices
-- edge function.

CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  ai_tokens_used INTEGER NOT NULL DEFAULT 0,
  ai_cost NUMERIC(10,6) NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  amount_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_refunded NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, period_start)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Read-only for users (writes come from the edge function via the service
-- role key, same pattern as ai_usage - no INSERT/UPDATE policy needed).
CREATE POLICY "Users can view their own invoices" ON invoices FOR SELECT USING (auth.uid() = user_id);

-- Admins can view everyone's invoices, matching the admin panel's existing
-- cross-account visibility.
CREATE POLICY "Admins can view all invoices" ON invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Runs monthly at 09:00 UTC on the 1st, for the previous calendar month.
-- Reuses the same cron_secret vault entry as daily-order-reminders.
SELECT cron.schedule(
  'monthly-invoices',
  '0 9 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-monthly-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- The edge function reuses the RESEND_API_KEY and REMINDER_FROM_EMAIL
-- secrets already set on send-order-reminders (Dashboard -> Edge Functions
-- -> send-monthly-invoices -> Secrets). SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY are injected automatically.
