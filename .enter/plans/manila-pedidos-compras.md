# Manila | Pedidos y Compras

## Context

El proyecto es hoy una plantilla limpia de Vite + React + TS + Tailwind + shadcn, sin backend conectado ni modelo de datos. Se necesita una aplicación interna real (no maqueta) para que encargados de sector carguen solicitudes de insumos, indumentaria y maquinaria, y para que hasta seis administradores gestionen revisión, compra fuera de la app y recepción, sin compras duplicadas ni pérdida de trazabilidad.

Decisiones acordadas:
- **Acceso**: sin auto-Propietario por registro público. El Propietario se define por un correo autorizado cargado por mí en la tabla protegida `app_settings.owner_email`; mientras sea NULL nadie obtiene el rol. Los demás usuarios se crean por invitación desde el panel de usuarios.
- **Correo**: integración real con **Resend** (`RESEND_API_KEY`, `RESEND_FROM` vía `supabase_add_secret`). Sin secreto, los envíos quedan en **"Pendiente de configuración"** y nunca se simulan como enviados.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.

UI en español, fechas DD/MM/AAAA, zona `America/Argentina/Buenos_Aires`, moneda ARS por defecto. Sin IA ni chatbot.

**Sobre el correo del Propietario**: en la respuesta llegó el texto de ejemplo `[ESCRIBÍ ACÁ TU EMAIL]`, así que no tengo todavía la dirección real. El plan no queda bloqueado: implemento todo y, para el arranque del Propietario, uso el procedimiento explícito de la sección "Arranque del Propietario", que funciona **también si la cuenta ya existe**. Cuando me pases la dirección real, la siembro yo en `app_settings.owner_email`.

### Ajustes incorporados
1. Sin auto-Propietario: cuenta autorizada explícitamente + invitaciones/verificación para el resto.
2. Visibilidad por sector: el encargado lee **todos** los pedidos de su sector; edita **solo sus propios borradores** (los admins, todos).
3. Cambios posteriores a aprobación/compra: acción explícita **"Solicitar cambio"**, con aviso claro, sin modificar el artículo original y sin tocar las compras existentes.
4. **Recepción**: `cantidad recibida = aceptada + incorrecta + dañada`; los **faltantes se registran aparte** y **solo lo aceptado descuenta el saldo pendiente**.
5. Idempotencia real: clave única por operación + funciones transaccionales con `SELECT ... FOR UPDATE` en compras y recepciones.
6. Adjuntos: permisos separados para pedidos (`requests/{id}/...`) y compras (`purchases/{id}/...`, solo admin/owner).
7. Reintento de correo que incluye `pending_config`, con reclamo atómico (sin envíos duplicados).
8. **Revisión de cambios**: administradores **y** Propietario.
9. **Gestión de usuarios, roles y permisos: exclusivamente el Propietario**, unificado en rutas, pantallas y funciones del servidor.

---

## 1. Backend (Enter Cloud)

Primer paso: `supabase_enable`. El cliente generado en `src/integrations/supabase/client.ts` se usa tal cual (no se edita).

### Autenticación y autorización
- Email + contraseña. `supabase_configure_auth` con registro habilitado y verificación de correo; ningún registro obtiene acceso por sí solo.
- `app_settings` (fila única): `owner_email`, `invite_mode`, timestamps. Solo escribible por funciones `security definer` protegidas.
- Trigger `on_auth_user_created`: crea `profiles` con rol `pending`, `active = false`. Si el email coincide con `app_settings.owner_email` (case-insensitive) → `owner` + `active`. Bajo `pg_advisory_xact_lock` para que solo una cuenta pueda reclamar el rol.
- Función `sync_owner_profile()` (`security definer`): reconcilia una cuenta **ya existente** con `app_settings.owner_email` a `owner` + `active` + correo verificado. Se ejecuta al autorizar al Propietario y también en su primer ingreso. Así el acceso del Propietario no depende del momento del registro.
- **Invitaciones** (`manage-users`, service role): el Propietario crea cuentas con rol y sector preasignados; envía invitación por Resend si está configurado o devuelve una contraseña temporal para entregar en mano (cambio obligatorio al primer ingreso). Si el entorno no expone el service role, la función lo informa explícitamente y queda el camino alternativo: la persona se registra, verifica su correo y el Propietario la autoriza desde el panel.
- Sesión con `supabase.auth.onAuthStateChange` (listener antes de restaurar sesión, callback no-async, llamadas al cliente dentro de `setTimeout(...,0)`, guardando `user` y `session`).

### Arranque del Propietario (explícito, no automático)
1. Se despliega el esquema con `owner_email` NULL: nadie es Propietario y ningún registro obtiene acceso.
2. Cuando me pases la dirección real, la escribo en `app_settings.owner_email` y ejecuto `sync_owner_profile()`, que promueve esa cuenta a `owner` + `active` **aunque ya exista**.
3. Si preferís arrancar sin pasarme el correo: registrás tu cuenta, yo la leo desde la base, la autorizo con el mismo procedimiento y dejo registrado ese correo como `owner_email`. En ningún caso se otorga el rol por un registro público sin autorización.

### Tablas (RLS habilitada en la misma migración que las crea)

**M1 — Identidad**
- `app_settings`, `sectors` (id, name único, code, is_demo, active), `profiles` (id = `auth.users.id`, full_name, email, role `owner|admin|encargado|pending`, sector_id, active, email_verified, timestamps).
- Funciones `security definer`: `app_role()`, `app_sector()`, `is_admin()`, `is_owner()`, `has_app_access()`.
- Semilla de sectores **demostrativos** y editables (`is_demo = true`): Despostada, Envasado, Frío y Cámaras, Mantenimiento, Vestuarios y Comedor, Expedición.
- Políticas: cada uno lee su perfil; admin/owner leen todos; `full_name` propio editable; **solo el Propietario** cambia `role`, `sector_id`, `active` (policy + `guard_profile_update`, que rechaza cualquier cambio de rol hecho por otro usuario, incluido un administrador).

**M2 — Catálogo**
- `catalog_items` (name, category `insumos|indumentaria|maquinaria`, description, variant, unit, presentation, image_url, usual_supplier, usual_url, is_demo, active). Semilla demostrativa marcada como tal. Lectura: usuarios con acceso. Escritura: admin/owner. Desactivar sin borrar historial.

**M3 — Pedidos y artículos**
- `requests`: id, folio `PED-AAAA-000000` (sequence + trigger), **`idempotency_key uuid unique`**, requester_id, sector_id, category, needed_by, priority `normal|alta|urgente`, urgency_reason (obligatorio si urgente), notes, status, assigned_admin_id, submitted_at, closed_by/closed_reason/closed_at, repeated_from_id, campos de maquinaria (machinery_type, equipment_name, problem, expected_benefit, no_purchase_consequence, current_equipment, technical_specs, estimated_price, currency), timestamps.
- `request_items`: id, request_id, line_no, catalog_item_id (nullable), name, description, specifications jsonb, unit, package_content, reported_stock, **requested_qty** y **approved_qty** separadas, approved_at/approved_by, unit_price_estimate, currency, suggested_url, purchase_url, notes, photo_path, item_status, reason, timestamps.
- `change_requests`: id, request_id, request_item_id, requested_by, field, old_value, new_value, reason, status `pending|accepted|rejected`, resolved_by/resolved_at/resolution_note, created_at. **La propuesta se guarda en su propia operación** (`INSERT` directo protegido por RLS, en su propia transacción) antes de cualquier otro cambio, de modo que si la operación siguiente falla o se cancela, la solicitud de cambio igualmente queda registrada y visible.
- **RLS por sector**: el encargado lee todos los pedidos de su sector (incluidos los de colegas); **solo edita los que él creó** en `draft`/`needs_info`; admin/owner leen y editan todo. Comentarios y confirmación de recepción: cualquier encargado del sector.
- **Cambios posteriores (ajuste 3)**: al tocar un artículo con `approved_qty > 0` o con compras, la UI **no** intenta modificar el artículo: ofrece la acción explícita **"Solicitar cambio"**, que inserta la propuesta con valor anterior y nuevo, motivo, autor y fecha, avisa al usuario que queda en revisión y notifica a administradores y Propietario. El artículo original, `approved_qty` y las compras **no se alteran**. Si el admin acepta, aplica el cambio de forma explícita desde la cola de revisión.
- `guard_request_update`: transiciones permitidas al encargado (`draft → pendiente_revision`, `needs_info → pendiente_revision`); nunca `aprobado/completado/rechazado`; no puede cambiar `requester_id`, `sector_id` ni `approved_qty`.
- `guard_request_completion`: no permite `completado` con saldo aprobado pendiente, salvo cierre explícito de un admin con motivo registrado.
- `log_request_event` (after insert/update) escribe el historial con fecha y autor; sin política de DELETE.

**M4 — Compras**
- `purchases`: id, folio `CMP-...`, **`idempotency_key uuid unique`**, created_by, channel `proveedor|mercado_libre|otro`, vendor_name, purchase_date, **shipping_cost a nivel compra**, currency, total, order_number, estimated_delivery_date, tracking, invoice_path, notes, status.
- `purchase_items`: id, purchase_id, request_item_id, qty, unit_price, currency, product_url, notes.
- `register_purchase(p_payload jsonb, p_idempotency_key uuid)` (`security definer`, una transacción): si la clave ya existe devuelve la compra existente sin crear nada; `SELECT ... FOR UPDATE` sobre los `request_items` afectados; recalcula el saldo aprobado no comprado y rechaza con excepción si se excede. Dos administradores simultáneos no pueden sobrecomprar ni duplicar. Permite comprar un pedido en distintos proveedores y reunir artículos de varios pedidos y sectores.
- RLS: lectura admin/owner; el encargado ve en modo lectura las líneas de compra de sus propios artículos (sin datos internos de compras ajenas); escritura admin/owner.

**M5 — Recepción y faltantes (ajuste 4)**
- `receipts`: id, folio `REC-...`, **`idempotency_key uuid unique`**, request_id, purchase_id (nullable), received_at, received_by_name, created_by, notes, photo_path.
- `receipt_items`: id, receipt_id, request_item_id, **qty_received** (= aceptada + incorrecta + dañada, físicamente recibido), **qty_accepted**, qty_wrong, qty_damaged, **qty_missing** (registrada aparte, no forma parte de lo recibido), notes.
- Reglas: se valida `qty_received = qty_accepted + qty_wrong + qty_damaged`; **solo `qty_accepted` descuenta el saldo pendiente**; incorrectos y dañados no cuentan como entregados correctamente y mantienen saldo/incidente; los faltantes se registran por separado sin sumar a lo recibido. Ejemplo: llegan 10 y 2 están dañadas → recibidas 10, aceptadas 8 (descuentan saldo), 2 dañadas como incidente.
- `register_receipt(p_payload jsonb, p_idempotency_key uuid)`: transaccional, con `FOR UPDATE`, valida las fórmulas y que lo recibido no supere el saldo pendiente sin revisión administrativa. Evita doble registro de la misma recepción.
- RLS: el encargado del sector confirma recepción de los pedidos de su sector; admin/owner todo.

**M6 — Conversación, historial y notificaciones**
- `request_comments` (author_id, body, kind `comment|info_request`), `request_events` (append-only), `notifications` (user_id, request_id, title, body, kind, read_at), `admin_notification_prefs` (user_id PK, notify_new_requests, sector_ids[], categories[]).
- `email_messages`: id, request_id, recipient_user_id, recipient_email, subject, body, kind, status `pending|sending|sent|failed|pending_config`, attempts, error, provider_message_id, **claimed_at**, sent_at, unique (request_id, recipient_email, kind).
- Trigger al pasar `submitted_at` de NULL a valor (una sola vez): notificaciones en la app para administradores activos con la preferencia habilitada y **un** `email_messages` por administrador (no por artículo). Los borradores no generan nada.
- Notificación interna al encargado cuando: se pide más información, se aprueba/rechaza un artículo, se registra una compra o una fecha estimada de entrega, y cuando su cambio queda pendiente de revisión. A administradores y Propietario cuando entra una solicitud de cambio.
- **Reclamo atómico del correo**: `UPDATE email_messages SET status='sending', claimed_at=now() WHERE id = ANY(...) AND status IN ('pending','failed','pending_config') AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes') RETURNING *`. El `UPDATE` condicional es atómico por fila: dos reintentos simultáneos no envían el mismo mensaje dos veces; los `pending_config` se reintentan en cuanto el servicio queda configurado.

**M7 — Storage (ajuste 6)**
- Bucket privado `request-attachments` con carpetas separadas: `requests/{request_id}/...` (fotos, presupuestos, documentación; acceso = quien puede ver ese pedido) y `purchases/{purchase_id}/...` (facturas y comprobantes; **solo admin/owner**, porque una compra puede abarcar varios sectores). El encargado no puede listar ni descargar comprobantes de compras, ni siquiera de compras que incluyan sus artículos.
- Bucket `catalog-images` para imágenes de catálogo.
- Políticas evaluadas con `is_admin()`/`has_app_access()` y pertenencia al pedido.

### Funciones de backend
- `send-request-emails`: `Deno.serve`, CORS + preflight, sin SQL crudo, logs diagnósticos. Verifica que el llamador sea admin/owner o el solicitante. Reclama `pending`/`failed`/`pending_config`, envía con Resend vía `Deno.env.get('RESEND_API_KEY')` / `RESEND_FROM`; sin secretos → `pending_config`; éxito → `sent` + `provider_message_id`; error → `failed` + `error`. El pedido se guarda aunque el correo falle.
- `manage-users`: invitación/creación de cuentas, autorización, rol, sector, desactivación y arranque del Propietario. Verifica en el servidor que quien llama sea Propietario (`is_owner()`); **ningún camino del cliente puede otorgar roles**. La revisión de solicitudes de cambio no pasa por acá: se resuelve con RLS para admin/owner.

---

## 2. Frontend

### Design system (`src/index.css` + `tailwind.config.ts`)
Fondo claro, azul oscuro (`--primary` ≈ `214 62% 20%`) y verde (`--accent`/`--success` ≈ `152 55% 34%`), `--warning` ámbar y `--destructive` rojo para urgencia y problemas. Sombras suaves (`--shadow-card`), radios; ningún color directo (`text-white`/`bg-white`). Solo modo claro (se elimina `.dark`). Variantes de botón grandes y legibles sobre fondo claro, más badges de estado y prioridad.

### Estructura
```
src/lib/         constants.ts  format.ts  validation.ts  permissions.ts  idempotency.ts
src/hooks/       use-auth.tsx  use-requests.ts  use-catalog.ts  use-notifications.ts
src/components/  layout/app-shell.tsx  status-badge.tsx  priority-badge.tsx
                 empty-state.tsx  error-state.tsx
                 request/request-list.tsx  request-items-table.tsx  comment-thread.tsx
                 history-timeline.tsx  attachment-upload.tsx  product-link.tsx
                 change-request-dialog.tsx  change-request-banner.tsx
                 admin/* (revisión por artículo, cambios, asignación, compra, recepción, usuarios)
```

### Rutas (`src/router.tsx`)
- Público: `/login` (ingresar / registrarse), `/pendiente` (cuenta sin autorizar).
- Encargado y admin: `/`, `/nuevo`, `/nuevo/:categoria`, `/pedidos`, `/pedidos/:id`, `/perfil`, `/notificaciones`.
- Admin **y Propietario**: `/admin`, `/admin/pedidos`, `/admin/revision-cambios`, `/admin/pendientes-compra`, `/admin/compras`, `/admin/compras/nueva`, `/admin/compras/:id`, `/admin/catalogo`, `/admin/sectores`, `/admin/reportes`.
- **Solo Propietario**: `/admin/usuarios`.
- Guardas: sin sesión → `/login`; sin acceso (`pending` o `active = false`) → `/pendiente`; `/admin/*` solo admin/owner. La misma regla se aplica en servidor: `change_requests` actualizable por admin/owner; `profiles.role/sector_id/active` solo por Propietario vía `manage-users`.

### Pantallas
- **Inicio encargado**: "Nuevo pedido" destacado, "Pedidos de mi sector", contadores de pendientes / en gestión / pendientes de recepción.
- **Wizard `/nuevo`**: tres categorías con campos condicionales (insumos con varios artículos, catálogo u "Otro artículo", especificaciones, cantidad, unidad, contenido por presentación, stock informado opcional, enlace, foto; indumentaria con talle/medida, motivo, destinatario; maquinaria con los campos del punto 3.C y sin exigir precio). Resumen previo, "Guardar borrador" y envío con clave de idempotencia generada al abrir el intento y reutilizada en los reintentos; ante error se conservan los datos.
- **Lista `/pedidos`**: número, fecha, categoría, prioridad, estado, responsable; tabla en escritorio, tarjetas en celular; marca de "creado por otro" donde no hay permiso de edición.
- **Detalle `/pedidos/:id`**: artículos con estado y saldo pendiente por artículo, fechas estimadas, alerta de cambio pendiente, conversación, historial con autor y fecha, adjuntos separados (pedido vs. compra, estos últimos solo admin/owner), "Abrir producto sugerido" (admin/owner, otra pestaña), "Solicitar cambio" en artículos aprobados o comprados, "Registrar recepción" y "Repetir pedido" → nuevo **borrador** nunca enviado automáticamente.
- **Panel admin**: colas (nuevas, urgentes, sin responsable, asignadas a mí, aprobadas pendientes de compra, compras pendientes de recepción, entregas vencidas, cambios pendientes), buscador por número/producto/solicitante y filtros por sector, categoría, prioridad, estado, responsable y fechas. Aprobación **por artículo** con solicitada vs. aprobada y motivo obligatorio al rechazar, cancelar o cambiar cantidad. "Asignarme pedido" con aviso si otro admin se adelantó, y reasignación registrada.
- **Compras**: alta con canal, proveedor, fecha, artículos y cantidades, precio unitario, envío a nivel compra, total, enlace comprado, orden, entrega estimada, seguimiento, comprobante y observaciones; compras parciales y multi-pedido vía `register_purchase`. Sin pagos ni credenciales de Mercado Libre.
- **Consolidación**: agrupa solo productos idénticos (artículo, variante, medida, talle y presentación), total con desglose por sector y solicitud, descuenta lo ya comprado, nunca agrupa texto libre no confirmado.
- **Recepción**: fecha, quién recibió, y por artículo: aceptadas, incorrectas, dañadas y **faltantes por separado**; el formulario muestra la fórmula y el saldo resultante en vivo. Si hay faltantes, incorrectos o dañados se avisa que el pedido no se cierra por esa entrega.
- **Catálogo y sectores**: alta, edición y desactivación sin borrar historial; lo demostrativo identificado como tal.
- **Usuarios (solo Propietario)**: invitar/crear cuentas con rol y sector, autorizar pendientes, desactivar. **Revisión de cambios (admin y Propietario)**: aceptar aplicando el cambio explícitamente, o rechazar con motivo.
- **Reportes**: por sector, por estado y antigüedad, gasto por período, productos más pedidos.
- **Estados visibles**: Borrador, Pendiente de revisión, Falta información, En evaluación, Aprobado / pendiente de compra, En compra, Comprado / pendiente de recepción, Recibido parcialmente, Completado, Rechazado, Cancelado. Resumen del pedido calculado por el avance de sus artículos.
- Mensajes claros de confirmación, error, carga y listas vacías.

### Documentación
Actualizar `CodeGuideline.md` con páginas, hooks y componentes nuevos.

---

## Implementation checklist

- [ ] `supabase_enable` y verificación del cliente generado en `src/integrations/supabase/client.ts`.
- [ ] `supabase_configure_auth`: registro con verificación de correo, sin autoautorización.
- [ ] M1: `app_settings` + `sectors` + `profiles` + funciones (`app_role/app_sector/is_admin/is_owner/has_app_access`) + trigger de alta (rol `pending`, salvo el correo autorizado) + `sync_owner_profile()` + `guard_profile_update` + RLS; confirmar con `supabase_get_table_schema`.
- [ ] M1: semilla de sectores demostrativos (`is_demo = true`).
- [ ] M1: `owner_email` sembrado con la dirección real que me pases (mientras sea NULL lo dejo informado como configuración pendiente).
- [ ] M2: `catalog_items` + RLS + semilla demostrativa; confirmar RLS.
- [ ] M3: `requests` (+ `idempotency_key` unique) + `request_items` + `change_requests` + folio + `guard_request_update`, `guard_item_update`, `guard_request_completion`, `log_request_event`, `submit_request` y `assign_request` atómicos + RLS (lectura por sector, edición por creador); confirmar RLS.
- [ ] M4: `purchases` (+ `idempotency_key` unique) + `purchase_items` + `register_purchase(payload, idempotency_key)` con `FOR UPDATE` y validación de saldos + RLS; confirmar RLS.
- [ ] M5: `receipts` (+ `idempotency_key` unique) + `receipt_items` (recibida = aceptada + incorrecta + dañada; faltantes aparte) + `register_receipt(payload, idempotency_key)` + RLS; confirmar RLS.
- [ ] M6: `request_comments`, `request_events`, `notifications`, `admin_notification_prefs`, `email_messages` (unique + `claimed_at`) + triggers de encolado y notificación; confirmar RLS.
- [ ] M6: policies de `change_requests` para lectura/escritura de admin **y** Propietario, e inserción propia del encargado como operación independiente.
- [ ] M7: buckets `request-attachments` (carpetas `requests/{id}/` y `purchases/{id}/` con permisos separados) y `catalog-images` + políticas.
- [ ] `src/index.css` + `tailwind.config.ts`: tokens azul oscuro/verde, badges y variantes de botón; eliminar `.dark`.
- [ ] `src/lib/`: `format.ts`, `constants.ts`, `validation.ts`, `permissions.ts`, `idempotency.ts`.
- [ ] `use-auth.tsx` (sesión + perfil + guardas) y `app-shell` responsivo con rutas en `router.tsx`.
- [ ] `/login` y `/pendiente` con las reglas de autorización acordadas.
- [ ] Inicio de encargado con contadores reales y `/pedidos` con columnas, tarjetas responsivas y marca de creador.
- [ ] Wizard `/nuevo` con campos condicionales, resumen, borrador y envío idempotente.
- [ ] Detalle `/pedidos/:id`: artículos con saldo, alerta de cambio pendiente, comentarios, historial, adjuntos separados, "Abrir producto sugerido", recepción y "Repetir pedido".
- [ ] `change-request-dialog.tsx`: "Solicitar cambio" inserta la propuesta como operación independiente y no modifica el artículo original.
- [ ] Panel `/admin` con todas las colas (incluida la de cambios), buscador y filtros.
- [ ] Revisión por artículo con motivos obligatorios, aprobación/rechazo parcial y cierre de saldo con motivo.
- [ ] `/admin/revision-cambios` (admin y Propietario): aceptar o rechazar sin alterar compras existentes.
- [ ] `/admin/compras`, `/admin/compras/nueva` (con `register_purchase`) y `/admin/compras/:id`.
- [ ] `/admin/pendientes-compra` con agrupación estricta y desglose por sector.
- [ ] `/admin/catalogo` y `/admin/sectores` con alta/edición/desactivación.
- [ ] `/admin/usuarios` (solo Propietario) con invitación/creación de cuentas, autorización y desactivación.
- [ ] `/perfil` con preferencias de notificación por sector y categoría.
- [ ] `/admin/reportes` con los cuatro reportes acordados.
- [ ] `send-request-emails` y `manage-users` escritos, desplegados con `supabase_deploy_edge_function` y verificados en logs; secretos de Resend pedidos con `supabase_add_secret`.
- [ ] `CodeGuideline.md` actualizado.

## Verification checklist

- [ ] `pnpm lint` y `pnpm exec tsc --noEmit` sin errores; `pnpm run build` correcto al final.
- [ ] Acceso: un registro nuevo queda `pending` sin acceso y **no** obtiene Propietario; la cuenta autorizada sí, incluso si ya existía (`sync_owner_profile`).
- [ ] Un encargado no puede cambiar `role`/`sector_id` (UPDATE rechazado por policy/trigger) y `/admin/usuarios` no es accesible para admin ni encargado.
- [ ] Aislamiento por sector: un encargado lee **todos** los pedidos de su sector y 0 filas de otro sector (consulta directa y UI).
- [ ] Edición de borradores: el encargado no puede editar el borrador de un colega de su sector; un admin sí.
- [ ] "Solicitar cambio": la propuesta queda en `change_requests` con valor anterior y nuevo, el artículo original y `approved_qty` no cambian, las compras existentes quedan intactas, y el registro sobrevive aunque falle la operación siguiente.
- [ ] Revisión de cambios: disponible para admin y Propietario; un encargado no puede resolverla (UPDATE rechazado).
- [ ] Doble administrador: dos intentos simultáneos de asignar el mismo pedido → uno gana y el otro ve "ya asignado"; dos `register_purchase` simultáneos sobre el mismo saldo → el segundo rechazado por el bloqueo y saldos correctos.
- [ ] Idempotencia: reenviar con la misma clave crea un solo pedido, una sola compra y una sola recepción; una clave distinta crea un registro nuevo legítimo.
- [ ] Recepción 10 con 2 dañadas: `qty_received = 10`, `qty_accepted = 8`, `qty_damaged = 2`, el saldo baja 8, el pedido **no** se completa y las 2 dañadas quedan como incidente.
- [ ] Faltantes: un faltante registrado no suma a lo recibido ni descuenta saldo; el saldo pendiente queda exacto.
- [ ] Fórmula inválida (recibida ≠ aceptada + incorrecta + dañada) rechazada por `register_receipt`.
- [ ] Cierre de saldo: sin cierre explícito de un admin con motivo, un pedido con saldo aprobado pendiente no se marca completado.
- [ ] Pedido con varios artículos y URLs distintas; URL no http/https rechazada y el envío no se bloquea si el campo está vacío; "Abrir producto sugerido" solo admin/owner y en otra pestaña.
- [ ] Rechazo parcial: un artículo rechazado con motivo y el resto continúa su circuito; el resumen lo refleja.
- [ ] Un pedido comprado en dos proveedores distintos conserva la relación solicitado/aprobado/comprado.
- [ ] Una compra reúne artículos de dos sectores y el desglose por sector se mantiene.
- [ ] Adjuntos: el encargado del sector A no puede listar ni descargar `purchases/{id}/...` de una compra que incluye sus artículos.
- [ ] Correo: sin `RESEND_API_KEY` el estado es "Pendiente de configuración" y el pedido se guarda; un `pending_config` se reintenta cuando el servicio queda configurado; dos reintentos simultáneos no envían dos veces el mismo mensaje.
- [ ] Consolidación: 5 y 3 cajas del mismo guante → 8 con desglose; texto libre sin equivalencia no se agrupa; lo ya comprado no se cuenta dos veces.
- [ ] Borrador: crear y modificar un borrador no genera notificaciones ni correos.
- [ ] Historial: envío, aprobación, rechazo, asignación, compra, recepción y cancelación quedan con fecha y autor; no hay control para borrarlo.
- [ ] Responsivo: verificado en `mobile_390` y `desktop_1280` (tarjetas en celular, tablas en escritorio).
- [ ] Fechas DD/MM/AAAA en `America/Argentina/Buenos_Aires` y montos en ARS comprobados en pantalla.

## Límites y configuración pendiente (se informarán al final)

- `owner_email`: llegó el texto de ejemplo en lugar de la dirección; hasta que me pases la real, la siembro o autorizo tu cuenta por el procedimiento explícito y lo informo como configuración pendiente.
- El correo real requiere `RESEND_API_KEY` y `RESEND_FROM`; sin eso queda **"Pendiente de configuración"**. Sin dominio verificado en Resend solo se puede enviar a la casilla dueña de la cuenta.
- Si el entorno de funciones no expone el service role, la creación de cuentas desde el panel queda informada como no disponible y se usa el camino alternativo (registro verificado + autorización del Propietario).
- WhatsApp y SMS quedan fuera de esta versión.
- La app organiza y registra compras; no paga ni compra automáticamente ni pide credenciales de Mercado Libre.
- El stock informado por el encargado es una referencia del momento, no un inventario automático.
