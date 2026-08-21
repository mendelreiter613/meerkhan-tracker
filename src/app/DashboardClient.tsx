'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Agent, Order } from '@/types/database'
import { getOrderReminder } from '@/lib/reminders'
import { addAgent, addOrder, updateOrderStatus, updateOrderRefund, updateReminderFrequency, logout } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatInterface } from '@/components/ChatInterface'
import { Separator } from '@/components/ui/separator'
import { 
  Package, 
  Users, 
  DollarSign, 
  ArrowRightLeft, 
  Sparkles, 
  Plus, 
  LogOut, 
  ShieldAlert,
  Inbox,
  Search,
  Download,
  History,
  Clock,
  AlertTriangle,
  Bell
} from 'lucide-react'

interface DashboardClientProps {
  orders: Order[]
  agents: Agent[]
  userEmail: string
  isAdmin?: boolean
  reminderFrequencyDays: number
}

const REMINDER_FREQUENCY_OPTIONS: { value: string, label: string }[] = [
  { value: '0', label: 'Reminders off' },
  { value: '1', label: 'Remind me daily' },
  { value: '3', label: 'Remind me every 3 days' },
  { value: '7', label: 'Remind me weekly' },
]

// 1. Added a configuration object for dynamic styling of the status dropdowns
const statusConfig: Record<string, { label: string, colorClass: string }> = {
  ordered: { label: 'Ordered', colorClass: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  review_submitted: { label: 'Review Submitted', colorClass: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' },
  review_live: { label: 'Review Live', colorClass: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
  refund_requested: { label: 'Refund Requested', colorClass: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
  refunded: { label: 'Refunded', colorClass: 'bg-green-50 text-green-700 ring-green-600/20' },
}

export default function DashboardClient({ orders, agents, userEmail, isAdmin, reminderFrequencyDays }: DashboardClientProps) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState<Order | null>(null)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState<Order | null>(null)
  const [reminderFrequency, setReminderFrequency] = useState(String(reminderFrequencyDays))

  const handleReminderFrequencyChange = async (value: string | null) => {
    if (!value) return
    setReminderFrequency(value)
    await updateReminderFrequency(Number(value))
  }

  const handleStatusChange = async (orderId: string, newStatus: string | null) => {
    if (!newStatus) return;
    await updateOrderStatus(orderId, newStatus)
  }

  const handleRecordRefund = async (formData: FormData) => {
    if (!selectedOrderForRefund) return
    const amount = parseFloat(formData.get('amount_refunded') as string)
    if (!Number.isFinite(amount) || amount < 0) return
    await updateOrderRefund(selectedOrderForRefund.id, amount)
    setSelectedOrderForRefund(null)
  }

  // Filtered orders list
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_number && order.order_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.agents?.name && order.agents.name.toLowerCase().includes(searchQuery.toLowerCase()))

    let matchesStatus = true
    if (statusFilter === 'pending_refund') {
      matchesStatus = (order.amount_spent || 0) > (order.amount_refunded || 0)
    } else if (statusFilter === 'needs_attention') {
      matchesStatus = getOrderReminder(order) !== null
    } else if (statusFilter !== 'all') {
      matchesStatus = order.status === statusFilter
    }

    return matchesSearch && matchesStatus
  })

  // Export CSV function
  const exportToCsv = () => {
    const headers = ['Item Name', 'Agent', 'Order Number', 'Amount Spent', 'Amount Refunded', 'Status', 'Created At']
    const rows = filteredOrders.map((o) => [
      `"${o.item_name.replace(/"/g, '""')}"`,
      `"${(o.agents?.name || '').replace(/"/g, '""')}"`,
      `"${o.order_number || ''}"`,
      o.amount_spent || 0,
      o.amount_refunded || 0,
      o.status,
      new Date(o.created_at).toLocaleDateString()
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `meerkhan_orders_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Agent Performance Calculations
  const agentPerformance = agents.map((agent) => {
    const agentOrders = orders.filter((o) => o.agent_id === agent.id)
    const totalSpent = agentOrders.reduce((sum, o) => sum + (o.amount_spent || 0), 0)
    const totalRefunded = agentOrders.reduce((sum, o) => sum + (o.amount_refunded || 0), 0)
    const pendingRecovery = totalSpent - totalRefunded

    return {
      ...agent,
      orderCount: agentOrders.length,
      totalSpent,
      totalRefunded,
      pendingRecovery
    }
  })

  // 2. Added derived metrics for the top dashboard cards
  const totalSpent = orders.reduce((acc, order) => acc + (order.amount_spent || 0), 0)
  const totalRefunded = orders.reduce((acc, order) => acc + (order.amount_refunded || 0), 0)
  const pendingRefunds = totalSpent - totalRefunded
  const attentionCount = orders.filter((order) => getOrderReminder(order) !== null).length

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      {/* Modern sticky header */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-5 w-5" />
          </div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Meerkhan Tracker</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">{userEmail}</span>
          <Select value={reminderFrequency} onValueChange={handleReminderFrequencyChange}>
            <SelectTrigger className="w-[190px] h-9 text-xs bg-card gap-1.5">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_FREQUENCY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button variant="outline" size="sm" render={<Link href="/admin" />} className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span className="hidden sm:inline">Admin Panel</span>
            </Button>
          )}
          <Separator orientation="vertical" className="h-6" />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-8 max-w-7xl mx-auto w-full">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card
            className={attentionCount > 0 ? 'cursor-pointer border-amber-200 bg-amber-50/50 hover:bg-amber-50' : undefined}
            onClick={() => attentionCount > 0 && setStatusFilter('needs_attention')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${attentionCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className={`font-heading text-2xl font-semibold ${attentionCount > 0 ? 'text-amber-600' : ''}`}>{attentionCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-heading text-2xl font-semibold">{orders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-heading text-2xl font-semibold">${totalSpent.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refunded</CardTitle>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-heading text-2xl font-semibold text-green-600">${totalRefunded.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Recovery</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-heading text-2xl font-semibold text-orange-600">${pendingRefunds.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="orders" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <TabsList className="bg-card border shadow-sm">
              <TabsTrigger value="orders" className="gap-2"><Package className="h-4 w-4"/> Orders</TabsTrigger>
              <TabsTrigger value="agents" className="gap-2"><Users className="h-4 w-4"/> Agents</TabsTrigger>
              <TabsTrigger value="ai" className="gap-2 text-indigo-600 data-[state=active]:text-indigo-700">
                <Sparkles className="h-4 w-4"/> AI Assistant
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="orders" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border-border">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b bg-muted/30 py-4 gap-4">
                <div>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>Manage and track all your Amazon review items.</CardDescription>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-60">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search orders or agents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs bg-card"
                    />
                  </div>

                  {/* Status Filter */}
                  <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || 'all')}>
                    <SelectTrigger className="w-[150px] h-9 text-xs bg-card">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="needs_attention">Needs Attention</SelectItem>
                      <SelectItem value="pending_refund">Pending Refund</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="review_submitted">Review Submitted</SelectItem>
                      <SelectItem value="review_live">Review Live</SelectItem>
                      <SelectItem value="refund_requested">Refund Requested</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* CSV Export Button */}
                  <Button variant="outline" size="sm" onClick={exportToCsv} className="h-9 gap-1.5 text-xs bg-card">
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>

                  {/* Add Order Dialog */}
                  <Dialog open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen}>
                    <Button render={<DialogTrigger />} size="sm" className="h-9 gap-1.5 text-xs shadow-sm">
                      <Plus className="h-3.5 w-3.5" /> Add Order
                    </Button>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add New Order</DialogTitle>
                        <DialogDescription>Record a new item you purchased for review.</DialogDescription>
                      </DialogHeader>
                      <form action={async (formData) => {
                        await addOrder(formData)
                        setIsOrderModalOpen(false)
                      }}>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="item_name">Item Name</Label>
                            <Input id="item_name" name="item_name" placeholder="e.g. Wireless Earbuds" required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="order_number">Order Number</Label>
                            <Input id="order_number" name="order_number" placeholder="114-XXXXXXX-XXXXXXX" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="amount_spent">Amount Spent ($)</Label>
                              <Input id="amount_spent" name="amount_spent" type="number" step="0.01" placeholder="0.00" />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="agent_id">Agent</Label>
                              <Select name="agent_id">
                                <SelectTrigger>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                      {agent.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" className="w-full sm:w-auto">Save Order</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Inbox className="h-12 w-12 text-muted-foreground/60 mb-4" />
                    <p className="text-lg font-medium text-foreground">No orders found</p>
                    <p className="text-sm">Try adjusting your search or filters.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="font-semibold">Item</TableHead>
                        <TableHead className="font-semibold">Agent</TableHead>
                        <TableHead className="font-semibold">Order #</TableHead>
                        <TableHead className="font-semibold">Spent</TableHead>
                        <TableHead className="font-semibold">Refunded</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold text-right">History</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const currentStatus = statusConfig[order.status] || { label: order.status, colorClass: 'bg-muted text-foreground' };
                        const reminder = getOrderReminder(order)
                        return (
                          <TableRow key={order.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                {reminder && (
                                  <span title={reminder.message}>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  </span>
                                )}
                                {order.item_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{order.agents?.name || '-'}</TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono">{order.order_number || '-'}</TableCell>
                            <TableCell className="font-medium">${order.amount_spent?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell className="text-green-600 font-medium">${order.amount_refunded?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>
                              <Select 
                                defaultValue={order.status} 
                                onValueChange={(value) => handleStatusChange(order.id, value)}
                              >
                                <SelectTrigger className={`w-[150px] h-8 text-xs font-medium border-0 ring-1 ring-inset ${currentStatus.colorClass}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(statusConfig).map(([val, config]) => (
                                    <SelectItem key={val} value={val}>
                                      {config.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-green-700"
                                  title="Record refund"
                                  onClick={() => setSelectedOrderForRefund(order)}
                                >
                                  <DollarSign className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="View history"
                                  onClick={() => setSelectedOrderForTimeline(order)}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Timeline Dialog */}
            <Dialog open={!!selectedOrderForTimeline} onOpenChange={(open) => !open && setSelectedOrderForTimeline(null)}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-600" /> Order History & Timeline
                  </DialogTitle>
                  <DialogDescription>
                    {selectedOrderForTimeline?.item_name} {selectedOrderForTimeline?.order_number ? `(${selectedOrderForTimeline.order_number})` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4 max-h-[350px] overflow-y-auto">
                  {(!selectedOrderForTimeline?.order_events || selectedOrderForTimeline.order_events.length === 0) ? (
                    <div className="text-center text-muted-foreground py-6 text-sm">
                      No event log recorded yet. Changes will appear here automatically.
                    </div>
                  ) : (
                    <div className="relative border-l border-border ml-4 pl-4 space-y-4">
                      {selectedOrderForTimeline.order_events
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((evt) => (
                          <div key={evt.id} className="relative">
                            <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                            <p className="text-sm font-medium text-foreground">{evt.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(evt.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Record Refund Dialog */}
            <Dialog open={!!selectedOrderForRefund} onOpenChange={(open) => !open && setSelectedOrderForRefund(null)}>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>Record Refund</DialogTitle>
                  <DialogDescription>
                    {selectedOrderForRefund?.item_name} — enter the amount you actually received. This marks the order as Refunded.
                  </DialogDescription>
                </DialogHeader>
                <form action={handleRecordRefund}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="amount_refunded">Amount Refunded ($)</Label>
                      <Input
                        key={selectedOrderForRefund?.id}
                        id="amount_refunded"
                        name="amount_refunded"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={
                          selectedOrderForRefund?.amount_refunded ||
                          selectedOrderForRefund?.amount_spent ||
                          undefined
                        }
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="w-full sm:w-auto">Save Refund</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="agents" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border-border">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 py-4">
                <div>
                  <CardTitle>Agents</CardTitle>
                  <CardDescription>Sellers and contacts who provide items for review.</CardDescription>
                </div>
                
                <Dialog open={isAgentModalOpen} onOpenChange={setIsAgentModalOpen}>
                  <Button render={<DialogTrigger />} variant="outline" className="gap-2 shadow-sm">
                    <Plus className="h-4 w-4" /> Add Agent
                  </Button>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New Agent</DialogTitle>
                      <DialogDescription>Create a new agent profile to link your orders to.</DialogDescription>
                    </DialogHeader>
                    <form action={async (formData) => {
                      await addAgent(formData)
                      setIsAgentModalOpen(false)
                    }}>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">Agent Name</Label>
                          <Input id="name" name="name" placeholder="e.g. John Doe" required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="contact_info">Contact Info (Optional)</Label>
                          <Input id="contact_info" name="contact_info" placeholder="WeChat / Email / WhatsApp" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" className="w-full sm:w-auto">Save Agent</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {agentPerformance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Users className="h-12 w-12 text-muted-foreground/60 mb-4" />
                    <p className="text-lg font-medium text-foreground">No agents added</p>
                    <p className="text-sm">Click &ldquo;Add Agent&rdquo; to build your contact list.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="font-semibold">Name</TableHead>
                        <TableHead className="font-semibold">Contact Info</TableHead>
                        <TableHead className="font-semibold">Orders</TableHead>
                        <TableHead className="font-semibold">Total Spent</TableHead>
                        <TableHead className="font-semibold">Total Refunded</TableHead>
                        <TableHead className="font-semibold text-right">Pending Recovery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentPerformance.map((agent) => (
                        <TableRow key={agent.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium text-foreground">{agent.name}</TableCell>
                          <TableCell className="text-muted-foreground">{agent.contact_info || '-'}</TableCell>
                          <TableCell className="font-medium">{agent.orderCount}</TableCell>
                          <TableCell className="font-medium">${agent.totalSpent.toFixed(2)}</TableCell>
                          <TableCell className="text-green-600 font-medium">${agent.totalRefunded.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-orange-600 font-medium">
                            ${agent.pendingRecovery.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
              <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 py-4">
                <CardTitle className="text-indigo-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" /> AI Assistant
                </CardTitle>
                <CardDescription className="text-indigo-700/70">
                  Chat with your data or get help writing reviews.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ChatInterface />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}