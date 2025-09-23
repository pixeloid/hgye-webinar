#!/usr/bin/env node

/**
 * Script to create the first admin user
 * Run this after setting up Supabase
 *
 * Usage: node scripts/create-first-admin.js
 */

import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Set it with: export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function createFirstAdmin() {
  console.log('🔧 Admin felhasználó létrehozása\n');

  try {
    // Check if admin already exists
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('role', 'admin');

    if (checkError && !checkError.message.includes('relation "public.user_profiles" does not exist')) {
      console.error('❌ Hiba az adminok ellenőrzésekor:', checkError.message);
      process.exit(1);
    }

    if (existingAdmins && existingAdmins.length > 0) {
      console.log('⚠️  Már léteznek admin felhasználók:');
      existingAdmins.forEach(admin => {
        console.log(`   - ${admin.email}`);
      });

      const proceed = await question('\nBiztosan szeretnél új admint létrehozni? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('❌ Megszakítva');
        process.exit(0);
      }
    }

    // Get admin details
    const email = await question('Admin email címe: ');
    const password = await question('Admin jelszava (min 6 karakter): ');
    const fullName = await question('Admin teljes neve: ');

    if (!email || !password || password.length < 6) {
      console.error('❌ Email és jelszó (min 6 karakter) kötelező!');
      process.exit(1);
    }

    console.log('\n📝 Admin létrehozása...');

    // Create admin user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || 'Administrator',
        role: 'admin'
      }
    });

    if (authError) {
      console.error('❌ Hiba a felhasználó létrehozásakor:', authError.message);
      process.exit(1);
    }

    console.log('✅ Auth felhasználó létrehozva:', authData.user.email);

    // Create or update user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        email: authData.user.email,
        full_name: fullName || 'Administrator',
        role: 'admin',
        is_active: true
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('⚠️  Profil frissítése sikertelen:', profileError.message);
      console.log('   (Lehet, hogy a trigger automatikusan létrehozta)');
    }

    console.log('\n✅ Admin felhasználó sikeresen létrehozva!');
    console.log('📧 Email:', email);
    console.log('🔑 Jelszó: [rejtett]');
    console.log('👤 Név:', fullName || 'Administrator');
    console.log('\n🚀 Most már beléphetsz az admin felületre: /admin-login');

  } catch (error) {
    console.error('❌ Váratlan hiba:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
createFirstAdmin();