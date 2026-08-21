-- Migration script for Phase 6 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2/3/4/5.sql
--
-- Lets each user choose how often they get the order-reminder email digest
-- (see migration-phase5.sql and the send-order-reminders edge function).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reminder_frequency_days INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- 0 = off, otherwise the number of days between reminder emails.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_reminder_frequency_valid CHECK (reminder_frequency_days IN (0, 1, 3, 7));

-- profiles has no general UPDATE policy for users (deliberately, since RLS
-- can't cleanly restrict which columns an UPDATE touches, and we don't want
-- users able to write their own `role`). Self-service preference changes go
-- through this SECURITY DEFINER function instead, which only ever touches
-- reminder_frequency_days and always scopes to auth.uid().
CREATE OR REPLACE FUNCTION public.update_reminder_frequency(p_frequency_days INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_frequency_days NOT IN (0, 1, 3, 7) THEN
    RAISE EXCEPTION 'Invalid reminder frequency';
  END IF;

  UPDATE profiles
  SET reminder_frequency_days = p_frequency_days
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_reminder_frequency(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_reminder_frequency(INTEGER) TO authenticated;
