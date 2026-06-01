
## Causa raíz

El `billing-cycle` actual, cuando la suscripción tiene `stripe_subscription_id`, **solo crea la factura local en `procesando` y asume que la suscripción recurrente de Stripe cobrará sola** (y que el webhook actualizará). Pero las facturas que Stripe generó el 1 de junio para tus dos cuentas activas quedaron en **estado `draft`** (verificado: `in_1TdJqTCUpJnsv7il2eALv1iE`, Financial Company, $499 MXN, `status: draft`, sin `number`, sin `hosted_invoice_url`). Una invoice en draft nunca se cobra ni dispara webhook → por eso no hay `intentos_cobro`, no hay `stripe_payment_intent_id` y la factura local lleva semanas en `procesando`.

Cuentas activas afectadas (suscripciones SaaS, no clientes finales):
- **Financial Company** — `sub_1THOteCUpJnsv7ilAIKDuEzW` — $499 — factura draft `in_1TdJqTCUpJnsv7il2eALv1iE`.
- **Todito a crédito** — `sub_1TFNrACUpJnsv7il5VeUUFXp` — $999 — pendiente de verificar igual situación.

## Plan

### 1. Diagnóstico final (un paso, sin código)
Inspeccionar en Stripe ambas suscripciones (`sub_1THOteCUpJnsv7ilAIKDuEzW` y `sub_1TFNrACUpJnsv7il5VeUUFXp`) y sus últimas invoices para confirmar `collection_method`, `default_payment_method` y por qué la invoice quedó en draft. Esto sólo lee datos.

### 2. Reparación inmediata de junio (one-shot)
Crear edge function temporal `billing-fix-drafts` (o reutilizar invocación manual) que, para cada suscripción activa:
- Recupere la última invoice del período actual.
- Si está en `draft`: `stripe.invoices.finalizeInvoice(id)` y luego `stripe.invoices.pay(id)`.
- Si está en `open`: `stripe.invoices.pay(id)`.
- Si se paga, actualizar la factura local: `estado='pagada'`, `stripe_invoice_id`, `stripe_payment_intent_id`, `fecha_pago`, y avanzar `fecha_proximo_cobro` al 1 del mes siguiente.
- Si falla el cobro, marcar suscripción `gracia` y registrar `intentos_cobro` con `error_mensaje`.

### 3. Arreglo permanente en `billing-cycle`
Reemplazar la rama "Stripe-billed = no hacer nada" por una rama que **sí ejecute y reconcilie** el cobro cada 1 de mes:
- Tras crear la factura local, buscar la invoice abierta/draft de Stripe para esa suscripción del período actual; si no existe, dejar que Stripe la genere y reintentar (loop con backoff corto) o forzar `stripe.invoices.create({ customer, subscription, auto_advance: true })`.
- Finalizar + pagar la invoice (`finalizeInvoice` → `pay`), igual que en el paso 2.
- Reflejar el resultado en la factura local (`pagada` / `gracia`) y en `intentos_cobro`.
- Mantener el flujo actual de `gracia` a 3 días → `suspendida`.

### 4. Resiliencia
- Añadir log + entrada en `intentos_cobro` por cada intento (éxito o fallo) para tener trazabilidad real.
- Confirmar que el webhook de Stripe (`invoice.payment_succeeded`, `invoice.payment_failed`) actualiza la factura local — si no existe handler o no está enlazado al evento de invoice de suscripción, agregarlo como red de seguridad complementaria, no como único mecanismo.

### 5. Verificación
- Ejecutar `billing-fix-drafts` para las 2 cuentas y validar en Stripe que ambas invoices quedan en `paid` y en la BD que las facturas pasan a `pagada` con `fecha_proximo_cobro = 2026-07-01`.
- Revisar logs de la función para confirmar ausencia de errores.

## Detalles técnicos

- Archivos a tocar: `supabase/functions/billing-cycle/index.ts` (modificar rama `isStripeBilled`), nueva `supabase/functions/billing-fix-drafts/index.ts` (one-shot, invocable manualmente desde la UI de Super Admin o vía curl).
- Stripe API: `invoices.list({ subscription, status: 'draft|open', limit: 1 })`, `invoices.finalizeInvoice`, `invoices.pay`. Versión `2025-08-27.basil`.
- Tablas tocadas: `facturas` (UPDATE estado/fecha_pago/stripe_*), `suscripciones` (UPDATE fecha_proximo_cobro/estado), `intentos_cobro` (INSERT).
- Sin cambios de schema ni RLS — todas las columnas requeridas ya existen.
- Sin impacto en la operación de los clientes finales de cada empresa (préstamos/cobranza); este flujo es exclusivamente del cobro SaaS hacia las empresas que rentan PrestApps.
