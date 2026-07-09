# CLAUDE.md — CRM para empresa de productos y servicios industriales

Este archivo define las reglas y convenciones del proyecto. Leelo antes de cada tarea y respetá estas reglas en todo el código que generes.

## Contexto del proyecto

CRM comercial y administrativo B2B para una empresa argentina que vende productos industriales y servicios. Cubre: cuentas/contactos, pipeline de oportunidades, actividades, catálogo, presupuestos, cuentas corrientes, métricas, panel de administración y (más adelante) un asistente de IA por WhatsApp. El usuario que dirige el proyecto NO es técnico: explicá los pasos de forma simple y pedí confirmación antes de acciones que requieran cuentas o credenciales suyas.

## Stack

- **App:** Next.js (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Datos:** PostgreSQL (Neon/Supabase) con Prisma
- **Auth:** Auth.js (NextAuth) con Google OAuth (SSO Google Workspace)
- **Hosting:** Vercel
- **IA (Fase 6):** API de Anthropic con function calling
- **WhatsApp (Fase 6):** WhatsApp Cloud API (Meta)

## Reglas de dominio (obligatorias)

1. **Dinero:** todo importe monetario usa tipo **decimal** (nunca float/number con coma flotante). Modelar el dinero como par `(amount: Decimal, currency)`.
2. **Multimoneda:** el sistema opera en **ARS y USD**. Nunca sumar montos de distintas monedas en un mismo saldo. La cuenta corriente mantiene **saldos separados por moneda**. Usar una tabla de tipos de cambio con fecha para conversiones/consolidados.
3. **Cuenta corriente:** todo movimiento (débito por factura/nota de débito, crédito por pago/nota de crédito) se escribe **dentro de una transacción de base de datos** para no dejar el saldo inconsistente. El saldo se deriva de los movimientos, con integridad garantizada.
4. **IVA:** los presupuestos calculan IVA discriminado por alícuota. Guardar alícuotas configurables.
5. **Presupuestos:** soportan versionado (Rev.1, Rev.2…), estados (Borrador→Enviado→Aprobado→Rechazado→Vencido) e ítems que pueden ser producto, servicio o texto libre.

## Seguridad y permisos (obligatorias)

1. **Permisos centralizados:** existe UNA capa central de autorización. Todos los módulos (web y asistente de WhatsApp) la usan. No duplicar reglas de acceso.
2. **Modelo de acceso:** por **rol** (Administrador, Gerente, Vendedor, Administración, Solo lectura) **+ propiedad del registro** (un vendedor solo ve sus cuentas/oportunidades; el gerente ve todo).
3. **Login Google:** restringido al dominio corporativo (parámetro `hd`). Un email fuera del dominio se rechaza. Un usuario nuevo válido queda en estado **pendiente** hasta que un Administrador lo activa y le asigna rol.
4. **Asistente WhatsApp (Fase 6):** SOLO LECTURA. Cada número debe estar vinculado y verificado contra un usuario. Las consultas heredan los permisos de ese usuario. Nunca operaciones de escritura ni financieras por WhatsApp. Registrar cada consulta (auditoría) y aplicar rate limiting.
5. **Secretos:** las claves/API keys van solo en `.env` (nunca en el código ni en el repositorio). Al necesitar una clave, pausá y pedile al usuario que la pegue en `.env`, indicando el nombre exacto de la variable.
6. **Auditoría:** registrar acciones sensibles (logins, cambios de permisos, altas/bajas de usuarios, ediciones financieras) en un `AuditLog`.

## Convenciones de código

- **Estructura sugerida:**
  - `/app` rutas y páginas
  - `/components` UI reutilizable
  - `/lib` lógica de negocio (presupuestos, cuenta corriente, métricas, permisos)
  - `/prisma` schema y migraciones
  - `/tests` tests de lógica financiera
- **Nombres:** claros y en inglés para el código; textos de interfaz en **español**.
- **Validación:** validar entradas del lado del servidor, no confiar solo en la pantalla.
- **Errores de dinero:** ante cualquier duda en cálculos financieros, priorizar corrección sobre velocidad y escribir un test.

## Testing

- Escribir tests para la lógica sensible: cálculo de IVA y totales de presupuesto, saldo de cuenta corriente, imputación de pagos, y verificación de permisos.
- Sembrar datos de prueba realistas (clientes, productos, pipeline poblado) para poder ver métricas desde temprano.

## Forma de trabajo

- Avanzar **de a un módulo por vez**. Al terminar cada módulo funcional, proponer al usuario probarlo y luego hacer un commit ("guardar el progreso").
- Explicar en pasos simples qué se necesita del usuario (cuentas, claves, aprobaciones).
- Mantener el orden de fases: 0 (cimientos/login/permisos) → 1 (CRM núcleo + panel admin) → 2 (presupuestos) → 3 (financiero) → 4 (métricas) → 5 (integraciones) → 6 (asistente WhatsApp).
- La capa de permisos y la capa de herramientas de consulta deben diseñarse pensando desde temprano en que las reutilizará el asistente de IA.
