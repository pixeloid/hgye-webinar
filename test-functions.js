// Test script for Supabase Edge Functions
// Run with: node test-functions.js

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function testFunction(functionName, payload = {}) {
  console.log(`\n📝 Testing ${functionName}...`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Testing Supabase Edge Functions\n');
  console.log('='.repeat(50));

  // Test 1: issue-zoom-signature without auth (should fail)
  console.log('\n1️⃣ Test issue-zoom-signature WITHOUT auth:');
  await testFunction('issue-zoom-signature', {
    deviceHash: 'test-device-hash-123',
    userAgent: 'Mozilla/5.0 Test Browser',
  });

  // Test 2: presence-heartbeat without auth (should fail)
  console.log('\n2️⃣ Test presence-heartbeat WITHOUT auth:');
  await testFunction('presence-heartbeat', {});

  // Test 3: otp-transfer request without auth (should fail)
  console.log('\n3️⃣ Test otp-transfer WITHOUT auth:');
  await testFunction('otp-transfer', {
    action: 'request',
    deviceHash: 'test-device-hash-456',
  });

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ All tests completed!');
  console.log('\n⚠️  Note: These tests are expected to fail with 401 Unauthorized');
  console.log('   because we\'re not providing a valid user session token.');
  console.log('\n📌 To test with authentication:');
  console.log('   1. Log in via the frontend at http://localhost:3000/login');
  console.log('   2. Get the session token from browser dev tools');
  console.log('   3. Replace the Bearer token in this test script');
}

runTests();