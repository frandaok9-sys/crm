"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { latestRevisions } from "@/lib/quotes";

export type GlobalSearchHit = {
  kind: "client" | "opportunity" | "quote";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/**
 * Búsqueda global (paleta Ctrl+K): clientes, oportunidades y presupuestos en
 * una sola consulta, SIEMPRE dentro del alcance del usuario (cartera propia o
 * general según permisos). Devuelve pocos resultados por tipo, ordenados.
 */
export async function globalSearchAction(
  query: string
): Promise<GlobalSearchHit[]> {
  const user = await requireActiveUser();
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const insensitive = { contains: q, mode: "insensitive" as const };

  const [clients, opportunities, quotes] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...clientScope(user),
        OR: [
          { legalName: insensitive },
          { tradeName: insensitive },
          { taxId: insensitive },
        ],
      },
      select: { id: true, legalName: true, city: true },
      orderBy: { legalName: "asc" },
      take: 5,
    }),
    prisma.opportunity.findMany({
      where: { ...opportunityScope(user), title: insensitive },
      select: {
        id: true,
        title: true,
        client: { select: { legalName: true } },
        stage: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.quote.findMany({
      where: {
        ...quoteScope(user),
        OR: [{ code: insensitive }, { client: { legalName: insensitive } }],
      },
      select: {
        id: true,
        rootId: true,
        version: true,
        code: true,
        client: { select: { legalName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10, // margen para deduplicar revisiones
    }),
  ]);

  return [
    ...clients.map((c) => ({
      kind: "client" as const,
      id: c.id,
      title: c.legalName,
      subtitle: c.city,
      href: `/clientes/${c.id}`,
    })),
    ...opportunities.map((o) => ({
      kind: "opportunity" as const,
      id: o.id,
      title: o.title,
      subtitle: `${o.client.legalName} · ${o.stage.name}`,
      href: `/oportunidades/${o.id}`,
    })),
    ...latestRevisions(quotes)
      .slice(0, 5)
      .map((qt) => ({
        kind: "quote" as const,
        id: qt.id,
        title: qt.version > 1 ? `${qt.code} (Rev.${qt.version})` : qt.code,
        subtitle: qt.client.legalName,
        href: `/presupuestos/${qt.id}`,
      })),
  ];
}
