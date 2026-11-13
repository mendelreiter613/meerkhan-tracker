import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Order, OrderStatus } from '@/types/database'
import { getOrderReminder } from '@/lib/reminders'

// Every query in this file runs with the service-role client, which bypasses
// RLS. Each one MUST be scoped with .eq('user_id', ctx.userId).
export interface ToolContext {
  db: SupabaseClient
  userId: string
}

const STATUSES = ['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded'] as const
const statusSchema = z.enum(STATUSES)

const STATUS_LABELS: Record<OrderStatus, string> = {
  ordered: 'Ordered',
  review_submitted: 'Review submitted',
  review_live: 'Review live',
  refund_requested: 'Refund requested',
  refunded: 'Refunded',
}

const ORDER_COLUMNS = 'id, item_name, order_number, order_date, amount_spent, amount_refunded, status, notes, agent_id, created_at, updated_at, agents(name)'

interface ToolDef<S extends z.ZodObject> {
  name: string
  title: string
  description: string
  schema: S
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>
}

function defineTool<S extends z.ZodObject>(def: ToolDef<S>) {
  return def
}

class ToolError extends Error {}

const money = (n: unknown) => Math.round(Number(n || 0) * 100) / 100

function formatOrder(order: Order & { agents?: { name: string } | null }) {
  const reminder = getOrderReminder(order)
  return {
    id: order.id,
    item: order.item_name,
    order_number: order.order_number,
    order_date: order.order_date,
    agent: order.agents?.name ?? null,
    status: order.status,
    status_label: STATUS_LABELS[order.status],
    amount_spent: money(order.amount_spent),
    amount_refunded: money(order.amount_refunded),
    still_owed: order.status === 'refunded' ? 0 : money(Number(order.amount_spent || 0) - Number(order.amount_refunded || 0)),
    notes: order.notes,
    needs_attention: reminder?.message ?? null,
    updated_at: order.updated_at,
  }
}

async function logEvent(ctx: ToolContext, orderId: string, eventType: string, description: string) {
  await ctx.db.from('order_events').insert({ order_id: orderId, user_id: ctx.userId, event_type: eventType, description })
}

async function loadOrder(ctx: ToolContext, orderId: string) {
  const { data, error } = await ctx.db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('id', orderId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (error) throw new ToolError(error.message)
  if (!data) throw new ToolError(`No order found with id ${orderId}. Use list_orders to look up the id.`)
  return data as unknown as Order & { agents?: { name: string } | null }
}

/** Finds an agent by name (case-insensitive), optionally creating it. */
async function resolveAgent(ctx: ToolContext, name: string, createIfMissing: boolean) {
  const trimmed = name.trim()
  const { data: agents, error } = await ctx.db.from('agents').select('id, name').eq('user_id', ctx.userId)
  if (error) throw new ToolError(error.message)

  const match = (agents || []).find((a) => a.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return { id: match.id as string, name: match.name as string, created: false }

  if (!createIfMissing) {
    const known = (agents || []).map((a) => a.name).join(', ') || 'none yet'
    throw new ToolError(`No agent named "${trimmed}". Known agents: ${known}. Pass create_agent_if_missing: true to add it.`)
  }

  const { data: created, error: insertError } = await ctx.db
    .from('agents')
    .insert({ user_id: ctx.userId, name: trimmed })
    .select('id, name')
    .single()
  if (insertError || !created) throw new ToolError(insertError?.message || 'Could not create agent')
  return { id: created.id as string, name: created.name as string, created: true }
}

export const TOOLS = [
  defineTool({
    name: 'get_summary',
    title: 'Get dashboard summary',
    description: 'Overview of the tracker: order counts per status, total spent, total refunded, money still owed, and orders that need attention. Good first call.',
    schema: z.object({}),
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const { data, error } = await ctx.db.from('orders').select(ORDER_COLUMNS).eq('user_id', ctx.userId)
      if (error) throw new ToolError(error.message)
      const orders = (data || []) as unknown as (Order & { agents?: { name: string } | null })[]

      const byStatus = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]))
      const totalSpent = orders.reduce((sum, o) => sum + Number(o.amount_spent || 0), 0)
      const totalRefunded = orders.reduce((sum, o) => sum + Number(o.amount_refunded || 0), 0)
      const stillOwed = orders
        .filter((o) => o.status !== 'refunded')
        .reduce((sum, o) => sum + Number(o.amount_spent || 0) - Number(o.amount_refunded || 0), 0)
      const attention = orders.map(formatOrder).filter((o) => o.needs_attention)

      return {
        total_orders: orders.length,
        orders_by_status: byStatus,
        total_spent: money(totalSpent),
        total_refunded: money(totalRefunded),
        still_owed: money(stillOwed),
        needs_attention: attention.map((o) => ({ id: o.id, item: o.item, agent: o.agent, status: o.status, reminder: o.needs_attention })),
      }
    },
  }),

  defineTool({
    name: 'list_orders',
    title: 'List orders',
    description: 'List orders, newest first. Filter by status, a keyword in the item name or order number, or agent name. Returns order ids needed by the other tools.',
    schema: z.object({
      status: statusSchema.optional().describe('Only orders in this status'),
      search: z.string().optional().describe('Keyword matched against item name and order number'),
      agent_name: z.string().optional().describe('Only orders placed through this agent'),
      limit: z.number().int().min(1).max(200).optional().describe('Max orders to return (default 50)'),
    }),
    annotations: { readOnlyHint: true },
    run: async (ctx, { status, search, agent_name, limit }) => {
      let query = ctx.db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      if (agent_name) {
        const agent = await resolveAgent(ctx, agent_name, false)
        query = query.eq('agent_id', agent.id)
      }

      const { data, error } = await query
      if (error) throw new ToolError(error.message)
      let orders = ((data || []) as unknown as (Order & { agents?: { name: string } | null })[]).map(formatOrder)

      if (search) {
        const needle = search.toLowerCase()
        orders = orders.filter((o) => o.item.toLowerCase().includes(needle) || (o.order_number || '').toLowerCase().includes(needle))
      }

      const max = limit ?? 50
      return { count: orders.length, orders: orders.slice(0, max), truncated: orders.length > max }
    },
  }),

  defineTool({
    name: 'get_order',
    title: 'Get order details',
    description: 'Full details for one order, including its timeline of status changes and refunds.',
    schema: z.object({ order_id: z.string().describe('Order id from list_orders') }),
    annotations: { readOnlyHint: true },
    run: async (ctx, { order_id }) => {
      const order = await loadOrder(ctx, order_id)
      const { data: events } = await ctx.db
        .from('order_events')
        .select('event_type, description, created_at')
        .eq('order_id', order_id)
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
      return { ...formatOrder(order), timeline: events || [] }
    },
  }),

  defineTool({
    name: 'add_order',
    title: 'Add order',
    description: 'Record a new purchase. If agent_name is given, the order is filed under that agent (pass create_agent_if_missing to add a new agent on the fly).',
    schema: z.object({
      item_name: z.string().trim().min(1).describe('What was bought'),
      amount_spent: z.number().nonnegative().describe('Amount paid, in dollars'),
      order_number: z.string().optional().describe('Amazon order number, e.g. 112-1234567-1234567'),
      order_date: z.iso.date().optional().describe('Purchase date, YYYY-MM-DD'),
      agent_name: z.string().optional().describe('Agent the order was placed through'),
      create_agent_if_missing: z.boolean().optional().describe('Create the agent if no agent with that name exists'),
      notes: z.string().optional(),
    }),
    run: async (ctx, args) => {
      const agent = args.agent_name ? await resolveAgent(ctx, args.agent_name, !!args.create_agent_if_missing) : null

      const { data, error } = await ctx.db
        .from('orders')
        .insert({
          user_id: ctx.userId,
          item_name: args.item_name,
          amount_spent: args.amount_spent,
          order_number: args.order_number || null,
          order_date: args.order_date || null,
          agent_id: agent?.id ?? null,
          notes: args.notes || null,
        })
        .select('id')
        .single()
      if (error || !data) throw new ToolError(error?.message || 'Could not create order')

      await logEvent(ctx, data.id, 'created', `Order created via connector for "${args.item_name}" ($${args.amount_spent.toFixed(2)})`)
      return { success: true, agent_created: agent?.created ?? false, order: formatOrder(await loadOrder(ctx, data.id)) }
    },
  }),

  defineTool({
    name: 'update_order_status',
    title: 'Update order status',
    description: 'Move an order to a new status: ordered, review_submitted, review_live or refund_requested. To mark an order refunded use record_refund, which also records the amount.',
    schema: z.object({
      order_id: z.string(),
      status: z.enum(['ordered', 'review_submitted', 'review_live', 'refund_requested']),
    }),
    annotations: { idempotentHint: true },
    run: async (ctx, { order_id, status }) => {
      await loadOrder(ctx, order_id)
      const { error } = await ctx.db
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', order_id)
        .eq('user_id', ctx.userId)
      if (error) throw new ToolError(error.message)
      await logEvent(ctx, order_id, 'status_changed', `Status updated to ${STATUS_LABELS[status].toUpperCase()} via connector`)
      return { success: true, order: formatOrder(await loadOrder(ctx, order_id)) }
    },
  }),

  defineTool({
    name: 'record_refund',
    title: 'Record refund',
    description: 'Record the refund received for an order and mark it refunded. The amount is the total refunded for that order and cannot exceed what was spent. Use find_orders_for_refund first if you only know the amount.',
    schema: z.object({
      order_id: z.string(),
      amount: z.number().nonnegative().describe('Total refunded for this order, in dollars'),
    }),
    annotations: { idempotentHint: true },
    run: async (ctx, { order_id, amount }) => {
      const order = await loadOrder(ctx, order_id)
      const spent = Number(order.amount_spent || 0)
      if (amount > spent) {
        throw new ToolError(`Refund of $${amount.toFixed(2)} exceeds the $${spent.toFixed(2)} spent on this order. Confirm the amounts with the user; fix amount_spent with edit_order if that is what is wrong.`)
      }
      const { error } = await ctx.db
        .from('orders')
        .update({ amount_refunded: amount, status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', order_id)
        .eq('user_id', ctx.userId)
      if (error) throw new ToolError(error.message)
      await logEvent(ctx, order_id, 'refund_updated', `Refund of $${amount.toFixed(2)} recorded via connector`)
      return { success: true, order: formatOrder(await loadOrder(ctx, order_id)) }
    },
  }),

  defineTool({
    name: 'find_orders_for_refund',
    title: 'Find orders matching a refund',
    description: 'Given a refund amount (e.g. from a PayPal notification), rank not-yet-refunded orders by how well they match. Confirm the match with the user before calling record_refund.',
    schema: z.object({
      refund_amount: z.number().nonnegative(),
      item_keyword: z.string().optional().describe('Product keyword, if known'),
      agent_name: z.string().optional().describe('Agent who sent the refund, if known'),
    }),
    annotations: { readOnlyHint: true },
    run: async (ctx, { refund_amount, item_keyword, agent_name }) => {
      const { data, error } = await ctx.db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('user_id', ctx.userId)
        .neq('status', 'refunded')
      if (error) throw new ToolError(error.message)
      const orders = (data || []) as unknown as (Order & { agents?: { name: string } | null })[]
      if (orders.length === 0) return { matches: [], message: 'No orders are waiting on a refund.' }

      const ranked = orders.map((order) => {
        const diff = Math.abs(Number(order.amount_spent || 0) - refund_amount)
        let score = 100 - diff * 5
        if (item_keyword && order.item_name.toLowerCase().includes(item_keyword.toLowerCase())) score += 50
        if (agent_name && order.agents?.name?.toLowerCase() === agent_name.toLowerCase()) score += 30
        if (order.status === 'refund_requested') score += 10
        return { ...formatOrder(order), amount_difference: money(diff), match_score: Math.max(0, Math.round(score)) }
      })
      ranked.sort((a, b) => b.match_score - a.match_score)
      return { matches: ranked.slice(0, 5) }
    },
  }),

  defineTool({
    name: 'edit_order',
    title: 'Edit order',
    description: 'Change an order\'s details: item name, order number, date, amount spent, agent or notes. Only the fields you pass are changed. Use update_order_status / record_refund for status and refunds.',
    schema: z.object({
      order_id: z.string(),
      item_name: z.string().trim().min(1).optional(),
      order_number: z.string().optional(),
      order_date: z.iso.date().optional(),
      amount_spent: z.number().nonnegative().optional(),
      agent_name: z.string().optional().describe('Move the order to this agent; pass an empty string to clear the agent'),
      create_agent_if_missing: z.boolean().optional(),
      notes: z.string().optional().describe('Replaces the existing notes'),
    }),
    run: async (ctx, args) => {
      const order = await loadOrder(ctx, args.order_id)
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (args.item_name !== undefined) updates.item_name = args.item_name
      if (args.order_number !== undefined) updates.order_number = args.order_number || null
      if (args.order_date !== undefined) updates.order_date = args.order_date
      if (args.notes !== undefined) updates.notes = args.notes || null
      if (args.amount_spent !== undefined) {
        const refunded = Number(order.amount_refunded || 0)
        if (args.amount_spent < refunded) {
          throw new ToolError(`Amount spent can't be less than the $${refunded.toFixed(2)} already refunded on this order.`)
        }
        updates.amount_spent = args.amount_spent
      }
      if (args.agent_name !== undefined) {
        updates.agent_id = args.agent_name.trim() === '' ? null : (await resolveAgent(ctx, args.agent_name, !!args.create_agent_if_missing)).id
      }

      const { error } = await ctx.db.from('orders').update(updates).eq('id', args.order_id).eq('user_id', ctx.userId)
      if (error) throw new ToolError(error.message)
      const changed = Object.keys(updates).filter((k) => k !== 'updated_at').join(', ')
      await logEvent(ctx, args.order_id, 'edited', `Order edited via connector (${changed || 'no changes'})`)
      return { success: true, order: formatOrder(await loadOrder(ctx, args.order_id)) }
    },
  }),

  defineTool({
    name: 'delete_order',
    title: 'Delete order',
    description: 'Permanently delete an order and its timeline. This cannot be undone, so confirm with the user first.',
    schema: z.object({ order_id: z.string() }),
    annotations: { destructiveHint: true },
    run: async (ctx, { order_id }) => {
      const order = await loadOrder(ctx, order_id)
      const { error } = await ctx.db.from('orders').delete().eq('id', order_id).eq('user_id', ctx.userId)
      if (error) throw new ToolError(error.message)
      return { success: true, deleted: { id: order.id, item: order.item_name } }
    },
  }),

  defineTool({
    name: 'list_agents',
    title: 'List agents',
    description: 'List the agents orders are placed through, with how many orders each has and how much is still owed.',
    schema: z.object({}),
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const [{ data: agents, error }, { data: orders }] = await Promise.all([
        ctx.db.from('agents').select('id, name, contact_info').eq('user_id', ctx.userId).order('name'),
        ctx.db.from('orders').select('agent_id, status, amount_spent, amount_refunded').eq('user_id', ctx.userId),
      ])
      if (error) throw new ToolError(error.message)
      return {
        agents: (agents || []).map((a) => {
          const mine = (orders || []).filter((o) => o.agent_id === a.id)
          const owed = mine
            .filter((o) => o.status !== 'refunded')
            .reduce((sum, o) => sum + Number(o.amount_spent || 0) - Number(o.amount_refunded || 0), 0)
          return { id: a.id, name: a.name, contact_info: a.contact_info, order_count: mine.length, still_owed: money(owed) }
        }),
      }
    },
  }),

  defineTool({
    name: 'add_agent',
    title: 'Add agent',
    description: 'Add a new agent.',
    schema: z.object({
      name: z.string().trim().min(1),
      contact_info: z.string().optional().describe('Phone, email, WhatsApp, etc.'),
    }),
    run: async (ctx, { name, contact_info }) => {
      const { data: existing } = await ctx.db.from('agents').select('id, name').eq('user_id', ctx.userId)
      const match = (existing || []).find((a) => a.name.toLowerCase() === name.toLowerCase())
      if (match) return { success: true, already_existed: true, agent: match }
      const { data, error } = await ctx.db
        .from('agents')
        .insert({ user_id: ctx.userId, name, contact_info: contact_info || null })
        .select('id, name, contact_info')
        .single()
      if (error) throw new ToolError(error.message)
      return { success: true, agent: data }
    },
  }),
]

export function listToolsForMcp() {
  return TOOLS.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...inputSchema } = z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema,
      annotations: { title: t.title, ...t.annotations },
    }
  })
}

export async function callTool(ctx: ToolContext, name: string, rawArgs: unknown) {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return null

  const parsed = tool.schema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return toolResult({ error: `Invalid arguments: ${z.prettifyError(parsed.error)}` }, true)
  }

  try {
    // The cast is safe: parsed.data was produced by this same tool's schema.
    const result = await (tool.run as (ctx: ToolContext, args: unknown) => Promise<unknown>)(ctx, parsed.data)
    return toolResult(result, false)
  } catch (err) {
    if (err instanceof ToolError) return toolResult({ error: err.message }, true)
    console.error(`MCP tool ${name} failed:`, err)
    return toolResult({ error: 'Something went wrong running this tool.' }, true)
  }
}

function toolResult(value: unknown, isError: boolean) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    isError,
  }
}
