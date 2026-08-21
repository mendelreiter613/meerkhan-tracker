import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Profile } from '@/types/database'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="mb-4">You do not have permission to view the admin dashboard.</p>
        <Link href="/">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  // Fetch AI usage aggregated by user
  const { data: usageData } = await supabase
    .from('ai_usage')
    .select('user_id, tokens_used, estimated_cost, profiles(email)')

  // Aggregate costs
  const userCosts: Record<string, { email: string; tokens: number; cost: number }> = {}

  usageData?.forEach((row: any) => {
    const email = row.profiles?.email || 'Unknown User'
    if (!userCosts[row.user_id]) {
      userCosts[row.user_id] = { email, tokens: 0, cost: 0 }
    }
    userCosts[row.user_id].tokens += row.tokens_used
    userCosts[row.user_id].cost += row.estimated_cost
  })

  const users = Object.values(userCosts)

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Link href="/">
          <Button variant="outline">Back to Tracker</Button>
        </Link>
      </header>

      <Card className="max-w-4xl mx-auto w-full">
        <CardHeader>
          <CardTitle>AI Usage Billing</CardTitle>
          <CardDescription>Monitor AI costs and usage across all registered users.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User Email</TableHead>
                <TableHead>Tokens Used</TableHead>
                <TableHead>Total Cost ($)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-gray-500 py-6">
                    No AI usage data recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.tokens.toLocaleString()}</TableCell>
                    <TableCell>${u.cost.toFixed(4)}</TableCell>
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
