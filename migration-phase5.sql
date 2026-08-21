-- Migration script for Phase 5 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2/3/4.sql
--
-- Sets up a daily email digest of orders needing attention (see
-- src/lib/reminders.ts for the same "stale order" thresholds used in the
-- in-app UI), sent via the send-order-reminders Edge Function.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Generate your own random value for this instead of reusing any example
-- value you find elsewhere. Run once, e.g.:
--   SELECT encode(gen_random_bytes(32), 'hex');
-- then paste the result into both this call and the edge function's
-- CRON_SECRET secret (Dashboard -> Edge Functions -> send-order-reminders ->
-- Secrets). The function checks this header instead of a user JWT, since
-- it's invoked by pg_cron rather than a logged-in user.
SELECT vault.create_secret(
  '<paste a random 32-byte hex value here>',
  'cron_secret',
  'Shared secret pg_cron uses to authenticate to the send-order-reminders edge function'
);

-- Runs daily at 14:00 UTC. Adjust the schedule to your preferred time.
SELECT cron.schedule(
  'daily-order-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-order-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- The edge function also needs these secrets set (Dashboard -> Edge Functions
-- -> send-order-reminders -> Secrets):
--   RESEND_API_KEY      - a Resend API key (not the SMTP credentials used for
--                          Supabase Auth emails - generate one under Resend's
--                          API Keys page)
--   REMINDER_FROM_EMAIL - a sender address on a domain verified in Resend
-- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
-- every Supabase Edge Function and don't need to be set manually.
