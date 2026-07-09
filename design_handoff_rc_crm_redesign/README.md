# Handoff: Rediseño RC CRM (Pisos Industriales)

## Overview
Rediseño integral del CRM de RC Pisos Industriales (repo `frandaok9-sys/crm`, Next.js App Router + Tailwind v4 + shadcn). Reemplaza el header superior + home "lanzador" por una **sidebar fija auto-plegable** con navegación persistente, y rediseña los 8 módulos: Inicio, Clientes, Pipeline, Presupuestos, Productos, Cobranzas, Métricas y Panel de control. Soporta modo oscuro (grafito, por defecto) y modo claro ("concrete").

## About the Design Files
Los archivos `.dc.html` de este paquete son **referencias de diseño hechas en HTML** — prototipos que muestran el look & feel e interacciones previstas. NO son código de producción. La tarea es **recrear estos diseños dentro del codebase existente** (`Next.js + Tailwind v4 + shadcn/base-ui`), reutilizando sus patrones: tokens CSS en `app/globals.css`, `components/ui/button.tsx`, server components por página, `@hello-pangea/dnd` para el kanban.

Abrí `RC CRM Rediseño v2.dc.html` en un navegador para ver el diseño final navegable (la v1 es una iteración anterior, solo referencia).

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciados y estados están definidos con valores exactos. Recrear pixel-perfect usando Tailwind y los tokens del proyecto.

## Arquitectura de layout (cambio principal)
Reemplazar el `<header>` de `app/(app)/layout.tsx` por:

- **Sidebar fija a la izquierda, ancho 68px** (solo íconos/puntos), que **se expande a 236px al hover** (transición `width 0.22s ease`). La versión expandida se superpone al contenido (`position: absolute` dentro de un wrapper de 68px, `z-index` alto, sombra `0 6px 16px rgba(0,0,0,0.35)`) para no reacomodar la página.
- Contenido de la sidebar (arriba → abajo):
  1. **Logo**: cuadrado 34×34px, radius 8px, fondo `#E0503A`, "RC" en Oswald 600 15px blanco. Al lado (solo expandida): "RC CRM" Oswald 600 15px uppercase + "PISOS INDUSTRIALES" 10px letter-spacing 0.14em color muted. Clic → /dashboard.
  2. Divider 1px `--border`.
  3. **Nav items** (8): fila con punto 6×6px radius 2px (activo: acento `#E0503A`; inactivo: `--avbd`), label 13.5px (activo: weight 700 color `--text`, fondo `--navactive` radius 8px; inactivo: weight 500 color `--muted`), badge numérico a la derecha 11px (Clientes 5, Pipeline 7, Presupuestos 2). Hover: fondo `--hover`. Padding 9px 12px. Plegada: solo el punto centrado, `title` como tooltip.
  4. **Toggle de tema** (abajo): pastilla 38×21px radius 11px. Oscuro: fondo `--chip`, borde `--avbd`, ☾ 10px muted a la derecha, perilla blanca 15px a la izquierda. Claro: fondo y borde `#E0503A`, ☀ blanco a la izquierda, perilla a la derecha. Transiciones 0.2s. Plegada: solo el glifo ☀/☾ centrado. Toda la fila es clickeable con hover `--hover`. Persistir elección (hoy: cookie `theme` — mantener).
  5. **Footer usuario**: avatar circular 32px con iniciales, nombre 12.5px weight 600, rol 10.5px uppercase muted, "Salir" 11px a la derecha (hover → `--text1`). Border-top 1px `--border`.

- **Main**: `flex:1`, scroll propio, padding de página `32px 36px 40px`, contenido `max-width: 1240px` (Pipeline sin max-width, scroll horizontal).

## Design Tokens
Tipografía (ya existen en el proyecto):
- **Títulos**: Oswald (var `--font-oswald`), weight 600, `text-transform: uppercase`, letter-spacing 0.02em. H1 páginas: 26px (Inicio: 30px). Números de KPI: Oswald 600, 22–30px, `tabular-nums`.
- **Cuerpo**: Geist Sans (el mock usa Archivo como sustituto visual). Base 14px; tablas 13–13.5px; labels de columnas 11px uppercase letter-spacing 0.1em weight 700.

Colores modo **oscuro** (por defecto):
```
--bg: #0D0E10   --side: #111214   --panel: #101114
--card: #15161A --card2: #17181C
--border: #24262B --border2: #1D1F24
--text: #FFFFFF --text1: #E5E6E3 --text2: #C9CBD1
--muted: #8A8D95 --muted2: #797D86
--hover: #191B1F --navactive/--chip: #1E2025
--avbg: #24262B --avbd: #33363D --input: #15161A
shadow: 0 6px 16px rgba(0,0,0,0.35)
```
Colores modo **claro** ("concrete"):
```
--bg: #F2F3F5   --side: #FFFFFF   --panel: #ECEDF0
--card/--card2/--input: #FFFFFF
--border: #E2E3E8 --border2: #E8E9ED
--text: #1B1C20 --text1: #24252A --text2: #3F4147
--muted: #6B6E76 --muted2: #83868E
--hover: #F5F6F8 --navactive/--chip: #EDEEF1
--avbg: #EDEEF1 --avbd: #D8DAE0
shadow: 0 6px 16px rgba(20,22,30,0.12)
```
Acentos y semánticos (ambos modos):
```
Acento marca (primary):  #E0503A
Cotizado (charts):       #5B82D6   (paleta ya validada del repo)
Etapas pipeline: Prospecto #8A8D95 · Contactado #5B82D6 · Propuesta enviada #D9A03C · Negociación #9B7BE8 · Ganado #4FA97A
Badges tinte: color de texto = variante clara/oscura del semántico; fondo = semántico al 14% alpha
  (texto en oscuro / en claro): verde #7CC8A2 / #2E7D54 · azul #8FAEE8 / #3D62B8 · ámbar #E0B45E / #A5721E · rojo #EE9585 / #B8402E
```
Radios: cards 12px · filas/botones 8–10px · badges 6px · chips/pills 20px. Botón primario: fondo `#E0503A`, texto blanco 700 13.5px, padding 11px 18px, radius 9px, hover `brightness(1.1)`.

## Screens / Views

### 1. Inicio (`/dashboard`)
- Kicker fecha 11px uppercase letter-spacing 0.18em color acento; "HOLA, {nombre}" Oswald 30px. Botón "+ Nueva oportunidad" a la derecha.
- **4 KPI cards** (grid 4 col, gap 14px): card `--card`, borde `--border`, **borde izquierdo 3px acento**, radius 12px, padding 18px 20px. Label 11px uppercase muted → número Oswald 30px → nota 12px (color semántico si aplica). Datos: Clientes, Oportunidades, Presupuestos enviados, Presupuestos aprobados (mismas queries actuales).
- **Fila 2** (grid 1.5fr/1fr): "PIPELINE POR ETAPA" — 5 filas con punto de color, label, barra de progreso (track `--chip` 8px radius 4px, fill color de etapa, ancho ∝ count) y count; link "Ver pipeline →" acento. "REQUIERE ATENCIÓN" — hasta 3 alertas: mini-card `--card2` con barrita vertical 3px de color semántico, título 13px 600 + subtítulo 12px muted. (Derivar de oportunidades sin actividad >7 días, propuestas sin respuesta, negociaciones por cerrar.)

### 2. Clientes (`/clientes`)
- Header: título + "{n} clientes en la cartera general". Botones: "Importar Excel" (outline: borde `--avbd`, texto `--text2`) y "+ Nuevo cliente" (primario).
- Input búsqueda 380px (bg `--input`, borde `--border` → focus `--muted`, radius 10px, padding 12px 16px).
- **Tabla** como card (radius 12px, overflow hidden). Header row bg `--card2`. Grid: `2.2fr 1.3fr 1.5fr 1fr 0.8fr 1.2fr` (Razón social, CUIT, Condición IVA, Localidad, Contactos, Vendedor). Filas: padding 14px 20px, border-bottom `--border2`, hover `--hover`. Razón social 13.5px 700 `--text` (link al detalle). **Condición IVA como badge**: Responsable Inscripto azul, Exento ámbar, Monotributo verde. Vendedor: avatar 22px iniciales + nombre.

### 3. Pipeline (`/oportunidades`)
- Header: título + "{n} oportunidades activas · arrastrá las tarjetas entre etapas" + botón primario.
- **Kanban** scroll-x, columnas 276px, gap 14px. Header de columna: label 12px uppercase 700 + **chip contador** (texto color de etapa, fondo etapa al 16% alpha, radius 10px) + total monetario compacto a la derecha (11.5px `--muted2`).
- **Contenedor de columna**: bg `--panel`, borde `--border2`, **border-top 3px del color de etapa**, radius 12px, padding 8px, min-height 140px.
- **Tarjeta**: bg `--card2`, borde `--border`, **border-left 3px color de etapa**, radius 10px, padding 13px 14px. Contenido: título 13.5px 700 + 📌 (opacity 0.25 si no fijada; fijada: opacity 1 + `outline: 1px solid #D9A03C`); cliente 12px muted + **chip m²** si tiene (10.5px, bg `--chip`, radius 10px); monto 14.5px 800 tabular + **avatar del vendedor 24px** (fondo = color asignado al vendedor al 18% alpha, iniciales en la variante clara/oscura); link "Ver / alertas →" 12px acento. Hover: `translateY(-2px)` + shadow + borde `--avbd` (transición 0.15s). Drag con `@hello-pangea/dnd` como hoy.
- Al pie de cada columna: **"＋ Agregar oportunidad"** — borde dashed `--avbd`, radius 9px, texto 12px `--muted2`, hover más visible.
- Agregar columna **Ganado** (verde) al final.

### 4. Presupuestos (`/presupuestos`)
- Tabla card. Grid: `1.6fr 2fr 1.1fr 1.3fr 1fr 1.3fr` (Número, Cliente, Estado, Total→right, Fecha, Vendedor). Número 13.5px 700 con nota de revisión debajo (11px muted, "Rev. 2 · 2 versiones"). **Estados como badges**: Aprobado verde, Enviado azul, Borrador gris (`--chip`/`--muted`), Rechazado rojo. Total alineado a la derecha, 700, tabular.

### 5. Productos (`/productos`)
- Header + botones Importar/Nuevo. Búsqueda 320px + **chips de marca** (Todas/Sinteplast/Ashford…): pill radius 20px; activa: fondo acento texto blanco; inactiva: transparente, borde `--avbd`, texto `--muted`.
- Tabla grid `2.6fr 0.9fr 0.9fr 0.7fr 1.1fr 0.6fr 1fr` (Producto+desc, Marca, Código, Unidad, Precio→right, IVA→right, Acciones→right). Producto: nombre 13.5px 700 + descripción 11.5px muted. Acción "Desactivar/Reactivar" texto 12.5px muted, hover `--text`. Fila inactiva: `opacity: 0.45`.

### 6. Cobranzas (`/cobranzas`)
- **5 KPI cards** (grid 5 col, padding 16px 18px, número Oswald 22px): Por cobrar ARS, Por cobrar USD, Cuentas con deuda, Facturas abiertas, Pagos sin imputar.
- Tabla grid `2fr 0.8fr 1.3fr 1.1fr 1.4fr 1fr` (Cliente, Moneda, Facturas abiertas→right, Antigüedad→right, Saldo deudor→right, acción). **Antigüedad semaforizada**: >60 días rojo weight 700, >30 ámbar weight 600, resto muted. "Ver cuenta →" acento. Nota al pie 12px con la leyenda del semáforo (sin emojis).

### 7. Métricas (`/metricas`)
- 4 KPI cards con borde izq. acento (Aprobado ARS, Aprobado USD, Conversión, m² en pipeline) + nota bajo Conversión.
- **2 charts** (grid 2 col): card con título uppercase + leyenda (cuadraditos 8px radius 2px: Cotizado `#5B82D6`, Aprobado `#E0503A`); barras agrupadas por mes (ancho 20px, radius 4px arriba, altura ∝ valor, mín 3px si >0), baseline 1px `--border`, labels de mes 11.5px `--muted2`. Mantener tooltip hover y "Ver tabla" (details) del código actual. Secciones "Aprobado por segmento", "Por vendedor" y "Embudo" siguen el mismo lenguaje (barras `#5B82D6`/`#E0503A`, tracks `--chip`).

### 8. Panel de control (`/admin`)
- **Tabs** (Resumen/Usuarios/Empresa): texto 13.5px, activa weight 700 `--text` con border-bottom 2px acento; inactiva `--muted`. Línea base 1px `--border`.
- Resumen: 5 stat cards (número Oswald 24px arriba, label abajo) + **banner ámbar** (fondo `#D9A03C` al 8–10%, borde al 35%, punto 8px ámbar, texto 13px) si hay usuarios pendientes.
- Usuarios: tabla `2.4fr 1.2fr 1fr 1fr` — avatar 30px + nombre/email, Rol, Estado badge (Activo verde / Pendiente ámbar), acción ("Activar" en acento para pendientes, "Editar" muted).
- Empresa: grid 1.4fr/1fr — card de datos (labels 11px uppercase + valores en inputs `--input` radius 8px; botón "Guardar cambios" primario) + card de logo (dropzone dashed 140px, nota "Se muestra en la cabecera y en los PDF de presupuestos").

## Interactions & Behavior
- Sidebar: expand on `mouseenter`, collapse on `mouseleave` del propio aside. Sin botones de toggle.
- Tema: toggle en sidebar; persiste (cookie `theme` existente). Transición de fondo 0.2–0.25s.
- Pipeline: drag & drop entre columnas (ya existe); pin toggle optimista (ya existe `togglePin`); hover-lift en tarjetas.
- Tablas: hover de fila `--hover`; toda la fila clickeable donde hay detalle.
- Productos: chips de marca filtran (hoy via searchParams `?marca=` — mantener); Desactivar/Reactivar optimista.
- Admin: tabs client-side (ya existe `AdminTabs`).
- Botones primarios hover: `filter: brightness(1.1)`. Links de acción hover: underline.

## State Management
Sin estado nuevo de servidor. Client-side: `hovered` (sidebar), tema (cookie existente), tab de admin (existente), pin/drag (existentes). Los badges del nav (conteos) salen de las mismas queries del dashboard — considerar un layout server component que los cargue.

## Assets
Sin assets nuevos. Fuentes: Oswald ya está (`--font-oswald`); cuerpo Geist ya está. El logo "RC" es tipográfico. Iconos del nav: puntos de 6px (no hay librería de íconos; si prefieren, lucide-react encaja con shadcn).

## Files
- `RC CRM Rediseño v2.dc.html` — **diseño final** navegable (8 módulos, ambos temas, sidebar auto-plegable). Abrir en navegador.
- `RC CRM Rediseño.dc.html` — v1, iteración anterior (referencia histórica).

Nota: los datos de los mocks son los datos demo reales de la app (5 clientes, 7 oportunidades, PRE-2026-0001/0002, etc.); Cobranzas y algunos m²/alertas usan cifras de ejemplo.
