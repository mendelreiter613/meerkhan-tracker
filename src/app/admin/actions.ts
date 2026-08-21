'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) return { currentUser: null, error: 'Not authenticated' }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single()

  if (currentProfile?.role !== 'admin') return { currentUser: null, error: 'Not authorized' }

  return { currentUser, error: null }
}

async function logAdminAction(actorId: string, action: string, targetUserId: string, details: string) {
  const adminSupabase = getAdminClient()
  await adminSupabase.from('admin_audit_log').insert({
    actor_id: actorId,
    action,
    target_user_id: targetUserId,
    details,
  })
}

export async function deleteUser(formData: FormData) {
  const { currentUser, error: authError } = await requireAdmin()
  if (!currentUser) return { error: authError }

  const userId = formData.get('userId')
  if (typeof userId !== 'string' || !userId) return { error: 'User ID is required' }
  if (userId === currentUser.id) return { error: 'You cannot delete your own account' }

  const adminSupabase = getAdminClient()
  const { error } = await adminSupabase.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  await logAdminAction(currentUser.id, 'delete_user', userId, 'User account deleted')

  revalidatePath('/admin')
  return { success: true }
}

export async function setUserRole(formData: FormData) {
  const { currentUser, error: authError } = await requireAdmin()
  if (!currentUser) return { error: authError }

  const userId = formData.get('userId')
  const role = formData.get('role')
  if (typeof userId !== 'string' || !userId) return { error: 'User ID is required' }
  if (role !== 'admin' && role !== 'user') return { error: 'Invalid role' }
  if (userId === currentUser.id) return { error: 'You cannot change your own role' }

  const adminSupabase = getAdminClient()
  const { error } = await adminSupabase.from('profiles').update({ role }).eq('id', userId)
  if (error) return { error: error.message }

  await logAdminAction(
    currentUser.id,
    role === 'admin' ? 'promote_to_admin' : 'demote_to_user',
    userId,
    `Role changed to ${role}`
  )

  revalidatePath('/admin')
  return { success: true }
}

// One-time bootstrap: lets the current user claim the admin role, but only
// while no admin account exists yet. Once an admin exists, further role
// changes must go through setUserRole (an existing admin promoting someone).
export async function bootstrapAdmin() {
  const supabase = await createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) return { error: 'Not authenticated' }

  const adminSupabase = getAdminClient()
  const { count, error: countError } = await adminSupabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (countError) return { error: countError.message }
  if ((count || 0) > 0) {
    return { error: 'An admin already exists. Ask an existing admin to promote your account.' }
  }

  const { error } = await adminSupabase.from('profiles').update({ role: 'admin' }).eq('id', currentUser.id)
  if (error) return { error: error.message }

  await logAdminAction(currentUser.id, 'bootstrap_admin', currentUser.id, 'Self-promoted via bootstrap (no admins existed yet)')

  revalidatePath('/admin')
  revalidatePath('/')
  return { success: true }
}