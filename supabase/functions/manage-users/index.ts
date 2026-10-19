// Gestion de usuarios reservada al Propietario.
//
// Autorizar, desactivar y reactivar cuentas son simples actualizaciones sobre
// "profiles": se ejecutan con el cliente del propio llamador, porque la base
// valida en el servidor (RLS + guardas) que quien llama sea el Propietario.
//
// Solo "invite" (crear una cuenta nueva) necesita el service role, porque crear
// usuarios de autenticacion requiere privilegios de administrador. Si el
// entorno no lo expone, se informa explicitamente y queda el camino alternativo
// (la persona se registra y el Propietario la autoriza desde el panel).
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

const ROLES = ["admin", "encargado", "finanzas"];

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

    // Cliente con la sesion del llamador: respeta RLS y dispara las guardas.
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
      return jsonResponse(
        { error: "Solo el Propietario puede gestionar usuarios, roles y permisos." },
        403,
      );
    }

    const body = await req.json();
    const action = body?.action as string;

    if (action === "authorize") {
      const userId = body?.user_id as string;
      const role = String(body?.role ?? "encargado");

      if (!userId) return jsonResponse({ error: "Falta el usuario." }, 400);
      if (!ROLES.includes(role)) return jsonResponse({ error: "Rol invalido." }, 400);

      const { error } = await callerClient
        .from("profiles")
        .update({ role, active: true, email_verified: true })
        .eq("id", userId);

      if (error) {
        console.error("authorize fallo", error.message);
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ status: "authorized", user_id: userId });
    }

    if (action === "deactivate" || action === "reactivate") {
      const userId = body?.user_id as string;
      if (!userId) return jsonResponse({ error: "Falta el usuario." }, 400);
      if (action === "deactivate" && userId === userData.user.id) {
        return jsonResponse({ error: "No podes desactivar tu propia cuenta." }, 400);
      }

      const { error } = await callerClient
        .from("profiles")
        .update({ active: action === "reactivate" })
        .eq("id", userId);

      if (error) {
        console.error("cambio de estado fallo", error.message);
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({
        status: action === "reactivate" ? "reactivated" : "deactivated",
        user_id: userId,
      });
    }

    if (action === "delete") {
      // Se pueden eliminar cuentas pendientes o desactivadas, nunca la del Propietario.
      // Si la cuenta tiene pedidos, compras u otros movimientos, la base rechaza el
      // borrado (para no perder historial) y la cuenta queda desactivada.
      const userId = body?.user_id as string;
      if (!userId) return jsonResponse({ error: "Falta el usuario." }, 400);
      if (userId === userData.user.id) {
        return jsonResponse({ error: "No podés eliminar tu propia cuenta." }, 400);
      }
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) {
        return jsonResponse({ error: "Eliminar cuentas no está disponible en este entorno (falta el service role)." }, 501);
      }
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data: target } = await admin.from("profiles").select("id, role, active").eq("id", userId).maybeSingle();
      if (!target) return jsonResponse({ error: "La cuenta ya no existe." }, 404);
      if (target.role === "owner") {
        return jsonResponse({ error: "La cuenta del Propietario no se puede eliminar." }, 400);
      }
      if (target.role !== "pending" && target.active) {
        return jsonResponse({ error: "Primero desactivá la cuenta; después la podés eliminar." }, 400);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error("deleteUser fallo", deleteError.message);
        return jsonResponse(
          {
            error:
              "Esta cuenta tiene pedidos, compras u otros movimientos registrados: no se puede eliminar sin perder ese historial. Queda desactivada y no puede ingresar.",
          },
          400,
        );
      }
      return jsonResponse({ status: "deleted", user_id: userId });
    }

    if (action === "invite") {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) {
        console.warn("invite sin service role disponible");
        return jsonResponse(
          {
            error:
              "Crear cuentas desde el panel no esta disponible en este entorno (falta el service role).",
            fallback:
              "Pedile a la persona que se registre con el link de la aplicacion y, cuando aparezca en Cuentas pendientes, autorizala con su rol y sector.",
          },
          501,
        );
      }

      const email = String(body?.email ?? "").trim().toLowerCase();
      const fullName = String(body?.full_name ?? "").trim();
      const role = String(body?.role ?? "encargado");

      if (!email || !email.includes("@")) {
        return jsonResponse({ error: "Correo invalido." }, 400);
      }
      if (!ROLES.includes(role)) {
        return jsonResponse({ error: "Rol invalido para una invitacion." }, 400);
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const temporaryPassword = generateTemporaryPassword();

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created?.user) {
        console.error("createUser fallo", createError?.message);
        return jsonResponse({ error: createError?.message ?? "No se pudo crear la cuenta." }, 400);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: fullName || email.split("@")[0],
          role,
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

    return jsonResponse({ error: "Accion no soportada." }, 400);
  } catch (error) {
    console.error("manage-users error inesperado", String(error));
    return jsonResponse({ error: "Error inesperado en la gestion de usuarios." }, 500);
  }
});
