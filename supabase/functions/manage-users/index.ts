// Gestion de usuarios reservada al Propietario: invitar/crear cuentas,
// autorizar cuentas pendientes, cambiar rol y sector, y desactivar cuentas.
//
// El permiso se valida en el servidor contra la base (rol = owner y activo).
// Si el service role no esta disponible en el entorno, la funcion lo informa
// explicitamente en lugar de simular un resultado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ROLES = ["owner", "admin", "encargado", "pending"];

const generateTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }
  return `${password}-1a`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Falta iniciar sesion." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesion invalida." }, 401);
    }

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("id, role, active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "owner" || !callerProfile.active) {
      return jsonResponse({ error: "Solo el Propietario puede gestionar usuarios, roles y permisos." }, 403);
    }

    if (!serviceRoleKey) {
      return jsonResponse(
        {
          error:
            "Pendiente de configuracion: el entorno no expone el service role, asi que no se pueden crear ni modificar cuentas desde el panel.",
          fallback:
            "La persona puede registrarse, verificar su correo y luego autorizarla desde esta misma pantalla.",
        },
        501,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const body = await req.json();
    const action = body?.action as string;

    if (action === "invite") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const fullName = String(body?.full_name ?? "").trim();
      const role = String(body?.role ?? "encargado");
      const sectorId = body?.sector_id ?? null;

      if (!email || !email.includes("@")) {
        return jsonResponse({ error: "Correo invalido." }, 400);
      }
      if (!ROLES.includes(role) || role === "owner") {
        return jsonResponse({ error: "Rol invalido para una invitacion." }, 400);
      }

      const temporaryPassword = generateTemporaryPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created?.user) {
        console.error("createUser fallo", createError?.message);
        return jsonResponse(
          { error: createError?.message ?? "No se pudo crear la cuenta." },
          400,
        );
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: fullName || email.split("@")[0],
          role,
          sector_id: sectorId,
          active: true,
          email_verified: true,
        })
        .eq("id", created.user.id);

      if (profileError) {
        console.error("No se pudo autorizar el perfil", profileError.message);
        return jsonResponse({ error: "La cuenta se creo pero no se pudo autorizar el perfil." }, 500);
      }

      return jsonResponse({
        status: "created",
        user_id: created.user.id,
        email,
        temporary_password: temporaryPassword,
        note: "Entrega esta contrasena temporal a la persona; deberia cambiarla al ingresar.",
      });
    }

    if (action === "authorize") {
      const userId = body?.user_id as string;
      const role = String(body?.role ?? "encargado");
      const sectorId = body?.sector_id ?? null;
      if (!userId) {
        return jsonResponse({ error: "Falta el usuario." }, 400);
      }
      if (!ROLES.includes(role) || role === "owner") {
        return jsonResponse({ error: "Rol invalido." }, 400);
      }
      if (role === "encargado" && !sectorId) {
        return jsonResponse({ error: "Un encargado necesita un sector asignado." }, 400);
      }

      const { error } = await admin
        .from("profiles")
        .update({ role, sector_id: sectorId, active: true, email_verified: true })
        .eq("id", userId);
      if (error) {
        console.error("authorize fallo", error.message);
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ status: "authorized", user_id: userId });
    }

    if (action === "deactivate") {
      const userId = body?.user_id as string;
      if (!userId) {
        return jsonResponse({ error: "Falta el usuario." }, 400);
      }
      if (userId === userData.user.id) {
        return jsonResponse({ error: "No podes desactivar tu propia cuenta de Propietario." }, 400);
      }
      const { error } = await admin.from("profiles").update({ active: false }).eq("id", userId);
      if (error) {
        console.error("deactivate fallo", error.message);
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ status: "deactivated", user_id: userId });
    }

    if (action === "reactivate") {
      const userId = body?.user_id as string;
      if (!userId) {
        return jsonResponse({ error: "Falta el usuario." }, 400);
      }
      const { error } = await admin.from("profiles").update({ active: true }).eq("id", userId);
      if (error) {
        console.error("reactivate fallo", error.message);
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ status: "reactivated", user_id: userId });
    }

    return jsonResponse({ error: "Accion no soportada." }, 400);
  } catch (error) {
    console.error("manage-users error inesperado", String(error));
    return jsonResponse({ error: "Error inesperado en la gestion de usuarios." }, 500);
  }
});
