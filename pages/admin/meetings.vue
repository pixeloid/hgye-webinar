<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <div class="bg-white shadow">
      <div class="px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">Meeting Kezelés</h1>
            <div class="flex space-x-3">
              <NuxtLink to="/admin" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
                ← Vissza
              </NuxtLink>
              <button @click="showNewMeetingModal = true" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                + Új Meeting
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="px-4 sm:px-6 lg:px-8 py-8">
      <!-- Meetings List -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-4 py-5 sm:p-6">
          <h2 class="text-lg font-medium text-gray-900 mb-4">Meetingek</h2>

          <div v-if="loading" class="text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p class="mt-2 text-gray-500">Betöltés...</p>
          </div>

          <div v-else-if="meetings.length === 0" class="text-center py-8">
            <p class="text-gray-500">Még nincs meeting létrehozva.</p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cím
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meeting ID
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Időpont
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hossz
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Max létszám
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Státusz
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meghívottak
                  </th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Műveletek
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="meeting in meetings" :key="meeting.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div class="text-sm font-medium text-gray-900">{{ meeting.title }}</div>
                      <div class="text-sm text-gray-500">{{ meeting.description }}</div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ meeting.meeting_number }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ formatDate(meeting.start_time) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ meeting.duration }} perc
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ meeting.max_participants }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="statusBadgeClass(meeting.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                      {{ statusText(meeting.status) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ meeting.invitee_count || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      @click="manageMeetingInvites(meeting)"
                      class="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Meghívók
                    </button>
                    <button
                      @click="editMeeting(meeting)"
                      class="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      Szerkeszt
                    </button>
                    <button
                      @click="deleteMeeting(meeting)"
                      class="text-red-600 hover:text-red-900"
                    >
                      Töröl
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- New/Edit Meeting Modal -->
    <div v-if="showNewMeetingModal" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 transition-opacity" @click="closeMeetingModal">
          <div class="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form @submit.prevent="saveMeeting">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 class="text-lg font-medium text-gray-900 mb-4">
                {{ editingMeeting ? 'Meeting Szerkesztése' : 'Új Meeting' }}
              </h3>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Cím</label>
                  <input
                    v-model="meetingForm.title"
                    type="text"
                    required
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Leírás</label>
                  <textarea
                    v-model="meetingForm.description"
                    rows="3"
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  ></textarea>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Meeting ID</label>
                  <input
                    v-model="meetingForm.meeting_number"
                    type="text"
                    required
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Jelszó (opcionális)</label>
                  <input
                    v-model="meetingForm.passcode"
                    type="text"
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Kezdés időpontja</label>
                  <input
                    v-model="meetingForm.start_time"
                    type="datetime-local"
                    required
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Hossz (perc)</label>
                  <input
                    v-model.number="meetingForm.duration"
                    type="number"
                    min="1"
                    required
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Max résztvevők száma</label>
                  <input
                    v-model.number="meetingForm.max_participants"
                    type="number"
                    min="1"
                    required
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700">Státusz</label>
                  <select
                    v-model="meetingForm.status"
                    class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="scheduled">Tervezett</option>
                    <option value="active">Aktív</option>
                    <option value="completed">Befejezett</option>
                    <option value="cancelled">Törölve</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                :disabled="savingMeeting"
                class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {{ savingMeeting ? 'Mentés...' : 'Mentés' }}
              </button>
              <button
                type="button"
                @click="closeMeetingModal"
                class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Mégse
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const router = useRouter()

// State
const loading = ref(false)
const meetings = ref<any[]>([])
const showNewMeetingModal = ref(false)
const editingMeeting = ref<any>(null)
const savingMeeting = ref(false)

const meetingForm = ref({
  title: '',
  description: '',
  meeting_number: '',
  passcode: '',
  start_time: '',
  duration: 60,
  max_participants: 200,
  status: 'scheduled'
})

// Load meetings
async function loadMeetings() {
  loading.value = true
  try {
    // Get meetings with invitee count
    const { data: meetingsData, error } = await supabase
      .from('meetings')
      .select(`
        *,
        invitees:invitees(count)
      `)
      .order('start_time', { ascending: false })

    if (error) throw error

    // Process the data to include invitee count
    meetings.value = meetingsData?.map(meeting => ({
      ...meeting,
      invitee_count: meeting.invitees?.[0]?.count || 0
    })) || []

  } catch (error: any) {
    console.error('Error loading meetings:', error)
    alert('Hiba történt a meetingek betöltése során')
  } finally {
    loading.value = false
  }
}

// Save meeting (create or update)
async function saveMeeting() {
  savingMeeting.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const meetingData = {
      ...meetingForm.value,
      created_by: user?.id,
      updated_at: new Date().toISOString()
    }

    if (editingMeeting.value) {
      // Update existing meeting
      const { error } = await supabase
        .from('meetings')
        .update(meetingData)
        .eq('id', editingMeeting.value.id)

      if (error) throw error
    } else {
      // Create new meeting
      const { error } = await supabase
        .from('meetings')
        .insert(meetingData)

      if (error) throw error
    }

    closeMeetingModal()
    await loadMeetings()
  } catch (error: any) {
    console.error('Error saving meeting:', error)
    alert('Hiba történt a meeting mentése során: ' + error.message)
  } finally {
    savingMeeting.value = false
  }
}

// Edit meeting
function editMeeting(meeting: any) {
  editingMeeting.value = meeting
  meetingForm.value = {
    title: meeting.title,
    description: meeting.description || '',
    meeting_number: meeting.meeting_number,
    passcode: meeting.passcode || '',
    start_time: new Date(meeting.start_time).toISOString().slice(0, 16),
    duration: meeting.duration,
    max_participants: meeting.max_participants,
    status: meeting.status
  }
  showNewMeetingModal.value = true
}

// Delete meeting
async function deleteMeeting(meeting: any) {
  if (!confirm(`Biztosan törölni szeretnéd a "${meeting.title}" meetinget?`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meeting.id)

    if (error) throw error

    await loadMeetings()
  } catch (error: any) {
    console.error('Error deleting meeting:', error)
    alert('Hiba történt a meeting törlése során')
  }
}

// Manage meeting invites
function manageMeetingInvites(meeting: any) {
  router.push(`/admin/meetings/${meeting.id}/invites`)
}

// Close modal
function closeMeetingModal() {
  showNewMeetingModal.value = false
  editingMeeting.value = null
  meetingForm.value = {
    title: '',
    description: '',
    meeting_number: '',
    passcode: '',
    start_time: '',
    duration: 60,
    max_participants: 200,
    status: 'scheduled'
  }
}

// Helper functions
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('hu-HU')
}

function statusText(status: string) {
  const statusMap: Record<string, string> = {
    scheduled: 'Tervezett',
    active: 'Aktív',
    completed: 'Befejezett',
    cancelled: 'Törölve'
  }
  return statusMap[status] || status
}

function statusBadgeClass(status: string) {
  const classMap: Record<string, string> = {
    scheduled: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800'
  }
  return classMap[status] || 'bg-gray-100 text-gray-800'
}

// Check auth on mount
onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = sessionStorage.getItem('is_admin') === 'true'

  if (!user || !isAdmin) {
    await router.push('/admin-login')
    return
  }

  await loadMeetings()
})
</script>