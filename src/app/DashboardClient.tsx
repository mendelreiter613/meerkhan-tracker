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

interface DashboardClientProps {
  orders: Order[]
  agents: Agent[]
  userEmail: string
  isAdmin?: boolean
}

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'review_submitted', label: 'Review Submitted' },
  { value: 'review_live', label: 'Review Live' },
  { value: 'refund_requested', label: 'Refund Requested' },
  { value: 'refunded', label: 'Refunded' },
]

export default function DashboardClient({ orders, agents, userEmail, isAdmin }: DashboardClientProps) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)

  const handleStatusChange = async (orderId: string, newStatus: string | null) => {
    if (!newStatus) return;
    await updateOrderStatus(orderId, newStatus)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex h-16 items-center justify-between border-b px-6 bg-white">
        <h1 className="text-xl font-bold">Meerkhan Tracker</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{userEmail}</span>
          {isAdmin && (
            <Button variant="outline" size="sm" render={<a href="/admin" />}>
              Admin Panel
            </Button>
          )}
          <form action={logout}>
            <Button variant="outline" size="sm">Log out</Button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
        <Tabs defaultValue="orders" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="ai">AI Assistant ✨</TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Dialog open={isAgentModalOpen} onOpenChange={setIsAgentModalOpen}>
                <Button variant="outline" render={<DialogTrigger />}>Add Agent</Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Agent</DialogTitle>
                    <DialogDescription>Create a new agent/seller to link orders to.</DialogDescription>
                  </DialogHeader>
                  <form action={async (formData) => {
                    await addAgent(formData)
                    setIsAgentModalOpen(false)
                  }}>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contact_info">Contact Info (Optional)</Label>
                        <Input id="contact_info" name="contact_info" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit">Save Agent</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen}>
                <Button render={<DialogTrigger />}>Add Order</Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Order</DialogTitle>
                    <DialogDescription>Record a new item you ordered.</DialogDescription>
                  </DialogHeader>
                  <form action={async (formData) => {
                    await addOrder(formData)
                    setIsOrderModalOpen(false)
                  }}>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="item_name">Item Name</Label>
                        <Input id="item_name" name="item_name" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="order_number">Order Number</Label>
                        <Input id="order_number" name="order_number" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="amount_spent">Amount Spent ($)</Label>
                        <Input id="amount_spent" name="amount_spent" type="number" step="0.01" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="agent_id">Agent</Label>
                        <Select name="agent_id">
                          <SelectTrigger>
                            <SelectValue placeholder="Select an agent" />
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
                    <DialogFooter>
                      <Button type="submit">Save Order</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <TabsContent value="orders" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle>Your Orders</CardTitle>
                <CardDescription>Track all your Amazon reviews and refunds.</CardDescription>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No orders found. Add one to get started!</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Order #</TableHead>
                        <TableHead>Spent</TableHead>
                        <TableHead>Refunded</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.item_name}</TableCell>
                          <TableCell>{order.agents?.name || '-'}</TableCell>
                          <TableCell>{order.order_number || '-'}</TableCell>
                          <TableCell>${order.amount_spent?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>${order.amount_refunded?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>
                            <Select 
                              defaultValue={order.status} 
                              onValueChange={(value) => handleStatusChange(order.id, value)}
                            >
                              <SelectTrigger className="w-[180px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
                <CardDescription>Sellers who provide items for review.</CardDescription>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No agents found. Add one to get started!</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact Info</TableHead>
                        <TableHead>Date Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">{agent.name}</TableCell>
                          <TableCell>{agent.contact_info || '-'}</TableCell>
                          <TableCell>{new Date(agent.created_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="m-0">
            <ChatInterface />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
