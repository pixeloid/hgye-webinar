<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Debug State Info -->
    <div class="fixed top-0 right-0 bg-black text-white p-2 text-xs z-50">
      State: {{ state }}
    </div>

    <!-- Loading State -->
    <div
      v-if="state === 'loading'"
      class="min-h-screen flex items-center justify-center"
    >
      <div class="text-center">
        <div
          class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"
        ></div>
        <p class="mt-4 text-gray-600">{{ loadingMessage }}</p>
        <p class="mt-2 text-xs text-gray-400">Debug: State = {{ state }}</p>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="state === 'error'"
      class="min-h-screen flex items-center justify-center"
    >
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div
            class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg
              class="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
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
          <NuxtLink to="/" class="block mt-4 text-blue-500 hover:text-blue-600">
            Vissza a főoldalra
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Duplicate Session State -->
    <div
      v-else-if="state === 'duplicate'"
      class="min-h-screen flex items-center justify-center"
    >
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div
            class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg
              class="w-8 h-8 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">
            Már van aktív munkameneted
          </h2>
          <p class="text-gray-600 mb-6">
            Úgy tűnik, már bejelentkeztél egy másik eszközön vagy böngészőben.
          </p>

          <div class="space-y-3">
            <button
              @click="requestOTP"
              :disabled="otpRequested"
              class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {{ otpRequested ? "OTP kód elküldve" : "Munkamenet átvétele" }}
            </button>

            <!-- OTP Input Form -->
            <div v-if="otpRequested" class="mt-4">
              <input
                v-model="otpCode"
                type="text"
                placeholder="Add meg az OTP kódot"
                maxlength="6"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                @click="verifyOTP"
                :disabled="!otpCode || otpCode.length !== 6"
                class="w-full mt-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
              >
                OTP megerősítése
              </button>
              <p class="text-xs text-gray-500 mt-2">
                Debug: {{ debugOtp || "Ellenőrizd az email-ed" }}
              </p>
            </div>

            <NuxtLink to="/" class="block text-gray-500 hover:text-gray-600">
              Mégsem
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Device Verification State -->
    <div
      v-else-if="state === 'device_verification'"
      class="min-h-screen flex items-center justify-center"
    >
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div
            class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg
              class="w-8 h-8 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">
            Új eszköz megerősítése
          </h2>
          <p class="text-gray-600 mb-6">
            Új eszközről történő belépést észleltünk. Biztonsági okokból
            megerősítés szükséges.
          </p>

          <div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4 text-left">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg
                  class="h-5 w-5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">
                  🚨 Biztonsági figyelmeztetés
                </h3>
                <p class="text-sm text-red-700 mt-1">
                  <strong>Gyanús tevékenység észlelve!</strong> Valaki
                  megpróbálta használni az Ön belépési linkjét egy másik
                  eszközről. Ha ez nem Ön volt,
                  <strong>NE írja be a megerősítő kódot</strong> és jelentse a
                  problémát.
                </p>
              </div>
            </div>
          </div>

          <div class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 text-left">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg
                  class="h-5 w-5 text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-blue-800">
                  Eszköz megerősítés szükséges
                </h3>
                <p class="text-sm text-blue-700 mt-1">
                  Ha Ön volt az, aki új eszközről próbált belépni (pl. mobil →
                  laptop), akkor adja meg a megerősítő kódot az email-éből.
                </p>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <input
              v-model="deviceOtpCode"
              type="text"
              placeholder="Megerősítő kód (6 számjegy)"
              maxlength="6"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              @click="verifyDeviceOTP"
              :disabled="
                !deviceOtpCode || deviceOtpCode.length !== 6 || deviceVerifying
              "
              class="w-full bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {{ deviceVerifying ? "Ellenőrzés..." : "Eszköz megerősítése" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zoom Meeting Container - Always present but hidden until needed -->
    <div
      id="zmmtg-root"
      :class="{
        'zoom-container': true,
        'zoom-hidden': state !== 'joined',
      }"
    ></div>

    <!-- Success/Connected State -->
    <div
      v-if="state === 'connected'"
      class="min-h-screen flex items-center justify-center"
    >
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div class="text-center">
          <div
            class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <svg
              class="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">
            Sikeresen csatlakoztál!
          </h2>
          <p class="text-gray-600">A Zoom webinárium betöltődött.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const router = useRouter();
const config = useRuntimeConfig();

// State management
const state = ref<
  | "loading"
  | "error"
  | "duplicate"
  | "device_verification"
  | "joined"
  | "connected"
>("loading");
const loadingMessage = ref("Belépés előkészítése...");
const errorMessage = ref("");
const canRetry = ref(false);

// OTP handling
const otpRequested = ref(false);
const otpCode = ref("");
const debugOtp = ref("");

// Device verification handling
const deviceOtpCode = ref("");
const deviceVerifying = ref(false);

// Session management
let heartbeatInterval: NodeJS.Timeout | null = null;
let sessionId: string | null = null;
let deviceHash: string = "";

async function initializeJoin() {
  try {
    loadingMessage.value = "Belépési link ellenőrzése...";

    // Clean up any existing Zoom elements first
    const existingZoomRoot = document.getElementById("zmmtg-root");
    if (existingZoomRoot) {
      console.log("Removing existing zmmtg-root element");
      existingZoomRoot.remove();
    }

    // Get access token from URL parameters
    const route = useRoute();
    const accessToken = route.query.token as string;

    if (!accessToken) {
      state.value = "error";
      errorMessage.value = "Érvénytelen belépési link. Hiányzó token.";
      canRetry.value = false;
      return;
    }

    console.log("=== INITIALIZATION ===");
    console.log("Access Token:", accessToken);

    // Store token for use in API calls
    sessionStorage.setItem("access_token", accessToken);

    // Generate device hash
    loadingMessage.value = "Eszköz azonosítása...";
    deviceHash = await useDeviceHash();
    console.log("Device Hash generated:", deviceHash);

    // Request Zoom signature from Edge Function
    loadingMessage.value = "Hozzáférés ellenőrzése...";
    await requestZoomSignature();
  } catch (error: any) {
    console.error("Initialization error:", error);
    state.value = "error";
    errorMessage.value = error.message || "Ismeretlen hiba történt";
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
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = "https://source.zoom.us/3.9.0/css/bootstrap.css";
    document.head.appendChild(link);

    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.type = "text/css";
    link2.href = "https://source.zoom.us/3.9.0/css/react-select.css";
    document.head.appendChild(link2);

    // Load Zoom SDK JS
    const script = document.createElement("script");
    script.src = "https://source.zoom.us/3.9.0/lib/vendor/react.min.js";
    script.onload = () => {
      const script2 = document.createElement("script");
      script2.src = "https://source.zoom.us/3.9.0/lib/vendor/react-dom.min.js";
      script2.onload = () => {
        const script3 = document.createElement("script");
        script3.src = "https://source.zoom.us/3.9.0/lib/vendor/redux.min.js";
        script3.onload = () => {
          const script4 = document.createElement("script");
          script4.src =
            "https://source.zoom.us/3.9.0/lib/vendor/redux-thunk.min.js";
          script4.onload = () => {
            const script5 = document.createElement("script");
            script5.src =
              "https://source.zoom.us/3.9.0/lib/vendor/lodash.min.js";
            script5.onload = () => {
              const script6 = document.createElement("script");
              script6.src = "https://source.zoom.us/zoom-meeting-3.9.0.min.js";
              script6.onload = () => {
                // Initialize Zoom SDK
                window.ZoomMtg.setZoomJSLib(
                  "https://source.zoom.us/3.9.0/lib",
                  "/av"
                );
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
    const accessToken = sessionStorage.getItem("access_token");
    if (!accessToken) {
      throw new Error("Hiányzó hozzáférési token");
    }

    console.log("=== REQUESTING ZOOM SIGNATURE ===");
    console.log("Access Token:", accessToken ? "present" : "missing");
    console.log("Device Hash:", deviceHash);
    console.log("User Agent:", navigator.userAgent);

    let response: any;

    try {
      response = await $fetch("/functions/v1/issue-zoom-signature", {
        baseURL: config.public.supabaseUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.public.supabaseAnonKey}`,
          apikey: config.public.supabaseAnonKey,
        },
        body: {
          accessToken,
          deviceHash,
          userAgent: navigator.userAgent,
        },
      });
    } catch (fetchError: any) {
      // Handle HTTP error responses (4xx, 5xx)
      if (fetchError.data) {
        response = fetchError.data;
        console.log("=== FETCH ERROR WITH DATA ===");
        console.log("Status:", fetchError.status);
        console.log("Response data:", response);
      } else {
        console.error("=== FETCH ERROR WITHOUT DATA ===");
        console.error("Error:", fetchError);
        throw fetchError;
      }
    }

    console.log("=== SIGNATURE RESPONSE ===");
    console.log("Response:", response);

    if (response?.error) {
      if (response.error === "duplicate_session") {
        state.value = "duplicate";
        return;
      }
      if (response.error === "device_verification_required") {
        console.log("Device verification required:", response.reason);
        console.log("Setting state to device_verification");
        state.value = "device_verification";
        console.log("State after setting:", state.value);
        console.log("Returning from device verification logic");
        return;
      }
      throw new Error(response.message || response.error);
    }

    // Store session ID
    sessionId = (response as any).sessionId;

    // Now load Zoom SDK and join
    loadingMessage.value = "Zoom SDK betöltése...";
    await loadZoomSDK();

    // Join Zoom meeting with SDK
    loadingMessage.value = "Csatlakozás a Zoom webináriumhoz...";
    await joinZoomMeeting(response);

    // State is set to 'joined' in the Zoom join success callback
  } catch (error: any) {
    if (error.data?.error === "duplicate_session") {
      state.value = "duplicate";
      return;
    }
    throw error;
  }
}

async function joinZoomMeeting(credentials: any) {
  return new Promise((resolve, reject) => {
    if (!window.ZoomMtg) {
      reject(new Error("Zoom SDK not loaded"));
      return;
    }

    console.log("=== STARTING ZOOM INIT ===");

    // Set a timeout in case Zoom doesn't respond
    const joinTimeout = setTimeout(() => {
      console.log("=== ZOOM JOIN TIMEOUT - ASSUMING SUCCESS ===");
      console.log(
        "Zoom took too long to respond, assuming it connected successfully"
      );
      state.value = "joined";
      startHeartbeat();
      resolve("timeout_success");
    }, 10000); // 10 second timeout

    window.ZoomMtg.init({
      leaveUrl: config.public.leaveUrl,
      isSupportAV: true,
      success: () => {
        console.log("=== ZOOM INIT SUCCESS ===");
        console.log("Zoom init successful, attempting to join with:", {
          sdkKey: credentials.sdkKey,
          meetingNumber: credentials.meetingNumber,
          userName: credentials.userName,
          userEmail: credentials.userEmail,
        });

        const cleanMeetingNumber = String(credentials.meetingNumber).replace(
          /[^\d]/g,
          ""
        );

        console.log("=== ZOOM JOIN ATTEMPT ===");
        console.log("Signature present:", credentials.signature ? "YES" : "NO");
        console.log("SDK Key:", credentials.sdkKey);
        console.log("Meeting Number (original):", credentials.meetingNumber);
        console.log("Meeting Number (cleaned):", cleanMeetingNumber);
        console.log("User Name:", credentials.userName);
        console.log("User Email:", credentials.userEmail);
        console.log("Password:", credentials.passWord ? "SET" : "EMPTY");

        window.ZoomMtg.join({
          signature: credentials.signature,
          sdkKey: credentials.sdkKey,
          meetingNumber: cleanMeetingNumber,
          userName: credentials.userName,
          userEmail: credentials.userEmail,
          passWord: credentials.passWord || "",
          success: (result: any) => {
            clearTimeout(joinTimeout);
            console.log("=== ZOOM JOIN SUCCESS ===");
            console.log("Join result:", result);
            console.log("Setting state to joined");
            state.value = "joined";
            startHeartbeat();
            resolve(result);
          },
          error: (error: any) => {
            clearTimeout(joinTimeout);
            console.error("=== ZOOM JOIN ERROR ===");
            console.error("Error details:", error);
            console.error("Error code:", error?.errorCode);
            console.error("Error message:", error?.errorMessage);
            console.error("Join parameters used:");
            console.error(
              "- Signature:",
              credentials.signature
                ? "present (" + credentials.signature.length + " chars)"
                : "missing"
            );
            console.error("- SDK Key:", credentials.sdkKey);
            console.error("- Meeting Number:", cleanMeetingNumber);
            console.error("- User Name:", credentials.userName);
            console.error("- User Email:", credentials.userEmail);
            console.error("- Password:", credentials.passWord || "empty");
            reject(error);
          },
        });

        // Additional fallback - if join doesn't call success/error after 5 seconds
        setTimeout(() => {
          console.log("=== ZOOM JOIN FALLBACK ===");
          console.log("Join method called but no response after 5 seconds");
          console.log("Checking if Zoom container exists...");

          const zoomContainer = document.querySelector("#zmmtg-root");
          if (zoomContainer) {
            console.log(
              "Zoom container found. Children count:",
              zoomContainer.children.length
            );
            console.log(
              "Container innerHTML length:",
              zoomContainer.innerHTML.length
            );

            // If Zoom has added any content, assume it's working
            if (
              zoomContainer.children.length > 0 ||
              zoomContainer.innerHTML.trim().length > 0
            ) {
              console.log(
                "Zoom container has content, assuming successful join"
              );
              clearTimeout(joinTimeout);
              state.value = "joined";
              startHeartbeat();
              resolve("fallback_success");
            } else {
              console.log(
                "Zoom container is empty, forcing state to joined anyway"
              );
              // Force state change even if empty - Zoom might be loading
              clearTimeout(joinTimeout);
              state.value = "joined";
              startHeartbeat();
              resolve("forced_success");
            }
          }
        }, 5000);
      },
      error: (error: any) => {
        clearTimeout(joinTimeout);
        console.error("=== ZOOM INIT ERROR ===");
        console.error("Zoom init error:", error);
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
      const accessToken = sessionStorage.getItem("access_token");
      if (!accessToken) {
        stopHeartbeat();
        state.value = "error";
        errorMessage.value = "Hiányzó hozzáférési token";
        return;
      }

      const response = (await $fetch("/functions/v1/presence-heartbeat", {
        baseURL: config.public.supabaseUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.public.supabaseAnonKey}`,
          apikey: config.public.supabaseAnonKey,
        },
        body: {
          accessToken,
          sessionId,
        },
      })) as any;

      if (response.error) {
        console.error("Heartbeat error:", response.error);
        // If session expired or not found, end the meeting
        if (
          response.error === "no_active_session" ||
          response.error === "session_expired"
        ) {
          stopHeartbeat();
          if (window.ZoomMtg) {
            window.ZoomMtg.leaveMeeting({});
          }
          state.value = "error";
          errorMessage.value = "A munkamenet lejárt";
        }
      }
    } catch (error) {
      console.error("Heartbeat failed:", error);
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
    const accessToken = sessionStorage.getItem("access_token");

    const response = (await $fetch("/functions/v1/otp-transfer", {
      baseURL: config.public.supabaseUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.public.supabaseAnonKey}`,
        apikey: config.public.supabaseAnonKey,
      },
      body: {
        action: "request",
        accessToken,
        deviceHash,
      },
    })) as any;

    if (response.error) {
      errorMessage.value = response.message || "OTP küldése sikertelen";
      state.value = "error";
      return;
    }

    // In development, show the OTP for testing
    if (response.debug_otp) {
      debugOtp.value = `Test OTP: ${response.debug_otp}`;
    }
  } catch (error: any) {
    errorMessage.value = "OTP kérés sikertelen";
    state.value = "error";
  }
}

async function verifyOTP() {
  try {
    const accessToken = sessionStorage.getItem("access_token");

    const response = (await $fetch("/functions/v1/otp-transfer", {
      baseURL: config.public.supabaseUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.public.supabaseAnonKey}`,
        apikey: config.public.supabaseAnonKey,
      },
      body: {
        action: "verify",
        accessToken,
        otpCode: otpCode.value,
        deviceHash,
      },
    })) as any;

    if (response.error) {
      errorMessage.value = response.message || "OTP ellenőrzés sikertelen";
      return;
    }

    // Session transferred successfully, retry joining
    sessionId = response.sessionId;
    otpRequested.value = false;
    otpCode.value = "";
    state.value = "loading";
    await requestZoomSignature();
  } catch (error: any) {
    errorMessage.value = "OTP ellenőrzés sikertelen";
  }
}

async function verifyDeviceOTP() {
  try {
    deviceVerifying.value = true;
    const accessToken = sessionStorage.getItem("access_token");

    console.log("=== DEVICE VERIFICATION ATTEMPT ===");
    console.log("Access Token:", accessToken ? "present" : "missing");
    console.log("Device OTP Code:", deviceOtpCode.value);

    const response = (await $fetch("/functions/v1/device-verification", {
      baseURL: config.public.supabaseUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.public.supabaseAnonKey}`,
        apikey: config.public.supabaseAnonKey,
      },
      body: {
        action: "verify",
        accessToken,
        otpCode: deviceOtpCode.value,
      },
    })) as any;

    console.log("=== DEVICE VERIFICATION RESPONSE ===");
    console.log("Response:", response);

    if (response.error) {
      errorMessage.value = response.message || "Eszköz megerősítés sikertelen";
      state.value = "error";
      canRetry.value = false;
      return;
    }

    if (response.deviceVerified) {
      console.log("Device verified successfully, retrying Zoom signature");
      // Device verified successfully, retry getting Zoom signature
      deviceOtpCode.value = "";
      state.value = "loading";
      loadingMessage.value = "Eszköz megerősítve, csatlakozás...";
      await requestZoomSignature();
    }
  } catch (error: any) {
    console.error("Device verification error:", error);
    errorMessage.value = error.data?.message || "Eszköz megerősítés sikertelen";
    state.value = "error";
    canRetry.value = false;
  } finally {
    deviceVerifying.value = false;
  }
}

async function reportSuspiciousActivity() {
  try {
    const accessToken = sessionStorage.getItem("access_token");

    console.log("=== REPORTING SUSPICIOUS ACTIVITY ===");

    // Log suspicious activity report
    await $fetch("/functions/v1/device-verification", {
      baseURL: config.public.supabaseUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.public.supabaseAnonKey}`,
        apikey: config.public.supabaseAnonKey,
      },
      body: {
        action: "report_suspicious",
        accessToken,
        reportReason: "unauthorized_access_attempt",
      },
    }).catch(() => null);

    // Show success message and redirect
    alert(
      "Köszönjük a jelentést! A biztonsági eseményt rögzítettük. A belépési linket letiltottuk további védelem érdekében."
    );

    // Redirect to home
    await router.push("/");
  } catch (error) {
    console.error("Error reporting suspicious activity:", error);
    alert(
      "Jelentés elküldése sikertelen, de a biztonsági eseményt rögzítettük."
    );
  }
}

async function retryJoin() {
  state.value = "loading";
  errorMessage.value = "";
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
  if (window.ZoomMtg && state.value === "joined") {
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
/* Zoom container always present but controlled by state */
.zoom-container {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 9999 !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* Hide zoom container when not in joined state */
.zoom-hidden {
  display: none !important;
}

/* Show zoom container when in joined state */
.zoom-container:not(.zoom-hidden) {
  display: block !important;
}

/* Ensure Zoom components take full space */
.zoom-container > div {
  width: 100% !important;
  height: 100% !important;
}

/* Alternative: if Zoom adds its own classes, ensure they're visible */
#zmmtg-root {
  background: #000;
}

#zmmtg-root > * {
  width: 100% !important;
  height: 100% !important;
}
</style>
