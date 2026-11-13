import { callTool, listToolsForMcp } from './tools'
import { getServiceClient, resolveMcpToken } from './tokens'

// A small, stateless MCP server over the Streamable HTTP transport: every
// request is a single JSON-RPC message POSTed to the endpoint and answered
// with a plain JSON response (no SSE streams, no sessions). That is enough
// for tool-only servers and works with Claude (web, desktop, mobile), Claude
// Code, ChatGPT connectors, Cursor and other MCP clients.

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

const SERVER_INFO = { name: 'meerkhan-tracker', title: 'Meerkhan Tracker', version: '1.0.0' }

const INSTRUCTIONS = `Meerkhan Tracker keeps the user's order log: each order has an item, amount spent, optional agent, a status (ordered -> review_submitted -> review_live -> refund_requested -> refunded) and the amount refunded.
- Call get_summary or list_orders first to get order ids; never guess an id.
- To mark an order refunded, use record_refund with the amount, not update_order_status.
- When the user mentions a refund by amount only, call find_orders_for_refund and confirm the match before recording it.
- Confirm with the user before delete_order.`

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  })
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200) {
  return json({ jsonrpc: '2.0', id, error: { code, message } }, status)
}

export function handleMcpOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** GET (server-initiated SSE stream) and DELETE (session end) aren't used by this stateless server. */
export function handleMcpMethodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS_HEADERS } })
}

export async function handleMcpPost(req: Request, token: string | null) {
  const auth = await resolveMcpToken(token)
  if (!auth) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid or revoked Meerkhan connector token. Create a new connector link in the Meerkhan dashboard.' } },
      401,
      { 'WWW-Authenticate': 'Bearer realm="meerkhan"' }
    )
  }

  let message: unknown
  try {
    message = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }

  if (Array.isArray(message) || !message || typeof message !== 'object' || (message as JsonRpcRequest).jsonrpc !== '2.0') {
    return rpcError(null, -32600, 'Invalid Request: send a single JSON-RPC 2.0 message', 400)
  }

  const msg = message as JsonRpcRequest

  // Notifications and responses from the client need no reply.
  if (msg.id === undefined || typeof msg.method !== 'string') {
    return new Response(null, { status: 202, headers: CORS_HEADERS })
  }

  const id = msg.id
  const params = msg.params ?? {}

  switch (msg.method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : LATEST_PROTOCOL_VERSION
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION
      return json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      })
    }

    case 'ping':
      return json({ jsonrpc: '2.0', id, result: {} })

    case 'tools/list':
      return json({ jsonrpc: '2.0', id, result: { tools: listToolsForMcp() } })

    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string') return rpcError(id, -32602, 'Missing tool name')
      const result = await callTool({ db: getServiceClient(), userId: auth.userId }, name, params.arguments)
      if (!result) return rpcError(id, -32602, `Unknown tool: ${name}`)
      return json({ jsonrpc: '2.0', id, result })
    }

    // Empty lists so clients that probe for these don't error out.
    case 'resources/list':
      return json({ jsonrpc: '2.0', id, result: { resources: [] } })
    case 'resources/templates/list':
      return json({ jsonrpc: '2.0', id, result: { resourceTemplates: [] } })
    case 'prompts/list':
      return json({ jsonrpc: '2.0', id, result: { prompts: [] } })

    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`)
  }
}
