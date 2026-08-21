-- Migration script for Phase 2 updates

-- Create Order Events table for timeline history
CREATE TABLE IF NOT EXISTS order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL, -- e.g. 'created', 'status_changed', 'refund_updated', 'note_added'
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on order_events
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- Policy for order_events
CREATE POLICY "Users can manage their own order_events" ON order_events FOR ALL USING (auth.uid() = user_id);
