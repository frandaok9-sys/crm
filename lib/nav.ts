import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  canAccessAdminPanel,
  canManageLedger,
  canLogExpenses,
  canAccessSensitiveAccounting,
  clientScope,
  opportunityScope,
  quoteScope,
  type Principal,
} from "@/lib/permissions";
import { EXECUTION_STAGE } from "@/lib/stages";
import { APP_COLORS, type NavItem } from "@/lib/nav-registry";

/**
 * Apps visibles para un usuario, con sus contadores (servidor). Misma capa
 * central de permisos que aplica cada página; el armazón solo MUESTRA lo que
 * el usuario puede abrir. `cache` evita repetir las consultas cuando el
 * layout y el escritorio de apps lo piden en la misma petición.
 */
export const getNavItems = cache(
  async (
    user: Principal & { id: string; dockHrefs?: string[] }
  ): Promise<NavItem[]> => {
    const [clientCount, opportunityCount, obraCount, quoteCount] =
      await Promise.all([
        prisma.client.count({ where: clientScope(user) }),
        prisma.opportunity.count({ where: opportunityScope(user) }),
        prisma.opportunity.count({
          where: { ...opportunityScope(user), stage: { name: EXECUTION_STAGE } },
        }),
        prisma.quote.count({ where: { ...quoteScope(user), version: 1 } }),
      ]);

    const color = (href: string) => APP_COLORS[href] ?? "#6b7280";
    const canConta = canManageLedger(user) || canLogExpenses(user);
    const contaSub = [
      ...(canManageLedger(user) ? ["Cobranzas"] : []),
      ...(canLogExpenses(user) ? ["Gastos"] : []),
      ...(canManageLedger(user) ? ["Finanzas"] : []),
      ...(canAccessSensitiveAccounting(user) ? ["Sueldos", "Personal"] : []),
    ];

    const items: NavItem[] = [
      { href: "/dashboard", label: "Inicio", hint: "Resumen, tareas y novedades", group: "comercial", color: color("/dashboard"), pinned: true },
      { href: "/clientes", label: "Clientes", hint: "Cuentas y contactos", group: "comercial", color: color("/clientes"), badge: clientCount, pinned: true },
      { href: "/oportunidades", label: "Pipeline", hint: "Oportunidades por etapa", group: "comercial", color: color("/oportunidades"), badge: opportunityCount, pinned: true },
      { href: "/presupuestos", label: "Presupuestos", hint: "Cotizaciones y pliegos", group: "comercial", color: color("/presupuestos"), badge: quoteCount, pinned: true },
      { href: "/metricas", label: "Métricas", hint: "Rendimiento comercial", group: "comercial", color: color("/metricas") },
      { href: "/mapa", label: "Mapa", hint: "Clientes y hojas de ruta", group: "herramientas", color: color("/mapa") },
      { href: "/obras", label: "En obra", hint: "Obras en ejecución", group: "operaciones", color: color("/obras"), badge: obraCount },
      { href: "/productos", label: "Productos", hint: "Catálogo y precios", group: "operaciones", color: color("/productos") },
      ...(canConta
        ? [{ href: "/contabilidad", label: "Contabilidad", hint: contaSub.join(" · "), group: "administracion" as const, color: color("/contabilidad"), pinned: true, sub: contaSub }]
        : []),
      { href: "/asistente", label: "Asistente IA", hint: "Consultas en lenguaje natural", group: "herramientas", color: color("/asistente") },
      ...(canAccessAdminPanel(user)
        ? [{ href: "/admin", label: "Panel de control", hint: "Usuarios, permisos, empresa", group: "sistema" as const, color: color("/admin") }]
        : []),
      { href: "/cuenta", label: "Mi cuenta", hint: "Perfil y contraseña", group: "sistema", color: color("/cuenta") },
    ];
    // Barra de accesos rápidos personalizada (dockHrefs en el usuario): si
    // la eligió, manda su lista y su orden; si está vacía, la barra por
    // defecto (pinned de arriba). Solo apps que puede abrir.
    const custom = (user.dockHrefs ?? []).filter((h) =>
      items.some((i) => i.href === h)
    );
    if (custom.length > 0) {
      for (const item of items) {
        const idx = custom.indexOf(item.href);
        item.pinned = idx >= 0;
        item.dockOrder = idx >= 0 ? idx : undefined;
      }
    } else {
      items.forEach((item, idx) => {
        if (item.pinned) item.dockOrder = idx;
      });
    }
    return items;
  }
);

/** Barra por defecto del sistema (para "Restablecer" en el editor). */
export function defaultDockHrefs(items: NavItem[]): string[] {
  return DEFAULT_DOCK.filter((h) => items.some((i) => i.href === h));
}
const DEFAULT_DOCK = ["/dashboard", "/clientes", "/oportunidades", "/presupuestos", "/contabilidad"];
