import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Store OTP codes in memory (in production, use Redis or database)
const otpStore = new Map<string, { code: string; expires: number; deviceHash: string }>();

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase clients
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

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
      .select("*")
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

    // Parse request body
    const { action, otpCode, deviceHash } = await req.json();

    if (action === "request") {
      // Check if there's an active session on another device
      const since = new Date(Date.now() - 30_000).toISOString();
      const { data: activeSessions } = await supabaseAdmin
        .from("sessions")
        .select("id, device_hash")
        .eq("invitee_id", invitee.id)
        .eq("active", true)
        .gte("last_heartbeat_at", since);

      if (!activeSessions || activeSessions.length === 0) {
        return new Response(
          JSON.stringify({
            error: "no_active_session",
            message: "Nincs aktív munkamenet másik eszközön"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check if it's a different device
      const differentDevice = !activeSessions.some(s => s.device_hash === deviceHash);
      if (!differentDevice) {
        return new Response(
          JSON.stringify({
            error: "same_device",
            message: "Ugyanarról az eszközről próbálsz belépni"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Generate and store OTP
      const otp = generateOTP();
      const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
      otpStore.set(email, { code: otp, expires, deviceHash });

      // Log OTP send event
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "otp_sent",
        meta: { deviceHash, maskedEmail: email.replace(/^(.{2}).*@/, "$1***@") },
      });

      // Send OTP email via SendGrid
      try {
        const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get("Authorization")!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'otp',
            to: email,
            templateData: {
              otpCode: otp,
              expiryMinutes: 10
            }
          }),
        });

        let emailResult = null;
        let debugOtp = null;

        if (!emailResponse.ok) {
          console.error(`Email sending failed for ${email}: ${await emailResponse.text()}`);
          // In development, still provide debug OTP if email fails
          debugOtp = Deno.env.get("NODE_ENV") === "development" ? otp : null;
        } else {
          emailResult = await emailResponse.json();
          // In development, provide debug OTP
          debugOtp = Deno.env.get("NODE_ENV") === "development" ? otp : null;
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "OTP kód elküldve az e-mail címedre",
            messageId: emailResult?.messageId,
            // Only include in development
            ...(debugOtp && { debug_otp: debugOtp }),
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (emailError: any) {
        console.error(`OTP email sending error for ${email}:`, emailError);

        // Still return success but log the email failure
        await supabaseAdmin.from("access_logs").insert({
          invitee_id: invitee.id,
          event_type: "otp_email_failed",
          meta: {
            deviceHash,
            maskedEmail: email.replace(/^(.{2}).*@/, "$1***@"),
            error: emailError.message
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "OTP kód elküldve az e-mail címedre",
            // In development, provide OTP even if email fails
            ...(Deno.env.get("NODE_ENV") === "development" && { debug_otp: otp }),
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

    } else if (action === "verify") {
      // Verify OTP and transfer session
      const stored = otpStore.get(email);

      if (!stored) {
        return new Response(
          JSON.stringify({
            error: "no_otp",
            message: "Nincs érvényes OTP kód"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check expiration
      if (Date.now() > stored.expires) {
        otpStore.delete(email);
        return new Response(
          JSON.stringify({
            error: "otp_expired",
            message: "Az OTP kód lejárt"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Verify OTP code
      if (stored.code !== otpCode) {
        await supabaseAdmin.from("access_logs").insert({
          invitee_id: invitee.id,
          event_type: "otp_failed",
          meta: { deviceHash },
        });

        return new Response(
          JSON.stringify({
            error: "invalid_otp",
            message: "Hibás OTP kód"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // OTP is valid, transfer session
      // Deactivate all existing sessions
      await supabaseAdmin
        .from("sessions")
        .update({ active: false })
        .eq("invitee_id", invitee.id);

      // Create new session for the new device
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

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

      // Update invitee's device hash
      await supabaseAdmin
        .from("invitees")
        .update({
          device_hash: deviceHash,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", invitee.id);

      // Log successful transfer
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "otp_verified",
        meta: {
          session_id: newSession?.id,
          deviceHash,
          ip,
        },
      });

      // Clear the OTP
      otpStore.delete(email);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Munkamenet sikeresen átvéve",
          sessionId: newSession?.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } else {
      return new Response(
        JSON.stringify({
          error: "invalid_action",
          message: "Érvénytelen művelet"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error("Error in otp-transfer:", error);

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