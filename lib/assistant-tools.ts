import { prisma } from "@/lib/prisma";
import {
  type Principal,
  type PermissionKey,
  clientScope,
  opportunityScope,
  quoteScope,
  canViewAllRecords,
  canManageLedger,
  hasPermission,
} from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { getMetrics } from "@/lib/metrics";
import { getReceivables } from "@/lib/receivables";
import { computeBalances } from "@/lib/ledger-calc";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";
import { QuoteStatus } from "@/lib/generated/prisma/enums";

/**
 * Caja de herramientas de SOLO LECTURA para el asistente de IA. El asistente
 * ve exactamente lo que el usuario vería en la web — ni más, ni menos —
 * gracias a DOS capas que reutilizan la capa central `lib/permissions.ts`
 * (nunca duplican reglas):
 *
 *   CAPA 1 (visibilidad): `toolsForUser(user)` filtra qué herramientas se le
 *   ofrecen al modelo según los permisos del usuario. Lo que no puede usar,
 *   ni se le muestra (p. ej. `cobranzas` requiere `ledger.manage`).
 *
 *   CAPA 2 (alcance del dato): cada consulta se filtra con clientScope /
 *   opportunityScope / quoteScope y con chequeos como `canManageLedger`, así
 *   un vendedor solo obtiene su propia cartera aunque pregunte por "todo".
 *
 * Pensado para ser reusado tal cual por el futuro canal de WhatsApp (Fase 6).
 */

// ---------------------------------------------------------------------------
// Declaraciones (lo que el modelo ve)
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOLS = [
  {
    name: "resumen_cartera",
    description:
      "Conteos del alcance del usuario: clientes, oportunidades por etapa y presupuestos por estado.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "buscar_clientes",
    description:
      "Lista clientes (hasta 15) con ciudad, segmento y vendedor. Sin 'texto' devuelve los primeros; con 'texto' filtra por nombre.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Filtro por nombre (opcional)." },
      },
    },
  },
  {
    name: "detalle_cliente",
    description:
      "Datos de UN cliente: contactos, oportunidades y presupuestos recientes, y saldo de cuenta corriente (si tiene permiso). Si hay varias coincidencias devuelve la lista.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del cliente." },
      },
      required: ["nombre"],
    },
  },
  {
    name: "pipeline_oportunidades",
    description:
      "Oportunidades del pipeline con cliente, monto, m² y vendedor. Filtros opcionales: 'etapa', y 'desde'/'hasta' (por fecha de creación de la oportunidad).",
    inputSchema: {
      type: "object",
      properties: {
        etapa: { type: "string", description: "Etapa a filtrar (opcional)." },
        desde: { type: "string", description: "Creadas desde AAAA-MM-DD (opcional)." },
        hasta: { type: "string", description: "Creadas hasta AAAA-MM-DD (opcional)." },
      },
    },
  },
  {
    name: "presupuestos",
    description:
      "Presupuestos (última revisión). Filtros opcionales: 'estado' (borrador/enviado/aprobado/rechazado/vencido), 'cliente', y 'desde'/'hasta' (por fecha de emisión).",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", description: "Estado (opcional)." },
        cliente: { type: "string", description: "Nombre del cliente (opcional)." },
        desde: { type: "string", description: "Emitidos desde AAAA-MM-DD (opcional)." },
        hasta: { type: "string", description: "Emitidos hasta AAAA-MM-DD (opcional)." },
      },
    },
  },
  {
    name: "productos",
    description:
      "Catálogo de productos con precio neto, marca (Sinteplast/Ashford), unidad e IVA. 'texto' filtra por nombre; 'marca' por proveedor.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Filtro por nombre (opcional)." },
        marca: { type: "string", description: "Filtro por marca (opcional)." },
      },
    },
  },
  {
    name: "metricas",
    description:
      "Métricas comerciales por moneda: totales cotizado/aprobado, conversión, m² en pipeline, aprobado por segmento, embudo por etapa y (si ve toda la cartera) comparativa por vendedor.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cobranzas",
    description:
      "Cuentas por cobrar: saldos deudores por cliente/moneda, facturas abiertas y pagos sin imputar.",
    inputSchema: { type: "object", properties: {} },
    requires: "ledger.manage",
  },
] as const;

/**
 * CAPA 1 — Herramientas visibles según permisos.
 * El modelo solo "ve" (y por lo tanto solo puede llamar) las herramientas que
 * el permiso del usuario habilita. Una herramienta sin `requires` está
 * disponible para cualquier usuario activo, pero SIEMPRE devuelve datos
 * filtrados por su cartera (ver CAPA 2). Ahorra tokens y es defensa en
 * profundidad: lo que no puede usar, ni se le ofrece.
 */
export function toolsForUser(user: Principal) {
  return ASSISTANT_TOOLS.filter((tool) => {
    const requires = (tool as { requires?: PermissionKey }).requires;
    return !requires || hasPermission(user, requires);
  });
}

/** Frase corta sobre el alcance del usuario, para que el modelo enmarque bien las respuestas. */
export function describeScope(user: Principal): string {
  const alcance = canViewAllRecords(user)
    ? "Este usuario ve los datos de TODA la empresa (todos los vendedores)."
    : "Este usuario ve SOLO su propia cartera (clientes, oportunidades y presupuestos asignados a él); no puede ver los de otros vendedores.";
  const cobranzas = canManageLedger(user)
    ? ""
    : " No tiene acceso a cuentas por cobrar ni a saldos financieros.";
  return alcance + cobranzas;
}

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
      return pipelineOportunidades(user, str("etapa"), parseDateRange(str("desde"), str("hasta")));
    case "presupuestos":
      return presupuestosTool(
        user,
        str("estado"),
        str("cliente"),
        parseDateRange(str("desde"), str("hasta"))
      );
    case "productos":
      return productosTool(str("texto"), str("marca"));
    case "metricas":
      return compactMetrics(user);
    case "cobranzas":
      // CAPA 2 (defensa en profundidad): aunque CAPA 1 no ofrece esta
      // herramienta sin permiso, re-verificamos por las dudas.
      if (!canManageLedger(user)) {
        return { error: "Este usuario no tiene permiso para ver cuentas por cobrar." };
      }
      return cobranzasResumen();
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

type DateRange = { gte?: Date; lte?: Date };

/**
 * Convierte "desde"/"hasta" (AAAA-MM-DD que calcula el modelo a partir de la
 * fecha de hoy) en un filtro Prisma. Se interpreta en hora de Argentina
 * (offset -03:00) para que "este mes" no se corra un día por la zona horaria
 * del servidor (Vercel corre en UTC). "hasta" es inclusivo (fin del día).
 */
function parseDateRange(desde?: string, hasta?: string): DateRange | undefined {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const range: DateRange = {};
  if (isDate(desde)) range.gte = new Date(`${desde}T00:00:00-03:00`);
  if (isDate(hasta)) range.lte = new Date(`${hasta}T23:59:59.999-03:00`);
  return range.gte || range.lte ? range : undefined;
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

async function pipelineOportunidades(
  user: Principal,
  etapa?: string,
  creado?: DateRange
) {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(user),
      ...(etapa
        ? { stage: { name: { contains: etapa, mode: "insensitive" as const } } }
        : {}),
      ...(creado ? { createdAt: creado } : {}),
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

async function presupuestosTool(
  user: Principal,
  estado?: string,
  cliente?: string,
  emitido?: DateRange
) {
  const all = await prisma.quote.findMany({
    where: {
      ...quoteScope(user),
      ...(emitido ? { issueDate: emitido } : {}),
    },
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

/** Catálogo de productos: visible para todos los usuarios (no se filtra por cartera). */
async function productosTool(texto?: string, marca?: string) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(texto ? { name: { contains: texto, mode: "insensitive" as const } } : {}),
      ...(marca ? { brand: { contains: marca, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    take: 20,
  });

  if (products.length === 0) {
    return { error: "No hay productos que coincidan con ese filtro." };
  }

  return products.map((p) => ({
    producto: p.name,
    marca: p.brand,
    unidad: p.unit,
    precio_neto: formatMoney(p.price.toString(), p.currency),
    iva: `${Number(p.ivaRate)}%`,
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

/**
 * Métricas en versión liviana para el asistente: se descarta la serie mensual
 * (6 meses × moneda, muy pesada) y campos de presentación (color/posición) que
 * el modelo no necesita. Ahorra tokens en cada llamada a la herramienta.
 */
async function compactMetrics(user: Principal) {
  const m = await getMetrics(user);
  return {
    totales: m.totals,
    conversion: m.conversion,
    m2_pipeline: m.pipelineM2,
    aprobado_por_segmento: m.bySegment,
    embudo_por_etapa: m.funnel.map((f) => ({
      etapa: f.stage,
      cantidad: f.count,
      m2: f.m2,
      montos: f.amounts,
    })),
    por_vendedor: m.bySeller,
  };
}
