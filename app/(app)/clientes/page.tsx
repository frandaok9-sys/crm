import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  canViewAllRecords,
  canCreateClients,
} from "@/lib/permissions";
import { IVA_LABELS } from "@/lib/clients";
import { IvaCondition } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { TintBadge, type TintVariant } from "@/components/tint-badge";
import { InitialsAvatar } from "@/components/initials-avatar";

const GRID = "grid grid-cols-[2.2fr_1.3fr_1.5fr_1fr_0.8fr_1.2fr] items-center";

const IVA_VARIANT: Partial<Record<IvaCondition, TintVariant>> = {
  [IvaCondition.RESPONSABLE_INSCRIPTO]: "blue",
  [IvaCondition.EXENTO]: "amber",
  [IvaCondition.MONOTRIBUTO]: "green",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireActiveUser();
  const showOwner = canViewAllRecords(user);
  const canCreate = canCreateClients(user);

  const clients = await prisma.client.findMany({
    where: {
      ...clientScope(user),
      ...(q
        ? {
            OR: [
              { legalName: { contains: q, mode: "insensitive" as const } },
              { tradeName: { contains: q, mode: "insensitive" as const } },
              { taxId: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { contacts: true } },
    },
    orderBy: { legalName: "asc" },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clients.length} cliente(s) en{" "}
            {showOwner ? "la cartera general" : "tu cartera"}.
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2.5">
            <Link href="/clientes/importar">
              <Button variant="outline" size="cta">
                Importar Excel
              </Button>
            </Link>
            <Link href="/clientes/nuevo">
              <Button size="cta">+ Nuevo cliente</Button>
            </Link>
          </div>
        )}
      </div>

      <form method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por razón social, fantasía o CUIT…"
          className="w-full max-w-[380px] rounded-[10px] border border-border bg-field px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted2 focus:border-muted-foreground"
        />
      </form>

      <section className="overflow-hidden rounded-[12px] border bg-card">
        <div
          className={`${GRID} border-b border-border2 bg-card2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground`}
        >
          <span>Razón social</span>
          <span>CUIT</span>
          <span>Condición IVA</span>
          <span>Localidad</span>
          <span>Contactos</span>
          <span>Vendedor</span>
        </div>

        {clients.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {q
              ? "No se encontraron clientes con ese criterio."
              : "Todavía no hay clientes."}
          </div>
        ) : (
          clients.map((client) => {
            const ownerName = client.owner
              ? client.owner.name ?? client.owner.email
              : null;
            const ivaVariant = client.ivaCondition
              ? IVA_VARIANT[client.ivaCondition]
              : undefined;
            return (
              <div
                key={client.id}
                className={`${GRID} border-b border-border2 px-5 py-[14px] text-[13px] transition-colors last:border-0 hover:bg-hoverbg`}
              >
                <span className="min-w-0 pr-3">
                  <span className="flex items-center gap-1.5">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="min-w-0 truncate text-[13.5px] font-bold text-foreground hover:underline"
                    >
                      {client.legalName}
                    </Link>
                    {client.isDraft && (
                      <Link
                        href={`/clientes/${client.id}`}
                        title="Alta rápida sin terminar — cargale CUIT, IVA y contacto"
                        className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary hover:bg-primary/20"
                      >
                        Por completar
                      </Link>
                    )}
                  </span>
                  {client.tradeName && (
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {client.tradeName}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-text2">
                  {client.taxId ?? "—"}
                </span>
                <span>
                  {client.ivaCondition ? (
                    <TintBadge variant={ivaVariant ?? "gray"}>
                      {IVA_LABELS[client.ivaCondition]}
                    </TintBadge>
                  ) : (
                    <span className="text-muted2">—</span>
                  )}
                </span>
                <span className="truncate pr-2 text-text2">
                  {client.city ?? "—"}
                </span>
                <span className="tabular-nums text-text2">
                  {client._count.contacts}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {ownerName ? (
                    <>
                      <InitialsAvatar name={ownerName} size={22} />
                      <span className="truncate text-text2">{ownerName}</span>
                    </>
                  ) : (
                    <span className="text-muted2">Sin asignar</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
