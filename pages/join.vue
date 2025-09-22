<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Loading State -->
    <div v-if="state === 'loading'" class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">{{ loadingMessage }}</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="state === 'error'" class="min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">Hiba történt</h2>
          <p class="text-gray-600 mb-4">{{ errorMessage }}</p>

          <!-- Retry button for certain errors -->
          <button
            v-if="canRetry"
            @click="retryJoin"
            class="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition"
          >
            Újrapróbálkozás
          </button>

          <!-- Go back button -->
          <NuxtLink
            to="/"
            class="block mt-4 text-blue-500 hover:text-blue-600"
          >
            Vissza a főoldalra
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Duplicate Session State -->
    <div v-else-if="state === 'duplicate'" class="min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">Már van aktív munkameneted</h2>
          <p class="text-gray-600 mb-6">
            Úgy tűnik, már bejelentkeztél egy másik eszközön vagy böngészőben.
          </p>

          <div class="space-y-3">
            <button
              @click="requestOTP"
              :disabled="otpRequested"
              class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {{ otpRequested ? 'OTP kód elküldve' : 'Munkamenet átvétele' }}
            </button>

            <!-- OTP Input Form -->
            <div v-if="otpRequested" class="mt-4">
              <input
                v-model="otpCode"
                type="text"
                placeholder="Add meg az OTP kódot"
                maxlength="6"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
              <button
                @click="verifyOTP"
                :disabled="!otpCode || otpCode.length !== 6"
                class="w-full mt-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
              >
                OTP megerősítése
              </button>
              <p class="text-xs text-gray-500 mt-2">
                Debug: {{ debugOtp || 'Ellenőrizd az email-ed' }}
              </p>
            </div>

            <NuxtLink
              to="/"
              class="block text-gray-500 hover:text-gray-600"
            >
              Mégsem
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Zoom Meeting Container -->
    <div v-else-if="state === 'joined'" id="zmmtg-root" class="min-h-screen"></div>

    <!-- Success/Connected State -->
    <div v-else-if="state === 'connected'" class="min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">Sikeresen csatlakoztál!</h2>
          <p class="text-gray-600">A Zoom webinárium betöltődött.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const supabase = useSupabaseClient();
const router = useRouter();
const config = useRuntimeConfig();

// State management
const state = ref<'loading' | 'error' | 'duplicate' | 'joined' | 'connected'>('loading');
const loadingMessage = ref('Belépés előkészítése...');
const errorMessage = ref('');
const canRetry = ref(false);

// OTP handling
const otpRequested = ref(false);
const otpCode = ref('');
const debugOtp = ref('');

// Session management
let heartbeatInterval: NodeJS.Timeout | null = null;
let sessionId: string | null = null;
let deviceHash: string = '';


async function initializeJoin() {
  try {
    loadingMessage.value = 'Felhasználó ellenőrzése...';

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await router.push('/login');
      return;
    }

    // Generate device hash
    loadingMessage.value = 'Eszköz azonosítása...';
    deviceHash = await useDeviceHash();

    // Load Zoom SDK first
    loadingMessage.value = 'Zoom SDK betöltése...';
    await loadZoomSDK();

    // Request Zoom signature from Edge Function
    loadingMessage.value = 'Zoom hitelesítés...';
    await requestZoomSignature();

  } catch (error: any) {
    console.error('Initialization error:', error);
    state.value = 'error';
    errorMessage.value = error.message || 'Ismeretlen hiba történt';
    canRetry.value = true;
  }
}

async function loadZoomSDK() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.ZoomMtg) {
      resolve(true);
      return;
    }

    // Load Zoom SDK CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = 'https://source.zoom.us/3.9.0/css/bootstrap.css';
    document.head.appendChild(link);

    const link2 = document.createElement('link');
    link2.rel = 'stylesheet';
    link2.type = 'text/css';
    link2.href = 'https://source.zoom.us/3.9.0/css/react-select.css';
    document.head.appendChild(link2);

    // Load Zoom SDK JS
    const script = document.createElement('script');
    script.src = 'https://source.zoom.us/3.9.0/lib/vendor/react.min.js';
    script.onload = () => {
      const script2 = document.createElement('script');
      script2.src = 'https://source.zoom.us/3.9.0/lib/vendor/react-dom.min.js';
      script2.onload = () => {
        const script3 = document.createElement('script');
        script3.src = 'https://source.zoom.us/3.9.0/lib/vendor/redux.min.js';
        script3.onload = () => {
          const script4 = document.createElement('script');
          script4.src = 'https://source.zoom.us/3.9.0/lib/vendor/redux-thunk.min.js';
          script4.onload = () => {
            const script5 = document.createElement('script');
            script5.src = 'https://source.zoom.us/3.9.0/lib/vendor/lodash.min.js';
            script5.onload = () => {
              const script6 = document.createElement('script');
              script6.src = 'https://source.zoom.us/zoom-meeting-3.9.0.min.js';
              script6.onload = () => {
                // Initialize Zoom SDK
                window.ZoomMtg.setZoomJSLib('https://source.zoom.us/3.9.0/lib', '/av');
                window.ZoomMtg.preLoadWasm();
                window.ZoomMtg.prepareWebSDK();
                resolve(true);
              };
              script6.onerror = reject;
              document.body.appendChild(script6);
            };
            script5.onerror = reject;
            document.body.appendChild(script5);
          };
          script4.onerror = reject;
          document.body.appendChild(script4);
        };
        script3.onerror = reject;
        document.body.appendChild(script3);
      };
      script2.onerror = reject;
      document.body.appendChild(script2);
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function requestZoomSignature() {
  try {
    const response = await $fetch('/functions/v1/issue-zoom-signature', {
      baseURL: config.public.supabaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: {
        deviceHash,
        userAgent: navigator.userAgent,
      },
    }) as any;

    if (response.error) {
      if (response.error === 'duplicate_session') {
        state.value = 'duplicate';
        return;
      }
      throw new Error(response.message || response.error);
    }

    // Store session ID
    sessionId = response.sessionId;

    // Join Zoom meeting with SDK
    loadingMessage.value = 'Csatlakozás a Zoom webináriumhoz...';
    await joinZoomMeeting(response);

    state.value = 'joined';

  } catch (error: any) {
    if (error.data?.error === 'duplicate_session') {
      state.value = 'duplicate';
      return;
    }
    throw error;
  }
}

async function joinZoomMeeting(credentials: any) {
  return new Promise((resolve, reject) => {
    if (!window.ZoomMtg) {
      reject(new Error('Zoom SDK not loaded'));
      return;
    }

    window.ZoomMtg.init({
      leaveUrl: config.public.leaveUrl,
      isSupportAV: true,
      success: () => {
        console.log('Zoom init successful, attempting to join with:', {
          sdkKey: credentials.sdkKey,
          meetingNumber: credentials.meetingNumber,
          userName: credentials.userName,
          userEmail: credentials.userEmail
        });

        window.ZoomMtg.join({
          signature: credentials.signature,
          sdkKey: credentials.sdkKey,
          meetingNumber: String(credentials.meetingNumber).replace(/[^\d]/g, ''), // Remove any non-digits
          userName: credentials.userName,
          userEmail: credentials.userEmail,
          passWord: credentials.passWord || '',
          success: (result: any) => {
            console.log('Zoom join success:', result);
            startHeartbeat();
            resolve(result);
          },
          error: (error: any) => {
            console.error('Zoom join error:', error);
            console.error('Join parameters were:', {
              signature: credentials.signature ? 'present' : 'missing',
              sdkKey: credentials.sdkKey,
              meetingNumber: String(credentials.meetingNumber).replace(/[^\d]/g, ''),
              userName: credentials.userName,
              userEmail: credentials.userEmail,
              passWord: credentials.passWord || 'empty'
            });
            reject(error);
          },
        });
      },
      error: (error: any) => {
        console.error('Zoom init error:', error);
        reject(error);
      },
    });
  });
}

function startHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Send heartbeat every 15 seconds
  heartbeatInterval = setInterval(async () => {
    try {
      const response = await $fetch('/functions/v1/presence-heartbeat', {
        baseURL: config.public.supabaseUrl,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: {
          sessionId,
        },
      });

      if (response.error) {
        console.error('Heartbeat error:', response.error);
        // If session expired or not found, end the meeting
        if (response.error === 'no_active_session' || response.error === 'session_expired') {
          stopHeartbeat();
          if (window.ZoomMtg) {
            window.ZoomMtg.leaveMeeting({});
          }
          state.value = 'error';
          errorMessage.value = 'A munkamenet lejárt';
        }
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function requestOTP() {
  try {
    otpRequested.value = true;

    const response = await $fetch('/functions/v1/otp-transfer', {
      baseURL: config.public.supabaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: {
        action: 'request',
        deviceHash,
      },
    }) as any;

    if (response.error) {
      errorMessage.value = response.message || 'OTP küldése sikertelen';
      state.value = 'error';
      return;
    }

    // In development, show the OTP for testing
    if (response.debug_otp) {
      debugOtp.value = `Test OTP: ${response.debug_otp}`;
    }
  } catch (error: any) {
    errorMessage.value = 'OTP kérés sikertelen';
    state.value = 'error';
  }
}

async function verifyOTP() {
  try {
    const response = await $fetch('/functions/v1/otp-transfer', {
      baseURL: config.public.supabaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: {
        action: 'verify',
        otpCode: otpCode.value,
        deviceHash,
      },
    }) as any;

    if (response.error) {
      errorMessage.value = response.message || 'OTP ellenőrzés sikertelen';
      return;
    }

    // Session transferred successfully, retry joining
    sessionId = response.sessionId;
    otpRequested.value = false;
    otpCode.value = '';
    state.value = 'loading';
    await requestZoomSignature();

  } catch (error: any) {
    errorMessage.value = 'OTP ellenőrzés sikertelen';
  }
}

async function retryJoin() {
  state.value = 'loading';
  errorMessage.value = '';
  canRetry.value = false;
  await initializeJoin();
}

// Lifecycle hooks
onMounted(() => {
  initializeJoin();
});

onUnmounted(() => {
  stopHeartbeat();
  // Clean up Zoom meeting if active
  if (window.ZoomMtg && state.value === 'joined') {
    window.ZoomMtg.leaveMeeting({});
  }
});

// Declare window type for Zoom SDK
declare global {
  interface Window {
    ZoomMtg: any;
  }
}
</script>

<style>
/* Zoom Meeting Container */
#zmmtg-root {
  position: relative;
  width: 100%;
  height: 100vh;
}
</style>

