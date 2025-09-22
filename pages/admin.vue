<template>
  <div class="min-h-screen bg-gray-100 p-6">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-800 mb-8">Admin Panel - Résztvevők kezelése</h1>

      <!-- Statistics -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-2xl font-bold text-blue-600">{{ stats.total }}</div>
          <div class="text-sm text-gray-600">Összes meghívott</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-2xl font-bold text-green-600">{{ stats.joined }}</div>
          <div class="text-sm text-gray-600">Csatlakozott</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-2xl font-bold text-yellow-600">{{ stats.invited }}</div>
          <div class="text-sm text-gray-600">Meghívva</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-2xl font-bold text-red-600">{{ stats.blocked }}</div>
          <div class="text-sm text-gray-600">Letiltva</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="bg-white rounded-lg shadow mb-6">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex">
            <button
              @click="activeTab = 'invite'"
              :class="activeTab === 'invite' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
              class="py-4 px-6 border-b-2 font-medium text-sm"
            >
              Meghívás
            </button>
            <button
              @click="activeTab = 'manage'"
              :class="activeTab === 'manage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
              class="py-4 px-6 border-b-2 font-medium text-sm"
            >
              Résztvevők kezelése
            </button>
            <button
              @click="activeTab = 'sessions'"
              :class="activeTab === 'sessions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
              class="py-4 px-6 border-b-2 font-medium text-sm"
            >
              Aktív munkamenetek
            </button>
          </nav>
        </div>

        <!-- Invite Tab -->
        <div v-if="activeTab === 'invite'" class="p-6">
          <h2 class="text-xl font-semibold mb-6">Résztvevők meghívása</h2>

          <!-- Single invite -->
          <div class="mb-8">
            <h3 class="text-lg font-medium mb-4">Egyéni meghívás</h3>
            <form @submit.prevent="inviteSingle" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">E-mail cím</label>
                  <input
                    v-model="singleInvite.email"
                    type="email"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="pelda@email.com"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Teljes név</label>
                  <input
                    v-model="singleInvite.fullName"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Példa Péter"
                  >
                </div>
              </div>
              <button
                type="submit"
                :disabled="loading || !singleInvite.email"
                class="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {{ loading ? 'Meghívás...' : 'Meghívás küldése' }}
              </button>
            </form>
          </div>

          <!-- CSV Upload -->
          <div class="border-t pt-8">
            <h3 class="text-lg font-medium mb-4">Tömeges meghívás (CSV)</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">CSV fájl feltöltése</label>
                <input
                  @change="handleFileUpload"
                  type="file"
                  accept=".csv"
                  class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                >
                <p class="text-sm text-gray-500 mt-2">
                  CSV formátum: email,full_name (fejléc nélkül)
                </p>
              </div>

              <!-- CSV Preview -->
              <div v-if="csvData.length > 0" class="mt-4">
                <h4 class="font-medium mb-2">Előnézet (első 5 sor):</h4>
                <div class="bg-gray-50 rounded p-4 text-sm">
                  <div v-for="(row, index) in csvData.slice(0, 5)" :key="index" class="mb-1">
                    <span class="font-medium">{{ row.email }}</span>
                    <span v-if="row.fullName" class="text-gray-600"> - {{ row.fullName }}</span>
                  </div>
                  <div v-if="csvData.length > 5" class="text-gray-500 mt-2">
                    ...és még {{ csvData.length - 5 }} sor
                  </div>
                </div>
                <button
                  @click="inviteBulk"
                  :disabled="loading"
                  class="mt-4 bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {{ loading ? 'Meghívások küldése...' : `${csvData.length} meghívás küldése` }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Manage Tab -->
        <div v-if="activeTab === 'manage'" class="p-6">
          <h2 class="text-xl font-semibold mb-6">Résztvevők kezelése</h2>

          <!-- Filters -->
          <div class="mb-4 flex gap-4">
            <select v-model="filter" class="px-3 py-2 border border-gray-300 rounded-md">
              <option value="">Összes státusz</option>
              <option value="invited">Meghívva</option>
              <option value="joined">Csatlakozott</option>
              <option value="completed">Befejezett</option>
              <option value="blocked">Letiltva</option>
            </select>
            <button
              @click="loadInvitees"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Frissítés
            </button>
          </div>

          <!-- Invitees Table -->
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Résztvevő
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Státusz
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utolsó aktivitás
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Műveletek
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="invitee in filteredInvitees" :key="invitee.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div class="text-sm font-medium text-gray-900">
                        {{ invitee.full_name || 'Nincs név' }}
                      </div>
                      <div class="text-sm text-gray-500">{{ invitee.email }}</div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getStatusColor(invitee.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                      {{ getStatusText(invitee.status) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(invitee.last_seen_at || invitee.created_at) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      v-if="invitee.status !== 'blocked'"
                      @click="blockInvitee(invitee.id)"
                      class="text-red-600 hover:text-red-900 mr-4"
                    >
                      Letiltás
                    </button>
                    <button
                      v-if="invitee.status === 'blocked'"
                      @click="unblockInvitee(invitee.id)"
                      class="text-green-600 hover:text-green-900 mr-4"
                    >
                      Feloldás
                    </button>
                    <button
                      @click="resendInvite(invitee.email)"
                      class="text-blue-600 hover:text-blue-900"
                    >
                      Újraküldés
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sessions Tab -->
        <div v-if="activeTab === 'sessions'" class="p-6">
          <h2 class="text-xl font-semibold mb-6">Aktív munkamenetek</h2>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Felhasználó
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP cím
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utolsó heartbeat
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Műveletek
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="session in activeSessions" :key="session.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">
                      {{ session.invitee?.full_name || 'Nincs név' }}
                    </div>
                    <div class="text-sm text-gray-500">{{ session.invitee?.email }}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ session.ip }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(session.last_heartbeat_at) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      @click="kickSession(session.id)"
                      class="text-red-600 hover:text-red-900"
                    >
                      Kizárás
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Success/Error Messages -->
      <div v-if="message" :class="messageType === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'" class="border px-4 py-3 rounded mb-4">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { createClient } from '@supabase/supabase-js';

const supabase = useSupabaseClient();

// State
const activeTab = ref('invite');
const loading = ref(false);
const message = ref('');
const messageType = ref<'success' | 'error'>('success');

// Single invite
const singleInvite = ref({
  email: '',
  fullName: ''
});

// CSV data
const csvData = ref<Array<{ email: string; fullName?: string }>>([]);

// Invitees data
const invitees = ref<any[]>([]);
const filter = ref('');
const activeSessions = ref<any[]>([]);

// Stats
const stats = computed(() => ({
  total: invitees.value.length,
  invited: invitees.value.filter(i => i.status === 'invited').length,
  joined: invitees.value.filter(i => i.status === 'joined').length,
  blocked: invitees.value.filter(i => i.status === 'blocked').length,
}));

const filteredInvitees = computed(() => {
  if (!filter.value) return invitees.value;
  return invitees.value.filter(i => i.status === filter.value);
});

// Functions
async function inviteSingle() {
  if (!singleInvite.value.email) return;

  loading.value = true;
  try {
    const session = await supabase.auth.getSession();
    if (!session.data.session?.access_token) {
      throw new Error('Nincs érvényes bejelentkezés');
    }

    const response = await $fetch('/functions/v1/invite-participants', {
      baseURL: useRuntimeConfig().public.supabaseUrl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.data.session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': useRuntimeConfig().public.supabaseAnonKey,
      },
      body: {
        invitees: [singleInvite.value]
      }
    });

    if (response.error) {
      throw new Error(response.message);
    }

    showMessage(`Meghívás elküldve: ${singleInvite.value.email}`, 'success');
    singleInvite.value = { email: '', fullName: '' };
    await loadInvitees();
  } catch (error: any) {
    showMessage(`Hiba: ${error.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const lines = text.split('\n').filter(line => line.trim());

    csvData.value = lines.map(line => {
      const [email, fullName] = line.split(',').map(s => s.trim());
      return { email, fullName: fullName || undefined };
    }).filter(row => row.email && row.email.includes('@'));
  };
  reader.readAsText(file);
}

async function inviteBulk() {
  if (csvData.value.length === 0) return;

  loading.value = true;
  try {
    const session = await supabase.auth.getSession();
    if (!session.data.session?.access_token) {
      throw new Error('Nincs érvényes bejelentkezés');
    }

    const response = await $fetch('/functions/v1/invite-participants', {
      baseURL: useRuntimeConfig().public.supabaseUrl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.data.session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': useRuntimeConfig().public.supabaseAnonKey,
      },
      body: {
        invitees: csvData.value
      }
    });

    if (response.error) {
      throw new Error(response.message);
    }

    showMessage(`${csvData.value.length} meghívás elküldve`, 'success');
    csvData.value = [];
    await loadInvitees();
  } catch (error: any) {
    showMessage(`Hiba: ${error.message}`, 'error');
  } finally {
    loading.value = false;
  }
}

async function loadInvitees() {
  try {
    // Use service role to bypass RLS for admin functions
    const serviceSupabase = createClient(
      useRuntimeConfig().public.supabaseUrl,
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      { auth: { persistSession: false } }
    );

    const { data } = await serviceSupabase
      .from('invitees')
      .select('*')
      .order('created_at', { ascending: false });

    invitees.value = data || [];
  } catch (error) {
    console.error('Error loading invitees:', error);
  }
}

async function loadActiveSessions() {
  try {
    const since = new Date(Date.now() - 60000).toISOString(); // Last 1 minute
    const { data } = await supabase
      .from('sessions')
      .select(`
        *,
        invitee:invitees(email, full_name)
      `)
      .eq('active', true)
      .gte('last_heartbeat_at', since)
      .order('last_heartbeat_at', { ascending: false });

    activeSessions.value = data || [];
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

async function blockInvitee(id: string) {
  await updateInviteeStatus(id, 'blocked');
}

async function unblockInvitee(id: string) {
  await updateInviteeStatus(id, 'invited');
}

async function updateInviteeStatus(id: string, status: string) {
  try {
    const { error } = await supabase
      .from('invitees')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    showMessage(`Státusz frissítve: ${status}`, 'success');
    await loadInvitees();
  } catch (error: any) {
    showMessage(`Hiba: ${error.message}`, 'error');
  }
}

async function resendInvite(email: string) {
  // TODO: Implement resend functionality
  showMessage('Újraküldés funkció fejlesztés alatt', 'error');
}

async function kickSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from('sessions')
      .update({ active: false })
      .eq('id', sessionId);

    if (error) throw error;

    showMessage('Munkamenet leállítva', 'success');
    await loadActiveSessions();
  } catch (error: any) {
    showMessage(`Hiba: ${error.message}`, 'error');
  }
}

function showMessage(text: string, type: 'success' | 'error') {
  message.value = text;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

function getStatusColor(status: string) {
  const colors = {
    invited: 'bg-blue-100 text-blue-800',
    joined: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    blocked: 'bg-red-100 text-red-800'
  };
  return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
}

function getStatusText(status: string) {
  const texts = {
    invited: 'Meghívva',
    joined: 'Csatlakozott',
    completed: 'Befejezett',
    blocked: 'Letiltva'
  };
  return texts[status as keyof typeof texts] || status;
}

function formatDate(dateString: string) {
  if (!dateString) return 'Soha';
  return new Date(dateString).toLocaleString('hu-HU');
}

// Lifecycle
onMounted(async () => {
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await navigateTo('/login');
    return;
  }

  loadInvitees();
  loadActiveSessions();

  // Auto-refresh sessions every 30 seconds
  setInterval(loadActiveSessions, 30000);
});
</script>