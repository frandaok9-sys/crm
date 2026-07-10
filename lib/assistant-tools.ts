import { prisma } from "@/lib/prisma";
import {
  type Principal,
  clientScope,
  opportunityScope,
  quoteScope,
  canViewAllRecords,
  canManageLedger,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { getMetrics } from "@/lib/metrics";
import { getReceivables } from "@/lib/receivables";
import { computeBalances } from "@/lib/ledger-calc";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";
import { QuoteStatus } from "@/lib/generated/prisma/enums";

/**
 * Caja de herramientas de SOLO LECTURA para el asistente de IA. Cada función
 * reutiliza las mismas reglas de alcance/permisos que el resto del CRM (nunca
 * las duplica) para que el bot vea exactamente lo que el usuario vería en la
 * web — ni más, ni menos. Pensado para ser reusado tal cual por el futuro
 * canal de WhatsApp (Fase 6).
 */

// ---------------------------------------------------------------------------
// Declaraciones (lo que el modelo ve)
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOLS = [
  {
    name: "resumen_cartera",
    description:
      "Resumen rápido: cantidad de clientes, oportunidades por etapa del pipeline y presupuestos por estado, dentro del alcance del usuario (su cartera propia o toda la empresa, según sus permisos).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "buscar_clientes",
    description:
      "Busca clientes por nombre (razón social o nombre de fantasía). Devuelve hasta 15 resultados con ciudad, segmento y vendedor asignado.",
    inputSchema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description: "Texto a buscar en el nombre del cliente.",
        },
      },
    },
  },
  {
    name: "detalle_cliente",
    description:
      "Busca UN cliente por nombre y devuelve sus datos, contactos, oportunidades y presupuestos recientes, y saldo de cuenta corriente (si el usuario tiene permiso financiero). Si hay varias coincidencias, devuelve la lista para que el usuario aclare cuál.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre (razón social o fantasía) del cliente.",
        },
      },
      required: ["nombre"],
    },
  },
  {
    name: "pipeline_oportunidades",
    description:
      "Lista oportunidades del pipeline comercial, opcionalmente filtradas por etapa (p. ej. 'Propuesta enviada'). Incluye cliente, monto, m² y vendedor.",
    inputSchema: {
      type: "object",
      properties: {
        etapa: {
          type: "string",
          description: "Nombre (o parte del nombre) de la etapa del pipeline.",
        },
      },
    },
  },
  {
    name: "presupuestos",
    description:
      "Lista presupuestos (solo la última revisión de cada uno), opcionalmente filtrados por estado (borrador, enviado, aprobado, rechazado, vencido) y/o nombre de cliente.",
    inputSchema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          description:
            "Borrador, Enviado, Aprobado, Rechazado o Vencido (en español, sin importar mayúsculas).",
        },
        cliente: { type: "string", description: "Nombre del cliente." },
      },
    },
  },
  {
    name: "metricas",
    description:
      "Métricas comerciales: totales cotizado/aprobado por moneda, tasa de conversión, m² en pipeline, aprobado por segmento, embudo por etapa y (si el usuario ve toda la cartera) comparativa por vendedor.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cobranzas",
    description:
      "Estado de cuentas por cobrar: saldos deudores por cliente y moneda, facturas abiertas y pagos sin imputar. Solo disponible para usuarios con permiso de cuenta corriente.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  user: Principal
): Promise<unknown> {
  const str = (key: string): string | undefined => {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  switch (name) {
    case "resumen_cartera":
      return resumenCartera(user);
    case "buscar_clientes":
      return buscarClientes(user, str("texto"));
    case "detalle_cliente":
      return detalleCliente(user, str("nombre") ?? "");
    case "pipeline_oportunidades":
      return pipelineOportunidades(user, str("etapa"));
    case "presupuestos":
      return presupuestosTool(user, str("estado"), str("cliente"));
    case "metricas":
      return getMetrics(user);
    case "cobranzas":
      if (!canManageLedger(user)) {
        return { error: "Este usuario no tiene permiso para ver cuentas por cobrar." };
      }
      return cobranzasResumen();
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

async function resumenCartera(user: Principal) {
  const [clientCount, opportunities, quotesRaw, stages] = await Promise.all([
    prisma.client.count({ where: clientScope(user) }),
    prisma.opportunity.findMany({
      where: opportunityScope(user),
      select: { stage: { select: { name: true } } },
    }),
    prisma.quote.findMany({
      where: quoteScope(user),
      select: { id: true, rootId: true, version: true, status: true },
    }),
    prisma.stage.findMany({ orderBy: { position: "asc" }, select: { name: true } }),
  ]);

  const stageCounts = new Map<string, number>(stages.map((s) => [s.name, 0]));
  for (const o of opportunities) {
    stageCounts.set(o.stage.name, (stageCounts.get(o.stage.name) ?? 0) + 1);
  }

  const statusCounts = new Map<string, number>();
  for (const q of latestRevisions(quotesRaw)) {
    const label = QUOTE_STATUS_LABELS[q.status];
    statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
  }

  return {
    alcance: canViewAllRecords(user) ? "toda la empresa" : "cartera propia del usuario",
    clientes: clientCount,
    oportunidades_por_etapa: [...stageCounts.entries()].map(([etapa, cantidad]) => ({
      etapa,
      cantidad,
    })),
    presupuestos_por_estado: [...statusCounts.entries()].map(([estado, cantidad]) => ({
      estado,
      cantidad,
    })),
  };
}

async function buscarClientes(user: Principal, texto?: string) {
  const clients = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      ...(texto
        ? {
            OR: [
              { legalName: { contains: texto, mode: "insensitive" as const } },
              { tradeName: { contains: texto, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { legalName: "asc" },
    take: 15,
  });

  if (clients.length === 0) {
    return { error: "No encontré clientes que coincidan con esa búsqueda." };
  }

  return clients.map((c) => ({
    nombre: c.legalName,
    fantasia: c.tradeName,
    ciudad: c.city,
    provincia: c.province,
    segmento: c.segment ? SEGMENT_LABELS[c.segment] : null,
    vendedor: c.owner ? c.owner.name ?? c.owner.email : "Sin asignar",
  }));
}

async function detalleCliente(user: Principal, nombre: string) {
  if (!nombre) return { error: "Indicá el nombre del cliente a buscar." };

  const clients = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      OR: [
        { legalName: { contains: nombre, mode: "insensitive" as const } },
        { tradeName: { contains: nombre, mode: "insensitive" as const } },
      ],
    },
    include: {
      owner: { select: { name: true, email: true } },
      contacts: {
        select: { name: true, position: true, phone: true, email: true, isPrimary: true },
      },
      opportunities: {
        select: {
          title: true,
          amount: true,
          currency: true,
          estimatedM2: true,
          stage: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      quotes: {
        select: {
          id: true,
          rootId: true,
          version: true,
          code: true,
          status: true,
          total: true,
          currency: true,
          validUntil: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    take: 5,
  });

  if (clients.length === 0) {
    return { error: `No encontré ningún cliente que coincida con "${nombre}".` };
  }
  if (clients.length > 1) {
    return {
      aviso: "Hay más de un cliente que coincide. Pedile al usuario que sea más específico.",
      coincidencias: clients.map((c) => c.legalName),
    };
  }

  const c = clients[0];
  let saldoCuentaCorriente: unknown = "No disponible: este usuario no gestiona cuenta corriente.";
  if (canManageLedger(user)) {
    const movements = await prisma.ledgerMovement.findMany({
      where: { clientId: c.id },
      select: { type: true, currency: true, amount: true },
    });
    saldoCuentaCorriente = computeBalances(
      movements.map((m) => ({ type: m.type, currency: m.currency, amount: m.amount.toString() }))
    );
  }

  return {
    nombre: c.legalName,
    fantasia: c.tradeName,
    cuit: c.taxId,
    condicion_iva: c.ivaCondition ? IVA_LABELS[c.ivaCondition] : null,
    ciudad: c.city,
    provincia: c.province,
    segmento: c.segment ? SEGMENT_LABELS[c.segment] : null,
    vendedor: c.owner ? c.owner.name ?? c.owner.email : "Sin asignar",
    contactos: c.contacts.map((ct) => ({
      nombre: ct.name,
      cargo: ct.position,
      telefono: ct.phone,
      email: ct.email,
      principal: ct.isPrimary,
    })),
    oportunidades_recientes: c.opportunities.map((o) => ({
      titulo: o.title,
      etapa: o.stage.name,
      monto: formatMoney(o.amount ? o.amount.toString() : null, o.currency),
      m2: o.estimatedM2 ? Number(o.estimatedM2) : null,
    })),
    presupuestos_recientes: latestRevisions(c.quotes)
      .slice(0, 5)
      .map((q) => ({
        codigo: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
        estado: QUOTE_STATUS_LABELS[q.status],
        total: formatMoney(q.total.toString(), q.currency),
        vence: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
      })),
    saldo_cuenta_corriente: saldoCuentaCorriente,
  };
}

async function pipelineOportunidades(user: Principal, etapa?: string) {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(user),
      ...(etapa
        ? { stage: { name: { contains: etapa, mode: "insensitive" as const } } }
        : {}),
    },
    include: {
      client: { select: { legalName: true } },
      stage: { select: { name: true } },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  if (opportunities.length === 0) {
    return { error: "No hay oportunidades que coincidan con ese filtro." };
  }

  return opportunities.map((o) => ({
    titulo: o.title,
    cliente: o.client.legalName,
    etapa: o.stage.name,
    monto: formatMoney(o.amount ? o.amount.toString() : null, o.currency),
    m2: o.estimatedM2 ? Number(o.estimatedM2) : null,
    vendedor: o.owner ? o.owner.name ?? o.owner.email : "Sin asignar",
  }));
}

const STATUS_BY_WORD: Record<string, QuoteStatus> = {
  borrador: QuoteStatus.DRAFT,
  draft: QuoteStatus.DRAFT,
  enviado: QuoteStatus.SENT,
  sent: QuoteStatus.SENT,
  aprobado: QuoteStatus.APPROVED,
  approved: QuoteStatus.APPROVED,
  rechazado: QuoteStatus.REJECTED,
  rejected: QuoteStatus.REJECTED,
  vencido: QuoteStatus.EXPIRED,
  expired: QuoteStatus.EXPIRED,
};

async function presupuestosTool(user: Principal, estado?: string, cliente?: string) {
  const all = await prisma.quote.findMany({
    where: quoteScope(user),
    select: {
      id: true,
      rootId: true,
      version: true,
      code: true,
      status: true,
      total: true,
      currency: true,
      validUntil: true,
      createdAt: true,
      client: { select: { legalName: true } },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let quotes = latestRevisions(all);

  if (cliente) {
    const needle = cliente.toLowerCase();
    quotes = quotes.filter((q) => q.client.legalName.toLowerCase().includes(needle));
  }
  const statusKey = estado ? STATUS_BY_WORD[estado.toLowerCase()] : undefined;
  if (statusKey) {
    quotes = quotes.filter((q) => q.status === statusKey);
  }

  if (quotes.length === 0) {
    return { error: "No hay presupuestos que coincidan con ese filtro." };
  }

  return quotes.slice(0, 20).map((q) => ({
    codigo: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
    cliente: q.client.legalName,
    estado: QUOTE_STATUS_LABELS[q.status],
    total: formatMoney(q.total.toString(), q.currency),
    vence: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    vendedor: q.owner ? q.owner.name ?? q.owner.email : "Sin asignar",
  }));
}

async function cobranzasResumen() {
  const { summary, rows } = await getReceivables();
  return {
    resumen: summary,
    principales_deudores: rows.slice(0, 15),
    nota: rows.length > 15 ? `Se muestran los 15 saldos más altos de ${rows.length} totales.` : undefined,
  };
}
