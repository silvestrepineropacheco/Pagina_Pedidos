# Manila | Pedidos y Compras

## Context

El proyecto es hoy una plantilla limpia de Vite + React + TS + Tailwind + shadcn, sin backend conectado ni modelo de datos. Se necesita una aplicación interna real (no maqueta) para que encargados de sector carguen solicitudes de insumos, indumentaria y maquinaria, y para que hasta seis administradores gestionen la revisión, la compra fuera de la app y la recepción, sin compras duplicadas ni pérdida de trazabilidad.

Decisiones acordadas con el usuario:
- **Autorización**: el primer usuario registrado queda como `Propietario`; el resto entra como `Pendiente` sin acceso hasta que el Propietario le asigne rol y sector.
- **Correo**: integración real con **Resend**. La API key y el remitente se cargan con el formulario seguro (`supabase_add_secret`). Sin secreto configurado, los envíos quedan en estado `pending_config` / **"Pendiente de configuración"** y nunca se simulan como enviados.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.

Toda la UI en español, fechas DD/MM/AAAA, zona `America/Argentina/Buenos_Aires`, moneda ARS por defecto. Sin IA ni chatbot.

---

## 1. Backend (Enter Cloud)

Primer paso obligatorio: `supabase_enable`. El cliente generado en `src/integrations/supabase/client.ts` se usa tal cual (no se edita).

### Autenticación
- Email + contraseña con **registro y login** en la misma pantalla.
- `supabase_configure_auth`: auto-confirmar email (sin vuelta por correo), registro habilitado.
- `signUp` con `emailRedirectTo: ${window.location.origin}/`.
- Sesión con `supabase.auth.onAuthStateChange` (listener registrado antes de restaurar sesión; callback no-async; llamadas al cliente dentro de `setTimeout(...,0)`). Se guardan `user` **y** `session`.

### Tablas y reglas (todas con RLS habilitada en la misma migración)

**M1 — Identidad y sectores**
- `sectors`: id, name único, code, is_demo, active, created_at. Semilla demostrativa editable: Despostada, Envasado, Frío y Cámaras, Mantenimiento, Vestuarios y Comedor, Expedición (marcadas `is_demo = true`).
- `profiles`: id (= `auth.users.id`), full_name, email, role (`owner|admin|encargado|pending`), sector_id → sectors, active, created_at, updated_at.
  - Trigger `on_auth_user_created` crea el perfil. Bajo `pg_advisory_xact_lock`: si no existe ningún `owner`, el nuevo perfil es `owner`; si no, `pending`. Nadie puede auto-asignarse rol.
  - Funciones `security definer`: `app_role()`, `app_sector()`, `is_admin()`, `is_owner()`, `has_app_access()` (evita recursión de RLS).
  - Políticas: cada usuario lee su perfil; admin/owner leen todos. `full_name` propio editable. **Solo el Propietario** cambia `role`, `sector_id`, `active` (policy en `UPDATE` + trigger `guard_profile_update` que rechaza cualquier cambio de rol hecho por otro usuario, incluido un admin).

**M2 — Catálogo**
- `catalog_items`: id, name, category (`insumos|indumentaria|maquinaria`), description, variant, unit, presentation, image_url, usual_supplier, usual_url, is_demo, active, created_at.
- Semilla demostrativa marcada como tal (cajas, bolsas, stickers, guantes descartables, film, cintas, botas, delantales, ropa térmica...).
- Lectura: cualquier usuario con acceso. Escritura: admin/owner. Desactivar (`active=false`) sin borrar historial.

**M3 — Pedidos y artículos**
- `requests`: id, **folio único** `PED-AAAA-000000` (sequence + trigger), requester_id, sector_id, category, needed_by (date), priority (`normal|alta|urgente`), urgency_reason (obligatorio si urgente, validado por trigger), notes, status, assigned_admin_id, submitted_at, closed_by/closed_reason/closed_at, repeated_from_id, y campos de maquinaria (`machinery_type` nueva/reemplazo/reparación/mejora, equipment_name, problem, expected_benefit, no_purchase_consequence, current_equipment, technical_specs, estimated_price, currency), created_at, updated_at.
- `request_items`: id, request_id, line_no, catalog_item_id (nullable), name, description, specifications (jsonb: medida/talle/material/modelo/presentación), unit, package_content, reported_stock, **requested_qty** y **approved_qty** separadas, unit_price_estimate, currency, suggested_url (del encargado), purchase_url (de la compra), notes, photo_path, item_status, reason (motivo de rechazo/cambio de cantidad), created_at.
- RLS: el encargado ve/inserta/edita solo pedidos **de su sector** y suyos; admin/owner ven todo. Un encargado no puede leer ni escribir pedidos de otro sector.
- Triggers de negocio (aquí viven los permisos, no en la UI):
  - `guard_request_update`: encargado solo mueve `draft → pendiente_revision`, `needs_info → pendiente_revision`; nunca puede poner `aprobado/completado/rechazado`; no puede cambiar `requester_id`, `sector_id`, ni `approved_qty`. Tras el envío, cambios de cantidad/especificación sobre artículos ya aprobados o comprados quedan **bloqueados silenciosamente → registrados como evento y devuelven el artículo a revisión**.
  - `guard_item_update`: solo admin/owner aprueban/rechazan o fijan `approved_qty`; registrar motivo obligatorio al rechazar o cambiar cantidad.
  - `guard_request_completion`: no permite `completado` con saldo aprobado pendiente, salvo cierre explícito de un admin con motivo registrado.
  - `assign_request` (botón "Asignarme pedido"): `UPDATE ... WHERE id = $1 AND assigned_admin_id IS NULL` — atómico; si afecta 0 filas, la UI avisa "ya está asignado a X". La reasignación exige acción explícita y deja evento.
  - `log_request_event` (after insert/update en requests y request_items) escribe historial y comentarios del sistema. Sin política de DELETE: el historial no se borra.

**M4 — Compras**
- `purchases`: id, folio `CMP-...`, created_by, channel (`proveedor|mercado_libre|otro`), vendor_name, purchase_date, **shipping_cost a nivel compra**, currency, total, order_number, estimated_delivery_date, tracking, invoice_path, notes, status.
- `purchase_items`: id, purchase_id, request_item_id, qty, unit_price, currency, product_url, notes.
- `guard_purchase_item_qty`: la suma comprada por artículo no puede superar `approved_qty`; lanza excepción. Esto impide que dos administradores generen una compra duplicada por acción simultánea. Permite comprar artículos de un pedido en distintos proveedores y reunir artículos de varios pedidos/sectores en una misma compra.
- RLS: lectura admin/owner (encargado ve las compras de sus propios artículos en modo lectura); escritura admin/owner.

**M5 — Recepción y faltantes**
- `receipts`: id, folio `REC-...`, request_id, purchase_id (nullable), received_at, received_by_name, created_by, notes, photo_path.
- `receipt_items`: id, receipt_id, request_item_id, qty_received, qty_accepted, issue_type (`none|faltante|incorrecto|dañado`), notes.
- `guard_receipt_item_qty`: no permite recibir más que el saldo pendiente sin revisión administrativa explícita. `qty_accepted` con `issue_type` distinto de `none` **no** cuenta como entregado. Múltiples entregas parciales conservan el saldo. Evita doble registro de la misma recepción.
- RLS: el encargado confirma recepción de pedidos de su sector; admin/owner todo.

**M6 — Conversación, historial y notificaciones**
- `request_comments`: id, request_id, author_id, body, kind (`comment|info_request`), created_at.
- `request_events`: id, request_id, actor_id, event_type, message, metadata jsonb, created_at. Append-only.
- `notifications`: id, user_id, request_id, title, body, kind, read_at, created_at.
- `admin_notification_prefs`: user_id PK, notify_new_requests bool, sector_ids uuid[], categories text[].
- `email_messages`: id, request_id, recipient_user_id, recipient_email, subject, body, kind, status (`pending|sent|failed|pending_config`), attempts, error, provider_message_id, sent_at, created_at, **unique (request_id, recipient_email, kind)** → idempotencia: reintentar no duplica avisos.
- Trigger al pasar `submitted_at` de NULL a valor (una sola vez): crea notificaciones en la app para administradores activos con la preferencia habilitada y encola **un** `email_messages` por administrador (no uno por artículo). Los borradores no generan nada.
- Trigger de notificación interna al encargado cuando: se pide más información, se aprueba/rechaza (por artículo), se registra una compra o una fecha estimada de entrega.

**M7 — Storage**
- Bucket privado `request-attachments`: fotos, presupuestos y documentación (imágenes + PDF, hasta 10 MB). Políticas por carpeta `{request_id}/...` según acceso al pedido.
- Bucket `catalog-images` para imágenes de catálogo.
- Facturas/comprobantes de compra van a `request-attachments` bajo la carpeta de la compra.

### Función de backend
- `supabase/functions/send-request-emails/index.ts` (`Deno.serve`, CORS + preflight, sin SQL crudo, logs diagnósticos):
  - Autentica al llamador y verifica que sea admin/owner o el solicitante.
  - Toma los `email_messages` en `pending`/`failed` del pedido y los envía con Resend leyendo `RESEND_API_KEY` y `RESEND_FROM` con `Deno.env.get()`.
  - **Si faltan los secretos**: marca `pending_config` y devuelve ese estado. No simula envíos exitosos.
  - Éxito → `sent` + `provider_message_id`; error → `failed` + `error`, con reintento manual ("Reintentar envío") que solo reprocesa lo no entregado. El pedido se guarda igual aunque el correo falle.
  - Se despliega con `supabase_deploy_edge_function` y se verifica con `supabase_search_edge_function_logs`.

---

## 2. Frontend

### Design system (`src/index.css` + `tailwind.config.ts`)
Tokens sobrios y profesionales según el brief: fondo claro, azul oscuro y verde.
- `--primary`: azul oscuro (~`214 62% 20%`), `--primary-foreground` claro.
- `--accent` / `--success`: verde (~`152 55% 34%`) para confirmaciones y estados resueltos.
- `--warning` ámbar y `--destructive` rojo para prioridad urgente y problemas, con sus variantes en `tailwind.config.ts`.
- Tokens de sombra suaves (`--shadow-card`) y radio; sin animaciones innecesarias. Se usa solo modo claro (se elimina el bloque `.dark`).
- Variantes nuevas en `button.tsx` (tamaños grandes, `hero`/`success`/`outline` legibles sobre fondo claro) y badges por estado/prioridad. Nunca colores directos tipo `text-white`/`bg-white`.

### Estructura de archivos
```
src/lib/
  constants.ts     # categorías, estados, prioridades, unidades, canales, con etiqueta + color
  format.ts        # fecha DD/MM/AAAA, fecha-hora en America/Argentina/Buenos_Aires, moneda ARS
  validation.ts    # URL http/https opcional, campos requeridos por categoría
  permissions.ts   # capacidades por rol (solo para UI; la verdad está en RLS/triggers)
src/hooks/
  use-auth.tsx     # AuthProvider + useAuth (user, session, profile, role, sector)
  use-requests.ts  # listado/detalle/filtros con react-query
  use-catalog.ts   # catálogo y sectores
  use-notifications.ts
src/components/
  layout/app-shell.tsx        # navegación lateral en escritorio, barra inferior en celular
  status-badge.tsx  priority-badge.tsx  empty-state.tsx  error-state.tsx
  request/request-list.tsx  request/request-items-table.tsx  request/comment-thread.tsx
  request/history-timeline.tsx  request/attachment-upload.tsx  request/product-link.tsx
  admin/*                     # acciones de revisión, asignación, compra, recepción
```

### Rutas (`src/router.tsx`)
- Público: `/login` (ingresar + registrarse), `/pendiente` (cuenta sin autorizar).
- Encargado y admin: `/` (inicio según rol), `/nuevo` (selector de las 3 categorías), `/nuevo/:categoria`, `/pedidos`, `/pedidos/:id` (detalle compartido, acciones según rol), `/perfil` (preferencias de notificación), `/notificaciones`.
- Admin: `/admin` (panel de colas), `/admin/pedidos`, `/admin/pendientes-compra` (consolidación), `/admin/compras`, `/admin/compras/nueva`, `/admin/compras/:id`, `/admin/catalogo`, `/admin/sectores`, `/admin/usuarios` (solo Propietario), `/admin/reportes`.
- Guard de ruta: sin sesión → `/login`; con sesión pero `pending`/`active=false` → `/pendiente`; rutas `/admin/*` solo admin/owner.

### Pantallas
- **Inicio encargado**: botón grande "Nuevo pedido", "Pedidos de mi sector", contadores de pendientes / en gestión / pendientes de recepción.
- **Formulario por categoría**: campos comunes (fecha necesaria, prioridad, justificación obligatoria si urgente, observaciones) y campos específicos que aparecen solo al elegir la categoría. Insumos: varios artículos, producto de catálogo u "Otro artículo", especificaciones, cantidad, unidad, contenido por presentación, stock informado (opcional), enlace, observaciones y foto. Indumentaria: nombre, cantidad, talle/medida, motivo, destinatario/lugar, enlace, adjuntos. Maquinaria: campos del punto 3.C, sin exigir precio.
- **Resumen previo al envío** + "Guardar borrador". Botón Enviar deshabilitado durante el envío y con clave de idempotencia (no se duplica al doble clic). Ante error se conservan los datos cargados.
- **Lista**: número, fecha, categoría, prioridad, estado y responsable; tabla en escritorio, tarjetas en celular.
- **Detalle**: artículos con estado y saldo pendiente por artículo, fechas estimadas, conversación de comentarios, historial de cambios, adjuntos, "Abrir producto sugerido" (solo admin, en otra pestaña) y "Registrar recepción" cuando corresponde. Encargado: "Repetir pedido" → nuevo **borrador** con los artículos anteriores, nunca enviado automáticamente.
- **Panel admin**: colas (nuevas, urgentes, sin responsable, asignadas a mí, aprobadas pendientes de compra, compras pendientes de recepción, entregas vencidas), buscador por número/producto/solicitante y filtros por sector, categoría, prioridad, estado, responsable y fechas. Aprobación **por artículo** conservando solicitada vs aprobada, con motivo obligatorio al rechazar/cancelar/cambiar cantidad. "Asignarme pedido" y reasignación con registro.
- **Compras**: registro con canal, proveedor, fecha, artículos y cantidades, precio unitario, envío a nivel compra, total, enlace comprado, orden, entrega estimada, seguimiento, comprobante y observaciones. Sin pagos ni credenciales de Mercado Libre.
- **Consolidación "Compras pendientes"**: agrupa solo productos idénticos (mismo artículo, variante, medida, talle y presentación); total + desglose por sector y solicitud; nunca agrupa texto libre no confirmado; descuenta lo ya comprado.
- **Recepción**: fecha, persona que recibió, cantidad recibida y aceptada por artículo, problema (faltante/incorrecto/dañado), observaciones y foto. Saldo siempre visible.
- **Catálogo / Sectores**: alta, edición y desactivación sin borrar historial; lo demostrativo identificado como tal y editable.
- **Usuarios (Propietario)**: autorizar cuentas pendientes asignando rol y sector; nunca se autoasigna admin desde el registro.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.
- **Estados visibles**: Borrador, Pendiente de revisión, Falta información, En evaluación, Aprobado / pendiente de compra, En compra, Comprado / pendiente de recepción, Recibido parcialmente, Completado, Rechazado, Cancelado. El resumen del pedido se calcula por el avance de sus artículos.
- Mensajes claros de confirmación, error, carga y listas vacías; formularios cortos y de pocos pasos para encargados.

### Idempotencia y concurrencia (cliente)
- Envío de pedido, registro de compra, recepción y reasignación: botón bloqueado durante la operación + claves de unicidad en la base (folio único, `receipt_items` por recepción, `email_messages` único).
- Asignación con `WHERE assigned_admin_id IS NULL` y aviso si otro admin se adelantó.

### Documentación
Actualizar `CodeGuideline.md` con las páginas, hooks y componentes nuevos (`src/lib/` no cambia su rol).

---

## Implementation checklist

- [ ] `supabase_enable` y verificar el cliente generado en `src/integrations/supabase/client.ts`.
- [ ] `supabase_configure_auth`: auto-confirmación de email y registro habilitado.
- [ ] M1: `sectors` + `profiles` + funciones `app_role/app_sector/is_admin/is_owner/has_app_access` + trigger de alta de usuario (primer usuario = owner) + `guard_profile_update` + RLS y políticas; confirmar con `supabase_get_table_schema`.
- [ ] M1: semilla de sectores demostrativos (`is_demo = true`, editables).
- [ ] M2: `catalog_items` + RLS + semilla demostrativa; confirmar RLS con `supabase_get_table_schema`.
- [ ] M3: `requests` + `request_items` + folio + `guard_request_update`, `guard_item_update`, `guard_request_completion`, `log_request_event`, asignación atómica + RLS por sector; confirmar RLS.
- [ ] M4: `purchases` + `purchase_items` + `guard_purchase_item_qty` + RLS; confirmar RLS.
- [ ] M5: `receipts` + `receipt_items` + `guard_receipt_item_qty` + RLS; confirmar RLS.
- [ ] M6: `request_comments`, `request_events`, `notifications`, `admin_notification_prefs`, `email_messages` (unique request+destinatario+kind) + triggers de notificación y encolado de correo; confirmar RLS.
- [ ] M7: buckets de storage y políticas de acceso a adjuntos, presupuestos, facturas e imágenes de catálogo.
- [ ] `src/index.css` + `tailwind.config.ts`: tokens azul oscuro/verde, badges y variantes de botón; eliminar `.dark`.
- [ ] `src/lib/format.ts`, `constants.ts`, `validation.ts`, `permissions.ts`.
- [ ] `use-auth.tsx` con listener de sesión, perfil y guardas de rol; `app-shell` responsivo y rutas registradas en `router.tsx`.
- [ ] Pantallas de `/login` y `/pendiente` con las reglas de autorización acordadas.
- [ ] Inicio de encargado con contadores reales y lista `/pedidos` con columnas y tarjetas responsivas.
- [ ] Wizard `/nuevo` con las tres categorías, campos condicionales, resumen previo, borrador y envío idempotente.
- [ ] Detalle `/pedidos/:id`: artículos con estado y saldo, comentarios, historial, adjuntos, "Abrir producto sugerido", "Registrar recepción" y "Repetir pedido" (borrador).
- [ ] Panel `/admin` con todas las colas, buscador y filtros.
- [ ] Revisión por artículo con motivos obligatorios, aprobación/rechazo parcial y cierre de saldo con motivo.
- [ ] `/admin/compras` (alta con envío a nivel compra, compras parciales y multi-pedido) y `/admin/compras/:id`.
- [ ] `/admin/pendientes-compra` con agrupación estricta por producto idéntico, desglose por sector y descuento de lo comprado.
- [ ] `/admin/catalogo` y `/admin/sectores` con alta/edición/desactivación.
- [ ] `/admin/usuarios` (solo Propietario) para autorizar cuentas y asignar rol/sector.
- [ ] `/perfil` con preferencias de notificación (activar/desactivar y filtrar por sector/categoría).
- [ ] `/admin/reportes` con los cuatro reportes acordados.
- [ ] `send-request-emails` escrito, desplegado con `supabase_deploy_edge_function` y verificado en logs; llaves de Resend pedidas con `supabase_add_secret`.
- [ ] Actualizar `CodeGuideline.md` con las páginas, hooks y componentes nuevos.

## Verification checklist

- [ ] `pnpm lint` y `pnpm exec tsc --noEmit` sin errores; `pnpm run build` correcto al final.
- [ ] Autenticación: registro + login funcionan; el primer usuario queda `owner` con acceso al panel de usuarios.
- [ ] Aislamiento por sector (positivo/negativo): un encargado ve sus pedidos de sector y recibe 0 filas al consultar pedidos de otro sector (verificado con consulta directa y con la UI).
- [ ] Escalada de privilegios: un encargado no puede cambiar `role`, `sector_id` ni aprobar (los intentos de UPDATE son rechazados por policy/trigger).
- [ ] Doble administrador: dos intentos simultáneos de asignar el mismo pedido → solo uno gana y el otro ve "ya asignado"; dos registros de compra sobre la misma cantidad aprobada → el segundo es rechazado por `guard_purchase_item_qty`.
- [ ] Pedido con varios artículos y URLs distintas: se guarda, se muestran y "Abrir producto sugerido" abre en otra pestaña solo para admin; URL inválida (no http/https) rechazada sin bloquear el envío si está vacía.
- [ ] Rechazo parcial: un artículo rechazado con motivo, el resto continúa su circuito y el resumen del pedido lo refleja.
- [ ] Un pedido comprado en dos proveedores distintos conserva la relación solicitado/aprobado/comprado.
- [ ] Una compra reúne artículos de dos sectores y el desglose por sector se mantiene correcto.
- [ ] Entrega parcial: el saldo pendiente por artículo es exacto y una segunda entrega lo completa.
- [ ] Producto dañado: `issue_type = dañado` no cuenta como entregado y el pedido **no** queda completado correctamente recibido.
- [ ] Cierre de saldo: un pedido con cantidad aprobada pendiente no se puede marcar completado sin cierre explícito de un admin con motivo registrado.
- [ ] Correo: sin secreto de Resend el estado es "Pendiente de configuración" y el pedido se guarda; con fallo del proveedor el estado es `failed` y el reintento no duplica avisos ya entregados.
- [ ] No duplicación: doble clic en Enviar genera un solo pedido; repetir el registro de una recepción no la duplica; reintentar la notificación no duplica avisos.
- [ ] Consolidación: dos sectores piden 5 y 3 cajas del mismo guante → muestra 8 con desglose; un producto de texto libre sin equivalencia no se agrupa; lo ya comprado no se cuenta dos veces.
- [ ] Borrador: guardar y modificar un borrador antes de enviar no genera notificaciones ni correos.
- [ ] Historial: cada acción (envío, aprobación, rechazo, asignación, compra, recepción, cancelación) queda con fecha y autor; no hay control en la app para borrarlo.
- [ ] Responsivo: verificado en `mobile_390` y `desktop_1280` (listas como tarjetas en celular, tablas en escritorio, formularios utilizables en celular).
- [ ] Fechas DD/MM/AAAA en `America/Argentina/Buenos_Aires` y montos en ARS comprobados en pantalla.

## Limitations to report at the end

- El correo real requiere `RESEND_API_KEY` y `RESEND_FROM`; sin eso la función marca **"Pendiente de configuración"**. Sin dominio verificado en Resend, solo se puede enviar a la casilla dueña de la cuenta.
- WhatsApp/SMS quedan fuera de esta versión (sin servicios pagos ni conexiones inventadas).
- La aplicación organiza y registra las compras; no realiza pagos ni compras automáticas ni pide credenciales de Mercado Libre.
- El stock informado por el encargado es una referencia del momento, no un inventario automático.
