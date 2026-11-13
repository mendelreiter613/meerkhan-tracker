-- Migration script for Phase 9 updates
-- Run this in the Supabase SQL editor after database.sql and migration-phase2 through 8.sql
--
-- Personal access tokens for the MCP connector (/api/mcp). Each token lets an
-- outside AI app (Claude, ChatGPT, Cursor, ...) read and update the owner's
-- orders and agents. Only a SHA-256 hash of the token is stored; the plain
-- token is shown to the user once, when it is created.

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- First few characters of the token, so the user can tell tokens apart.
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_id ON mcp_tokens(user_id);

ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;

-- Users create, list and revoke their own tokens from the dashboard. Token
-- lookups during an MCP request run with the service-role key (the request
-- carries no Supabase session), which bypasses RLS.
CREATE POLICY "Users can manage their own mcp tokens" ON mcp_tokens FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
