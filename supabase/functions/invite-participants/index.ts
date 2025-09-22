import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteeData {
  email: string;
  fullName?: string;
}

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
        auth: {
          persistSession: false,
        },
      }
    );

    // Initialize user Supabase client for authentication check
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

    // Check if user is authenticated
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

    // TODO: Add admin role check here
    // For now, any authenticated user can invite participants
    // In production, you should check if user has admin role

    // Parse request body
    const { invitees } = await req.json();

    if (!Array.isArray(invitees) || invitees.length === 0) {
      return new Response(
        JSON.stringify({
          error: "invalid_request",
          message: "Invitees array is required and must not be empty"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate invitee data
    for (const invitee of invitees) {
      if (!invitee.email || !invitee.email.includes('@')) {
        return new Response(
          JSON.stringify({
            error: "invalid_email",
            message: `Invalid email address: ${invitee.email}`
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    const results = {
      created: 0,
      invited: 0,
      errors: [] as string[],
      details: [] as any[]
    };

    const meetingNumber = Deno.env.get("ZOOM_MEETING_NUMBER") || "12345678";

    // Process each invitee
    for (const inviteeData of invitees) {
      try {
        const { email, fullName } = inviteeData as InviteeData;

        // Check if invitee already exists
        const { data: existingInvitee } = await supabaseAdmin
          .from("invitees")
          .select("id, email, status")
          .eq("email", email)
          .single();

        if (existingInvitee) {
          results.details.push({
            email,
            status: 'exists',
            message: `User already exists with status: ${existingInvitee.status}`
          });
          continue;
        }

        // Create invitee record
        const { data: newInvitee, error: inviteeError } = await supabaseAdmin
          .from("invitees")
          .insert({
            email,
            full_name: fullName || null,
            webinar_id: meetingNumber,
            status: 'invited'
          })
          .select()
          .single();

        if (inviteeError) {
          console.error(`Error creating invitee ${email}:`, inviteeError);
          results.errors.push(`Failed to create invitee ${email}: ${inviteeError.message}`);
          continue;
        }

        results.created++;

        // Create user in Supabase Auth and send invitation email
        try {
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            {
              redirectTo: `http://localhost:3001/join`,
              data: {
                full_name: fullName || '',
                webinar_id: meetingNumber
              }
            }
          );

          if (authError) {
            console.error(`Auth invitation error for ${email}:`, authError);
            results.errors.push(`Failed to send invitation to ${email}: ${authError.message}`);

            // Log the failed invitation attempt
            await supabaseAdmin.from("access_logs").insert({
              invitee_id: newInvitee.id,
              event_type: "invitation_failed",
              meta: {
                error: authError.message,
                email,
                admin_user: user.email
              },
            });
          } else {
            results.invited++;
            results.details.push({
              email,
              status: 'invited',
              message: 'Invitation sent successfully'
            });

            // Log successful invitation
            await supabaseAdmin.from("access_logs").insert({
              invitee_id: newInvitee.id,
              event_type: "invitation_sent",
              meta: {
                email,
                full_name: fullName,
                admin_user: user.email
              },
            });
          }
        } catch (authErr: any) {
          console.error(`Auth error for ${email}:`, authErr);
          results.errors.push(`Authentication error for ${email}: ${authErr.message}`);
        }

      } catch (error: any) {
        console.error(`Processing error for ${inviteeData.email}:`, error);
        results.errors.push(`Failed to process ${inviteeData.email}: ${error.message}`);
      }
    }

    // Return results
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${invitees.length} invitations. Created: ${results.created}, Invited: ${results.invited}, Errors: ${results.errors.length}`,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error in invite-participants:", error);

    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Belső hiba történt a meghívások feldolgozása során"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});