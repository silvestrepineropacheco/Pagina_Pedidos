// Envia los avisos por correo de una solicitud usando Resend.
// Si el servicio no esta configurado, los mensajes quedan en "pending_config"
// (nunca se simula un envio exitoso) y se pueden reintentar mas adelante.
//
// Requiere la autenticacion del llamador: las funciones RPC
// claim_email_messages / mark_email_message validan los permisos en la base.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmailMessage = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Falta iniciar sesion para procesar los avisos." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesion invalida." }, 401);
    }

    let requestId: string | undefined;
    try {
      const body = await req.json();
      requestId = body?.request_id;
    } catch {
      return jsonResponse({ error: "Cuerpo de la solicitud invalido." }, 400);
    }
    if (!requestId) {
      return jsonResponse({ error: "Falta el identificador de la solicitud." }, 400);
    }

    // Reclamo atomico: dos reintentos simultaneos no pueden tomar el mismo mensaje.
    const { data: claimed, error: claimError } = await supabase.rpc("claim_email_messages", {
      p_request_id: requestId,
    });
    if (claimError) {
      console.error("claim_email_messages fallo", claimError.message);
      return jsonResponse({ error: claimError.message }, 403);
    }

    const messages = (claimed ?? []) as EmailMessage[];
    if (messages.length === 0) {
      return jsonResponse({ status: "nothing_to_send", claimed: 0, sent: 0, failed: 0 });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM");

    if (!apiKey || !from) {
      const detail = "Pendiente de configuracion: falta cargar RESEND_API_KEY y RESEND_FROM.";
      for (const message of messages) {
        await supabase.rpc("mark_email_message", {
          p_id: message.id,
          p_status: "pending_config",
          p_error: detail,
        });
      }
      console.warn("Resend sin configurar; mensajes marcados como pending_config", messages.length);
      return jsonResponse({
        status: "pending_config",
        claimed: messages.length,
        sent: 0,
        failed: 0,
        detail,
      });
    }

    let sent = 0;
    let failed = 0;

    for (const message of messages) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.recipient_email],
            subject: message.subject,
            text: message.body,
          }),
        });
        const payload = await res.json().catch(() => ({}));

        if (res.ok && payload?.id) {
          await supabase.rpc("mark_email_message", {
            p_id: message.id,
            p_status: "sent",
            p_provider_message_id: String(payload.id),
          });
          sent += 1;
        } else {
          const error = `Resend respondio ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`;
          await supabase.rpc("mark_email_message", {
            p_id: message.id,
            p_status: "failed",
            p_error: error,
          });
          failed += 1;
          console.error("Envio fallido", message.recipient_email, error);
        }
      } catch (sendError) {
        const error = String(sendError).slice(0, 300);
        await supabase.rpc("mark_email_message", {
          p_id: message.id,
          p_status: "failed",
          p_error: error,
        });
        failed += 1;
        console.error("Excepcion al enviar", message.recipient_email, error);
      }
    }

    return jsonResponse({ status: "processed", claimed: messages.length, sent, failed });
  } catch (error) {
    console.error("send-request-emails error inesperado", String(error));
    return jsonResponse({ error: "Error inesperado al procesar los avisos." }, 500);
  }
});
