<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
      <h1 class="text-2xl font-bold mb-6 text-center">Belépés a webináriumba</h1>

      <!-- Email form -->
      <div v-if="!otpSent">
        <form @submit.prevent="sendOTP">
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
              :placeholder="emailFromUrl || 'pelda@email.com'"
            >
          </div>

          <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p>{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading || !email"
            class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {{ loading ? 'Küldés...' : 'OTP kód kérése' }}
          </button>
        </form>
      </div>

      <!-- OTP verification form -->
      <div v-else>
        <form @submit.prevent="verifyOTP">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              Kód elküldve: {{ email }}
            </label>
            <p class="text-sm text-gray-600 mb-4">Add meg a 6 jegyű kódot az e-mailedből:</p>
            <input
              v-model="otpCode"
              type="text"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              autofocus
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-2xl text-center tracking-widest font-mono"
              placeholder="000000"
              @input="otpCode = otpCode.replace(/[^0-9]/g, '')"
            >
          </div>

          <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p>{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading || otpCode.length !== 6"
            class="w-full bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-600 disabled:opacity-50 mb-2"
          >
            {{ loading ? 'Ellenőrzés...' : 'Belépés' }}
          </button>

          <div class="flex justify-between">
            <button
              @click="resetForm"
              type="button"
              class="text-gray-600 hover:text-gray-800 text-sm"
            >
              ← Másik email
            </button>
            <button
              @click="resendOTP"
              :disabled="loading"
              type="button"
              class="text-blue-600 hover:text-blue-800 text-sm"
            >
              Új kód küldése
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()

const email = ref('')
const otpCode = ref('')
const otpSent = ref(false)
const loading = ref(false)
const error = ref('')

// Get email from URL if provided
const emailFromUrl = route.query.email as string || ''
if (emailFromUrl) {
  email.value = emailFromUrl
}

const sendOTP = async () => {
  loading.value = true
  error.value = ''

  try {
    // First check if user exists in invitees table
    const { data: invitee, error: inviteeError } = await supabase
      .from('invitees')
      .select('id, email, status')
      .eq('email', email.value)
      .single()

    if (inviteeError || !invitee) {
      error.value = 'Ez az email cím nincs meghívva a webináriumra'
      loading.value = false
      return
    }

    if (invitee.status === 'blocked') {
      error.value = 'Ez a fiók le van tiltva'
      loading.value = false
      return
    }

    // Send OTP via backend
    const response = await fetch(`${config.public.supabaseUrl}/functions/v1/auth-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.public.supabaseAnonKey}`
      },
      body: JSON.stringify({
        action: 'send',
        email: email.value
      })
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || 'Nem sikerült elküldeni az OTP kódot')
    }

    otpSent.value = true
  } catch (err: any) {
    error.value = err.message || 'Hiba történt az OTP küldése során'
  } finally {
    loading.value = false
  }
}

const verifyOTP = async () => {
  loading.value = true
  error.value = ''

  try {
    // Verify OTP via backend
    const response = await fetch(`${config.public.supabaseUrl}/functions/v1/auth-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.public.supabaseAnonKey}`
      },
      body: JSON.stringify({
        action: 'verify',
        email: email.value,
        otpCode: otpCode.value
      })
    })

    const result = await response.json()

    if (!response.ok) {
      error.value = result.message || 'Hibás OTP kód'
      loading.value = false
      return
    }

    // Store auth data
    sessionStorage.setItem('authenticated_email', result.email)
    sessionStorage.setItem('session_token', result.sessionToken)
    sessionStorage.setItem('user_name', result.user.full_name)

    // Redirect to join page
    await router.push('/join')
  } catch (err: any) {
    error.value = 'Hiba történt a belépés során'
  } finally {
    loading.value = false
  }
}

const resendOTP = async () => {
  otpCode.value = ''
  await sendOTP()
}

const resetForm = () => {
  otpSent.value = false
  otpCode.value = ''
  error.value = ''
}

// Check if user is already authenticated
onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    router.push('/join')
  }
})
</script>