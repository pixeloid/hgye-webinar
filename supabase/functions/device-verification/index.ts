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
    const { action, accessToken, otpCode } = await req.json();

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

    if (action === "verify") {
      console.log('Device verification attempt:', { accessToken: accessToken ? 'present' : 'missing', otpCode });

      if (!accessToken || !otpCode) {
        return new Response(
          JSON.stringify({
            error: "missing_data",
            message: "Access token és OTP kód szükséges"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Get invitee by access token
      const { data: invitee, error: inviteeError } = await supabaseAdmin
        .from("invitees")
        .select("*")
        .eq("access_token", accessToken)
        .single();

      if (inviteeError || !invitee) {
        console.log('Invitee not found for token');
        return new Response(
          JSON.stringify({
            error: "invalid_token",
            message: "Érvénytelen access token"
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Find valid OTP code for device verification
      const { data: otpRecord, error: otpError } = await supabaseAdmin
        .from('otp_codes')
        .select('*')
        .eq('invitee_id', invitee.id)
        .eq('purpose', 'device_verification')
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otpError || !otpRecord) {
        console.log('No valid OTP found for device verification');
        return new Response(
          JSON.stringify({
            error: "no_valid_otp",
            message: "Nincs érvényes megerősítő kód, vagy lejárt"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Verify OTP code
      if (otpRecord.code !== otpCode) {
        console.log('Invalid OTP code provided');
        // Log failed attempt
        await supabaseAdmin.from("access_logs").insert({
          invitee_id: invitee.id,
          event_type: "device_verification_failed",
          meta: {
            device_hash: otpRecord.device_hash,
            ip: otpRecord.ip,
            reason: "invalid_code"
          },
        });

        return new Response(
          JSON.stringify({
            error: "invalid_otp",
            message: "Hibás megerősítő kód"
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('OTP verified successfully, updating device binding');

      // OTP is valid - update device binding
      // 1. Mark OTP as used
      await supabaseAdmin
        .from('otp_codes')
        .update({ used: true })
        .eq('id', otpRecord.id);

      // 2. Deactivate all previous sessions for this invitee
      await supabaseAdmin
        .from('sessions')
        .update({ active: false })
        .eq('invitee_id', invitee.id);

      // 3. Update invitee with new device hash
      await supabaseAdmin
        .from("invitees")
        .update({
          device_hash: otpRecord.device_hash,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", invitee.id);

      // 4. Log successful device verification
      await supabaseAdmin.from("access_logs").insert({
        invitee_id: invitee.id,
        event_type: "device_verification_success",
        meta: {
          device_hash: otpRecord.device_hash,
          ip: otpRecord.ip,
          user_agent: otpRecord.user_agent,
          previous_device_hash: invitee.device_hash
        },
      });

      console.log('Device verification completed successfully');

      return new Response(
        JSON.stringify({
          success: true,
          message: "Eszköz sikeresen megerősítve. Most már csatlakozhat.",
          deviceVerified: true
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
    console.error("Error in device-verification:", error);

    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Belső hiba történt az eszköz megerősítése során"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});