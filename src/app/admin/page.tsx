import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, DollarSign, Cpu, Package, ArrowLeft } from 'lucide-react'
import { AdminUserActions } from './AdminUserActions'
import { bootstrapAdmin } from './actions'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  // Check if current user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    // Check whether any admin exists yet. If not, let this user claim the
    // role as a one-time bootstrap step instead of requiring a manual DB edit.
    const bootstrapCheckClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { count: adminCount } = await bootstrapCheckClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    const noAdminsYet = (adminCount || 0) === 0

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center gap-4">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        {noAdminsYet ? (
          <>
            <p className="max-w-md text-slate-600">
              No admin account exists yet. Claim the admin role for your account to set up the admin panel.
            </p>
            <form action={async () => { await bootstrapAdmin() }}>
              <Button type="submit">Become Admin</Button>
            </form>
          </>
        ) : (
          <p>You do not have permission to view the admin dashboard.</p>
        )}
        <Link href="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  // Use Service Role key on the server to bypass RLS and fetch all user data
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all registered profiles
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch all orders
  const { data: orders } = await adminSupabase
    .from('orders')
    .select('user_id, amount_spent, amount_refunded')

  // Fetch all AI usage
  const { data: aiUsage } = await adminSupabase
    .from('ai_usage')
    .select('user_id, tokens_used, estimated_cost')

  // Aggregate metrics per user
  const userStats = (profiles || []).map((p) => {
    const userOrders = (orders || []).filter((o) => o.user_id === p.id)
    const userAi = (aiUsage || []).filter((a) => a.user_id === p.id)

    const orderCount = userOrders.length
    const totalSpent = userOrders.reduce((sum, o) => sum + Number(o.amount_spent || 0), 0)
    const totalRefunded = userOrders.reduce((sum, o) => sum + Number(o.amount_refunded || 0), 0)
    const tokensUsed = userAi.reduce((sum, a) => sum + Number(a.tokens_used || 0), 0)
    const aiCost = userAi.reduce((sum, a) => sum + Number(a.estimated_cost || 0), 0)

    return {
      id: p.id,
      email: p.email,
      role: p.role,
      createdAt: p.created_at,
      orderCount,
      totalSpent,
      totalRefunded,
      tokensUsed,
      aiCost,
    }
  })

  // Global KPI totals
  const totalUsers = userStats.length
  const totalGlobalOrders = userStats.reduce((sum, u) => sum + u.orderCount, 0)
  const totalGlobalAiCost = userStats.reduce((sum, u) => sum + u.aiCost, 0)
  const totalGlobalTokens = userStats.reduce((sum, u) => sum + u.tokensUsed, 0)

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 p-6 space-y-8 max-w-7xl mx-auto w-full">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Panel</h1>
          <p className="text-sm text-slate-500">Overview of all registered users, orders, and AI API costs.</p>
        </div>
        <Button variant="outline" render={<Link href="/" />} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Tracker
        </Button>
      </header>

      {/* Global Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registered Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total System Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGlobalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens Used</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGlobalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total AI API Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">${totalGlobalAiCost.toFixed(4)}</div>
          </CardContent>
        </Card>
      </div>

      {/* User Accounts Table */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b bg-slate-50/50 py-4">
          <CardTitle>User Accounts & Billing</CardTitle>
          <CardDescription>
            All registered user profiles in Supabase with their order count and AI token usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold">User Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold">Date Joined</TableHead>
                <TableHead className="font-semibold">Orders</TableHead>
                <TableHead className="font-semibold">Tokens Used</TableHead>
                <TableHead className="font-semibold text-right">AI Cost ($)</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                userStats.map((u) => (
                  <TableRow key={u.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-medium text-slate-900">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'outline'} className="capitalize">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{u.orderCount}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">
                      {u.tokensUsed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-indigo-600 font-mono">
                      ${u.aiCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id === user.id ? (
                        <span className="text-sm text-slate-500">Current account</span>
                      ) : (
                        <AdminUserActions userId={u.id} email={u.email} role={u.role === 'admin' ? 'admin' : 'user'} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
