// Sincroniza un pedido de Manila Patagonia con los conectores habilitados:
// - Gmail "Notificaciones Manila Patagonia": avisa a los administradores.
// - Google Sheets "Registro de pedidos y compras": mantiene el registro (sin duplicados).
// - Google Drive "Comprobantes de compras Manila": archiva comprobantes y adjuntos.
//
// La base de datos de la aplicacion sigue siendo la fuente principal: esto solo
// refleja el estado. Cada canal se registra en integration_sync_log, asi que un
// reintento no repite avisos, filas ni archivos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://api.enter.pro/code/api/v1/edge-function/connectors/operations";

const OPS = {
  gmailSend: "9638a554-b2dd-4973-891b-feb5fa51286e",
  driveFindFolder: "37d849b9-6bba-4e9e-b663-15aae4601c19",
  driveCreateFolder: "3378d30c-fcd2-4264-abd0-927b254fc585",
  driveFindFile: "6e488a65-2265-43e6-8b48-3a099bd97b7f",
  driveUploadFromUrl: "f3add469-c853-4b82-b9f0-f0b33fede451",
  sheetsCreate: "7aee5edc-f78f-475e-8a7b-73160f6b540e",
  sheetsGet: "fae77e36-cafa-4ae7-833e-f9e90047990b",
  sheetsUpdate: "2bec2a3a-21ab-44a6-a06f-fdabe8dfe71e",
};

const TOKENS = {
  gmail: "CONNECTOR_RUNTIME_TOKEN_e23b5a18faa9_533",
  drive: "CONNECTOR_RUNTIME_TOKEN_e23b5a18faa9_534",
  sheets: "CONNECTOR_RUNTIME_TOKEN_e23b5a18faa9_535",
};

const DRIVE_ROOT = "Pedidos Manila";
const SHEETS_TITLE = "Registro de pedidos y compras Manila";
const BUCKET = "request-attachments";

const COLUMNS = [
  "Número de pedido",
  "Fecha",
  "Categoría",
  "Sector",
  "Solicitante",
  "Artículos",
  "Cantidades",
  "Estado",
  "Proveedor",
  "Fecha de compra",
  "Precio total",
  "Fecha estimada de entrega",
  "Fecha de recepción",
  "Responsable",
];

const EVENTS = ["created", "approved", "purchased", "received", "rejected"] as const;
type SyncEvent = (typeof EVENTS)[number];

const STATE_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_review: "Pendiente de revisión",
  needs_info: "Falta información",
  evaluating: "En evaluación",
  approved_pending_purchase: "Aprobado — pendiente de compra",
  purchasing: "En compra",
  purchased_pending_receipt: "Compra realizada — esperando recepción",
  partially_received: "Recibido parcialmente",
  completed: "Recibido",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const CATEGORY_LABELS: Record<string, string> = {
  insumos: "Insumos de producción",
  indumentaria: "Indumentaria y equipamiento",
  maquinaria: "Maquinaria y mejoras",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

const date = (value: unknown) => {
  if (!value) return "";
  const raw = String(value);
  const parsed = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const [year, month, day] = parsed.split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
};

const fileName = (path: string) => path.split("/").pop() ?? path;

const callConnector = async (
  tokenName: string,
  operationId: string,
  input: unknown,
  label: string,
) => {
  const token = Deno.env.get(tokenName);
  if (!token) {
    throw new Error(
      `${label}: falta la credencial del conector (${tokenName}); se aprovisiona al desplegar la funcion.`,
    );
  }
  const response = await fetch(`${GATEWAY}/${operationId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message ?? `Error ${response.status}`;
    throw new Error(`${label}: ${payload?.error?.code ?? "PROVIDER_ERROR"}: ${message}`);
  }
  return payload?.data ?? payload;
};

const firstItem = (data: unknown, keys: string[]) => {
  const record = data as Record<string, unknown> | null;
  if (!record) return null;
  const list = record[keys[0]] ?? record[keys[1]];
  if (Array.isArray(list) && list.length > 0) return list[0] as Record<string, unknown>;
  return record;
};

const asList = (data: unknown, keys: string[]): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const record = data as Record<string, unknown> | null;
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return [];
};

/** Filas devueltas por la lectura de Sheets, sin confiar en la forma exacta. */
const extractSheetRows = (data: unknown): unknown[][] => {
  if (Array.isArray(data)) return data as unknown[][];
  const record = data as Record<string, unknown> | null;
  const nested = record?.data as Record<string, unknown> | undefined;
  const candidates = [record?.values, record?.rows, nested?.values, nested?.rows];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as unknown[][];
  }
  return [];
};

/* ------------------------- Planilla de pedidos de ventas ------------------------- */
// Lectura (nunca escritura) de la hoja PEDIDOS para los reportes semanales de ventas.
// El enlace de la planilla se guarda una sola vez en integration_targets.
const SALES_SHEET_TARGET = "Planilla de pedidos de ventas";
const SALES_SHEET_TAB = "PEDIDOS";
const SALES_SHEET_RANGE = "A1:Z10000";

const spreadsheetIdFrom = (value: string) => {
  const fromLink = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(value)?.[1];
  if (fromLink) return fromLink;
  return /^[a-zA-Z0-9_-]{20,}$/.test(value.trim()) ? value.trim() : "";
};

/* Acceso a Google con una cuenta de servicio (solo lectura de planillas). */
// La clave vive en el secreto GOOGLE_SERVICE_ACCOUNT_JSON de Supabase: nunca en el código.
interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

const googleServiceAccount = (): GoogleServiceAccount => {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error("Falta cargar la credencial de Google (secreto GOOGLE_SERVICE_ACCOUNT_JSON) en Supabase.");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.client_email || !parsed?.private_key) throw new Error("incompleta");
    return { client_email: String(parsed.client_email), private_key: String(parsed.private_key) };
  } catch {
    throw new Error("La credencial de Google (GOOGLE_SERVICE_ACCOUNT_JSON) no es el archivo JSON completo de la cuenta de servicio.");
  }
};

const base64Url = (input: string | Uint8Array) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const googleAccessToken = async (account: GoogleServiceAccount) => {
  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 600,
      }),
    ),
  ].join(".");
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Google rechazó la credencial: ${text(payload?.error_description || payload?.error) || response.status}`);
  }
  return String(payload.access_token);
};

const readSalesOrders = async (
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  body: Record<string, unknown> | null,
) => {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.active || (profile.role !== "admin" && profile.role !== "owner")) {
    return jsonResponse({ error: "Solo los administradores pueden leer la planilla de pedidos." }, 403);
  }

  const provided = text(body?.spreadsheet).trim();
  let spreadsheetId = "";
  if (provided) {
    spreadsheetId = spreadsheetIdFrom(provided);
    if (!spreadsheetId) {
      return jsonResponse({ error: "El enlace no parece ser de una planilla de Google Sheets." }, 400);
    }
  } else {
    const { data: target } = await supabase
      .from("integration_targets")
      .select("external_id")
      .eq("kind", "sheets_book")
      .eq("name", SALES_SHEET_TARGET)
      .maybeSingle();
    spreadsheetId = text(target?.external_id);
  }
  if (!spreadsheetId) {
    return jsonResponse({ error: "Todavía no se configuró la planilla de pedidos.", needs_config: true }, 400);
  }

  let account: GoogleServiceAccount;
  try {
    account = googleServiceAccount();
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }

  // Se piden los valores sin formato para que los importes lleguen como números.
  let data: unknown = null;
  try {
    const token = await googleAccessToken(account);
    const range = encodeURIComponent(`${SALES_SHEET_TAB}!${SALES_SHEET_RANGE}`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = text(payload?.error?.message);
      if (response.status === 403) {
        return jsonResponse(
          { error: `La planilla no está compartida con ${account.client_email}. Compartila con ese correo como "Lector".` },
          502,
        );
      }
      if (response.status === 404) {
        return jsonResponse({ error: "No se encontró la planilla: revisá el enlace." }, 502);
      }
      if (/not supported for this document/i.test(detail)) {
        return jsonResponse(
          { error: "El archivo es un Excel subido a Drive. Guardalo como Hoja de cálculo de Google y usá ese enlace." },
          502,
        );
      }
      if (/unable to parse range/i.test(detail)) {
        return jsonResponse({ error: `La planilla no tiene una hoja llamada "${SALES_SHEET_TAB}".` }, 502);
      }
      return jsonResponse({ error: `No se pudo leer la planilla: ${detail.slice(0, 300) || response.status}` }, 502);
    }
    data = payload;
  } catch (error) {
    return jsonResponse({ error: `No se pudo leer la planilla: ${String(error).slice(0, 300)}` }, 502);
  }

  // Recién cuando la lectura funcionó se recuerda la planilla para la próxima vez.
  if (provided) {
    await supabase.from("integration_targets").upsert(
      { kind: "sheets_book", name: SALES_SHEET_TARGET, external_id: spreadsheetId },
      { onConflict: "kind,name" },
    );
  }

  return jsonResponse({ ok: true, spreadsheet_id: spreadsheetId, values: extractSheetRows(data) });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Falta iniciar sesión." }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Sesión inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    if (text(body?.action) === "read_sales_orders") {
      return await readSalesOrders(supabase, userData.user.id, body);
    }

    const requestId = text(body?.request_id);
    const event = text(body?.event) as SyncEvent;

    if (!requestId) return jsonResponse({ error: "Falta el pedido." }, 400);
    if (!EVENTS.includes(event)) return jsonResponse({ error: "Evento no soportado." }, 400);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || !profile.active || profile.role === "pending") {
      return jsonResponse({ error: "Tu cuenta no tiene acceso." }, 403);
    }

    const { data: request } = await supabase
      .from("requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) return jsonResponse({ error: "No se encontró el pedido." }, 404);

    const isAdmin = profile.role === "admin" || profile.role === "owner";
    // Los avisos de "pedido creado" los dispara el encargado que lo envía;
    // el resto de los eventos solo los administradores.
    if (!isAdmin && !(event === "created" && request.requester_id === profile.id)) {
      return jsonResponse({ error: "Solo los administradores pueden sincronizar este evento." }, 403);
    }

    const [itemsResult, purchasesResult, receiptsResult, adminsResult, profilesResult] =
      await Promise.all([
        supabase.from("request_items").select("*").eq("request_id", requestId).order("line_no"),
        supabase.from("purchases").select("*").order("created_at", { ascending: false }),
        supabase.from("receipts").select("*").eq("request_id", requestId).order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("email, full_name, role")
          .in("role", ["admin", "owner"])
          .eq("active", true),
        supabase.from("profiles").select("id, full_name"),
      ]);

    const items = itemsResult.data ?? [];
    const purchases = purchasesResult.data ?? [];
    const receipts = receiptsResult.data ?? [];
    const admins = (adminsResult.data ?? []).filter((entry) => entry.email);
    const nameOf = (id?: string | null) =>
      (profilesResult.data ?? []).find((entry) => entry.id === id)?.full_name ?? "";

    const itemIds = new Set(items.map((item) => item.id));
    let purchaseRows: Record<string, unknown>[] = [];
    if (itemIds.size > 0) {
      const { data: lines } = await supabase
        .from("purchase_items")
        .select("*")
        .in("request_item_id", [...itemIds]);
      const purchaseIds = [...new Set((lines ?? []).map((line) => line.purchase_id))];
      purchaseRows = purchases.filter((purchase) => purchaseIds.includes(purchase.id));
    }

    const folio = text(request.folio);
    const status = text(request.status);
    const category = text(request.category);
    const stateLabel = STATE_LABELS[status] ?? status;
    const vendors = [...new Set(purchaseRows.map((purchase) => text(purchase.vendor_name)).filter(Boolean))].join(", ");
    const totalPurchase = purchaseRows.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0);
    const purchaseDate = purchaseRows[0]?.purchase_date ?? null;
    const estimatedDelivery = purchaseRows.find((purchase) => purchase.estimated_delivery_date)
      ?.estimated_delivery_date ?? null;
    const receiptDate = receipts[0]?.received_at ?? null;
    const adminUrl = "https://e23b5a18faa94fd096692b0fc92bb168.live-preview.enter.pro";

    const syncLog = async (
      channel: "gmail" | "drive" | "sheets",
      status: "ok" | "failed" | "skipped" | "pending_config",
      detail: string,
      externalId?: string | null,
    ) => {
      await supabase.from("integration_sync_log").upsert(
        {
          request_id: requestId,
          event,
          channel,
          status,
          detail: detail.slice(0, 500),
          external_id: externalId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "request_id,event,channel" },
      );
    };

    const alreadyDone = async (channel: "gmail" | "drive" | "sheets") => {
      const { data } = await supabase
        .from("integration_sync_log")
        .select("status")
        .eq("request_id", requestId)
        .eq("event", event)
        .eq("channel", channel)
        .maybeSingle();
      return data?.status === "ok";
    };

    const channels: Record<string, { status: string; detail?: string }> = {};

    /* ------------------------------- Gmail ------------------------------- */
    try {
      if (await alreadyDone("gmail")) {
        channels.gmail = { status: "skipped", detail: "Ya se había enviado (sin duplicar)." };
      } else {
        const subject = `[Manila] ${folio} · ${stateLabel}`;
        const bodyLines = [
          `Pedido: ${folio}`,
          `Estado: ${stateLabel}`,
          `Categoría: ${CATEGORY_LABELS[category] ?? category}`,
          `Solicitante: ${nameOf(request.requester_id)}`,
          `Fecha del pedido: ${date(request.submitted_at ?? request.created_at)}`,
          `Fecha necesaria: ${date(request.needed_by)}`,
          `Prioridad: ${text(request.priority)}`,
          vendors ? `Proveedor: ${vendors}` : "",
          totalPurchase > 0 ? `Precio total: $ ${totalPurchase.toFixed(2)}` : "",
          purchaseDate ? `Fecha de compra: ${date(purchaseDate)}` : "",
          receiptDate ? `Fecha de recepción: ${date(receiptDate)}` : "",
          "",
          `Abrir el pedido: ${adminUrl}/pedidos/${requestId}`,
        ].filter(Boolean);

        let sent = 0;
        const failures: string[] = [];
        for (const admin of admins) {
          try {
            await callConnector(
              TOKENS.gmail,
              OPS.gmailSend,
              { recipient_email: admin.email, subject, body: bodyLines.join("\n") },
              "gmail.send",
            );
            sent += 1;
          } catch (error) {
            failures.push(`${admin.email}: ${String(error).slice(0, 120)}`);
          }
        }

        if (sent > 0) {
          const detail = `${sent} aviso(s) enviado(s)${failures.length ? ` · fallaron ${failures.length}: ${failures.join(" | ")}` : ""}`;
          await syncLog("gmail", failures.length ? "failed" : "ok", detail);
          channels.gmail = { status: failures.length ? "failed" : "ok", detail };
        } else {
          const detail = `No se pudo enviar: ${failures.join(" | ") || "sin destinatarios activos"}`;
          await syncLog("gmail", "failed", detail);
          channels.gmail = { status: "failed", detail };
        }
      }
    } catch (error) {
      const detail = String(error).slice(0, 300);
      await syncLog("gmail", "failed", detail);
      channels.gmail = { status: "failed", detail };
    }

    /* ------------------------------ Google Sheets ------------------------------ */
    try {
      if (await alreadyDone("sheets")) {
        channels.sheets = { status: "skipped", detail: "La planilla ya estaba actualizada." };
      } else {
        let spreadsheetId = "";
        const { data: target } = await supabase
          .from("integration_targets")
          .select("external_id")
          .eq("kind", "sheets_book")
          .eq("name", SHEETS_TITLE)
          .maybeSingle();
        spreadsheetId = text(target?.external_id);

        if (!spreadsheetId) {
          const found = await callConnector(
            TOKENS.drive,
            OPS.driveFindFile,
            {
              q: `name = '${SHEETS_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            },
            "drive.findFile",
          );
          const file = firstItem(found, ["files", "items"]);
          spreadsheetId = text(file?.id);
        }

        if (!spreadsheetId) {
          const created = await callConnector(
            TOKENS.sheets,
            OPS.sheetsCreate,
            { title: SHEETS_TITLE },
            "sheets.create",
          );
          spreadsheetId =
            text((created as Record<string, unknown>)?.spreadsheetId) ||
            text(firstItem(created, ["spreadsheet", "spreadsheets"])?.spreadsheetId) ||
            text(firstItem(created, ["spreadsheet", "spreadsheets"])?.id);
        }

        if (!spreadsheetId) throw new Error("No se pudo obtener la planilla de registro.");

        await supabase.from("integration_targets").upsert(
          { kind: "sheets_book", name: SHEETS_TITLE, external_id: spreadsheetId },
          { onConflict: "kind,name" },
        );

        const requested = items
          .map((item) => Number(item.requested_qty))
          .reduce((sum, value) => sum + value, 0);

        const registryRow = [
          folio,
          date(request.submitted_at ?? request.created_at),
          CATEGORY_LABELS[category] ?? category,
          "—",
          nameOf(request.requester_id),
          items.map((item) => text(item.name)).join("; "),
          items
            .map((item) => `${Number(item.requested_qty)} ${text(item.unit) || ""}`.trim())
            .join("; "),
          stateLabel,
          vendors || "—",
          date(purchaseDate),
          totalPurchase > 0 ? totalPurchase.toFixed(2) : "",
          date(estimatedDelivery),
          date(receiptDate),
          nameOf(request.assigned_admin_id) || "Sin asignar",
        ];

        // Se usan las operaciones nativas de Sheets: leer la columna del número de
        // pedido y escribir solo esa fila (o agregarla). Se omite el nombre de la
        // pestaña a propósito: así aplica a la primera hoja visible.
        const current = await callConnector(
          TOKENS.sheets,
          OPS.sheetsGet,
          { spreadsheet_id: spreadsheetId, range: "A1:N1000" },
          "sheets.get",
        );
        const rows = extractSheetRows(current);
        const lastColumn = String.fromCharCode(64 + COLUMNS.length);

        if (rows.length === 0) {
          await callConnector(
            TOKENS.sheets,
            OPS.sheetsUpdate,
            {
              spreadsheet_id: spreadsheetId,
              range: `A1:${lastColumn}2`,
              value_input_option: "RAW",
              values: [COLUMNS, registryRow],
            },
            "sheets.update",
          );
        } else {
          const position = rows.findIndex(
            (row, index) => index > 0 && text((row as unknown[])?.[0]).trim() === folio,
          );
          const targetRow = position > 0 ? position + 1 : rows.length + 1;
          await callConnector(
            TOKENS.sheets,
            OPS.sheetsUpdate,
            {
              spreadsheet_id: spreadsheetId,
              range: `A${targetRow}:${lastColumn}${targetRow}`,
              value_input_option: "RAW",
              values: [registryRow],
            },
            "sheets.update",
          );
        }

        const detail = `Fila ${rows.length === 0 ? "creada" : "actualizada"} en “${SHEETS_TITLE}” (${items.length} artículo(s), ${requested} solicitado(s)).`;
        await syncLog("sheets", "ok", detail, spreadsheetId);
        channels.sheets = { status: "ok", detail };
      }
    } catch (error) {
      const detail = String(error).slice(0, 300);
      await syncLog("sheets", "failed", detail);
      channels.sheets = { status: "failed", detail };
    }

    /* ------------------------------- Google Drive ------------------------------- */
    try {
      const files: { path: string; label: string }[] = [];
      for (const item of items) {
        if (item.photo_path) files.push({ path: text(item.photo_path), label: "foto" });
        const adjuntos = (item.specifications as Record<string, unknown> | null)?.adjuntos;
        if (Array.isArray(adjuntos)) {
          for (const adjunto of adjuntos) {
            if (typeof adjunto === "string" && adjunto.length > 0) {
              files.push({ path: adjunto, label: "adjunto" });
            }
          }
        }
      }
      for (const purchase of purchaseRows) {
        if (purchase.invoice_path) {
          files.push({ path: text(purchase.invoice_path), label: "comprobante" });
        }
      }

      if (files.length === 0) {
        channels.drive = {
          status: "skipped",
          detail: "El pedido no tiene comprobantes ni adjuntos para archivar.",
        };
      } else if (await alreadyDone("drive")) {
        channels.drive = { status: "skipped", detail: "Los archivos ya estaban archivados." };
      } else {
        const resolveFolder = async (
          name: string,
          kind: "drive_root" | "drive_year" | "drive_category" | "drive_order",
          parentId?: string,
        ) => {
          const { data: stored } = await supabase
            .from("integration_targets")
            .select("external_id, parent_id")
            .eq("kind", kind)
            .eq("name", name)
            .maybeSingle();
          if (stored?.external_id && (!parentId || stored.parent_id === parentId)) {
            return text(stored.external_id);
          }
          const found = await callConnector(
            TOKENS.drive,
            OPS.driveFindFolder,
            { name_exact: name, ...(parentId ? { parent_folder_id: parentId } : {}) },
            "drive.findFolder",
          );
          const existing = firstItem(found, ["folders", "files"]);
          let folderId = text(existing?.id);
          if (!folderId) {
            const created = await callConnector(
              TOKENS.drive,
              OPS.driveCreateFolder,
              { name, ...(parentId ? { parent_id: parentId } : {}) },
              "drive.createFolder",
            );
            folderId =
              text(firstItem(created, ["folder", "file"])?.id) ||
              text((created as Record<string, unknown>)?.id);
          }
          if (!folderId) throw new Error(`No se pudo resolver la carpeta “${name}”.`);
          await supabase.from("integration_targets").upsert(
            { kind, name, external_id: folderId, parent_id: parentId ?? null },
            { onConflict: "kind,name" },
          );
          return folderId;
        };

        const rootId = await resolveFolder(DRIVE_ROOT, "drive_root");
        const year = date(request.submitted_at ?? request.created_at).slice(6) || "sin-anio";
        const yearId = await resolveFolder(`Pedidos ${year}`, "drive_year", rootId);
        const categoryId = await resolveFolder(
          CATEGORY_LABELS[category] ?? category,
          "drive_category",
          yearId,
        );
        const orderFolderId = await resolveFolder(folio, "drive_order", categoryId);

        let uploaded = 0;
        const failures: string[] = [];
        for (const file of files) {
          try {
            const name = `${folio} - ${file.label} - ${fileName(file.path)}`;
            const existing = await callConnector(
              TOKENS.drive,
              OPS.driveFindFile,
              { q: `name = '${name}' and '${orderFolderId}' in parents and trashed = false` },
              "drive.findFile",
            );
            if (firstItem(existing, ["files", "items"])) continue;

            const { data: signed } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(file.path, 3600);
            if (!signed?.signedUrl) throw new Error(`Sin acceso al archivo ${file.path}`);

            await callConnector(
              TOKENS.drive,
              OPS.driveUploadFromUrl,
              { source_url: signed.signedUrl, name, parent_folder_id: orderFolderId },
              "drive.uploadFromUrl",
            );
            uploaded += 1;
          } catch (error) {
            failures.push(`${fileName(file.path)}: ${String(error).slice(0, 100)}`);
          }
        }

        const detail = `${uploaded} archivo(s) archivado(s) en “${DRIVE_ROOT}/${`Pedidos ${year}`}/${CATEGORY_LABELS[category] ?? category}/${folio}”${failures.length ? ` · fallaron ${failures.length}: ${failures.join(" | ")}` : ""}`;
        await syncLog("drive", failures.length && uploaded === 0 ? "failed" : "ok", detail, orderFolderId);
        channels.drive = { status: uploaded > 0 ? "ok" : "failed", detail };
      }
    } catch (error) {
      const detail = String(error).slice(0, 300);
      await syncLog("drive", "failed", detail);
      channels.drive = { status: "failed", detail };
    }

    return jsonResponse({
      ok: true,
      folio,
      event,
      state: stateLabel,
      recipients: admins.map((admin) => admin.email),
      channels,
    });
  } catch (error) {
    console.error("manila-sync error", String(error));
    return jsonResponse({ error: String(error).slice(0, 300) }, 500);
  }
});
