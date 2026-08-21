-- Migration script for Phase 4 updates
-- Run this in the Supabase SQL editor after database.sql, migration-phase2.sql, and migration-phase3.sql

-- ai_usage previously had only a SELECT RLS policy, so every insert from the
-- chat route (running as the authenticated user, not service role) was
-- silently rejected by RLS. The daily spend cap always read "$0 spent"
-- because no usage rows were ever actually persisted.
--
-- Rather than opening broad INSERT/UPDATE policies (which would let a user
-- fabricate their own usage rows to dodge the cap), all writes go through
-- these two SECURITY DEFINER functions, which always act on auth.uid() and
-- never trust a caller-supplied user id.

-- Atomically checks the daily cap and reserves a usage row before the AI
-- call starts. pg_advisory_xact_lock serializes concurrent requests from the
-- same user so two simultaneous messages can't both read "under cap" before
-- either one's cost is recorded.
CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_daily_cap NUMERIC)
RETURNS TABLE(allowed BOOLEAN, spent_today NUMERIC, usage_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_spent NUMERIC;
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT COALESCE(SUM(estimated_cost), 0) INTO v_spent
  FROM ai_usage
  WHERE user_id = v_user_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');

  IF v_spent >= p_daily_cap THEN
    RETURN QUERY SELECT false, v_spent, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO ai_usage (user_id, tokens_used, estimated_cost)
  VALUES (v_user_id, 0, 0)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT true, v_spent, v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(NUMERIC) TO authenticated;

-- Fills in the real token/cost numbers on the reserved row once the AI
-- response has actually finished. Only ever touches a row owned by the
-- caller.
CREATE OR REPLACE FUNCTION public.finalize_ai_usage(p_usage_id UUID, p_tokens_used INTEGER, p_estimated_cost NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_usage
  SET tokens_used = p_tokens_used,
      estimated_cost = p_estimated_cost
  WHERE id = p_usage_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_usage(UUID, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_ai_usage(UUID, INTEGER, NUMERIC) TO authenticated;
