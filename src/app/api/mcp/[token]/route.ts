import { handleMcpMethodNotAllowed, handleMcpOptions, handleMcpPost } from '@/lib/mcp/server'

// MCP endpoint with the token in the URL, for apps whose "add custom
// connector" screen only takes a URL (Claude on web/desktop/mobile, ChatGPT).
// Treat the full URL like a password.

export const maxDuration = 30

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return handleMcpPost(req, token)
}

export const GET = handleMcpMethodNotAllowed
export const DELETE = handleMcpMethodNotAllowed
export const OPTIONS = handleMcpOptions
