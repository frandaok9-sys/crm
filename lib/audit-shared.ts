/**
 * Parte "pura" del registro de auditoría: etiquetas, categorías y tipos.
 * SIN importar Prisma, para que pueda usarse tanto en el servidor
 * (lib/audit-log.ts) como en componentes cliente (filtros del panel).
 */

export const ACTION_LABELS: Record<string, string> = {
  "user.login": "Inicio de sesión",
  "user.demo_login": "Acceso de demostración",
  "user.created": "Usuario creado",
  "user.activated": "Usuario activado",
  "user.role_changed": "Rol modificado",
  "user.permissions_changed": "Permisos modificados",
  "client.created": "Cliente creado",
  "client.updated": "Cliente editado",
  "client.assigned": "Cliente reasignado",
  "clients.imported": "Clientes importados",
  "contact.created": "Contacto creado",
  "opportunity.created": "Oportunidad creada",
  "opportunity.updated": "Oportunidad editada",
  "opportunity.moved": "Oportunidad movida de etapa",
  "opportunity.pin_toggled": "Oportunidad fijada/desfijada",
  "reminder.created": "Alerta creada",
  "reminder.deleted": "Alerta eliminada",
  "quote.created": "Presupuesto creado",
  "quote.updated": "Presupuesto editado",
  "quote.status_changed": "Estado de presupuesto cambiado",
  "quote.revised": "Nueva revisión de presupuesto",
  "quote.invoiced": "Presupuesto facturado",
  "ledger.movement_created": "Movimiento de cuenta corriente",
  "ledger.movement_deleted": "Movimiento eliminado",
  "product.created": "Producto creado",
  "product.updated": "Producto editado",
  "products.imported": "Productos importados",
  "company.settings_updated": "Configuración de empresa actualizada",
  "cartera.reassigned": "Cartera reasignada",
  "assistant.query": "Consulta al asistente",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const AUDIT_CATEGORIES: { id: string; label: string; prefixes: string[] }[] = [
  { id: "sesion", label: "Sesión", prefixes: ["user.login", "user.demo_login"] },
  {
    id: "usuarios",
    label: "Usuarios",
    prefixes: ["user.created", "user.activated", "user.role_changed", "user.permissions_changed"],
  },
  { id: "clientes", label: "Clientes", prefixes: ["client.", "clients.", "contact."] },
  { id: "oportunidades", label: "Oportunidades", prefixes: ["opportunity.", "reminder."] },
  { id: "presupuestos", label: "Presupuestos", prefixes: ["quote."] },
  { id: "financiero", label: "Financiero", prefixes: ["ledger.", "cartera."] },
  { id: "catalogo", label: "Catálogo", prefixes: ["product.", "products."] },
  { id: "empresa", label: "Empresa", prefixes: ["company."] },
  { id: "asistente", label: "Asistente", prefixes: ["assistant."] },
];

export function actionsForCategory(id: string): string[] {
  const cat = AUDIT_CATEGORIES.find((c) => c.id === id);
  if (!cat) return [];
  return Object.keys(ACTION_LABELS).filter((a) =>
    cat.prefixes.some((p) => a === p || a.startsWith(p))
  );
}

export type AuditFilters = {
  actorId?: string;
  category?: string;
  desde?: string; // AAAA-MM-DD
  hasta?: string;
  page?: number;
};

export type AuditEntry = {
  id: string;
  fecha: string;
  actor: string;
  action: string;
  actionLabel: string;
  entidad: string | null;
  detalle: string | null;
  ip: string | null;
};

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};
