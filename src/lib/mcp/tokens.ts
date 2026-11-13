import { createHash, randomBytes } from 'crypto'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'

export const MCP_TOKEN_PREFIX = 'mk_'

export function generateMcpToken() {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url')
  return { token, hash: hashMcpToken(token), prefix: token.slice(0, 10) }
}

export function hashMcpToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function getServiceClient(): SupabaseClient {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Resolves a plain MCP token to the user it belongs to, or null if the token
 * is unknown or revoked.
 */
export async function resolveMcpToken(token: string | null | undefined): Promise<{ userId: string } | null> {
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX) || token.length > 200) return null

  const admin = getServiceClient()
  const { data, error } = await admin
    .from('mcp_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', hashMcpToken(token))
    .maybeSingle()

  if (error || !data || data.revoked_at) return null

  await admin.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  return { userId: data.user_id as string }
}
