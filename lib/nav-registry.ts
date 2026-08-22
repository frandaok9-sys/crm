/**
 * Registro de aplicaciones del CRM (parte PURA, sin base de datos: la usan
 * tanto el servidor como los componentes del navegador).
 *
 * Cada módulo es una "app": ícono, color, grupo y pista. El armazón
 * (escritorio de apps, dock, lanzador, barra móvil) se arma desde acá; los
 * permisos y los contadores los resuelve lib/nav.ts en el servidor.
 */

export type AppGroup = "comercial" | "operaciones" | "herramientas" | "administracion" | "sistema";

export const APP_GROUP_LABELS: Record<AppGroup, string> = {
  comercial: "Comercial",
  operaciones: "Operaciones",
  herramientas: "Herramientas",
  administracion: "Administración",
  sistema: "Sistema",
};

export const APP_GROUP_ORDER: AppGroup[] = [
  "comercial",
  "operaciones",
  "herramientas",
  "administracion",
  "sistema",
];

/** Tope de accesos rápidos en la barra (dock / barra inferior): que siga siendo una barra. */
export const DOCK_MAX = 7;

/** Ítem de navegación ya resuelto para un usuario (con contador si aplica). */
export type NavItem = {
  href: string;
  label: string;
  hint: string;
  group: AppGroup;
  /** Color del ícono (tokens iOS del diseño). */
  color: string;
  badge?: number;
  /** Va en el dock de escritorio y en la barra inferior del celular. */
  pinned?: boolean;
  /** Posición en la barra cuando el usuario la personalizó. */
  dockOrder?: number;
  /** Sub-apps (pestañas internas), solo informativo para el escritorio. */
  sub?: string[];
};

/** Íconos (trazos SVG 24×24) por ruta. */
export const ICON_PATHS: Record<string, string> = {
  "/apps":
    "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  "/dashboard": "M4 11l8-7 8 7M6 10v10h12V10",
  "/clientes":
    "M9 10a3 3 0 100-6 3 3 0 000 6M3.5 20a5.5 5.5 0 0111 0M16 4.5a3 3 0 010 6M18 14.5a5.5 5.5 0 013 4.5",
  "/oportunidades": "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
  "/obras": "M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6",
  "/mapa": "M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 10a2 2 0 100-4 2 2 0 000 4",
  "/pizarra": "M3 4h18v13H3zM8 21l4-4 4 4M8 12l3-3 2 2 3-4",
  "/presupuestos": "M7 3h8l4 4v14H7zM15 3v4h4M10 13h6M10 17h6",
  "/productos": "M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10",
  // Contabilidad (Cobranzas + Gastos + Finanzas): libro contable.
  "/contabilidad": "M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2zM18 8h1v12h-9M8 8h6M8 12h6",
  "/metricas": "M4 20h16M6 20v-6M11 20V8M16 20v-9",
  "/asistente":
    "M12 3l1.6 4.2L18 9l-4.4 1.8L12 15l-1.6-4.2L6 9l4.4-1.8zM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  "/admin": "M4 8h16M4 16h16M9 6v4M15 14v4",
  "/cuenta": "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
};

/** Colores de ícono por ruta (paleta iOS del diseño). */
export const APP_COLORS: Record<string, string> = {
  "/dashboard": "#e0503a",
  "/clientes": "#5b82d6",
  "/oportunidades": "#f0a14a",
  "/presupuestos": "#8e6bd6",
  "/metricas": "#d65b8e",
  "/mapa": "#2aa79b",
  "/pizarra": "#0ea5e9",
  "/obras": "#d9a03c",
  "/productos": "#6b7280",
  "/contabilidad": "#34a853",
  "/asistente": "#111827",
  "/admin": "#6b7280",
  "/cuenta": "#5b82d6",
};

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Palabras clave extra por app, para el buscador ("gastos" → Contabilidad). */
export const APP_KEYWORDS: Record<string, string> = {
  "/dashboard": "inicio home resumen tareas novedades",
  "/clientes": "cuentas contactos cartera empresas",
  "/oportunidades": "pipeline kanban etapas negocios",
  "/presupuestos": "cotizacion cotizaciones pliego pdf revision",
  "/metricas": "reportes rendimiento kpi conversion",
  "/mapa": "hojas de ruta gira geolocalizacion",
  "/pizarra": "pizarra tablero lucid miro presentacion ideas diagrama lluvia de ideas",
  "/obras": "en obra ejecucion costos avance",
  "/productos": "catalogo precios ashford lista",
  "/contabilidad": "cobranzas gastos finanzas sueldos personal cuenta corriente facturas balance",
  "/asistente": "ia chat preguntas inteligencia artificial",
  "/admin": "panel de control usuarios permisos empresa auditoria",
  "/cuenta": "mi cuenta perfil contraseña tema",
};

/** ¿La app coincide con lo que escribió el usuario? */
export function appMatches(item: { href: string; label: string; hint: string; sub?: string[] }, query: string): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  const haystack = normalizeText(
    `${item.label} ${item.hint} ${APP_KEYWORDS[item.href] ?? ""} ${(item.sub ?? []).join(" ")}`
  );
  return haystack.includes(q);
}

/** Ítem activo según la ruta actual (prefijo). */
export function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
