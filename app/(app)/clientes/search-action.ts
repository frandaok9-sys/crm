"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { clientScope } from "@/lib/permissions";

export type ClientOption = { id: string; legalName: string };

/**
 * Búsqueda de clientes para los selectores (nuevo presupuesto / nueva
 * oportunidad). Con carteras de 2000+ clientes ya no se manda la lista entera
 * al navegador: el selector consulta acá a medida que se tipea. Siempre
 * respeta el alcance del usuario (cartera propia vs general).
 */
export async function searchClientOptionsAction(
  query: string
): Promise<ClientOption[]> {
  const user = await requireActiveUser();
  const q = String(query || "").trim();
  const rows = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      ...(q
        ? {
            OR: [
              { legalName: { contains: q, mode: "insensitive" as const } },
              { tradeName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, legalName: true },
    orderBy: { legalName: "asc" },
    take: 12,
  });
  return rows;
}
