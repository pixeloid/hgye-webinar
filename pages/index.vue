<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Webinárium Platform</h1>
      <p class="text-gray-600 mb-8">Biztonságos belépés Zoom webináriumokhoz</p>

      <div class="space-y-4">
        <NuxtLink
          to="/login"
          class="block bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition"
        >
          Bejelentkezés
        </NuxtLink>

        <NuxtLink
          to="/admin"
          class="block bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition"
        >
          Admin Panel
        </NuxtLink>
      </div>

      <div class="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
        <h3 class="font-semibold mb-2">Teszt belépés:</h3>
        <p>Email: test@example.com</p>
        <p>Jelszó: test123456</p>
      </div>
    </div>
  </div>
</template>