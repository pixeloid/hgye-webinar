// Test invitation functionality
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://localhost:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function testInvitation() {
  console.log('🔥 Testing invitation system...\n');

  try {
    // First login as test user to get session token
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test123456'
    });

    if (loginError) {
      console.error('❌ Login failed:', loginError.message);
      return;
    }

    console.log('✅ Logged in successfully');
    const accessToken = loginData.session.access_token;

    // Test single invitation
    console.log('\n📧 Testing single invitation...');

    const inviteResponse = await fetch(`${SUPABASE_URL}/functions/v1/invite-participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        invitees: [
          {
            email: 'testuser@example.com',
            fullName: 'Test User'
          }
        ]
      })
    });

    const inviteResult = await inviteResponse.json();
    console.log('Invitation result:', JSON.stringify(inviteResult, null, 2));

    if (inviteResult.success) {
      console.log('✅ Invitation sent successfully!');
      console.log(`📊 Results: Created: ${inviteResult.results.created}, Invited: ${inviteResult.results.invited}`);
    } else {
      console.log('❌ Invitation failed:', inviteResult.message);
    }

    // Check Inbucket for the email
    console.log('\n📬 Check Inbucket for emails: http://127.0.0.1:54324');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testInvitation();