export const useSupabaseClient = () => {
  const { $supabase } = useNuxtApp()
  return $supabase
}