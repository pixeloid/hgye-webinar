import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { action, email, otpCode } = await req.json();

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    if (action === "send") {
      // Check if user exists in invitees table
      const { data: invitee, error: inviteeError } = await supabaseAdmin
        .from("invitees")
        .select("id, email, status")
        .eq("email", email)
        .single();

      if (inviteeError || !invitee) {
        return new Response(
          JSON.stringify({
            error: "not_invited",
            message: "Ez az email cím nincs meghívva a webináriumra"
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      if (invitee.status === 'blocked') {
        return new Response(
          JSON.stringify({
            error: "blocked",
            message: "Ez a fiók le van tiltva"
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Clean up old OTP codes for this email
      await supabaseAdmin
        .from('otp_codes')
        .delete()
        .eq('email', email);

      // Generate and store OTP in database
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await supabaseAdmin
        .from('otp_codes')
        .insert({
          email,
          code: otp,
          expires_at: expiresAt.toISOString()
        });

      // Send OTP email via SendGrid
      try {
        const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
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

        if (!emailResponse.ok) {
          throw new Error('Email sending failed');
        }

        // Log OTP send event
        await supabaseAdmin.from("access_logs").insert({
          event_type: "otp_sent",
          meta: { email, masked: email.replace(/^(.{2}).*@/, "$1***@") },
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "OTP kód elküldve az e-mail címedre",
            // In development, also return OTP for testing
            ...(Deno.env.get("NODE_ENV") === "development" && { debug_otp: otp })
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (emailError: any) {
        console.error('OTP email sending error:', emailError);

        // In development, still return success with debug OTP
        if (Deno.env.get("NODE_ENV") === "development") {
          return new Response(
            JSON.stringify({
              success: true,
              message: "OTP kód elküldve (fejlesztői mód)",
              debug_otp: otp
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(
          JSON.stringify({
            error: "email_failed",
            message: "Nem sikerült elküldeni az email-t"
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

    } else if (action === "verify") {
      // Verify OTP code from database
      const { data: otpRecord, error: otpError } = await supabaseAdmin
        .from('otp_codes')
        .select('*')
        .eq('email', email)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otpError || !otpRecord) {
        return new Response(
          JSON.stringify({
            error: "no_otp",
            message: "Nincs érvényes OTP kód ehhez az email címhez"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Verify code
      if (otpRecord.code !== otpCode) {
        // Log failed attempt
        await supabaseAdmin.from("access_logs").insert({
          event_type: "otp_failed",
          meta: { email },
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

      // OTP is valid, mark as used
      await supabaseAdmin
        .from('otp_codes')
        .update({ used: true })
        .eq('id', otpRecord.id);

      // Get invitee
      const { data: invitee } = await supabaseAdmin
        .from("invitees")
        .select("*")
        .eq("email", email)
        .single();

      // Create or get user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: invitee?.full_name || '',
          webinar_id: invitee?.webinar_id || ''
        }
      });

      // Generate a session token (simplified - in production use proper JWT)
      const sessionToken = crypto.randomUUID();

      // Store session
      await supabaseAdmin.from("sessions").insert({
        invitee_id: invitee?.id,
        active: true,
        last_heartbeat_at: new Date().toISOString(),
      });

      // Log successful verification
      await supabaseAdmin.from("access_logs").insert({
        event_type: "otp_verified",
        meta: { email },
      });

      // Update invitee status
      if (invitee) {
        await supabaseAdmin
          .from("invitees")
          .update({
            status: 'claimed',
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", invitee.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Sikeres belépés",
          sessionToken,
          email,
          user: {
            email,
            full_name: invitee?.full_name || email
          }
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
    console.error("Error in auth-otp:", error);

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