import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, DollarSign, Cpu, Package, ArrowLeft, Receipt } from 'lucide-react'
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
        <h1 className="font-heading text-2xl font-semibold">Access Denied</h1>
        {noAdminsYet ? (
          <>
            <p className="max-w-md text-muted-foreground">
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

  // Fetch all generated monthly invoices
  const { data: invoices } = await adminSupabase
    .from('invoices')
    .select('*')
    .order('period_start', { ascending: false })

  const emailById = new Map((profiles || []).map((p) => [p.id, p.email]))

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
    <div className="flex flex-col min-h-screen bg-muted/30 p-6 space-y-8 max-w-7xl mx-auto w-full">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Overview of all registered users, orders, and AI API costs.</p>
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
            <div className="font-heading text-2xl font-semibold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total System Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold">{totalGlobalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens Used</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold">{totalGlobalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total AI API Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold text-indigo-600">${totalGlobalAiCost.toFixed(4)}</div>
          </CardContent>
        </Card>
      </div>

      {/* User Accounts Table */}
      <Card className="shadow-sm border-border">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle>User Accounts & Billing</CardTitle>
          <CardDescription>
            All registered user profiles in Supabase with their order count and AI token usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                userStats.map((u) => (
                  <TableRow key={u.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'outline'} className="capitalize">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{u.orderCount}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {u.tokensUsed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-indigo-600 font-mono">
                      ${u.aiCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id === user.id ? (
                        <span className="text-sm text-muted-foreground">Current account</span>
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

      {/* Invoice History */}
      <Card className="shadow-sm border-border">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" /> Invoice History
          </CardTitle>
          <CardDescription>
            Monthly account statements generated automatically on the 1st of each month.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold">Period</TableHead>
                <TableHead className="font-semibold">User Email</TableHead>
                <TableHead className="font-semibold">Orders</TableHead>
                <TableHead className="font-semibold">Spent</TableHead>
                <TableHead className="font-semibold">Refunded</TableHead>
                <TableHead className="font-semibold">Tokens Used</TableHead>
                <TableHead className="font-semibold text-right">AI Cost ($)</TableHead>
                <TableHead className="font-semibold text-right">Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No invoices generated yet. The first run happens on the 1st of next month.
                  </TableCell>
                </TableRow>
              ) : (
                (invoices || []).map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">
                      {new Date(inv.period_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                    </TableCell>
                    <TableCell className="text-foreground">{emailById.get(inv.user_id) || 'Unknown user'}</TableCell>
                    <TableCell className="font-medium">{inv.order_count}</TableCell>
                    <TableCell className="font-medium">${Number(inv.amount_spent).toFixed(2)}</TableCell>
                    <TableCell className="text-green-600 font-medium">${Number(inv.amount_refunded).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {Number(inv.ai_tokens_used).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-indigo-600 font-mono">
                      ${Number(inv.ai_cost).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(inv.created_at).toLocaleDateString()}
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
