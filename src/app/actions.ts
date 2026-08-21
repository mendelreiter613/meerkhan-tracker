'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function addAgent(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Not authenticated' }

  const name = formData.get('name') as string
  const contact_info = formData.get('contact_info') as string

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

  const item_name = formData.get('item_name') as string
  const order_number = formData.get('order_number') as string
  const amount_spent = parseFloat(formData.get('amount_spent') as string) || 0
  const agent_id = formData.get('agent_id') as string

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

  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { error: error.message }

  if (user) {
    const formattedStatus = status.replace('_', ' ').toUpperCase()
    await supabase.from('order_events').insert([{
      order_id: orderId,
      user_id: user.id,
      event_type: 'status_changed',
      description: `Status updated to ${formattedStatus}`
    }])
  }
  
  revalidatePath('/')
  return { success: true }
}

export async function updateOrderRefund(orderId: string, amount: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('orders')
    .update({ amount_refunded: amount, status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { error: error.message }

  if (user) {
    await supabase.from('order_events').insert([{
      order_id: orderId,
      user_id: user.id,
      event_type: 'refund_updated',
      description: `Refund of $${amount.toFixed(2)} recorded`
    }])
  }

  revalidatePath('/')
  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
