import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailTemplate {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendGridPayload {
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    subject: string;
  }>;
  from: {
    email: string;
    name?: string;
  };
  content: Array<{
    type: string;
    value: string;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
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

    // Get the current user for authentication
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

    const { type, to, templateData } = await req.json();

    // Get SendGrid configuration
    const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "noreply@hgye-webinar.com";
    const fromName = Deno.env.get("FROM_NAME") || "HGYE Webinar";

    if (!sendGridApiKey) {
      throw new Error("SendGrid API key not configured");
    }

    let emailTemplate: EmailTemplate;

    // Generate email based on type
    switch (type) {
      case 'invitation':
        emailTemplate = generateInvitationEmail(to, templateData, fromEmail, fromName);
        break;
      case 'otp':
        emailTemplate = generateOTPEmail(to, templateData, fromEmail, fromName);
        break;
      case 'reminder':
        emailTemplate = generateReminderEmail(to, templateData, fromEmail, fromName);
        break;
      case 'device_verification':
        emailTemplate = generateDeviceVerificationEmail(to, templateData, fromEmail, fromName);
        break;
      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    // Send email via SendGrid
    const result = await sendEmailViaSendGrid(emailTemplate, sendGridApiKey);

    // Log the email sending
    await supabase.from("access_logs").insert({
      event_type: "email_sent",
      meta: {
        type,
        to,
        subject: emailTemplate.subject,
        sendgrid_message_id: result.messageId
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
        message: "Email sent successfully"
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Error sending email:", error);

    return new Response(
      JSON.stringify({
        error: "email_send_failed",
        message: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function generateInvitationEmail(to: string, data: any, fromEmail: string, fromName: string): EmailTemplate {
  const { inviteeName, loginUrl, meetingDate, meetingTime } = data;

  return {
    to,
    from: fromEmail,
    subject: "Tájékoztatás az oltásmegtagadók jogi támadásaival szembeni eljárásrendről - HGYE webinár",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HGYE Webinárium meghívás</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #ffffff; border: 1px solid #ddd; }
          .button { display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          .important { background: #fffbe6; border-left: 4px solid #ffcc00; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>HGYE Webinárium</h1>
          </div>
          <div class="content">
            <h2>Kedves Kolléga!</h2>

            <p>Köszönjük jelentkezését a ma <strong>(2025.09.23.), 18.00 órakor</strong> kezdődő <strong>"Tájékoztatás az oltásmegtagadók jogi támadásaival szembeni eljárásrendről"</strong> című HGYE webinárra, amelynek csatlakozási linkjét alább küldjük.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" class="button">Csatlakozás a webináriumhoz</a>
            </div>

            <div class="important">
              <h3>Fontos tudnivalók a webinárral kapcsolatban:</h3>
              <ul>
                <li>A felületre történő csatlakozáskor/bejelentkezéskor kérjük, a <strong>teljes nevét adja meg</strong>.</li>
                <li>Kérjük, a <strong>mikrofont tartsa kikapcsolva</strong>, végig a webinár alatt.</li>
                <li>Amennyiben kérdése van az elhangzott előadásokkal kapcsolatban, kérjük, hogy a <strong>hgye@hgye.hu</strong> címünkre küldje meg, és eljuttatjuk az előadókhoz megválaszolásra.</li>
              </ul>
            </div>

            <p>Bízunk benne, hogy a webináron elhangzó előadások az Ön számára is hasznos információkat fognak tartalmazni.</p>

            <p><strong>Üdvözlettel,<br>
            HGYE-vezetőség</strong></p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

            <p style="font-size: 12px; color: #666;">
              <strong>Technikai információk:</strong><br>
              • Ez a link csak Önnek szól, ne ossza meg senkivel<br>
              • Egy időben csak egy eszközről lehet bent<br>
              • A link 30 napig érvényes
            </p>
          </div>
          <div class="footer">
            <p>Ez egy automatikusan generált email. Kérjük, ne válaszoljon rá.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Kedves Kolléga!

      Köszönjük jelentkezését a ma (2025.09.23.), 18.00 órakor kezdődő "Tájékoztatás az oltásmegtagadók jogi támadásaival szembeni eljárásrendről" című HGYE webinárra, amelynek csatlakozási linkjét alább küldjük.

      Csatlakozás a webináriumhoz: ${loginUrl}

      Fontos tudnivalók a webinárral kapcsolatban:
      • A felületre történő csatlakozáskor/bejelentkezéskor kérjük, a teljes nevét adja meg.
      • Kérjük, a mikrofont tartsa kikapcsolva, végig a webinár alatt.
      • Amennyiben kérdése van az elhangzott előadásokkal kapcsolatban, kérjük, hogy a hgye@hgye.hu címünkre küldje meg, és eljuttatjuk az előadókhoz megválaszolásra.

      Bízunk benne, hogy a webináron elhangzó előadások az Ön számára is hasznos információkat fognak tartalmazni.

      Üdvözlettel,
      HGYE-vezetőség

      Technikai információk:
      • Ez a link csak Önnek szól, ne ossza meg senkivel
      • Egy időben csak egy eszközről lehet bent
      • A link 30 napig érvényes
    `
  };
}

function generateOTPEmail(to: string, data: any, fromEmail: string, fromName: string): EmailTemplate {
  const { otpCode, expiryMinutes = 10 } = data;

  return {
    to,
    from: fromEmail,
    subject: "OTP kód a munkamenet átvételéhez",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OTP Kód</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .otp-code { background: #FEF3C7; border: 2px solid #F59E0B; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; letter-spacing: 3px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Munkamenet átvétel</h1>
          </div>
          <div class="content">
            <h2>OTP Kód a munkamenet átvételéhez</h2>
            <p>Az alábbi kódot használja a munkamenet átvételéhez:</p>

            <div class="otp-code">${otpCode}</div>

            <p><strong>Fontos információk:</strong></p>
            <ul>
              <li>A kód ${expiryMinutes} percig érvényes</li>
              <li>Csak egyszer használható fel</li>
              <li>Ne ossza meg senkivel</li>
            </ul>

            <p>Ha nem Ön kérte ezt a kódot, kérjük, hagyja figyelmen kívül ezt az emailt.</p>
          </div>
          <div class="footer">
            <p>Ez egy automatikusan generált email. Kérjük, ne válaszoljon rá.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      OTP Kód a munkamenet átvételéhez: ${otpCode}

      A kód ${expiryMinutes} percig érvényes és csak egyszer használható fel.

      Ne ossza meg senkivel!
    `
  };
}

function generateReminderEmail(to: string, data: any, fromEmail: string, fromName: string): EmailTemplate {
  const { inviteeName, loginUrl, minutesBefore } = data;

  return {
    to,
    from: fromEmail,
    subject: "Emlékeztető: Hamarosan kezdődik a webinárium",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Webinárium emlékeztető</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Webinárium emlékeztető</h1>
          </div>
          <div class="content">
            <h2>Kedves ${inviteeName || 'Résztvevő'}!</h2>
            <p>Emlékeztetjük, hogy ${minutesBefore} perc múlva kezdődik a HGYE webinárium!</p>

            <p>Kérjük, csatlakozzon időben:</p>

            <a href="${loginUrl}" class="button">Belépés most</a>

            <p>Várjuk szeretettel!</p>
          </div>
          <div class="footer">
            <p>Ez egy automatikusan generált email. Kérjük, ne válaszoljon rá.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Kedves ${inviteeName || 'Résztvevő'}!

      Emlékeztetjük, hogy ${minutesBefore} perc múlva kezdődik a HGYE webinárium!

      Belépési link: ${loginUrl}

      Várjuk szeretettel!
    `
  };
}

function generateDeviceVerificationEmail(to: string, data: any, fromEmail: string, fromName: string): EmailTemplate {
  const { otpCode, deviceInfo, expiryMinutes = 10 } = data;

  return {
    to,
    from: fromEmail,
    subject: "Új eszközről történő belépés megerősítése - HGYE webinár",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Eszköz megerősítés</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #ffffff; border: 1px solid #ddd; }
          .otp-code { background: #FEF3C7; border: 2px solid #F59E0B; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; letter-spacing: 3px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          .device-info { background: #f8f9fa; border-left: 4px solid #6c757d; padding: 10px; margin: 15px 0; font-size: 12px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Új eszköz megerősítése</h1>
          </div>
          <div class="content">
            <h2>Kedves Kolléga!</h2>

            <p>Új eszközről történő belépést észleltünk a HGYE webinárium belépési linkjénél.</p>

            <div class="warning">
              <strong>Biztonsági figyelmeztetés:</strong> Ha nem Ön próbál belépni, hagyja figyelmen kívül ezt az emailt és ne ossza meg a kódot senkivel.
            </div>

            <p>A belépéshez adja meg az alábbi megerősítő kódot:</p>

            <div class="otp-code">${otpCode}</div>

            <div class="device-info">
              <strong>Eszköz információ:</strong><br>
              ${deviceInfo || 'Ismeretlen eszköz'}
            </div>

            <p><strong>Fontos tudnivalók:</strong></p>
            <ul>
              <li>A kód ${expiryMinutes} percig érvényes</li>
              <li>Sikeres megerősítés után ez az eszköz lesz hozzárendelve a belépési linkhez</li>
              <li>Korábbi eszközök elvesztik a hozzáférést</li>
              <li>Ne ossza meg ezt a kódot senkivel</li>
            </ul>
          </div>
          <div class="footer">
            <p>Ez egy automatikusan generált email. Kérjük, ne válaszoljon rá.</p>
            <p>HGYE webinárium rendszer</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Új eszköz megerősítése - HGYE webinár

      Kedves Kolléga!

      Új eszközről történő belépést észleltünk a HGYE webinárium belépési linkjénél.

      Megerősítő kód: ${otpCode}

      Eszköz információ: ${deviceInfo || 'Ismeretlen eszköz'}

      A kód ${expiryMinutes} percig érvényes.

      BIZTONSÁGI FIGYELMEZTETÉS: Ha nem Ön próbál belépni, hagyja figyelmen kívül ezt az emailt és ne ossza meg a kódot senkivel.

      Sikeres megerősítés után ez az eszköz lesz hozzárendelve a belépési linkhez, korábbi eszközök elvesztik a hozzáférést.
    `
  };
}

async function sendEmailViaSendGrid(email: EmailTemplate, apiKey: string) {
  const payload: SendGridPayload = {
    personalizations: [
      {
        to: [{ email: email.to }],
        subject: email.subject,
      },
    ],
    from: {
      email: email.from,
      name: "HGYE Webinar"
    },
    content: [
      {
        type: "text/plain",
        value: email.text || email.html.replace(/<[^>]*>/g, ''),
      },
      {
        type: "text/html",
        value: email.html,
      },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
  }

  // SendGrid returns the message ID in the X-Message-Id header
  const messageId = response.headers.get("X-Message-Id") || "unknown";

  return {
    messageId,
    statusCode: response.status,
  };
}