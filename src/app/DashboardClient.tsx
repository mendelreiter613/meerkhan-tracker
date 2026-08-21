'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Agent, Order, OrderStatus } from '@/types/database'
import { addAgent, addOrder, updateOrderStatus, logout } from './actions'
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
  Clock
} from 'lucide-react'

interface DashboardClientProps {
  orders: Order[]
  agents: Agent[]
  userEmail: string
  isAdmin?: boolean
}

// 1. Added a configuration object for dynamic styling of the status dropdowns
const statusConfig: Record<string, { label: string, colorClass: string }> = {
  ordered: { label: 'Ordered', colorClass: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  review_submitted: { label: 'Review Submitted', colorClass: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' },
  review_live: { label: 'Review Live', colorClass: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
  refund_requested: { label: 'Refund Requested', colorClass: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
  refunded: { label: 'Refunded', colorClass: 'bg-green-50 text-green-700 ring-green-600/20' },
}

export default function DashboardClient({ orders, agents, userEmail, isAdmin }: DashboardClientProps) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState<Order | null>(null)

  const handleStatusChange = async (orderId: string, newStatus: string | null) => {
    if (!newStatus) return;
    await updateOrderStatus(orderId, newStatus)
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

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      {/* Modern sticky header */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Meerkhan Tracker</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-500 hidden sm:inline-block">{userEmail}</span>
          {isAdmin && (
            <Button variant="outline" size="sm" render={<Link href="/admin" />} className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span className="hidden sm:inline">Admin Panel</span>
            </Button>
          )}
          <Separator orientation="vertical" className="h-6" />
          <form action={logout}>
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-8 max-w-7xl mx-auto w-full">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalSpent.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refunded</CardTitle>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${totalRefunded.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Recovery</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">${pendingRefunds.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="orders" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <TabsList className="bg-white border shadow-sm">
              <TabsTrigger value="orders" className="gap-2"><Package className="h-4 w-4"/> Orders</TabsTrigger>
              <TabsTrigger value="agents" className="gap-2"><Users className="h-4 w-4"/> Agents</TabsTrigger>
              <TabsTrigger value="ai" className="gap-2 text-indigo-600 data-[state=active]:text-indigo-700">
                <Sparkles className="h-4 w-4"/> AI Assistant
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="orders" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b bg-slate-50/50 py-4 gap-4">
                <div>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>Manage and track all your Amazon review items.</CardDescription>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-60">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search orders or agents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs bg-white"
                    />
                  </div>

                  {/* Status Filter */}
                  <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || 'all')}>
                    <SelectTrigger className="w-[150px] h-9 text-xs bg-white">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending_refund">Pending Refund</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="review_submitted">Review Submitted</SelectItem>
                      <SelectItem value="review_live">Review Live</SelectItem>
                      <SelectItem value="refund_requested">Refund Requested</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* CSV Export Button */}
                  <Button variant="outline" size="sm" onClick={exportToCsv} className="h-9 gap-1.5 text-xs bg-white">
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
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <Inbox className="h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-lg font-medium text-slate-900">No orders found</p>
                    <p className="text-sm">Try adjusting your search or filters.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50">
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
                        const currentStatus = statusConfig[order.status] || { label: order.status, colorClass: 'bg-slate-100 text-slate-800' };
                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/80">
                            <TableCell className="font-medium">{order.item_name}</TableCell>
                            <TableCell className="text-slate-600">{order.agents?.name || '-'}</TableCell>
                            <TableCell className="text-slate-600 text-xs font-mono">{order.order_number || '-'}</TableCell>
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                onClick={() => setSelectedOrderForTimeline(order)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
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
                    <div className="text-center text-slate-500 py-6 text-sm">
                      No event log recorded yet. Changes will appear here automatically.
                    </div>
                  ) : (
                    <div className="relative border-l border-slate-200 ml-4 pl-4 space-y-4">
                      {selectedOrderForTimeline.order_events
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((evt) => (
                          <div key={evt.id} className="relative">
                            <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                            <p className="text-sm font-medium text-slate-900">{evt.description}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(evt.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="agents" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50 py-4">
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
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <Users className="h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-lg font-medium text-slate-900">No agents added</p>
                    <p className="text-sm">Click "Add Agent" to build your contact list.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50">
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
                        <TableRow key={agent.id} className="hover:bg-slate-50/80">
                          <TableCell className="font-medium text-slate-900">{agent.name}</TableCell>
                          <TableCell className="text-slate-600">{agent.contact_info || '-'}</TableCell>
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