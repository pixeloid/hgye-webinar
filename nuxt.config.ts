// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
      zoomSdkKey: process.env.NUXT_PUBLIC_ZOOM_SDK_KEY || '',
      zoomMeetingNumber: process.env.NUXT_PUBLIC_ZOOM_MEETING_NUMBER || '',
      leaveUrl: process.env.NUXT_PUBLIC_LEAVE_URL || 'https://example.com/thanks'
    }
  },
  nitro: {
    preset: 'netlify'
  },
  vite: {
    optimizeDeps: {
      exclude: ['@zoomus/websdk']
    }
  }
})
