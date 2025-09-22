<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
      <h1 class="text-2xl font-bold mb-6 text-center">Bejelentkezés</h1>

      <div v-if="!loading && !sent && !error">
        <form @submit.prevent="sendMagicLink">
          <div class="mb-4">
            <label for="email" class="block text-gray-700 text-sm font-bold mb-2">
              E-mail cím
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="pelda@email.com"
            >
          </div>

          <button
            type="submit"
            :disabled="loading || !email"
            class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Belépési link küldése
          </button>
        </form>

        <!-- Test login with password (development only) -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <p class="text-sm text-gray-600 mb-3">Fejlesztői belépés (csak teszt):</p>
          <form @submit.prevent="loginWithPassword">
            <div class="mb-3">
              <input
                v-model="testEmail"
                type="email"
                placeholder="test@example.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
            </div>
            <div class="mb-3">
              <input
                v-model="testPassword"
                type="password"
                placeholder="Jelszó"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
            </div>
            <button
              type="submit"
              :disabled="loading || !testEmail || !testPassword"
              class="w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Teszt belépés
            </button>
          </form>
        </div>
      </div>

      <div v-if="loading" class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p class="mt-4 text-gray-600">Belépési link küldése...</p>
      </div>

      <div v-if="sent" class="text-center">
        <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p class="font-bold">E-mail elküldve!</p>
          <p>Ellenőrizd az e-mail fiókod és kattints a belépési linkre.</p>
        </div>
        <p class="text-gray-600 text-sm">
          E-mail: <strong>{{ email }}</strong>
        </p>
      </div>

      <div v-if="error" class="text-center">
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p class="font-bold">Hiba történt</p>
          <p>{{ errorMessage }}</p>
        </div>
        <button
          @click="resetForm"
          class="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Újrapróbálkozás
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const router = useRouter()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref(false)
const errorMessage = ref('')

// Test login fields
const testEmail = ref('test@example.com')
const testPassword = ref('test123456')

async function sendMagicLink() {
  if (!email.value) return

  loading.value = true
  error.value = false
  errorMessage.value = ''

  try {
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.value,
      options: {
        emailRedirectTo: `http://localhost:3001/join`
      }
    })

    if (authError) {
      throw authError
    }

    sent.value = true
  } catch (err: any) {
    error.value = true
    errorMessage.value = err.message || 'Nem sikerült elküldeni a belépési linket'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  email.value = ''
  loading.value = false
  sent.value = false
  error.value = false
  errorMessage.value = ''
}

async function loginWithPassword() {
  if (!testEmail.value || !testPassword.value) return

  loading.value = true
  error.value = false
  errorMessage.value = ''

  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: testEmail.value,
      password: testPassword.value
    })

    if (authError) {
      throw authError
    }

    // Successful login, redirect to join page
    await router.push('/join')
  } catch (err: any) {
    error.value = true
    errorMessage.value = err.message || 'Sikertelen belépés'
  } finally {
    loading.value = false
  }
}

// Check if user is already logged in
onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    router.push('/join')
  }
})
</script>