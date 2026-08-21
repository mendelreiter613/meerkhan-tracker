export type OrderStatus = 'ordered' | 'review_submitted' | 'review_live' | 'refund_requested' | 'refunded';

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  contact_info: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  agent_id: string | null;
  item_name: string;
  order_number: string | null;
  order_date: string | null;
  amount_spent: number | null;
  amount_refunded: number | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  agents?: Agent | null; // Joined table
}

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}
