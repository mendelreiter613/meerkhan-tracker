import { Order, OrderStatus } from '@/types/database'

// How many days an order can sit in a status before we flag it as needing attention.
const STALE_THRESHOLD_DAYS: Partial<Record<OrderStatus, number>> = {
  ordered: 3,
  review_submitted: 7,
  review_live: 3,
  refund_requested: 10,
}

const REMINDER_ACTIONS: Partial<Record<OrderStatus, string>> = {
  ordered: 'Submit your review',
  review_submitted: 'Check if the review is live yet',
  review_live: 'Send the screenshot and request your refund',
  refund_requested: 'Follow up with the agent on the refund',
}

export interface OrderReminder {
  daysSinceUpdate: number
  message: string
}

export function getOrderReminder(order: Order): OrderReminder | null {
  const threshold = STALE_THRESHOLD_DAYS[order.status]
  if (threshold === undefined) return null

  const daysSinceUpdate = Math.floor((Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceUpdate < threshold) return null

  return {
    daysSinceUpdate,
    message: `${REMINDER_ACTIONS[order.status]} — ${daysSinceUpdate} days in this status`,
  }
}
