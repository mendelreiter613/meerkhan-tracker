import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { Order, Agent } from '@/types/database'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  // Fetch agents
  const { data: agentsData } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })

  // Keep the main order query independent of the optional timeline table.
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select(`
      *,
      agents (*)
    `)
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('Failed to load orders:', ordersError)
  }

  const agents = (agentsData || []) as Agent[]
  let orders = (ordersData || []) as Order[]

  // Load timeline events separately so a missing migration cannot hide orders.
  if (orders.length > 0) {
    const { data: eventsData, error: eventsError } = await supabase
      .from('order_events')
      .select('*')
      .in('order_id', orders.map((order) => order.id))
      .order('created_at', { ascending: false })

    if (eventsError) {
      console.error('Failed to load order timeline events:', eventsError)
    } else {
      orders = orders.map((order) => ({
        ...order,
        order_events: (eventsData || []).filter((event) => event.order_id === order.id),
      }))
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return (
    <DashboardClient 
      orders={orders} 
      agents={agents} 
      userEmail={user.email || ''} 
      isAdmin={profile?.role === 'admin'}
    />
  )
}
