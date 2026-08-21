"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { getNavItems } from "@/lib/nav";
import { DOCK_MAX } from "@/lib/nav-registry";

/**
 * Guarda la barra de accesos rápidos del usuario (dock en escritorio, barra
 * inferior en el celular): rutas en el orden elegido. Solo se aceptan apps
 * que el usuario puede abrir. Lista vacía = volver a la barra por defecto.
 */
export async function saveDock(hrefs: string[]): Promise<void> {
  const user = await requireActiveUser();
  const allowed = new Set((await getNavItems(user)).map((i) => i.href));
  const clean = [...new Set(hrefs.map(String))]
    .filter((h) => allowed.has(h))
    .slice(0, DOCK_MAX);

  await prisma.user.update({
    where: { id: user.id },
    data: { dockHrefs: clean },
  });
  // El armazón (layout) se vuelve a armar con la barra nueva.
  revalidatePath("/", "layout");
}
