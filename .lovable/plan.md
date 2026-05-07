# Mi Cobranza — Vista Todo-en-Uno

Convertir `/mi-cobranza` en un centro de operaciones donde el cobrador trabaja sin salir de la página. Los clientes/cuotas no desaparecen al cobrar: cambian de estado visual y siguen ofreciendo todas las acciones (ver préstamo, pagos, reenviar ticket, etc.).

## Cambios principales

### 1. La cuota cobrada no desaparece
- En la pestaña **Cobrar**, mostrar TODAS las cuotas del rango (pendientes + ya cobradas) en una sola lista ordenada (pendientes arriba, cobradas abajo atenuadas con badge "Cobrada hoy").
- Quitar el bloque separado "Ya cobradas" — todo en una sola lista continua.
- Una cuota recién cobrada se actualiza in-place mostrando el monto cobrado y un check verde.

### 2. Nueva tarjeta "CuotaCard" expandible
Cada cuota se vuelve un panel acordeón. Al hacer clic en la tarjeta (o en un botón "Ver más") se expande mostrando:

- **Resumen del préstamo**: ID, monto original, saldo total restante, próxima cuota, % avanzado.
- **Tabla mini de amortización** (últimas 3 + próximas 3 cuotas) con estado de cada una.
- **Últimos pagos** del préstamo (5 más recientes) con fecha, monto, método.
- **Acciones rápidas** (sin navegar):
  - Cobrar / Cobrar de nuevo (si hay saldo)
  - Reenviar último ticket por WhatsApp
  - Descargar PDF del último recibo
  - Registrar visita
  - Registrar promesa
  - Llamar / WhatsApp al cliente
  - Ver foto del cliente
  - Abrir mapa con dirección/GPS
- **Botón secundario** "Abrir préstamo completo" (mantiene navegación opcional para casos avanzados).

### 3. Modales en lugar de navegación
Sustituir los `navigate()` actuales por modales/drawers dentro de la página:

- **DetallePrestamoDrawer**: side-drawer (desde la derecha) con tabs (Info, Amortización, Pagos, Documentos). Reusa componentes existentes de `PrestamoDetallePage`.
- **HistorialPagosModal**: lista de pagos del préstamo con acción "Reenviar ticket" y "Descargar PDF" por cada pago.
- **ClienteInfoModal**: ficha rápida del cliente (foto, contacto, dirección, otros préstamos).

### 4. Reenviar ticket / comprobante
- Botón "Reenviar último ticket" en cada CuotaCard si hay pagos previos.
- Botón "Reenviar" por cada pago en HistorialPagosModal.
- Reusa `sendWhatsAppReceipt` del `PagoModal` y la generación PNG existente. Si no hay último pago, deshabilitar.

### 5. Feedback visual mejorado
- Toast con acción "Reenviar ticket" inmediatamente después de cobrar.
- Badge dinámico en la tarjeta: Pendiente → Parcial → Cobrada (con animación suave).
- Contadores arriba se actualizan en vivo (ya lo hacen al invalidar queries).

## Detalles técnicos

- Archivos a editar:
  - `src/pages/CobradorViewPage.tsx`: refactor de `CuotaCard` a versión expandible; unificar lista pendientes+cobradas en pestaña Cobrar; añadir handlers para nuevos modales.
  - **Nuevos componentes** en `src/components/cobranza/`:
    - `CuotaCardExpandible.tsx` (reemplaza el sub-componente actual)
    - `DetallePrestamoDrawer.tsx` (Sheet de shadcn con tabs)
    - `HistorialPagosModal.tsx`
    - `ClienteInfoModal.tsx`
  - `src/lib/whatsapp-receipt.ts` (extraer la lógica de `sendWhatsAppReceipt` de `PagoModal` para reusarla desde tarjetas y modales).
- Hooks reusados: `useCobranzaRango`, `usePagosCobrador`. Nuevo hook `usePagosPorPrestamo(prestamoId)` para cargar historial bajo demanda al expandir.
- El estado de "expandido" se guarda en un `Set<cuotaId>` en el componente padre para que persista al re-render de queries.
- No se toca lógica financiera ni RPC (se mantiene `registrar_pago` + `rebuild_amortizacion`).

## Lo que NO cambia
- Permisos / roles.
- Lógica de cálculo de mora, distribución waterfall.
- Pestañas Cartera, Historial, Pagos, Perfil (siguen igual).
- `PagoModal` se sigue usando tal cual.
