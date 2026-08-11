import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { TintBadge } from "@/components/tint-badge";
import { formatDateAR } from "@/lib/dates";

const CHANNEL_LABELS: Record<string, string> = {
  asistente: "Chat del asistente",
  "mapa.estrategia": "Estrategia de gira",
  "mapa.prospectos": "Prospección web",
};

const DAYS = 30;

/**
 * Auditoría de uso de la IA: qué preguntan los usuarios, qué responde el
 * asistente y qué falla. Ventana de análisis: últimos 30 días.
 */
export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const user = await requireActiveUser();
  if (!canManageUsers(user)) redirect("/dashboard");

  const since = new Date(Date.now() - DAYS * 86_400_000);
  const PAGE_SIZE = 50;
  const total = await prisma.assistantLog.count({
    where: { createdAt: { gte: since } },
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(p ?? "1", 10) || 1));

  const [byChannel, errorCount, byUser, rows] = await Promise.all([
    prisma.assistantLog.groupBy({
      by: ["channel"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.assistantLog.count({
      where: { createdAt: { gte: since }, error: { not: null } },
    }),
    prisma.assistantLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
    prisma.assistantLog.findMany({
      where: { createdAt: { gte: since } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // Nombres de los usuarios más activos.
  const topIds = byUser.map((u) => u.userId).filter((x): x is string => !!x);
  const topUsers = topIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameOf = new Map(topUsers.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Volver al Panel de Control
        </Link>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight">
          Uso de la IA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las conversaciones con los asistentes de IA de los últimos{" "}
          {DAYS} días: preguntas, respuestas y errores, para detectar qué
          mejorar.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[12px] border bg-card p-4">
          <p className="text-xs text-muted-foreground">Interacciones (30 días)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
        </div>
        {byChannel.map((c) => (
          <div key={c.channel} className="rounded-[12px] border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              {CHANNEL_LABELS[c.channel] ?? c.channel}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {c._count._all}
            </p>
          </div>
        ))}
        <div className="rounded-[12px] border bg-card p-4">
          <p className="text-xs text-muted-foreground">Con error</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${errorCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {errorCount}
          </p>
        </div>
      </div>

      {/* Usuarios más activos */}
      {byUser.length > 0 && (
        <div className="rounded-[12px] border bg-card p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quiénes más la usan
          </p>
          <div className="flex flex-wrap gap-2">
            {byUser.map((u) => (
              <span
                key={u.userId ?? "anon"}
                className="rounded-full bg-chip px-3 py-1 text-xs"
              >
                {u.userId ? (nameOf.get(u.userId) ?? "—") : "—"} ·{" "}
                <strong className="tabular-nums">{u._count._all}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conversaciones */}
      <section className="overflow-hidden rounded-[12px] border bg-card">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sin interacciones registradas todavía. Se guardan desde ahora, a
            medida que el equipo use el asistente.
          </p>
        ) : (
          rows.map((r) => (
            <details
              key={r.id}
              className="group border-b border-border2 last:border-0"
            >
              <summary className="flex cursor-pointer items-center gap-3 px-5 py-3 text-[13px] hover:bg-hoverbg">
                <span className="w-[118px] shrink-0 tabular-nums text-muted-foreground">
                  {formatDateAR(r.createdAt)}{" "}
                  {r.createdAt.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="w-32 shrink-0 truncate text-text2">
                  {r.user ? (r.user.name ?? r.user.email) : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.question ?? "(sin pregunta)"}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <TintBadge
                    variant={
                      r.channel === "asistente"
                        ? "blue"
                        : r.channel === "mapa.estrategia"
                          ? "green"
                          : "amber"
                    }
                  >
                    {CHANNEL_LABELS[r.channel] ?? r.channel}
                  </TintBadge>
                  {r.error && <TintBadge variant="red">Error</TintBadge>}
                </span>
              </summary>
              <div className="space-y-2 border-t border-border2 bg-card2 px-5 py-4 text-[13px]">
                {r.question && (
                  <p>
                    <span className="font-semibold text-muted-foreground">
                      Pregunta:{" "}
                    </span>
                    {r.question}
                  </p>
                )}
                {r.reply && (
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold text-muted-foreground">
                      Respuesta:{" "}
                    </span>
                    {r.reply}
                  </p>
                )}
                {r.error && (
                  <p className="text-red-600 dark:text-red-400">
                    <span className="font-semibold">Error: </span>
                    {r.error}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {r.tools.length > 0 && (
                    <>Herramientas: {r.tools.join(", ")} · </>
                  )}
                  {r.durationMs != null && <>{(r.durationMs / 1000).toFixed(1)} s</>}
                </p>
              </div>
            </details>
          ))
        )}
      </section>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {pageCount} · {total} interacciones
          </span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={`/admin/ia?p=${page - 1}`} className="font-semibold text-primary hover:underline">
                ← Anterior
              </Link>
            )}
            {page < pageCount && (
              <Link href={`/admin/ia?p=${page + 1}`} className="font-semibold text-primary hover:underline">
                Siguiente →
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
