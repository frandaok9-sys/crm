"use server";

import { requireActiveUser } from "@/lib/auth";
import { getNotifications } from "@/lib/alerts";

/** Novedades del usuario para el panel de la campana (se carga al abrirlo). */
export async function fetchNotifications() {
  const user = await requireActiveUser();
  return getNotifications(user);
}
