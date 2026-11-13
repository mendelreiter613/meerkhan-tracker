import { handleMcpMethodNotAllowed, handleMcpOptions, handleMcpPost } from '@/lib/mcp/server'

// MCP endpoint for clients that can send an Authorization header
// (Claude Code, Cursor, the Claude API's MCP connector, ...):
//   POST /api/mcp   with   Authorization: Bearer mk_...
// Apps that only take a URL (Claude mobile/web custom connectors, ChatGPT)
// use /api/mcp/<token> instead.

export const maxDuration = 30

export async function POST(req: Request) {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  return handleMcpPost(req, token)
}

export const GET = handleMcpMethodNotAllowed
export const DELETE = handleMcpMethodNotAllowed
export const OPTIONS = handleMcpOptions
