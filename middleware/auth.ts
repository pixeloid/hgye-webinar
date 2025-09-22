export default defineNuxtRouteMiddleware(async (to, from) => {
  const supabase = useSupabaseClient()

  // Skip auth check for login and index pages
  if (to.path === '/login' || to.path === '/') {
    return
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return navigateTo('/login')
  }
})