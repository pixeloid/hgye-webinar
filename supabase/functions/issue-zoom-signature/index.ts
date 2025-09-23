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
    console.log('Token-based issue-zoom-signature called'); // Debug log
    // Initialize Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Parse request body to get the access token
    const { accessToken, deviceHash, userAgent } = await req.json().catch(() => ({}));
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    console.log('Received data:', { accessToken: accessToken ? 'present' : 'missing', deviceHash, userAgent });

    if (!accessToken) {
      console.log('Missing access token');
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Access token required" }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch invitee record by access token
    console.log('Looking up invitee with token:', accessToken);
    const { data: invitee, error: inviteeError } = await supabaseAdmin
      .from("invitees")
      .select("*")
      .eq("access_token", accessToken)
      .single();

    console.log('Invitee lookup result:', { invitee: invitee ? 'found' : 'not found', error: inviteeError?.message });

    if (inviteeError || !invitee) {
      await supabaseAdmin.from("access_logs").insert({
        event_type: "join_denied",
        meta: { accessToken, reason: "invalid_token", userAgent, deviceHash, ip },
      });

      return new Response(
        JSON.stringify({ error: "forbidden", reason: "invalid_token", message: "Érvénytelen vagy lejárt belépési link" }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if token is expired
    if (invitee.token_expires_at && new Date(invitee.token_expires_at) < new Date()) {
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "join_denied",
        meta: { reason: "token_expired", userAgent, deviceHash, ip },
      });

      return new Response(
        JSON.stringify({ error: "forbidden", reason: "token_expired", message: "A belépési link lejárt" }),
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

    // Check for device binding - new device verification
    const isFirstTime = !invitee.device_hash;
    const isNewDevice = invitee.device_hash && invitee.device_hash !== deviceHash;

    console.log('Device check:', {
      isFirstTime,
      isNewDevice,
      storedHash: invitee.device_hash,
      currentHash: deviceHash
    });

    if (isNewDevice) {
      // This is a new device trying to use the token
      console.log('New device detected, requesting email verification');

      // Generate OTP for device verification
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in otp_codes table
      await supabaseAdmin.from("otp_codes").insert({
        invitee_id: invitee.id,
        email: invitee.email,
        code: otpCode,
        purpose: "device_verification",
        expires_at: expiresAt.toISOString(),
        device_hash: deviceHash,
        ip: ip,
        user_agent: userAgent
      });

      // Send device verification email
      try {
        const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'device_verification',
            to: invitee.email,
            templateData: {
              otpCode,
              deviceInfo: userAgent,
              expiryMinutes: 10
            }
          }),
        });

        if (!emailResponse.ok) {
          console.error('Device verification email sending failed');
        }
      } catch (emailError) {
        console.error('Device verification email error:', emailError);
      }

      // Log device verification request
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "device_verification_requested",
        meta: { deviceHash, ip, userAgent, otpCode: otpCode.substring(0, 2) + "****" },
      });

      return new Response(
        JSON.stringify({
          error: "device_verification_required",
          reason: "new_device",
          message: "Új eszközről történő belépés megerősítése szükséges. Ellenőrizd az email-ed!",
          debugOtp: otpCode // Show OTP for testing since email sending may fail without SendGrid
        }),
        {
          status: 423,
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

    // Update invitee status and device hash
    if (invitee.status === "invited") {
      await supabaseAdmin
        .from("invitees")
        .update({
          status: "joined",
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          device_hash: deviceHash  // Bind token to this device
        })
        .eq("id", invitee.id);
    } else if (isFirstTime) {
      // First time using token but status is not "invited" - still bind device
      await supabaseAdmin
        .from("invitees")
        .update({
          last_seen_at: new Date().toISOString(),
          device_hash: deviceHash  // Bind token to this device
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
    const meetingNumber = String(meetingNumberRaw).replace(/[^\d]/g, ''); // Clean meeting number to digits only
    const zoomPassword = Deno.env.get("ZOOM_PASSWORD") || "";
    const role = 0; // participant (0 for meeting participant)

    const userName = invitee.full_name || invitee.email.split("@")[0];

    console.log('=== ZOOM MEETING DEBUG INFO ===');
    console.log('Meeting Number (raw):', meetingNumberRaw);
    console.log('Meeting Number (cleaned):', meetingNumber);
    console.log('SDK Key:', sdkKey);
    console.log('Password set:', zoomPassword ? 'YES' : 'NO');
    console.log('User Name:', userName);
    console.log('Role:', role, '(0=participant)');

    // JWT signature generation for Zoom Web SDK
    // Based on official Zoom documentation for Meeting SDK
    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours (less than 48 hours max)
    const tokenExp = iat + 1800; // minimum 1800 seconds (30 minutes) ahead of iat

    const header = {
      alg: "HS256",
      typ: "JWT"
    };

    // JWT payload for Zoom Meeting SDK
    const payload = {
      sdkKey: sdkKey,
      mn: meetingNumber,  // meeting number (digits only)
      role: role,         // 0 = participant
      iat: iat,
      exp: exp,
      tokenExp: tokenExp
    };

    console.log('=== JWT GENERATION DEBUG ===');
    console.log('IAT (issued at):', iat, new Date(iat * 1000).toISOString());
    console.log('EXP (expires):', exp, new Date(exp * 1000).toISOString());
    console.log('Token EXP:', tokenExp, new Date(tokenExp * 1000).toISOString());
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

    console.log('=== SIGNATURE GENERATION RESULT ===');
    console.log('Generated signature length:', signature.length);
    console.log('Signature preview:', signature.substring(0, 50) + '...');
    console.log('Full signature:', signature);
    console.log('Meeting credentials to return:');
    console.log('- SDK Key:', sdkKey);
    console.log('- Meeting Number:', meetingNumber);
    console.log('- User Name:', userName);
    console.log('- Password:', zoomPassword || '(empty)');

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
        userEmail: invitee.email,
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