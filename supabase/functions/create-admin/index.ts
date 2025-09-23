import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Parse request body
    const { email, password, fullName } = await req.json();

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "missing_fields",
          message: "Email és jelszó kötelező"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if this is the first admin (allow creation without auth)
    const { count: adminCount } = await supabaseAdmin
      .from("user_profiles")
      .select("*", { count: 'exact', head: true })
      .eq("role", "admin");

    // If there are already admins, require authentication
    if (adminCount && adminCount > 0) {
      // Check if current user is admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({
            error: "unauthorized",
            message: "Csak admin hozhat létre új admin felhasználót"
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Verify the requesting user is an admin
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
        authHeader.replace("Bearer ", "")
      );

      if (userError || !user) {
        return new Response(
          JSON.stringify({
            error: "unauthorized",
            message: "Érvénytelen token"
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check if requesting user is admin
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "forbidden",
            message: "Nincs jogosultságod admin létrehozására"
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Create admin user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || 'Administrator',
        role: 'admin'
      }
    });

    if (authError) {
      return new Response(
        JSON.stringify({
          error: "creation_failed",
          message: authError.message
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update user profile to admin role (trigger may have created it as viewer)
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
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
      console.error("Failed to update user profile:", profileError);
    }

    // Log admin creation
    await supabaseAdmin.from("access_logs").insert({
      event_type: "admin_created",
      meta: {
        admin_email: email,
        created_by: req.headers.get("Authorization") ? "existing_admin" : "initial_setup"
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Admin felhasználó sikeresen létrehozva",
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role: 'admin'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error in create-admin:", error);

    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Belső hiba történt"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});