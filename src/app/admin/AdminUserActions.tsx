'use client'

import { deleteUser, setUserRole } from './actions'
import { Button } from '@/components/ui/button'
import { Trash2, ShieldPlus, ShieldMinus } from 'lucide-react'

interface AdminUserActionsProps {
  userId: string
  email: string
  role: 'admin' | 'user'
}

export function AdminUserActions({ userId, email, role }: AdminUserActionsProps) {
  const nextRole = role === 'admin' ? 'user' : 'admin'

  return (
    <div className="flex items-center justify-end gap-2">
      <form
        action={async (formData) => {
          await setUserRole(formData)
        }}
        onSubmit={(event) => {
          const message =
            role === 'admin'
              ? `Remove admin access from ${email}?`
              : `Make ${email} an admin? They will be able to view and manage all accounts.`
          if (!window.confirm(message)) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="role" value={nextRole} />
        <Button type="submit" variant="outline" size="sm" className="gap-2">
          {role === 'admin' ? <ShieldMinus className="h-4 w-4" /> : <ShieldPlus className="h-4 w-4" />}
          <span className="hidden sm:inline">{role === 'admin' ? 'Remove Admin' : 'Make Admin'}</span>
        </Button>
      </form>
      <form
        action={async (formData) => {
          await deleteUser(formData)
        }}
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
    </div>
  )
}