<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
      <h1 class="text-2xl font-bold mb-6 text-center">Admin Belépés</h1>

      <form @submit.prevent="loginAdmin">
        <div class="mb-4">
          <label for="email" class="block text-gray-700 text-sm font-bold mb-2">
            Admin Email
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="admin@example.com"
          >
        </div>

        <div class="mb-6">
          <label for="password" class="block text-gray-700 text-sm font-bold mb-2">
            Jelszó
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          >
        </div>

        <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{{ error }}</p>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {{ loading ? 'Belépés...' : 'Belépés' }}
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-gray-200">
        <p class="text-sm text-gray-600">
          <strong>Fejlesztői infó:</strong><br>
          Alapértelmezett admin: admin@example.com / admin123456<br>
          <span class="text-xs">Változtasd meg éles környezetben!</span>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// Development default credentials
if (process.env.NODE_ENV === 'development') {
  email.value = 'admin@example.com'
  password.value = 'admin123456'
}

async function loginAdmin() {
  loading.value = true
  error.value = ''

  try {
    // Sign in with email and password
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (authError) throw authError

    // Check if user is admin (you can add admin role check here)
    // For now, we'll check if the email matches admin pattern
    if (!email.value.includes('admin')) {
      await supabase.auth.signOut()
      throw new Error('Nincs admin jogosultságod')
    }

    // Store admin session
    sessionStorage.setItem('admin_user', email.value)
    sessionStorage.setItem('is_admin', 'true')

    // Redirect to admin page
    await router.push('/admin')
  } catch (err: any) {
    error.value = err.message || 'Sikertelen belépés'
  } finally {
    loading.value = false
  }
}

// Check if already logged in as admin
onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user && sessionStorage.getItem('is_admin') === 'true') {
    router.push('/admin')
  }
})
</script>