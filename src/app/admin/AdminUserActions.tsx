'use client'

import { deleteUser } from './actions'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface AdminUserActionsProps {
  userId: string
  email: string
}

export function AdminUserActions({ userId, email }: AdminUserActionsProps) {
  return (
    <form
      action={deleteUser}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${email}? This permanently removes the user and all of their data.`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="destructive" size="sm" className="gap-2">
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </form>
  )
}