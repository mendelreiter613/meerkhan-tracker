'use client'

import { useState } from 'react'
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
  Inbox
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

  const handleStatusChange = async (orderId: string, newStatus: string | null) => {
    if (!newStatus) return;
    await updateOrderStatus(orderId, newStatus)
  }

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
            <Button variant="outline" size="sm" render={<a href="/admin" />} className="gap-2">
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
              <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50 py-4">
                <div>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>Manage and track all your Amazon review items.</CardDescription>
                </div>
                
                <Dialog open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen}>
                  <Button render={<DialogTrigger />} className="gap-2 shadow-sm">
                    <Plus className="h-4 w-4" /> Add Order
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
              </CardHeader>
              <CardContent className="p-0">
                {orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <Inbox className="h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-lg font-medium text-slate-900">No orders yet</p>
                    <p className="text-sm">Click "Add Order" to track your first item.</p>
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
                        <TableHead className="font-semibold text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => {
                        const currentStatus = statusConfig[order.status] || { label: order.status, colorClass: 'bg-slate-100 text-slate-800' };
                        return (
                          <TableRow key={order.id} className="hover:bg-slate-50/80">
                            <TableCell className="font-medium">{order.item_name}</TableCell>
                            <TableCell className="text-slate-600">{order.agents?.name || '-'}</TableCell>
                            <TableCell className="text-slate-600 text-xs font-mono">{order.order_number || '-'}</TableCell>
                            <TableCell className="font-medium">${order.amount_spent?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell className="text-green-600 font-medium">${order.amount_refunded?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell className="text-right">
                              <Select 
                                defaultValue={order.status} 
                                onValueChange={(value) => handleStatusChange(order.id, value)}
                              >
                                <SelectTrigger className={`w-[160px] h-8 ml-auto text-xs font-medium border-0 ring-1 ring-inset ${currentStatus.colorClass}`}>
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
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
                {agents.length === 0 ? (
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
                        <TableHead className="font-semibold text-right">Date Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => (
                        <TableRow key={agent.id} className="hover:bg-slate-50/80">
                          <TableCell className="font-medium">{agent.name}</TableCell>
                          <TableCell className="text-slate-600">{agent.contact_info || '-'}</TableCell>
                          <TableCell className="text-right text-slate-500 text-sm">
                            {new Date(agent.created_at).toLocaleDateString()}
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