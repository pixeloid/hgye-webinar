// Script to add a test user to Supabase Auth
// Run with: node add-test-user.js

import { createClient } from '@supabase/supabase-js';

// Use the service role key for admin operations
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  console.log('🔑 Creating test user...\n');

  try {
    // Create user in Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'test@example.com',
      password: 'test123456',
      email_confirm: true // Auto-confirm email
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log('✅ User already exists: test@example.com');
      } else {
        throw authError;
      }
    } else {
      console.log('✅ User created: test@example.com');
    }

    // Check if invitee record exists
    const { data: invitee, error: inviteeError } = await supabase
      .from('invitees')
      .select('*')
      .eq('email', 'test@example.com')
      .single();

    if (invitee) {
      console.log('✅ Invitee record already exists');
    } else {
      // Create invitee record if it doesn't exist
      const { error: insertError } = await supabase
        .from('invitees')
        .insert({
          email: 'test@example.com',
          full_name: 'Test User',
          webinar_id: '12345678',
          status: 'invited'
        });

      if (insertError && !insertError.message.includes('duplicate')) {
        console.error('Error creating invitee:', insertError);
      } else {
        console.log('✅ Invitee record created');
      }
    }

    console.log('\n📧 Test user credentials:');
    console.log('   Email: test@example.com');
    console.log('   Password: test123456');
    console.log('\n🔗 Login URL: http://localhost:3001/login');
    console.log('\n📌 Note: Since we\'re using local development,');
    console.log('   you can login directly with these credentials.');
    console.log('   No actual email will be sent.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createTestUser();