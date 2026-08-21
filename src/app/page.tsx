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

  // Fetch orders with agent details and timeline events
  const { data: ordersData } = await supabase
    .from('orders')
    .select(`
      *,
      agents (*),
      order_events (*)
    `)
    .order('created_at', { ascending: false })

  const agents = (agentsData || []) as Agent[]
  const orders = (ordersData || []) as Order[]

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
