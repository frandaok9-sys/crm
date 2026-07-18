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
import { logAudit } from "@/lib/audit";
import { getMetrics } from "@/lib/metrics";
import { getReceivables } from "@/lib/receivables";
import { computeBalances } from "@/lib/ledger-calc";
import { computeQuoteTotals, lineNet } from "@/lib/quotes-calc";
import { geocodeAddress, geocodeClient } from "@/lib/geocode";
import { defaultTenantId, recordCanonicalEvent } from "@/lib/nexus/central";
import { planTrip, tripMapsUrl, type TripWaypoint } from "@/lib/trip";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";
import { QuoteStatus, Currency, QuoteItemType } from "@/lib/generated/prisma/enums";

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
    name: "detalle_presupuesto",
    description:
      "Trae UN presupuesto con TODO el detalle: ítems (descripción, cantidad, precio, IVA), subtotal, descuento, IVA discriminado, total, estado, validez y link de descarga del PDF. Buscá por 'codigo' (ej. PRE-0007) o por 'cliente' (con parte del nombre alcanza, no hace falta exacto). Si hay varias coincidencias, se devuelve la lista para que el usuario elija.",
    inputSchema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código del presupuesto (ej. PRE-0007). Opcional." },
        cliente: { type: "string", description: "Nombre o parte del nombre del cliente. Opcional." },
      },
    },
  },
  {
    name: "crear_presupuesto",
    description:
      "Carga un presupuesto BORRADOR para un cliente de la cartera. Recibe el cliente (con parte del nombre alcanza) y los ítems (descripción, cantidad y precio unitario neto; IVA/unidad/tipo opcionales). Calcula IVA y total. Queda como BORRADOR para revisar y enviar desde el CRM. NUNCA inventes precios ni cantidades: usá SOLO los que da el usuario (si hace falta un precio de lista, buscalo con 'productos').",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o parte del nombre del cliente de la cartera." },
        moneda: { type: "string", description: "ARS o USD (opcional, por defecto ARS)." },
        items: {
          type: "array",
          description: "Ítems del presupuesto.",
          items: {
            type: "object",
            properties: {
              descripcion: { type: "string", description: "Qué se cotiza (ej. 'Piso epoxi industrial')." },
              cantidad: { type: "number", description: "Cantidad (ej. 500 para 500 m²)." },
              precio_unitario: { type: "number", description: "Precio unitario NETO, sin IVA." },
              iva: { type: "number", description: "Alícuota de IVA % (opcional, por defecto 21)." },
              unidad: { type: "string", description: "Unidad (opcional, por defecto m²)." },
              tipo: { type: "string", description: "producto | servicio | texto (opcional, por defecto servicio)." },
            },
            required: ["descripcion", "cantidad", "precio_unitario"],
          },
        },
      },
      required: ["cliente", "items"],
    },
    requires: "quotes.manage",
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
  {
    name: "armar_hoja_ruta",
    description:
      "Arma y GUARDA una hoja de ruta de visitas. Recibe la salida y los destinos (direcciones, ciudades o nombres de clientes de la cartera), optimiza el orden y devuelve km, tiempo, costo aproximado y el link de Google Maps. Es la única acción que crea algo.",
    inputSchema: {
      type: "object",
      properties: {
        salida: { type: "string", description: "Punto de partida: dirección o ciudad." },
        destinos: {
          type: "array",
          items: { type: "string" },
          description: "Destinos a visitar: direcciones, ciudades o nombres de clientes de la cartera.",
        },
      },
      required: ["salida", "destinos"],
    },
    // Guardar una hoja es ESCRITURA: mismos permisos que en la web.
    requires: "opportunities.manage",
  },
  {
    name: "hojas_de_ruta",
    description:
      "Lista las hojas de ruta guardadas (nombre, km, fecha y link de Google Maps). Úsala cuando pidan sus rutas guardadas o el link de maps de una ruta.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "detalle_hoja_ruta",
    description:
      "Trae UNA hoja de ruta guardada con TODO el detalle: recorrido en orden, oportunidades de cada visita (etapa, m², monto), dirección y contacto, el link de Google Maps y la URL de una imagen del mapa de la ruta. Usala cuando pidan 'la hoja de ruta X', 'con el mapa/captura' o 'con los detalles'. 'nombre' es opcional (sin nombre, trae la más reciente).",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre o parte del nombre de la hoja (opcional)." },
      },
    },
  },
  {
    name: "crear_cliente_rapido",
    description:
      "Alta RÁPIDA de un cliente (solo nombre + dirección/ciudad) para poder armar rutas o visitarlo sin tenerlo cargado. Queda como BORRADOR incompleto: hay que completarlo después en el CRM. Usala cuando pidan agregar/cargar un cliente que todavía no existe.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Razón social o nombre del cliente." },
        direccion: { type: "string", description: "Dirección (opcional)." },
        ciudad: { type: "string", description: "Ciudad o localidad (opcional, ayuda a ubicarlo)." },
      },
      required: ["nombre"],
    },
    requires: "clients.manage",
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
  const strList = (key: string): string[] => {
    const value = args[key];
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
    }
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
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
    case "detalle_presupuesto":
      return detallePresupuesto(user, str("codigo"), str("cliente"));
    case "crear_presupuesto":
      // CAPA 2: crear presupuestos es escritura (roles de consulta, no).
      if (!hasPermission(user, "quotes.manage")) {
        return { error: "Este usuario no puede crear presupuestos (rol de consulta)." };
      }
      return crearPresupuesto(user, str("cliente") ?? "", args["items"], str("moneda"));
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
    case "armar_hoja_ruta":
      // CAPA 2: guardar hojas de ruta es escritura (roles de consulta, no).
      if (!hasPermission(user, "opportunities.manage")) {
        return { error: "Este usuario no puede crear hojas de ruta (rol de consulta)." };
      }
      return armarHojaRuta(user, str("salida") ?? "", strList("destinos"));
    case "hojas_de_ruta":
      return listarHojasRuta(user);
    case "detalle_hoja_ruta":
      return detalleHojaRuta(user, str("nombre"));
    case "crear_cliente_rapido":
      // CAPA 2: re-verificar permiso de escritura de clientes.
      if (!hasPermission(user, "clients.manage")) {
        return { error: "Este usuario no puede crear clientes." };
      }
      return crearClienteRapido(user, str("nombre") ?? "", str("direccion"), str("ciudad"));
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
    pdf: `/presupuestos/${q.id}/pdf`, // link de descarga (no generar el PDF con IA)
  }));
}

/**
 * Detalle de UN presupuesto, buscado por código o por nombre (parcial) del
 * cliente — no hace falta el nombre exacto. Respeta el alcance del usuario.
 * Recalcula el IVA discriminado a partir de los ítems (mismo motor que la web).
 */
async function detallePresupuesto(
  user: Principal,
  codigo?: string,
  cliente?: string
) {
  if (!codigo && !cliente) {
    return { error: "Indicá el código (ej. PRE-0007) o el nombre del cliente del presupuesto." };
  }

  const rows = await prisma.quote.findMany({
    where: {
      ...quoteScope(user),
      OR: [
        ...(codigo
          ? [{ code: { contains: codigo, mode: "insensitive" as const } }]
          : []),
        ...(cliente
          ? [{ client: { legalName: { contains: cliente, mode: "insensitive" as const } } }]
          : []),
      ],
    },
    select: {
      id: true,
      rootId: true,
      version: true,
      code: true,
      status: true,
      currency: true,
      validUntil: true,
      paymentTerms: true,
      overallDiscount: true,
      total: true,
      createdAt: true,
      client: { select: { legalName: true } },
      owner: { select: { name: true, email: true } },
      items: {
        orderBy: { position: "asc" },
        select: {
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          discount: true,
          ivaRate: true,
          lineNet: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const quotes = latestRevisions(rows);
  if (quotes.length === 0) {
    return { error: "No encontré un presupuesto con ese código o cliente." };
  }
  if (quotes.length > 1) {
    return {
      aviso: "Hay varios presupuestos que coinciden. Pedile al usuario que elija por código.",
      coincidencias: quotes.slice(0, 10).map((q) => ({
        codigo: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
        cliente: q.client.legalName,
        estado: QUOTE_STATUS_LABELS[q.status],
        total: formatMoney(q.total.toString(), q.currency),
      })),
    };
  }

  const q = quotes[0];
  const totals = computeQuoteTotals(
    q.items.map((i) => ({
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      ivaRate: i.ivaRate.toString(),
      discount: i.discount.toString(),
    })),
    q.overallDiscount.toString()
  );

  return {
    codigo: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
    cliente: q.client.legalName,
    estado: QUOTE_STATUS_LABELS[q.status],
    moneda: q.currency,
    vendedor: q.owner ? q.owner.name ?? q.owner.email : "Sin asignar",
    vence: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    condicion_pago: q.paymentTerms ?? undefined,
    items: q.items.map((i) => ({
      descripcion: i.description,
      cantidad: Number(i.quantity),
      unidad: i.unit,
      precio_unitario: formatMoney(i.unitPrice.toString(), q.currency),
      descuento: Number(i.discount) > 0 ? `${Number(i.discount)}%` : undefined,
      iva: `${Number(i.ivaRate)}%`,
      neto: formatMoney(i.lineNet.toString(), q.currency),
    })),
    subtotal: formatMoney(totals.subtotal, q.currency),
    descuento_general:
      Number(q.overallDiscount) > 0
        ? `${Number(q.overallDiscount)}% (${formatMoney(totals.overallDiscountAmount, q.currency)})`
        : undefined,
    iva_discriminado: totals.ivaBreakdown.map((r) => ({
      alicuota: `${Number(r.rate)}%`,
      base: formatMoney(r.base, q.currency),
      iva: formatMoney(r.amount, q.currency),
    })),
    iva_total: formatMoney(totals.ivaTotal, q.currency),
    total: formatMoney(q.total.toString(), q.currency),
    pdf: `/presupuestos/${q.id}/pdf`,
  };
}

type QuoteItemInput = {
  type: QuoteItemType;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  ivaRate: string;
};

/** Normaliza los ítems que arma el modelo a la forma que espera el motor de cálculo. */
function parseAssistantItems(raw: unknown): QuoteItemInput[] {
  if (!Array.isArray(raw)) return [];
  const TIPO: Record<string, QuoteItemType> = {
    producto: QuoteItemType.PRODUCT,
    product: QuoteItemType.PRODUCT,
    servicio: QuoteItemType.SERVICE,
    service: QuoteItemType.SERVICE,
    texto: QuoteItemType.TEXT,
    text: QuoteItemType.TEXT,
  };
  const numStr = (v: unknown, fallback: string): string => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(n) : fallback;
  };
  const out: QuoteItemInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const description = String(r.descripcion ?? r.description ?? "").trim();
    if (!description) continue;
    out.push({
      type: TIPO[String(r.tipo ?? r.type ?? "").toLowerCase()] ?? QuoteItemType.SERVICE,
      description: description.slice(0, 300),
      quantity: numStr(r.cantidad ?? r.quantity, "1"),
      unit: (String(r.unidad ?? r.unit ?? "").trim() || "m²").slice(0, 12),
      unitPrice: numStr(r.precio_unitario ?? r.unitPrice, "0"),
      discount: "0",
      ivaRate: numStr(r.iva ?? r.ivaRate, "21"),
    });
  }
  return out;
}

/**
 * Crea un presupuesto BORRADOR desde el chat. Resuelve el cliente por nombre
 * parcial (respetando el alcance), calcula IVA/total con el motor de cálculo
 * (Decimal, mismo que la web) y lo deja en estado Borrador para revisar y
 * enviar desde el CRM. Nunca inventa precios: usa solo los ítems dados.
 */
async function crearPresupuesto(
  user: Principal,
  clienteNombre: string,
  itemsRaw: unknown,
  moneda?: string
) {
  const nombre = clienteNombre.trim();
  if (nombre.length < 2) return { error: "Indicá el cliente del presupuesto." };

  const items = parseAssistantItems(itemsRaw);
  if (items.length === 0) {
    return { error: "Indicá al menos un ítem con descripción, cantidad y precio unitario." };
  }

  // Resolver el cliente por nombre parcial, dentro del alcance del usuario.
  const clients = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      OR: [
        { legalName: { contains: nombre, mode: "insensitive" } },
        { tradeName: { contains: nombre, mode: "insensitive" } },
      ],
    },
    select: { id: true, legalName: true, ownerId: true },
    take: 5,
  });
  if (clients.length === 0) {
    return { error: `No encontré un cliente que coincida con "${nombre}". Si es nuevo, dalo de alta con crear_cliente_rapido y volvé a intentar.` };
  }
  if (clients.length > 1) {
    return {
      aviso: "Hay más de un cliente que coincide. Pedile al usuario que aclare cuál.",
      coincidencias: clients.map((c) => c.legalName),
    };
  }
  const client = clients[0];

  const currency = moneda?.toUpperCase() === "USD" ? Currency.USD : Currency.ARS;
  const totals = computeQuoteTotals(items, 0);

  // Código correlativo (mismo esquema que la creación desde la web).
  const count = await prisma.quote.count({ where: { version: 1 } });
  const code = `PRE-${String(count + 1).padStart(4, "0")}`;

  let tenantId: string | null = null;
  try {
    tenantId = await defaultTenantId();
  } catch {
    /* sin tenant por defecto */
  }

  const quote = await prisma.quote.create({
    data: {
      code,
      clientId: client.id,
      ownerId: client.ownerId ?? user.id,
      currency,
      overallDiscount: "0",
      net: totals.net,
      ivaTotal: totals.ivaTotal,
      total: totals.total,
      tenantId,
      items: {
        create: items.map((it, index) => ({
          type: it.type,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          discount: it.discount,
          ivaRate: it.ivaRate,
          lineNet: lineNet(it.quantity, it.unitPrice, it.discount),
          position: index,
        })),
      },
    },
  });

  await logAudit({
    action: "quote.created",
    actorId: user.id,
    targetType: "Quote",
    targetId: quote.id,
    metadata: { code, total: totals.total, currency, via: "assistant", draft: true },
  });
  if (tenantId) {
    try {
      await recordCanonicalEvent({
        tenantId,
        entity: "quote",
        action: "created",
        nexusId: quote.id,
        userId: user.id,
        detail: `${code} · ${currency} ${totals.total}`,
      });
    } catch {
      /* sync no bloqueante */
    }
  }

  return {
    creado: code,
    cliente: client.legalName,
    moneda: currency,
    estado: "Borrador",
    items: items.map((it) => ({
      descripcion: it.description,
      cantidad: Number(it.quantity),
      unidad: it.unit,
      precio_unitario: formatMoney(it.unitPrice, currency),
      iva: `${Number(it.ivaRate)}%`,
    })),
    subtotal: formatMoney(totals.subtotal, currency),
    iva_total: formatMoney(totals.ivaTotal, currency),
    total: formatMoney(totals.total, currency),
    editar: `/presupuestos/${quote.id}/editar`,
    pdf: `/presupuestos/${quote.id}/pdf`,
    nota: "Presupuesto creado como BORRADOR. Revisá los precios y ajustá lo que falte, y luego ENVIALO desde el CRM (Presupuestos → editar). No se envía solo.",
  };
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

// ---------------------------------------------------------------------------
// Hojas de ruta (planificador de viajes) — la ÚNICA acción que crea algo
// ---------------------------------------------------------------------------

/** Ubica un texto (dirección/ciudad) en coordenadas. */
async function geocodeText(
  q: string
): Promise<{ lat: number; lng: number; label: string } | null> {
  const p = await geocodeAddress(`${q}, Argentina`);
  return p ? { lat: Number(p.lat), lng: Number(p.lng), label: q } : null;
}

/**
 * Arma y guarda una hoja de ruta a partir de texto. Los destinos pueden ser
 * clientes de la cartera (por nombre) o lugares (dirección/ciudad). Respeta el
 * alcance del usuario. Devuelve un resumen conciso + el link de Maps.
 */
async function armarHojaRuta(user: Principal, salida: string, destinos: string[]) {
  if (!salida) return { error: "Indicá el punto de salida (dirección o ciudad)." };
  if (destinos.length === 0) return { error: "Indicá al menos un destino a visitar." };

  const origin = await geocodeText(salida);
  if (!origin) return { error: `No pude ubicar la salida: "${salida}".` };

  const waypoints: TripWaypoint[] = [];
  const noUbicados: string[] = [];
  for (let i = 0; i < destinos.length; i++) {
    const d = destinos[i];
    // Primero, cliente de la cartera (ya geolocalizado).
    const client = await prisma.client.findFirst({
      where: {
        ...clientScope(user),
        latitude: { not: null },
        longitude: { not: null },
        OR: [
          { legalName: { contains: d, mode: "insensitive" } },
          { tradeName: { contains: d, mode: "insensitive" } },
        ],
      },
      select: { id: true, legalName: true, latitude: true, longitude: true },
    });
    if (client) {
      waypoints.push({
        kind: "custom",
        id: `client-${client.id}`,
        lat: Number(client.latitude),
        lng: Number(client.longitude),
        label: client.legalName,
      });
      continue;
    }
    const g = await geocodeText(d);
    if (g) waypoints.push({ kind: "custom", id: `asst-${i}`, lat: g.lat, lng: g.lng, label: d });
    else noUbicados.push(d);
  }

  if (waypoints.length === 0) {
    return { error: "No pude ubicar ninguno de los destinos. Probá con la ciudad." };
  }

  const plan = await planTrip(user, {
    origin,
    waypoints,
    returnMode: "origin",
    endPoint: null,
    litersPer100Km: 8,
    pricePerLiter: 1200,
    corridorKm: 10,
  });
  const mapsUrl = tripMapsUrl(plan);

  // Guardar (para que aparezca en "las hojas de ruta ya cargadas" del mapa).
  const name = `${origin.label} · ${plan.stops.length} visita${plan.stops.length === 1 ? "" : "s"}`;
  const saved = await prisma.savedTrip.create({
    data: {
      ownerId: user.id,
      name,
      totalKm: plan.totalKm,
      data: { plan: { ...plan, narrative: "" }, waypoints, mapsUrl },
    },
  });
  await logAudit({
    action: "trip.created",
    actorId: user.id,
    targetType: "SavedTrip",
    targetId: saved.id,
    metadata: { name, via: "assistant" },
  });

  const h = Math.floor(plan.totalMinutes / 60);
  const m = Math.round(plan.totalMinutes % 60);
  return {
    guardada: name,
    salida: origin.label,
    recorrido: plan.stops.map((s) => ({ n: s.order, destino: s.name, tramo_km: Math.round(s.legKm) })),
    total_km: Math.round(plan.totalKm),
    tiempo: h > 0 ? `${h} h ${m} min` : `${m} min`,
    combustible_aprox: `$${Math.round(plan.fuelCost).toLocaleString("es-AR")} (estimado 8L/100km, $1200/L)`,
    volver_a_la_salida: true,
    maps: mapsUrl,
    no_ubicados: noUbicados.length ? noUbicados : undefined,
    nota: "Hoja de ruta guardada; aparece en el mapa. El costo de combustible es una estimación.",
  };
}

/** Lista las hojas de ruta guardadas del usuario (o todas, si ve toda la cartera). */
async function listarHojasRuta(user: Principal) {
  const rows = await prisma.savedTrip.findMany({
    where: canViewAllRecords(user) ? {} : { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (rows.length === 0) {
    return { hojas: [], nota: "No hay hojas de ruta guardadas todavía." };
  }
  return {
    hojas: rows.map((r) => ({
      nombre: r.name,
      km: Math.round(r.totalKm),
      fecha: r.createdAt.toLocaleDateString("es-AR"),
      maps: (r.data as { mapsUrl?: string })?.mapsUrl ?? null,
    })),
  };
}

/**
 * Trae UNA hoja de ruta con todo el detalle (recorrido, oportunidades, contacto),
 * el link de Maps y la URL de la imagen del mapa. Respeta el alcance del usuario.
 */
async function detalleHojaRuta(user: Principal, nombre?: string) {
  const where = canViewAllRecords(user) ? {} : { ownerId: user.id };
  const trip = nombre
    ? await prisma.savedTrip.findFirst({
        where: { ...where, name: { contains: nombre, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
      })
    : await prisma.savedTrip.findFirst({ where, orderBy: { createdAt: "desc" } });
  if (!trip) return { error: nombre ? `No encontré una hoja de ruta con "${nombre}".` : "No hay hojas de ruta guardadas." };

  const data = trip.data as {
    mapsUrl?: string;
    plan?: {
      origin?: { label?: string };
      totalKm?: number;
      totalMinutes?: number;
      fuelCost?: number;
      stops?: {
        order: number;
        name: string;
        title: string | null;
        stageName: string | null;
        m2Label: string | null;
        amountLabel: string | null;
        address: string | null;
        contactName: string | null;
        phone: string | null;
        legKm: number;
      }[];
    };
  };
  const plan = data?.plan;
  if (!plan?.stops) {
    return { error: "Esa hoja de ruta es de una versión anterior; abrila en el mapa y recalculala." };
  }
  const min = plan.totalMinutes ?? 0;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  const undef = <T,>(v: T | null | undefined): T | undefined => (v == null || v === "" ? undefined : v);

  return {
    nombre: trip.name,
    salida: plan.origin?.label,
    total_km: Math.round(plan.totalKm ?? 0),
    tiempo: h > 0 ? `${h} h ${m} min` : `${m} min`,
    combustible_aprox: `$${Math.round(plan.fuelCost ?? 0).toLocaleString("es-AR")} (estimado)`,
    recorrido: plan.stops.map((s) => ({
      n: s.order,
      destino: s.name,
      etapa: undef(s.stageName),
      obra: undef(s.title),
      m2: undef(s.m2Label),
      monto: undef(s.amountLabel),
      direccion: undef(s.address),
      contacto: undef(s.contactName),
      tel: undef(s.phone),
      tramo_km: Math.round(s.legKm),
    })),
    maps: data.mapsUrl ?? null,
    mapa_imagen: `/mapa/hoja/${trip.id}/imagen`,
  };
}

// ---------------------------------------------------------------------------
// Alta rápida de cliente (BORRADOR) — para armar rutas sin tenerlo cargado
// ---------------------------------------------------------------------------

/**
 * Crea un cliente mínimo (borrador) para poder usarlo en rutas al instante.
 * Queda marcado isDraft=true hasta que se complete/edite desde el CRM, y se
 * geolocaliza para que aparezca en el mapa y el planificador de viajes.
 */
async function crearClienteRapido(
  user: Principal,
  nombre: string,
  direccion?: string,
  ciudad?: string
) {
  const name = nombre.trim();
  if (name.length < 2) return { error: "Indicá el nombre del cliente." };

  // Evitar duplicar uno que ya está en su cartera.
  const dup = await prisma.client.findFirst({
    where: { ...clientScope(user), legalName: { equals: name, mode: "insensitive" } },
    select: { id: true, isDraft: true },
  });
  if (dup) {
    return {
      error: `Ya existe un cliente "${name}" en tu cartera${dup.isDraft ? " (está como borrador, completalo en el CRM)" : ""}.`,
    };
  }

  let tenantId: string | null = null;
  try {
    tenantId = await defaultTenantId();
  } catch {
    /* sin tenant por defecto */
  }

  const created = await prisma.client.create({
    data: {
      legalName: name,
      address: direccion?.trim() || null,
      city: ciudad?.trim() || null,
      ownerId: user.id,
      isDraft: true,
      tenantId,
    },
  });
  // Misma traza de auditoría que el alta desde la web.
  await logAudit({
    action: "client.created",
    actorId: user.id,
    targetType: "Client",
    targetId: created.id,
    metadata: { legalName: name, via: "assistant", draft: true },
  });
  // Ubicarlo en el mapa (para rutas). Nunca rompe el alta.
  try {
    await geocodeClient(created.id);
  } catch {
    /* geocodificación diferida */
  }

  return {
    creado: name,
    borrador: true,
    ya_sirve_para_rutas: true,
    nota: "Cliente creado como BORRADOR: ya podés usarlo para armar rutas. FALTAN datos (CUIT, condición de IVA, contacto). Quedará una alerta 'clientes por completar' hasta que lo termines desde Clientes → editar.",
  };
}
