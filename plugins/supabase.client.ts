import { createClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  if (!config.public.supabaseUrl) {
    console.error('NUXT_PUBLIC_SUPABASE_URL is required')
    throw new Error('NUXT_PUBLIC_SUPABASE_URL is required')
  }

  if (!config.public.supabaseAnonKey) {
    console.error('NUXT_PUBLIC_SUPABASE_ANON_KEY is required')
    throw new Error('NUXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }

  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )

  return {
    provide: {
      supabase
    }
  }
})