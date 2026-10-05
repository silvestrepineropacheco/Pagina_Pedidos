# Manila | Pedidos y Compras

## Context

El proyecto es hoy una plantilla limpia de Vite + React + TS + Tailwind + shadcn, sin backend conectado ni modelo de datos. Se necesita una aplicación interna real (no maqueta) para que encargados de sector carguen solicitudes de insumos, indumentaria y maquinaria, y para que hasta seis administradores gestionen revisión, compra fuera de la app y recepción, sin compras duplicadas ni pérdida de trazabilidad.

Decisiones acordadas:
- **Acceso**: no hay auto-Propietario por registro público. El Propietario queda definido por un **correo autorizado explícitamente** cargado por mí en la tabla protegida `app_settings.owner_email`; mientras ese valor sea NULL nadie obtiene el rol. Los demás usuarios se crean por **invitación** desde el panel de usuarios.
- **Correo**: integración real con **Resend** (`RESEND_API_KEY`, `RESEND_FROM` vía `supabase_add_secret`). Sin secreto, los envíos quedan en **"Pendiente de configuración"** y nunca se simulan como enviados.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.

Toda la UI en español, fechas DD/MM/AAAA, zona `America/Argentina/Buenos_Aires`, moneda ARS por defecto. Sin IA ni chatbot.

**Único dato que necesito de vos**: el correo del Propietario autorizado. Sin él, `owner_email` queda NULL y ninguna cuenta recibe el rol hasta que me lo pases.

### Ajustes incorporados a este plan
1. Sin auto-Propietario: cuenta autorizada explícitamente + invitaciones/verificación para el resto.
2. Visibilidad por sector: el encargado lee **todos** los pedidos de su sector; edita **solo sus propios borradores** (y los admins todos).
3. Cambios posteriores a aprobación/compra: aviso claro y **solicitud de cambio registrada para revisión**, sin bloquear ni modificar nada en silencio y sin tocar las compras existentes.
4. Entregas parcialmente dañadas: lo aceptado **sí** descuenta saldo; lo dañado/incorrecto/faltante se registra como incidente aparte.
5. Idempotencia real: clave de idempotencia única por operación + funciones transaccionales con `SELECT ... FOR UPDATE` para compras y recepciones simultáneas.
6. Adjuntos: permisos separados para archivos de pedidos (`requests/{id}/...`) y de compras (`purchases/{id}/...`, solo admin/owner porque una compra puede abarcar varios sectores).
7. Reintento de correo que incluye `pending_config`, con reclamo atómico para que dos reintentos simultáneos no dupliquen envíos.

---

## 1. Backend (Enter Cloud)

Primer paso: `supabase_enable`. El cliente generado en `src/integrations/supabase/client.ts` se usa tal cual (no se edita).

### Autenticación y autorización
- Email + contraseña. `supabase_configure_auth` con registro habilitado y verificación de correo; **ningún registro obtiene acceso por sí solo**.
- `app_settings` (fila única): `owner_email`, `invite_mode`, timestamps. Escritura solo por función `security definer` protegida; sin políticas de INSERT/UPDATE/DELETE para usuarios comunes.
- Trigger `on_auth_user_created`: crea `profiles` con rol `pending`, `active = false`. Si el email coincide con `app_settings.owner_email` (comparación case-insensitive), el perfil nace `owner` y `active = true`. Protegido con `pg_advisory_xact_lock` para que solo una cuenta pueda reclamar el rol de Propietario.
- **Invitaciones**: función de backend `manage-users` (service role) invocada por el Propietario/Administrador para crear cuentas con rol y sector preasignados. Según disponibilidad, envía correo de invitación con Resend o devuelve una **contraseña temporal** para entregar en mano (con cambio obligatorio al primer ingreso). Si el service role no está disponible en el entorno, la función devuelve ese error explícito y queda el camino alternativo: la persona se registra, verifica su correo y el Propietario la autoriza desde el panel. Nunca autoautorización.
- Sesión con `supabase.auth.onAuthStateChange` (listener antes de restaurar sesión, callback no-async, llamadas al cliente dentro de `setTimeout(...,0)`, guardando `user` y `session`).

### Tablas (RLS habilitada en la misma migración que las crea)

**M1 — Identidad**
- `app_settings`, `sectors` (id, name único, code, is_demo, active), `profiles` (id = `auth.users.id`, full_name, email, role `owner|admin|encargado|pending`, sector_id, active, timestamps).
- Funciones `security definer`: `app_role()`, `app_sector()`, `is_admin()`, `is_owner()`, `has_app_access()`.
- Semilla de sectores **demostrativos** y editables (`is_demo = true`): Despostada, Envasado, Frío y Cámaras, Mantenimiento, Vestuarios y Comedor, Expedición.
- Políticas: cada uno lee su perfil; admin/owner leen todos; `full_name` propio editable; **solo el Propietario** cambia `role`, `sector_id`, `active` (policy + `guard_profile_update`, que rechaza cualquier cambio de rol hecho por otro usuario, incluido un admin).

**M2 — Catálogo**
- `catalog_items` (name, category `insumos|indumentaria|maquinaria`, description, variant, unit, presentation, image_url, usual_supplier, usual_url, is_demo, active). Semilla demostrativa marcada como tal. Lectura: usuarios con acceso. Escritura: admin/owner. Desactivar sin borrar historial.

**M3 — Pedidos y artículos**
- `requests`: id, folio `PED-AAAA-000000` (sequence + trigger), **`idempotency_key uuid unique`**, requester_id, sector_id, category, needed_by, priority `normal|alta|urgente`, urgency_reason (obligatorio si urgente, validado por trigger), notes, status, assigned_admin_id, submitted_at, closed_by/closed_reason/closed_at, repeated_from_id, campos de maquinaria (machinery_type nueva/reemplazo/reparación/mejora, equipment_name, problem, expected_benefit, no_purchase_consequence, current_equipment, technical_specs, estimated_price, currency), timestamps.
- `request_items`: id, request_id, line_no, catalog_item_id (nullable), name, description, specifications jsonb, unit, package_content, reported_stock, **requested_qty** y **approved_qty** separadas, approved_at/approved_by, unit_price_estimate, currency, suggested_url, purchase_url, notes, photo_path, item_status, reason, timestamps.
- `change_requests`: id, request_id, request_item_id, requested_by, field, old_value, new_value, reason, status `pending|accepted|rejected`, resolved_by/resolved_at/resolution_note, created_at.
- **RLS por sector (ajuste 2)**: el encargado **lee todos los pedidos de su sector** (incluidos los de sus colegas); **solo edita los que él creó** y en estado `draft`/`needs_info`; admin/owner leen y editan todo. Comentarios y confirmación de recepción: cualquier encargado del sector.
- **Ajuste 3 — cambios posteriores**: `guard_item_update` **no bloquea en silencio**: si el artículo tiene `approved_qty > 0` o compras asociadas, cualquier cambio de cantidad o especificación hecho por el encargado se rechaza explicando el motivo, se escribe en `change_requests` con el valor anterior y el nuevo, se notifica a los administradores y el artículo se marca "cambio pendiente de revisión". Las compras existentes nunca se alteran; si el admin acepta el cambio, lo aplica explícitamente desde la cola de revisión.
- `guard_request_update`: transiciones permitidas al encargado (`draft → pendiente_revision`, `needs_info → pendiente_revision`); nunca `aprobado/completado/rechazado`; no puede cambiar `requester_id`, `sector_id` ni `approved_qty`.
- `guard_request_completion`: no permite `completado` con saldo aprobado pendiente, salvo cierre explícito de un admin con motivo registrado.
- `log_request_event` (after insert/update) escribe el historial con fecha y autor; sin política de DELETE.

**M4 — Compras**
- `purchases`: id, folio `CMP-...`, **`idempotency_key uuid unique`**, created_by, channel `proveedor|mercado_libre|otro`, vendor_name, purchase_date, **shipping_cost a nivel compra**, currency, total, order_number, estimated_delivery_date, tracking, invoice_path, notes, status.
- `purchase_items`: id, purchase_id, request_item_id, qty, unit_price, currency, product_url, notes.
- **Ajuste 5 — transacción con bloqueo**: función `security definer` `register_purchase(p_payload jsonb, p_idempotency_key uuid)` que, en una sola transacción: verifica la clave de idempotencia (si ya existe, devuelve la compra existente sin crear nada), toma `SELECT ... FOR UPDATE` sobre los `request_items` afectados, recalcula el saldo aprobado no comprado y rechaza con excepción si se excede. Dos administradores simultáneos no pueden sobrecomprar ni duplicar. Permite comprar un pedido en distintos proveedores y reunir artículos de varios pedidos y sectores.
- RLS: lectura admin/owner; el encargado ve en modo lectura las líneas de compra de sus propios artículos (sin datos internos de compras ajenas); escritura admin/owner.

**M5 — Recepción y faltantes (ajuste 4)**
- `receipts`: id, folio `REC-...`, **`idempotency_key uuid unique`**, request_id, purchase_id (nullable), received_at, received_by_name, created_by, notes, photo_path.
- `receipt_items`: id, receipt_id, request_item_id, qty_received, **qty_accepted**, qty_missing, qty_wrong, qty_damaged, notes.
- Regla: **el saldo pendiente baja por `qty_accepted`**. Si llegan 10 y 2 están dañadas: 8 aceptadas descuentan saldo y 2 quedan registradas como incidente. Los incidentes no cierran el pedido: el artículo mantiene saldo hasta que se reponga o un admin cierre el saldo con motivo.
- `register_receipt(p_payload jsonb, p_idempotency_key uuid)`: transaccional, con `FOR UPDATE`, valida `qty_received = qty_accepted + faltante + incorrecto + dañado` y que lo recibido no supere el saldo pendiente sin revisión administrativa. Evita doble registro de la misma recepción.
- RLS: el encargado del sector confirma recepción de los pedidos de su sector; admin/owner todo.

**M6 — Conversación, historial y notificaciones**
- `request_comments` (author_id, body, kind `comment|info_request`), `request_events` (append-only), `notifications` (user_id, request_id, title, body, kind, read_at), `admin_notification_prefs` (user_id PK, notify_new_requests, sector_ids[], categories[]).
- `email_messages`: id, request_id, recipient_user_id, recipient_email, subject, body, kind, status `pending|sending|sent|failed|pending_config`, attempts, error, provider_message_id, **claimed_at**, sent_at, unique (request_id, recipient_email, kind).
- Trigger al pasar `submitted_at` de NULL a valor (una sola vez): notificaciones en la app para administradores activos con la preferencia habilitada y **un** `email_messages` por administrador (no por artículo). Los borradores no generan nada.
- Trigger de notificación interna al encargado cuando: se pide más información, se aprueba/rechaza un artículo, se registra una compra o una fecha estimada de entrega, y cuando un cambio queda pendiente de revisión.
- **Ajuste 7 — reclamo atómico**: el reintento reclama con `UPDATE email_messages SET status='sending', claimed_at=now() WHERE id = ANY(...) AND status IN ('pending','failed','pending_config') AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes') RETURNING *`. El `UPDATE` condicional es atómico por fila: dos reintentos simultáneos no pueden enviar el mismo mensaje dos veces. Los `pending_config` entran en el reintento en cuanto el servicio queda configurado.

**M7 — Storage (ajuste 6)**
- Bucket privado `request-attachments` con carpetas separadas: `requests/{request_id}/...` (fotos, presupuestos, documentación; acceso = quien puede ver ese pedido) y `purchases/{purchase_id}/...` (facturas y comprobantes; **acceso solo admin/owner**, porque una compra puede abarcar varios sectores). El encargado **no** puede leer ni listar comprobantes de compras, ni siquiera de compras que incluyan sus artículos.
- Bucket `catalog-images` para imágenes de catálogo.
- Políticas de storage evaluadas con `is_admin()`/`has_app_access()` y pertenencia al pedido.

### Funciones de backend
- `send-request-emails`: `Deno.serve`, CORS + preflight, sin SQL crudo, logs diagnósticos. Verifica que el llamador sea admin/owner o el solicitante. Reclama mensajes `pending`/`failed`/`pending_config`, envía con Resend vía `Deno.env.get('RESEND_API_KEY')` / `RESEND_FROM`; sin secretos → `pending_config` (nunca éxito simulado); éxito → `sent` + `provider_message_id`; error → `failed` + `error`, reintentable. El pedido se guarda aunque el correo falle.
- `manage-users`: invitación/creación de cuentas, autorización, cambio de rol y sector, desactivación. Verifica en el servidor que quien llama sea Propietario; nunca confía en el cliente.

---

## 2. Frontend

### Design system (`src/index.css` + `tailwind.config.ts`)
Fondo claro, azul oscuro (`--primary` ≈ `214 62% 20%`) y verde (`--accent` / `--success` ≈ `152 55% 34%`), `--warning` ámbar y `--destructive` rojo para urgencia y problemas. Sombras suaves (`--shadow-card`), radios y ningún color directo (`text-white`/`bg-white`). Solo modo claro (se elimina el bloque `.dark`). Variantes de botón grandes y legibles sobre fondo claro, más badges de estado y prioridad.

### Estructura
```
src/lib/         constants.ts (categorías/estados/prioridades/unidades/canales + color)
                 format.ts (DD/MM/AAAA, America/Argentina/Buenos_Aires, ARS)
                 validation.ts (URL http/https opcional, reglas por categoría)
                 permissions.ts (capacidades por rol, solo para UI)
                 idempotency.ts (genera y conserva la clave por intento de formulario)
src/hooks/       use-auth.tsx  use-requests.ts  use-catalog.ts  use-notifications.ts
src/components/  layout/app-shell.tsx  status-badge.tsx  priority-badge.tsx
                 empty-state.tsx  error-state.tsx
                 request/request-list.tsx  request-items-table.tsx  comment-thread.tsx
                 history-timeline.tsx  attachment-upload.tsx  product-link.tsx
                 change-request-banner.tsx
                 admin/* (revisión por artículo, asignación, compra, recepción, usuarios)
```

### Rutas (`src/router.tsx`)
- Público: `/login` (ingresar / registrarse), `/pendiente` (cuenta sin autorizar).
- Encargado y admin: `/`, `/nuevo`, `/nuevo/:categoria`, `/pedidos`, `/pedidos/:id`, `/perfil`, `/notificaciones`.
- Admin: `/admin`, `/admin/pedidos`, `/admin/pendientes-compra`, `/admin/compras`, `/admin/compras/nueva`, `/admin/compras/:id`, `/admin/catalogo`, `/admin/sectores`, `/admin/reportes`.
- Solo Propietario: `/admin/usuarios`, `/admin/revision-cambios`.
- Guardas: sin sesión → `/login`; sin acceso (`pending` o `active = false`) → `/pendiente`; `/admin/*` solo admin/owner; `/admin/usuarios` solo Propietario.

### Pantallas
- **Inicio encargado**: "Nuevo pedido" destacado, "Pedidos de mi sector", contadores de pendientes / en gestión / pendientes de recepción.
- **Wizard `/nuevo`**: tres categorías con campos condicionales (insumos con varios artículos, catálogo u "Otro artículo", especificaciones, cantidad, unidad, contenido por presentación, stock informado opcional, enlace, foto; indumentaria con talle/medida, motivo, destinatario; maquinaria con los campos del punto 3.C y sin exigir precio). Resumen previo al envío, "Guardar borrador", envío con clave de idempotencia generada al abrir el intento y reutilizada en los reintentos; ante error se conservan los datos.
- **Lista `/pedidos`**: número, fecha, categoría, prioridad, estado, responsable; tabla en escritorio, tarjetas en celular. El encargado ve todo su sector, con marca de "creado por otro" en los que no puede editar.
- **Detalle `/pedidos/:id`**: artículos con estado y saldo pendiente por artículo, fechas estimadas, alerta de cambio pendiente de revisión, conversación, historial con autor y fecha, adjuntos separados (pedido vs. compra, estos últimos solo admin), "Abrir producto sugerido" (solo admin, otra pestaña), "Registrar recepción" cuando corresponde y "Repetir pedido" → nuevo **borrador** nunca enviado automáticamente.
- **Panel admin**: colas (nuevas, urgentes, sin responsable, asignadas a mí, aprobadas pendientes de compra, compras pendientes de recepción, entregas vencidas, **cambios pendientes de revisión**), buscador por número/producto/solicitante y filtros por sector, categoría, prioridad, estado, responsable y fechas. Aprobación **por artículo** con solicitada vs. aprobada y motivo obligatorio al rechazar, cancelar o cambiar cantidad. "Asignarme pedido" con aviso si otro admin se adelantó, y reasignación registrada.
- **Compras**: alta con canal, proveedor, fecha, artículos y cantidades, precio unitario, envío a nivel compra, total, enlace comprado, orden, entrega estimada, seguimiento, comprobante y observaciones; compras parciales y multi-pedido vía `register_purchase`. Sin pagos ni credenciales de Mercado Libre.
- **Consolidación**: agrupa solo productos idénticos (artículo, variante, medida, talle y presentación), total con desglose por sector y solicitud, descuenta lo ya comprado, nunca agrupa texto libre no confirmado.
- **Recepción**: fecha, quién recibió, cantidades aceptadas / faltantes / incorrectas / dañadas por artículo, observaciones y foto; saldo siempre visible. Si hay dañados o faltantes, se avisa que el pedido no se cierra por esa entrega.
- **Catálogo y sectores**: alta, edición y desactivación sin borrar historial; lo demostrativo identificado como tal.
- **Usuarios (Propietario)**: invitar/crear cuentas con rol y sector, autorizar pendientes, desactivar. **Revisión de cambios**: aceptar (aplicando el cambio explícitamente) o rechazar con motivo.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.
- **Estados visibles**: Borrador, Pendiente de revisión, Falta información, En evaluación, Aprobado / pendiente de compra, En compra, Comprado / pendiente de recepción, Recibido parcialmente, Completado, Rechazado, Cancelado. Resumen del pedido calculado por el avance de sus artículos.
- Mensajes claros de confirmación, error, carga y listas vacías.

### Documentación
Actualizar `CodeGuideline.md` con páginas, hooks y componentes nuevos.

---

## Implementation checklist

- [ ] `supabase_enable` y verificación del cliente generado en `src/integrations/supabase/client.ts`.
- [ ] `supabase_configure_auth`: registro con verificación de correo, sin autoautorización.
- [ ] M1: `app_settings` + `sectors` + `profiles` + funciones (`app_role/app_sector/is_admin/is_owner/has_app_access`) + trigger de alta (rol `pending`, salvo el correo autorizado que nace `owner`) + `guard_profile_update` + RLS; confirmar con `supabase_get_table_schema`.
- [ ] M1: semilla de sectores demostrativos (`is_demo = true`).
- [ ] M1: `owner_email` cargado con el correo que me pases (si no lo tengo, queda NULL y lo dejo informado).
- [ ] M2: `catalog_items` + RLS + semilla demostrativa; confirmar RLS.
- [ ] M3: `requests` (+ `idempotency_key` unique) + `request_items` + `change_requests` + folio + `guard_request_update`, `guard_item_update` (con registro de cambio, sin bloqueo silencioso), `guard_request_completion`, `log_request_event`, `submit_request` y `assign_request` atómicos + RLS de lectura por sector y edición por creador; confirmar RLS.
- [ ] M4: `purchases` (+ `idempotency_key` unique) + `purchase_items` + `register_purchase(payload, idempotency_key)` con `FOR UPDATE` y validación de saldos + RLS; confirmar RLS.
- [ ] M5: `receipts` (+ `idempotency_key` unique) + `receipt_items` (aceptadas/faltantes/incorrectas/dañadas) + `register_receipt(payload, idempotency_key)` + RLS; confirmar RLS.
- [ ] M6: `request_comments`, `request_events`, `notifications`, `admin_notification_prefs`, `email_messages` (unique + `claimed_at`) + triggers de encolado y notificación; confirmar RLS.
- [ ] M7: buckets `request-attachments` (carpetas `requests/{id}/` y `purchases/{id}/` con permisos separados) y `catalog-images` + políticas.
- [ ] `src/index.css` + `tailwind.config.ts`: tokens azul oscuro/verde, badges y variantes de botón; eliminar `.dark`.
- [ ] `src/lib/`: `format.ts`, `constants.ts`, `validation.ts`, `permissions.ts`, `idempotency.ts`.
- [ ] `use-auth.tsx` (sesión + perfil + guardas) y `app-shell` responsivo con rutas en `router.tsx`.
- [ ] `/login` y `/pendiente` con las reglas de autorización acordadas.
- [ ] Inicio de encargado con contadores reales y `/pedidos` con columnas, tarjetas responsivas y marca de creador.
- [ ] Wizard `/nuevo` con campos condicionales, resumen, borrador y envío idempotente.
- [ ] Detalle `/pedidos/:id`: artículos con saldo, alerta de cambio pendiente, comentarios, historial, adjuntos separados, "Abrir producto sugerido", recepción y "Repetir pedido".
- [ ] Panel `/admin` con todas las colas (incluida la de cambios), buscador y filtros.
- [ ] Revisión por artículo con motivos obligatorios, aprobación/rechazo parcial y cierre de saldo con motivo.
- [ ] `/admin/revision-cambios`: aceptar o rechazar cambios registrados sin alterar compras existentes.
- [ ] `/admin/compras`, `/admin/compras/nueva` (con `register_purchase`) y `/admin/compras/:id`.
- [ ] `/admin/pendientes-compra` con agrupación estricta y desglose por sector.
- [ ] `/admin/catalogo` y `/admin/sectores` con alta/edición/desactivación.
- [ ] `/admin/usuarios` (Propietario) con invitación/creación de cuentas, autorización y desactivación.
- [ ] `/perfil` con preferencias de notificación por sector y categoría.
- [ ] `/admin/reportes` con los cuatro reportes acordados.
- [ ] `send-request-emails` y `manage-users` escritos, desplegados con `supabase_deploy_edge_function` y verificados en logs; secretos de Resend pedidos con `supabase_add_secret`.
- [ ] `CodeGuideline.md` actualizado.

## Verification checklist

- [ ] `pnpm lint` y `pnpm exec tsc --noEmit` sin errores; `pnpm run build` correcto al final.
- [ ] Acceso: un registro nuevo queda `pending` sin acceso y **no** obtiene Propietario; la cuenta con el correo autorizado sí; un encargado no puede cambiar `role`/`sector_id` (UPDATE rechazado por policy/trigger).
- [ ] Aislamiento por sector: un encargado lee **todos** los pedidos de su sector y 0 filas de otro sector (verificado con consulta directa y en la UI).
- [ ] Edición de borradores: el encargado no puede editar el borrador de un colega de su sector; un admin sí.
- [ ] Cambio tras aprobación/compra: el intento del encargado muestra aviso, queda en `change_requests` con valor anterior y nuevo, y **las compras existentes no cambian**; el admin puede aceptarlo o rechazarlo.
- [ ] Doble administrador: dos intentos simultáneos de asignar el mismo pedido → uno gana y el otro ve "ya asignado"; dos `register_purchase` simultáneos sobre el mismo saldo → el segundo es rechazado por el bloqueo y los saldos quedan correctos.
- [ ] Idempotencia: reenviar el mismo envío (misma clave) crea un solo pedido, una sola compra y una sola recepción; una clave distinta crea un registro nuevo legítimo.
- [ ] Pedido con varios artículos y URLs distintas; URL no http/https rechazada y el envío no se bloquea si el campo está vacío; "Abrir producto sugerido" solo para admin y en otra pestaña.
- [ ] Rechazo parcial: un artículo rechazado con motivo y el resto continúa su circuito; el resumen del pedido lo refleja.
- [ ] Un pedido comprado en dos proveedores distintos conserva la relación solicitado/aprobado/comprado.
- [ ] Una compra reúne artículos de dos sectores y el desglose por sector se mantiene.
- [ ] Entrega parcial: 10 recibidas con 2 dañadas → 8 aceptadas descuentan saldo, 2 quedan como incidente y el pedido **no** se completa; una segunda entrega de 2 lo completa.
- [ ] Cierre de saldo: sin cierre explícito de un admin con motivo, un pedido con saldo aprobado pendiente no se marca completado.
- [ ] Adjuntos: el encargado del sector A no puede listar ni descargar `purchases/{id}/...` de una compra que incluye sus artículos de otros sectores.
- [ ] Correo: sin `RESEND_API_KEY` el estado es "Pendiente de configuración" y el pedido se guarda; un `pending_config` pasa a reintentarse cuando el servicio queda configurado; dos reintentos simultáneos no envían dos veces el mismo mensaje.
- [ ] Consolidación: 5 y 3 cajas del mismo guante → 8 con desglose; texto libre sin equivalencia no se agrupa; lo ya comprado no se cuenta dos veces.
- [ ] Borrador: crear y modificar un borrador no genera notificaciones ni correos.
- [ ] Historial: envío, aprobación, rechazo, asignación, compra, recepción y cancelación quedan con fecha y autor; no hay control para borrarlo.
- [ ] Responsivo: verificado en `mobile_390` y `desktop_1280` (tarjetas en celular, tablas en escritorio).
- [ ] Fechas DD/MM/AAAA en `America/Argentina/Buenos_Aires` y montos en ARS comprobados en pantalla.

## Límites y configuración pendiente (se informarán al final)

- El correo real requiere `RESEND_API_KEY` y `RESEND_FROM`; sin eso queda **"Pendiente de configuración"**. Sin dominio verificado en Resend solo se puede enviar a la casilla dueña de la cuenta.
- Si el entorno de funciones no expone el service role, la creación de cuentas desde el panel queda informada como no disponible y se usa el camino alternativo (registro verificado + autorización del Propietario).
- WhatsApp y SMS quedan fuera de esta versión.
- La app organiza y registra compras; no paga ni compra automáticamente ni pide credenciales de Mercado Libre.
- El stock informado por el encargado es una referencia del momento, no un inventario automático.
