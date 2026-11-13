'use server'

import { createClient } from '@/utils/supabase/server'
import { generateMcpToken } from '@/lib/mcp/tokens'

export interface McpTokenSummary {
  id: string
  name: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
}

export async function listMcpTokens(): Promise<{ tokens?: McpTokenSummary[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('id, name, token_prefix, created_at, last_used_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { tokens: data as McpTokenSummary[] }
}

/** Creates a connector token. The plain token is returned once and never stored. */
export async function createMcpToken(name: string): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const label = name.trim().slice(0, 60) || 'AI app'
  const { token, hash, prefix } = generateMcpToken()

  const { error } = await supabase
    .from('mcp_tokens')
    .insert({ user_id: user.id, name: label, token_hash: hash, token_prefix: prefix })

  if (error) return { error: error.message }
  return { token }
}

export async function revokeMcpToken(id: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  return { success: true }
}
