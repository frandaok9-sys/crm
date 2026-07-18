import { prisma } from "@/lib/prisma";
import type { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { QuoteStatus, ClientActivityType } from "@/lib/generated/prisma/enums";

type ActiveUser = Awaited<ReturnType<typeof requireActiveUser>>;

const WEEK_MS = 7 * 86_400_000;

/**
 * Cantidad de cosas que "requieren atención" para el usuario, respetando su
 * alcance de permisos. Alimenta el contador de la campana del sidebar y usa las
 * mismas señales que el bloque "Requiere atención" del dashboard:
 * clientes por completar + propuestas sin respuesta + oportunidades sin
 * actividad (>7 días) + tareas propias vencidas.
 */
export async function getAlertCount(user: ActiveUser): Promise<number> {
  const staleBefore = new Date(Date.now() - WEEK_MS);
  const [draftClients, quotesSent, staleOpps, overdueTasks] = await Promise.all(
    [
      prisma.client.count({
        where: { ...clientScope(user), isDraft: true },
      }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.SENT },
      }),
      prisma.opportunity.count({
        where: {
          ...opportunityScope(user),
          stage: { name: { notIn: ["Ganada", "Perdida"] } },
          updatedAt: { lt: staleBefore },
        },
      }),
      prisma.clientActivity.count({
        where: {
          createdById: user.id,
          type: ClientActivityType.TASK,
          doneAt: null,
          dueAt: { lt: new Date() },
        },
      }),
    ]
  );

  return draftClients + quotesSent + staleOpps + overdueTasks;
}
