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
    // Initialize Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Initialize Supabase client for user context
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    // Get the current user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const email = user.email!;

    // Get the invitee
    const { data: invitee, error: inviteeError } = await supabaseAdmin
      .from("invitees")
      .select("id")
      .eq("email", email)
      .single();

    if (inviteeError || !invitee) {
      return new Response(
        JSON.stringify({ error: "forbidden", reason: "not_invited" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body for optional session ID
    const { sessionId } = await req.json().catch(() => ({}));

    // Build query for active session
    let sessionQuery = supabaseAdmin
      .from("sessions")
      .select("id, last_heartbeat_at")
      .eq("invitee_id", invitee.id)
      .eq("active", true);

    // If sessionId is provided, filter by it
    if (sessionId) {
      sessionQuery = sessionQuery.eq("id", sessionId);
    }

    // Get the most recent active session
    const { data: sessions } = await sessionQuery
      .order("created_at", { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({
          error: "no_active_session",
          message: "Nincs aktív munkamenet"
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const session = sessions[0];
    const now = new Date().toISOString();

    // Check if heartbeat is stale (more than 60 seconds old)
    const lastHeartbeat = new Date(session.last_heartbeat_at);
    const heartbeatAge = Date.now() - lastHeartbeat.getTime();

    if (heartbeatAge > 60000) {
      // Session is stale, deactivate it
      await supabaseAdmin
        .from("sessions")
        .update({ active: false })
        .eq("id", session.id);

      return new Response(
        JSON.stringify({
          error: "session_expired",
          message: "A munkamenet lejárt"
        }),
        {
          status: 410, // Gone
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update heartbeat timestamp
    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({ last_heartbeat_at: now })
      .eq("id", session.id);

    if (updateError) {
      console.error("Failed to update heartbeat:", updateError);
      return new Response(
        JSON.stringify({
          error: "update_failed",
          message: "Nem sikerült frissíteni a munkamenetet"
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update invitee's last_seen_at
    await supabaseAdmin
      .from("invitees")
      .update({ last_seen_at: now })
      .eq("id", invitee.id);

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session.id,
        lastHeartbeat: now,
        heartbeatInterval: 15000, // Suggest 15 second intervals
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error in presence-heartbeat:", error);

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