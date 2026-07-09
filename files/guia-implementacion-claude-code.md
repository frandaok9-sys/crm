# Guía de implementación del CRM con Claude Code

> Guía pensada para vos: **no escribís código**, Claude Code lo hace. Vos sos el director del proyecto. Esta guía te dice qué instalar, qué cuentas crear, y qué pedirle a Claude Code paso a paso.

---

## 1. El stack que te recomiendo (y por qué)

Elegí un stack que es **fácil de hospedar, tiene poca configuración local y Claude Code domina a la perfección**. Menos fricción = menos callejones sin salida para vos.

| Pieza | Elección | Por qué te conviene |
|-------|----------|---------------------|
| Aplicación | **Next.js + TypeScript** | Un solo proyecto para todo (pantalla + servidor). Menos partes que coordinar. |
| Base de datos | **PostgreSQL en la nube (Neon o Supabase)** | No instalás nada en tu compu; la base vive en internet. Tiene plan gratis para empezar. |
| Manejo de datos | **Prisma** | Claude Code define la estructura de datos de forma ordenada y segura. |
| Diseño de pantallas | **Tailwind + shadcn/ui** | Componentes lindos y consistentes sin diseñar desde cero. |
| Login | **Auth.js con Google** | El SSO con Google Workspace que definimos. |
| Hosting | **Vercel** | Publicás la app conectándola a tu repositorio. Muy simple, con plan gratis. |
| IA (asistente) | **API de Anthropic (Claude)** | El cerebro del asistente de WhatsApp. |
| WhatsApp | **WhatsApp Cloud API (Meta)** | Canal oficial para el asistente. |

Todo esto es **cloud-first**: casi nada se instala en tu computadora, lo que reduce muchísimo los problemas típicos.

---

## 2. Tu rol: sos el director, no el programador

Cambio de mentalidad clave para trabajar bien con Claude Code:

- **Claude Code escribe el código.** Vos le describís qué querés, revisás el resultado en el navegador, y le decís qué está bien y qué corregir.
- **Trabajás de a pedacitos.** Nunca le pidas "hacé todo el CRM". Le pedís un módulo, lo probás, y recién ahí seguís con el próximo.
- **Probás siempre.** Después de cada pieza, abrís la app y verificás que funciona antes de avanzar.
- **Describís los problemas como se los contarías a una persona.** "Cuando aprieto Guardar no pasa nada" es un reporte perfecto. No necesitás saber por qué.
- **Tenés red de seguridad.** Con Git (control de versiones) siempre podés volver atrás si algo se rompe. Claude Code maneja Git por vos; solo tenés que pedirle que "guarde el progreso" cada vez que algo funciona.

> Regla de oro: **una cosa a la vez, probar, y solo entonces guardar y seguir.**

---

## 3. Preparación inicial (se hace una sola vez)

### 3.1 Suscripción a Claude
Para usar Claude Code necesitás una suscripción paga de Claude (Pro o Max). Para un proyecto de este tamaño, con sesiones largas, **Max** te va a rendir mejor. Alternativamente se puede usar con crédito de API, pero la suscripción es más simple para vos.

### 3.2 Instalar Claude Code
Recomendación para vos: usá la **app de escritorio de Claude Code**, que te permite trabajar **sin terminal**. Descargala desde el sitio oficial de Claude Code (para Mac, Windows o Linux). Si en algún momento te piden usar comandos, la app o el instalador nativo se encargan; no necesitás instalar Node.js por tu cuenta.

Documentación oficial de referencia: `https://docs.claude.com/en/docs/claude-code/overview`

### 3.3 Cuenta de GitHub (tu red de seguridad)
Creá una cuenta gratuita en `https://github.com`. Ahí se va a guardar el historial del proyecto. Claude Code se conecta y hace el trabajo pesado; vos solo autorizás. Esto te permite: no perder nada, volver atrás si algo falla, y publicar en Vercel después.

---

## 4. Lo que tenés que hacer POR FUERA (cuentas y credenciales)

Esto es lo que **ni Claude Code ni yo podemos hacer por vos**: crear cuentas, verificar tu identidad y generar claves. Estas acciones las hacés vos en los sitios web correspondientes, porque involucran tus credenciales y tu identidad. Claude Code te va a pedir que pegues cada clave en un archivo seguro del proyecto (llamado `.env`) y te va a decir exactamente dónde.

> **Importante sobre seguridad:** las claves (API keys) son como contraseñas. No las compartas en chats, capturas ni mensajes. Van únicamente en el archivo `.env` del proyecto, que nunca se publica.

Checklist por integración:

### 4.1 Clave de la API de Anthropic (para el asistente de IA)
- Entrá a `https://console.anthropic.com`, sección **API Keys**, y creá una clave.
- La vas a necesitar recién en la Fase 6 (asistente de WhatsApp), pero podés tenerla lista antes.

### 4.2 Google Cloud — credenciales OAuth (para el login con Google Workspace)
- En `https://console.cloud.google.com` creás un proyecto y unas "credenciales OAuth 2.0".
- Configurás que solo se acepte tu dominio corporativo.
- Te da un **Client ID** y un **Client Secret** que pegás en el `.env`.
- Es un poco laberíntico la primera vez; cuando llegues, pedime los pasos exactos y te guío pantalla por pantalla (o Claude Code te guía con la interfaz actual).

### 4.3 Base de datos PostgreSQL (Neon o Supabase)
- Creás una cuenta gratuita en `https://neon.tech` o `https://supabase.com`.
- Te dan una "cadena de conexión" (un texto largo) que pegás en el `.env`.
- Con eso Claude Code conecta la app a la base sin que instales nada local.

### 4.4 Vercel (hosting, para publicar la app)
- Cuenta en `https://vercel.com`, conectada a tu GitHub.
- Publicar es prácticamente apretar un botón una vez conectado.

### 4.5 WhatsApp Business — Cloud API (Fase 6, la más laboriosa)
- Se gestiona desde la plataforma de Meta (Meta for Developers / WhatsApp Business Platform).
- Requiere: una cuenta de Meta Business, verificar el negocio, y un número de teléfono dedicado para el bot.
- Es el trámite más largo (la verificación de negocio puede demorar). Conviene arrancarlo con tiempo antes de la Fase 6.
- Te da un **token** y un **número** que van al `.env`.

### 4.6 Dominio (opcional al principio, necesario para producción)
- Un dominio propio (ej. `crm.tuempresa.com`) hace falta para el login con Google en producción y para el webhook de WhatsApp (que necesita una dirección pública segura).
- Al desarrollar y probar podés usar las direcciones temporales que da Vercel.

**Qué hace cada quién, en claro:**
- **Vos:** crear cuentas, verificar identidad/negocio, generar claves, pegarlas en `.env` cuando Claude Code te lo indique, y apretar "publicar".
- **Claude Code:** todo el código, la estructura de datos, conectar las piezas usando esas claves, y guiarte con los comandos.
- **Yo:** el plan, los prompts, y guiarte en cada paso cuando te trabes.

---

## 5. Construcción fase por fase (con prompts para copiar)

Trabajá **una fase a la vez**. Dentro de cada fase, un módulo a la vez. Después de cada pedido: probá en el navegador y, si funciona, pedile a Claude Code "guardá el progreso en Git".

Antes de empezar, poné el archivo `CLAUDE.md` (te lo dejo aparte) en la carpeta del proyecto. Es el "manual de reglas" que Claude Code lee siempre.

### Arranque del proyecto
> **Prompt:** "Vamos a crear un CRM. Leé el archivo CLAUDE.md antes de empezar. Creá un proyecto nuevo con Next.js, TypeScript, Tailwind y shadcn/ui, y configuralo con Prisma apuntando a mi base de datos PostgreSQL (te voy a pasar la cadena de conexión). Conectá el proyecto a un repositorio de GitHub. Explicame en pasos simples qué necesitás de mí."

### Fase 0 — Cimientos (login + roles + estructura)
> **Prompt:** "Implementá el login con Google (Auth.js) restringido a mi dominio corporativo. Un usuario que se loguea con Google válido queda en estado 'pendiente' hasta que un administrador lo activa. Creá la estructura de datos base: usuarios con rol y estado, y los roles Administrador, Gerente, Vendedor, Administración y Solo lectura. Dejá lista una capa central de permisos que después usen todos los módulos."
>
> **Qué probar:** que podés entrar con tu cuenta de Google, que un email de otro dominio es rechazado, y que un usuario nuevo queda pendiente.

### Fase 1 — CRM núcleo + Panel de administración
> **Prompt (módulo 1):** "Creá el módulo de Cuentas (empresas cliente) y Contactos, con listado, alta, edición y ficha. Cada cuenta tiene un vendedor asignado."
>
> **Prompt (módulo 2):** "Creá el pipeline de Oportunidades con vista Kanban por etapas configurables y motivo de pérdida obligatorio al marcar Perdido."
>
> **Prompt (módulo 3):** "Creá el módulo de Actividades (llamada, email, reunión, visita, tarea) vinculables a cuenta, contacto u oportunidad, con vencimientos y una vista de pendientes de hoy."
>
> **Prompt (módulo 4 - panel admin):** "Creá el Panel de Administración (solo rol Administrador): dar de alta colaboradores por email corporativo, asignar rol y permisos, activar/suspender usuarios, y un tablero de monitoreo con últimos accesos y actividad reciente."
>
> **Qué probar:** crear una empresa, moverla por el pipeline, cargar una actividad, y desde el panel dar de alta un colaborador de prueba y cambiarle el rol.

### Fase 2 — Presupuestos
> **Prompt (módulo 1):** "Creá el catálogo de Productos y Servicios, con listas de precios en ARS y USD e IVA por ítem."
>
> **Prompt (módulo 2):** "Creá el módulo de Presupuestos: encabezado (cliente, vendedor, moneda, validez, condiciones), ítems con producto/servicio, cantidad, descuento y subtotal, cálculo de IVA discriminado, totales, estados (Borrador→Enviado→Aprobado→Rechazado→Vencido) y versionado (Rev.1, Rev.2)."
>
> **Prompt (módulo 3):** "Generá el PDF del presupuesto con los datos de mi empresa, términos y condiciones."
>
> **Qué probar:** armar un presupuesto con productos y un servicio, cambiar de estado, generar el PDF y revisar que los totales e IVA den bien.

### Fase 3 — Financiero (cuentas corrientes)
> **Prompt (módulo 1):** "Permití convertir un presupuesto aprobado en factura, y registrar facturas, pagos y notas de crédito. Todos los montos con tipo decimal y los movimientos de cuenta corriente dentro de transacciones de base de datos."
>
> **Prompt (módulo 2):** "Creá la Cuenta Corriente por cliente: libro de movimientos (débitos y créditos), saldo en tiempo real por moneda (ARS y USD por separado), imputación de pagos a comprobantes, y reporte de antigüedad de saldos (aging)."
>
> **Qué probar:** registrar una factura y un pago, y verificar que el saldo del cliente da correcto en cada moneda. **Esta es la parte más sensible: probala con varios casos.**

### Fase 4 — Métricas
> **Prompt:** "Creá los tableros: comercial (pipeline por etapa y vendedor, conversión, ticket promedio, ganadas vs perdidas, forecast) y financiero (por cobrar total, aging, DSO, top deudores). Respetando permisos: un vendedor ve solo lo suyo."
>
> **Qué probar:** que los números coinciden con los datos cargados y que un usuario Vendedor no ve datos de otros.

### Fase 5 — Integraciones
> Facturación electrónica AFIP, emails, exportaciones, notificaciones. Se van sumando de a una. AFIP es la más compleja: dejala para cuando el resto esté sólido.

### Fase 6 — Asistente de IA por WhatsApp
> **Prompt (paso 1):** "Creá una capa de herramientas de solo lectura para consultar el CRM (saldos, oportunidades, presupuestos, métricas), que respete los permisos del usuario. Exponela de forma reutilizable (idealmente como servidor MCP)."
>
> **Prompt (paso 2):** "Conectá WhatsApp Cloud API: recibir mensajes por webhook, identificar al usuario por su número (solo números vinculados y verificados), pasar la pregunta a Claude con function calling usando la capa de herramientas, y responder por WhatsApp. Solo lectura, con auditoría y límite de consultas."
>
> **Qué probar:** desde tu WhatsApp vinculado, preguntar "¿cuánto me debe el cliente X?" y que responda respetando tus permisos. Que un número no vinculado no reciba nada.

---

## 6. Multimoneda (ARS + USD) — cómo se maneja

Como operan en ambas monedas, hay que hacerlo bien desde el diseño de datos:

- **Todo monto se guarda como `decimal`** (nunca como número con coma flotante) para evitar errores de centavos.
- **Cada monto lleva su moneda**: se maneja como un par `(importe, moneda)`. Un presupuesto es en ARS o en USD, no mezclado.
- **La cuenta corriente lleva saldos separados por moneda.** No se suma ARS con USD en un mismo saldo.
- **Tabla de tipos de cambio**: para cuando quieras ver un total consolidado o convertir, se registra el tipo de cambio con su fecha. Útil por la inflación.

Esto ya está anotado como regla en el `CLAUDE.md` para que Claude Code lo respete siempre.

---

## 7. Reglas de oro para no romper nada

1. **Una cosa a la vez.** Un módulo, probar, guardar. Nunca todo junto.
2. **Probá en el navegador después de cada cambio.** Si algo falla, contáselo a Claude Code con tus palabras.
3. **Guardá el progreso (Git) cuando algo funciona.** Es tu botón de "deshacer" ante cualquier problema.
4. **No pegues claves en lugares públicos.** Solo en el archivo `.env`.
5. **La parte financiera y la de seguridad, probalas de más.** Son las que más cuidado piden.
6. **Antes de usarlo con datos y plata reales, hacé revisar la app por un desarrollador.** No es obligatorio para construir y probar, pero para producción con dinero de clientes es lo prudente. Claude Code puede dejar todo bien encaminado; una revisión final de un profesional te da tranquilidad.

---

## 8. Tu primer día concreto (hacé esto ahora)

1. Contratá la suscripción de Claude (Pro o Max).
2. Instalá la app de escritorio de Claude Code.
3. Creá tu cuenta de GitHub.
4. Creá la base de datos gratuita en Neon (o Supabase) y guardá la cadena de conexión.
5. Poné el archivo `CLAUDE.md` en una carpeta nueva para el proyecto.
6. Abrí Claude Code en esa carpeta y usá el **prompt de "Arranque del proyecto"** (sección 5).
7. Seguí con la **Fase 0**.

Cuando termines el arranque y la Fase 0, avisame y seguimos con la siguiente, revisando lo que haya quedado. Cualquier traba, me contás qué pasó y lo resolvemos.
