import { google } from '@ai-sdk/google'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id

  const systemPrompt = `You are Meerkhan, an AI assistant for managing Amazon orders, reviews, and refunds.
You help the user track what they bought, when they submitted a review, when it went live, and when they got refunded.
You have access to their database via tools. 
When the user says "I got refunded X", use the tools to check their orders. If there's an obvious order matching that amount, ask for confirmation or just update it. If not, ask them which order it was.
If the user says "I ordered X from agent Y", check if agent Y exists. If not, create the agent, then create the order.
The user might upload screenshots of their orders or refund confirmations. You can read the images to find out the item name, order number, amount spent, or refunded amount. Extract this information and use it to add or update orders. If any information is missing, ask the user.

Current date: ${new Date().toLocaleDateString()}
Always be concise, helpful, and friendly.`

  const result = await streamText({
    model: google('gemini-1.5-pro'),
    system: systemPrompt,
    messages,
    onFinish: async (event) => {
      // Calculate token usage and cost
      const promptTokens = event.usage?.promptTokens || 0
      const completionTokens = event.usage?.completionTokens || 0
      const totalTokens = promptTokens + completionTokens
      
      // Rough estimate for gemini-1.5-pro (example pricing: $1.25/1M input, $5.00/1M output)
      const cost = (promptTokens * 1.25 + completionTokens * 5.0) / 1000000

      if (totalTokens > 0) {
        await supabase.from('ai_usage').insert({
          user_id: userId,
          tokens_used: totalTokens,
          estimated_cost: cost
        })
      }
    },
    tools: {
      getOrders: tool({
        description: 'Get a list of the users orders, optionally filtered by status.',
        parameters: z.object({
          status: z.enum(['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded']).optional()
        }),
        execute: async ({ status }) => {
          let query = supabase.from('orders').select('id, item_name, amount_spent, amount_refunded, status, agent_id').eq('user_id', userId)
          if (status) query = query.eq('status', status)
          const { data } = await query
          return data
        }
      }),
      updateOrder: tool({
        description: 'Update an existing order (status, or refund amount).',
        parameters: z.object({
          orderId: z.string(),
          status: z.enum(['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded']).optional(),
          amountRefunded: z.number().optional()
        }),
        execute: async ({ orderId, status, amountRefunded }) => {
          const updates: any = {}
          if (status) updates.status = status
          if (amountRefunded !== undefined) updates.amount_refunded = amountRefunded
          
          const { data, error } = await supabase.from('orders').update(updates).eq('id', orderId).eq('user_id', userId).select()
          if (error) return { error: error.message }
          return { success: true, updatedOrder: data }
        }
      }),
      getAgents: tool({
        description: 'Get a list of the users agents/sellers.',
        parameters: z.object({}),
        execute: async () => {
          const { data } = await supabase.from('agents').select('id, name').eq('user_id', userId)
          return data
        }
      }),
      addAgent: tool({
        description: 'Create a new agent/seller.',
        parameters: z.object({
          name: z.string()
        }),
        execute: async ({ name }) => {
          const { data, error } = await supabase.from('agents').insert({ user_id: userId, name }).select()
          if (error) return { error: error.message }
          return { success: true, agent: data?.[0] }
        }
      }),
      addOrder: tool({
        description: 'Add a new order.',
        parameters: z.object({
          itemName: z.string(),
          amountSpent: z.number(),
          agentId: z.string().optional()
        }),
        execute: async ({ itemName, amountSpent, agentId }) => {
          const { data, error } = await supabase.from('orders').insert({
            user_id: userId,
            item_name: itemName,
            amount_spent: amountSpent,
            agent_id: agentId || null
          }).select()
          if (error) return { error: error.message }
          return { success: true, order: data?.[0] }
        }
      })
    }
  })

  return result.toDataStreamResponse()
}
