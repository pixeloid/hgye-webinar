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
    // Initialize Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    // Parse request body
    const { deviceHash, userAgent } = await req.json().catch(() => ({}));
    const email = user.email!;
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // Fetch invitee record
    const { data: invitee, error: inviteeError } = await supabaseAdmin
      .from("invitees")
      .select("*")
      .eq("email", email)
      .single();

    if (inviteeError || !invitee) {
      await supabaseAdmin.from("access_logs").insert({
        event_type: "join_denied",
        meta: { email, reason: "not_invited", userAgent, deviceHash, ip },
      });

      return new Response(
        JSON.stringify({ error: "forbidden", reason: "not_invited" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (invitee.status === "blocked") {
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "join_denied",
        meta: { reason: "blocked", userAgent, deviceHash, ip },
      });

      return new Response(
        JSON.stringify({ error: "forbidden", reason: "blocked" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check for active sessions in the last 30 seconds
    const since = new Date(Date.now() - 30_000).toISOString();
    const { data: activeSessions } = await supabaseAdmin
      .from("sessions")
      .select("id, device_hash")
      .eq("invitee_id", invitee.id)
      .eq("active", true)
      .gte("last_heartbeat_at", since);

    if (activeSessions && activeSessions.length > 0) {
      // Check if it's the same device
      const sameDevice = activeSessions.some(s => s.device_hash === deviceHash);

      if (!sameDevice) {
        // Log duplicate attempt from different device
        await supabaseAdmin.from("access_logs").insert({
          invitee_id: invitee.id,
          event_type: "duplicate_attempt",
          meta: { userAgent, deviceHash, ip, existing_sessions: activeSessions.length },
        });

        return new Response(
          JSON.stringify({
            error: "duplicate_session",
            reason: "active_session_exists",
            message: "Már van aktív bejelentkezésed egy másik eszközön"
          }),
          {
            status: 423,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Deactivate all previous sessions
    await supabaseAdmin
      .from("sessions")
      .update({ active: false })
      .eq("invitee_id", invitee.id);

    // Create new session
    const { data: newSession } = await supabaseAdmin
      .from("sessions")
      .insert({
        invitee_id: invitee.id,
        user_agent: userAgent,
        device_hash: deviceHash,
        ip: ip,
        active: true,
        last_heartbeat_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Update invitee status if first join
    if (invitee.status === "invited") {
      await supabaseAdmin
        .from("invitees")
        .update({
          status: "joined",
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          device_hash: deviceHash
        })
        .eq("id", invitee.id);
    } else {
      await supabaseAdmin
        .from("invitees")
        .update({
          last_seen_at: new Date().toISOString()
        })
        .eq("id", invitee.id);
    }

    // Generate Zoom SDK signature
    const sdkKey = Deno.env.get("ZOOM_SDK_KEY")!;
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET")!;
    const meetingNumberRaw = Deno.env.get("ZOOM_MEETING_NUMBER") || Deno.env.get("NUXT_PUBLIC_ZOOM_MEETING_NUMBER")!;
    const meetingNumber = String(meetingNumberRaw).replace(/[^\d]/g, ''); // Clean meeting number
    const zoomPassword = Deno.env.get("ZOOM_PASSWORD") || "";
    const role = 0; // participant

    const userName = invitee.full_name || email.split("@")[0];

    console.log('Generating signature for meeting:', meetingNumber, 'with SDK key:', sdkKey);

    // JWT signature generation for Zoom Web SDK
    // Based on official Zoom documentation
    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours (less than 48 hours)
    const tokenExp = iat + 1800; // minimum 1800 seconds (30 minutes) ahead of iat

    const header = {
      alg: "HS256",
      typ: "JWT"
    };

    const payload = {
      sdkKey: sdkKey,
      mn: meetingNumber,
      role: role,
      iat: iat,
      exp: exp,
      tokenExp: tokenExp
    };

    console.log('JWT Header:', JSON.stringify(header));
    console.log('JWT Payload:', JSON.stringify(payload));

    // Custom base64url encoding for consistency with Zoom's expectations
    function base64urlEncode(str: string): string {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }

    const headerEncoded = base64urlEncode(JSON.stringify(header));
    const payloadEncoded = base64urlEncode(JSON.stringify(payload));
    const data = `${headerEncoded}.${payloadEncoded}`;

    console.log('Unsigned token:', data);

    // Create HMAC signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(sdkSecret);
    const dataToSign = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureArrayBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);
    const signatureArray = new Uint8Array(signatureArrayBuffer);

    // Convert to base64url
    let signatureBase64 = '';
    for (let i = 0; i < signatureArray.length; i++) {
      signatureBase64 += String.fromCharCode(signatureArray[i]);
    }

    const signatureBase64Url = base64urlEncode(signatureBase64);
    const signature = `${data}.${signatureBase64Url}`;

    console.log('Generated signature length:', signature.length);
    console.log('Signature preview:', signature.substring(0, 50) + '...');

    // Log successful signature generation
    await supabaseAdmin.from("access_logs").insert({
      invitee_id: invitee.id,
      event_type: "sdk_issued",
      meta: {
        session_id: newSession?.id,
        meeting_number: meetingNumber,
        deviceHash,
        ip,
        exp: exp
      },
    });

    // Return the signature and details
    return new Response(
      JSON.stringify({
        signature: signature,
        sdkKey: sdkKey,
        meetingNumber: meetingNumber,
        userName: userName,
        userEmail: email,
        passWord: zoomPassword,
        sessionId: newSession?.id,
        message: "Signature sikeresen generálva"
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error in issue-zoom-signature:", error);

    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Belső hiba történt, kérjük próbálja később"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});