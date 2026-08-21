import { google } from '@ai-sdk/google'
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

const DAILY_AI_COST_CAP_USD = Number(process.env.AI_DAILY_COST_CAP_USD || '1')

export async function POST(req: Request) {
  const { messages } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id

  // Per-user daily spend guardrail so the chat can't run up an unbounded API bill.
  // Checking and reserving happen atomically in one DB call (with an advisory lock
  // keyed on the user) so two simultaneous requests can't both slip through under
  // the cap before either one's actual cost is recorded.
  const { data: reservationData, error: reservationError } = await supabase
    .rpc('reserve_ai_usage', { p_daily_cap: DAILY_AI_COST_CAP_USD })
    .single()
  const reservation = reservationData as { allowed: boolean; spent_today: number; usage_id: string | null } | null

  if (reservationError || !reservation) {
    console.error('Failed to check AI spend cap:', reservationError)
    return new Response(
      JSON.stringify({ error: 'Unable to verify AI usage cap right now. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!reservation.allowed) {
    return new Response(
      JSON.stringify({ error: `Daily AI usage cap of $${DAILY_AI_COST_CAP_USD.toFixed(2)} reached. Try again tomorrow.` }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const usageId = reservation.usage_id as string

  const systemPrompt = `You are Meerkhan, an AI assistant for managing Amazon orders, reviews, and refunds.
You help the user track what they bought, when they submitted a review, when it went live, and when they got refunded.
You have access to their database via tools. 
When the user says "I got refunded X" or uploads a PayPal/refund screenshot, use the \`findMatchingOrdersForRefund\` tool to find candidate orders. Compare the refund amount with open or pending orders, suggest the best match to the user, and ask for confirmation before applying the refund (or apply if explicit).
If the user says "I ordered X from agent Y", check if agent Y exists using \`getAgents\`. If not, create the agent with \`addAgent\`, then create the order with \`addOrder\`.
The user might upload screenshots of their orders or refund confirmations. Extract item name, order number, amount spent, or refunded amount, and use tools to manage their records.

Current date: ${new Date().toLocaleDateString()}
Always be concise, helpful, and friendly.`

  try {
    const tools = {
      getOrders: tool({
        description: 'Get a list of the users orders, optionally filtered by status.',
        inputSchema: z.object({
          status: z.enum(['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded']).optional()
        }),
        execute: async ({ status }) => {
          let query = supabase.from('orders').select('id, item_name, order_number, amount_spent, amount_refunded, status, agent_id').eq('user_id', userId)
          if (status) query = query.eq('status', status)
          const { data } = await query
          return data
        }
      }),
      updateOrder: tool({
        description: 'Update an existing order (status, or refund amount).',
        inputSchema: z.object({
          orderId: z.string(),
          status: z.enum(['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded']).optional(),
          amountRefunded: z.number().nonnegative().optional()
        }),
        execute: async ({ orderId, status, amountRefunded }) => {
          const updates: { updated_at: string; status?: typeof status; amount_refunded?: number } = {
            updated_at: new Date().toISOString(),
          }
          if (status) updates.status = status
          if (amountRefunded !== undefined) updates.amount_refunded = amountRefunded
          
          const { data, error } = await supabase.from('orders').update(updates).eq('id', orderId).eq('user_id', userId).select()
          if (error) return { error: error.message }

          if (status) {
            await supabase.from('order_events').insert({
              order_id: orderId,
              user_id: userId,
              event_type: 'status_changed',
              description: `AI updated status to ${status.replace('_', ' ').toUpperCase()}`
            })
          }
          if (amountRefunded !== undefined) {
            await supabase.from('order_events').insert({
              order_id: orderId,
              user_id: userId,
              event_type: 'refund_updated',
              description: `AI recorded refund of $${amountRefunded.toFixed(2)}`
            })
          }

          return { success: true, updatedOrder: data }
        }
      }),
      findMatchingOrdersForRefund: tool({
        description: 'Search non-refunded orders to find potential matches for a refund amount.',
        inputSchema: z.object({
          refundAmount: z.number().describe('The refund amount received by the user'),
          itemNameSnippet: z.string().optional().describe('Optional product keyword if mentioned')
        }),
        execute: async ({ refundAmount, itemNameSnippet }) => {
          const query = supabase
            .from('orders')
            .select('id, item_name, order_number, amount_spent, amount_refunded, status, created_at, agents(name)')
            .eq('user_id', userId)
            .neq('status', 'refunded')

          const { data, error } = await query
          if (error) return { error: error.message }
          if (!data || data.length === 0) return { matches: [], message: 'No pending non-refunded orders found.' }

          // Score and rank candidate orders
          const ranked = data.map((order) => {
            const spent = Number(order.amount_spent || 0)
            const diff = Math.abs(spent - refundAmount)
            let score = 100 - diff * 5 // higher score for closer amount match

            if (itemNameSnippet && order.item_name.toLowerCase().includes(itemNameSnippet.toLowerCase())) {
              score += 50
            }

            return {
              orderId: order.id,
              itemName: order.item_name,
              orderNumber: order.order_number,
              amountSpent: spent,
              agentName: order.agents?.[0]?.name || 'No Agent',
              currentStatus: order.status,
              amountDifference: diff,
              matchScore: Math.max(0, Math.round(score))
            }
          })

          ranked.sort((a, b) => b.matchScore - a.matchScore)

          return { matches: ranked.slice(0, 3) }
        }
      }),
      getAgents: tool({
        description: 'Get a list of the users agents/sellers.',
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase.from('agents').select('id, name').eq('user_id', userId)
          return data
        }
      }),
      addAgent: tool({
        description: 'Create a new agent/seller.',
        inputSchema: z.object({
          name: z.string().min(1),
          contactInfo: z.string().optional()
        }),
        execute: async ({ name, contactInfo }) => {
          const { data, error } = await supabase.from('agents').insert({ user_id: userId, name, contact_info: contactInfo || null }).select()
          if (error) return { error: error.message }
          return { success: true, agent: data?.[0] }
        }
      }),
      addOrder: tool({
        description: 'Add a new order.',
        inputSchema: z.object({
          itemName: z.string().min(1),
          amountSpent: z.number().nonnegative(),
          orderNumber: z.string().optional(),
          agentId: z.string().optional()
        }),
        execute: async ({ itemName, amountSpent, orderNumber, agentId }) => {
          const { data, error } = await supabase.from('orders').insert({
            user_id: userId,
            item_name: itemName,
            amount_spent: amountSpent,
            order_number: orderNumber || null,
            agent_id: agentId || null
          }).select()
          if (error) return { error: error.message }

          if (data?.[0]?.id) {
            await supabase.from('order_events').insert({
              order_id: data[0].id,
              user_id: userId,
              event_type: 'created',
              description: `AI created order for "${itemName}" ($${amountSpent.toFixed(2)})`
            })
          }

          return { success: true, order: data?.[0] }
        }
      })
    }

    const result = streamText({
      model: google('gemini-3.6-flash'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages, { tools }),
      stopWhen: stepCountIs(5),
      tools,
      onFinish: async (event) => {
        try {
          // Calculate token usage and cost
          const inputTokens = event.usage?.inputTokens || 0
          const outputTokens = event.usage?.outputTokens || 0
          const totalTokens = inputTokens + outputTokens

          // Rough estimate for gemini (example pricing: $1.25/1M input, $5.00/1M output)
          const cost = (inputTokens * 1.25 + outputTokens * 5.0) / 1000000

          const { error: finalizeError } = await supabase.rpc('finalize_ai_usage', {
            p_usage_id: usageId,
            p_tokens_used: totalTokens,
            p_estimated_cost: cost
          })
          if (finalizeError) throw finalizeError
        } catch (err) {
          console.error('Failed to record AI usage:', err)
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Chat API Error:', error)
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
