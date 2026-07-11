import { prisma } from "@/lib/prisma";
import { SEGMENT_LABELS } from "@/lib/clients";
import { QuoteStatus } from "@/lib/generated/prisma/enums";

/**
 * Conector RC → Nexus Central. Empuja cada alta/edición (ya traducida al
 * modelo canónico) a la central vía su API. Es la "vía B" de la guía Nexus,
 * sin n8n: push directo desde el propio sistema.
 *
 * Config en .env (si falta, el conector queda apagado y no molesta):
 *   NEXUS_URL="http://localhost:3001"
 *   NEXUS_API_KEY="nx_…"   (la API key de RC en la central)
 *
 * Reglas: NUNCA rompe el flujo de negocio (todo en try/catch), timeout corto,
 * y cada push lleva un event_id único → la central lo hace idempotente.
 */

const QUOTE_STATUS_CANONICAL: Record<QuoteStatus, string> = {
  DRAFT: "draft",
  SENT: "sent",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "rejected",
};

function config(): { url: string; apiKey: string } | null {
  const url = process.env.NEXUS_URL?.replace(/\/$/, "");
  const apiKey = process.env.NEXUS_API_KEY;
  return url && apiKey ? { url, apiKey } : null;
}

/** Arma el payload canónico de la entidad leyéndola de la base de RC. */
async function buildPayload(
  entity: "client" | "opportunity" | "quote",
  id: string
): Promise<Record<string, unknown> | null> {
  if (entity === "client") {
    const c = await prisma.client.findUnique({ where: { id } });
    if (!c) return null;
    return {
      external_id: c.id,
      name: c.legalName,
      cuit: c.taxId,
      zone: [c.city, c.province].filter(Boolean).join(", ") || null,
      industry: c.segment ? SEGMENT_LABELS[c.segment] : c.industry,
    };
  }
  if (entity === "opportunity") {
    const o = await prisma.opportunity.findUnique({
      where: { id },
      include: { client: true, stage: { select: { name: true } } },
    });
    if (!o) return null;
    return {
      external_id: o.id,
      title: o.title,
      stage: o.stage.name,
      amount: o.amount ? o.amount.toString() : null,
      currency: o.currency,
      origin: "external",
      client: {
        external_id: o.client.id,
        name: o.client.legalName,
        cuit: o.client.taxId,
        zone: [o.client.city, o.client.province].filter(Boolean).join(", ") || null,
      },
    };
  }
  const q = await prisma.quote.findUnique({ where: { id } });
  if (!q) return null;
  return {
    external_id: q.id,
    code: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
    status: QUOTE_STATUS_CANONICAL[q.status],
    total: q.total.toString(),
    currency: q.currency,
  };
}

/**
 * Empuja una entidad a la central. Devuelve el resultado para poder loguearlo;
 * jamás lanza. `eventId` único garantiza idempotencia del lado de la central.
 */
export async function pushToNexus(
  entity: "client" | "opportunity" | "quote",
  entityId: string,
  eventId: string
): Promise<{ pushed: boolean; detail: string }> {
  const cfg = config();
  if (!cfg) return { pushed: false, detail: "conector sin configurar" };

  try {
    const data = await buildPayload(entity, entityId);
    if (!data) return { pushed: false, detail: "entidad no encontrada" };

    const res = await fetch(`${cfg.url}/api/v1/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ event_id: eventId, entity, source: "rc-crm", data }),
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { pushed: false, detail: `central respondió ${res.status}: ${body.error ?? ""}` };
    }
    return { pushed: true, detail: String(body.result ?? "ok") };
  } catch (error) {
    return { pushed: false, detail: (error as Error).message.slice(0, 200) };
  }
}
