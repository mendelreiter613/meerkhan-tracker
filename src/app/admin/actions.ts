'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function deleteUser(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) return { error: 'Not authenticated' }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single()

  if (currentProfile?.role !== 'admin') return { error: 'Not authorized' }

  const userId = formData.get('userId')
  if (typeof userId !== 'string' || !userId) return { error: 'User ID is required' }
  if (userId === currentUser.id) return { error: 'You cannot delete your own account' }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await adminSupabase.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}