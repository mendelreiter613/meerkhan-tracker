'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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

  const { error } = await supabase
    .from('orders')
    .insert([{ 
      user_id: user.id, 
      item_name, 
      order_number, 
      amount_spent, 
      agent_id: agent_id || null 
    }])

  if (error) return { error: error.message }
  
  revalidatePath('/')
  return { success: true }
}

export async function updateOrderStatus(orderId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { error: error.message }
  
  revalidatePath('/')
  return { success: true }
}

export async function updateOrderRefund(orderId: string, amount: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ amount_refunded: amount, status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { error: error.message }
  
  revalidatePath('/')
  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/')
}
