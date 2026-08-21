'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { OrderStatus } from '@/types/database'

const VALID_STATUSES: OrderStatus[] = ['ordered', 'review_submitted', 'review_live', 'refund_requested', 'refunded']

export async function addAgent(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string || '').trim()
  const contact_info = formData.get('contact_info') as string

  if (!name) return { error: 'Agent name is required' }

  const { error } = await supabase
    .from('agents')
    .insert([{ user_id: user.id, name, contact_info }])

  if (error) return { error: error.message }

  revalidatePath('/')
  return { success: true }
}

export async function addOrder(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const item_name = (formData.get('item_name') as string || '').trim()
  const order_number = formData.get('order_number') as string
  const amount_spent = parseFloat(formData.get('amount_spent') as string) || 0
  const agent_id = formData.get('agent_id') as string

  if (!item_name) return { error: 'Item name is required' }
  if (amount_spent < 0) return { error: 'Amount spent cannot be negative' }

  const { data, error } = await supabase
    .from('orders')
    .insert([{ 
      user_id: user.id, 
      item_name, 
      order_number, 
      amount_spent, 
      agent_id: agent_id || null 
    }])
    .select()

  if (error) return { error: error.message }
  
  if (data?.[0]?.id) {
    await supabase.from('order_events').insert([{
      order_id: data[0].id,
      user_id: user.id,
      event_type: 'created',
      description: `Order created for "${item_name}" ($${amount_spent.toFixed(2)})`
    }])
  }

  revalidatePath('/')
  return { success: true }
}

export async function updateOrderStatus(orderId: string, status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }
  if (!VALID_STATUSES.includes(status as OrderStatus)) return { error: 'Invalid status' }

  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  const formattedStatus = status.replace('_', ' ').toUpperCase()
  await supabase.from('order_events').insert([{
    order_id: orderId,
    user_id: user.id,
    event_type: 'status_changed',
    description: `Status updated to ${formattedStatus}`
  }])

  revalidatePath('/')
  return { success: true }
}

export async function updateOrderRefund(orderId: string, amount: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Refund amount must be a non-negative number' }

  const { error } = await supabase
    .from('orders')
    .update({ amount_refunded: amount, status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  await supabase.from('order_events').insert([{
    order_id: orderId,
    user_id: user.id,
    event_type: 'refund_updated',
    description: `Refund of $${amount.toFixed(2)} recorded`
  }])

  revalidatePath('/')
  return { success: true }
}

const VALID_REMINDER_FREQUENCIES = [0, 1, 3, 7]

export async function updateReminderFrequency(frequencyDays: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }
  if (!VALID_REMINDER_FREQUENCIES.includes(frequencyDays)) return { error: 'Invalid reminder frequency' }

  const { error } = await supabase.rpc('update_reminder_frequency', { p_frequency_days: frequencyDays })
  if (error) return { error: error.message }

  revalidatePath('/')
  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
