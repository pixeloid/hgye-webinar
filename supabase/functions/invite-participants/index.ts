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

        // Create user in Supabase Auth (without sending email)
        try {
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true, // Auto-confirm email to skip verification
            user_metadata: {
              full_name: fullName || '',
              webinar_id: meetingNumber
            }
          });

          if (authError) {
            console.error(`Auth user creation error for ${email}:`, authError);
            results.errors.push(`Failed to create user ${email}: ${authError.message}`);

            // Log the failed user creation
            await supabaseAdmin.from("access_logs").insert({
              invitee_id: newInvitee.id,
              event_type: "user_creation_failed",
              meta: {
                error: authError.message,
                email,
                admin_user: user.email
              },
            });
            continue;
          }

          // Send invitation email via SendGrid
          try {
            const loginUrl = `${Deno.env.get("SITE_URL") || "http://localhost:3001"}/login?email=${encodeURIComponent(email)}`;

            const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Authorization': req.headers.get("Authorization")!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'invitation',
                to: email,
                templateData: {
                  inviteeName: fullName,
                  loginUrl,
                  meetingDate: null, // Can be set later
                  meetingTime: null  // Can be set later
                }
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              throw new Error(`Email sending failed: ${errorText}`);
            }

            const emailResult = await emailResponse.json();

            results.invited++;
            results.details.push({
              email,
              status: 'invited',
              message: 'User created and invitation email sent successfully',
              messageId: emailResult.messageId
            });

            // Log successful invitation
            await supabaseAdmin.from("access_logs").insert({
              invitee_id: newInvitee.id,
              event_type: "invitation_sent",
              meta: {
                email,
                full_name: fullName,
                admin_user: user.email,
                sendgrid_message_id: emailResult.messageId,
                login_url: loginUrl
              },
            });

          } catch (emailError: any) {
            console.error(`Email sending error for ${email}:`, emailError);
            results.errors.push(`User created but email failed for ${email}: ${emailError.message}`);

            // Log the failed email attempt
            await supabaseAdmin.from("access_logs").insert({
              invitee_id: newInvitee.id,
              event_type: "email_failed",
              meta: {
                error: emailError.message,
                email,
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