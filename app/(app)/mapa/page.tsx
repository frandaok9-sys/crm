// Rutas con muchos destinos (OSRM + geocodificación) superan el límite
// serverless por defecto; las acciones del mapa heredan este tope.
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { opportunityScope, canViewAllRecords } from "@/lib/permissions";
import { formatMoney } from "@/lib/opportunities";
import { stageHex } from "@/lib/stage-colors";
import { sellerColor } from "@/components/initials-avatar";
import { type MapPin } from "@/components/opportunity-map";
import { MapWorkspace } from "@/components/map-workspace";

export default async function MapPage() {
  const user = await requireActiveUser();
  const companyWide = canViewAllRecords(user);

  const [located, unlocatedCount, stages] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        ...opportunityScope(user),
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        client: { select: { legalName: true } },
        owner: { select: { name: true, email: true } },
        stage: { select: { name: true, color: true } },
      },
    }),
    prisma.opportunity.count({
      where: { ...opportunityScope(user), latitude: null },
    }),
    prisma.stage.findMany({ orderBy: { position: "asc" } }),
  ]);

  const pins: MapPin[] = located.map((o) => {
    const ownerName = o.owner
      ? o.owner.name ?? o.owner.email
      : "Sin asignar";
    return {
      id: o.id,
      title: o.title,
      clientName: o.client.legalName,
      m2Label: o.estimatedM2
        ? `${Number(o.estimatedM2).toLocaleString("es-AR")} m²`
        : null,
      amountLabel: formatMoney(
        o.amount ? o.amount.toString() : null,
        o.currency
      ),
      stageName: o.stage.name,
      stageHex: stageHex(o.stage.color),
      ownerName,
      ownerTint: sellerColor(ownerName),
      lat: Number(o.latitude),
      lng: Number(o.longitude),
    };
  });

  const sellers = [...new Map(pins.map((p) => [p.ownerName, p.ownerTint]))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Mapa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pins.length} obra(s) ubicada(s)
            {companyWide ? " en toda la cartera" : " de tu cartera"}
            {unlocatedCount > 0 &&
              ` · ${unlocatedCount} sin ubicación (cargales dirección de obra)`}
            .
          </p>
        </div>
      </div>

      {/* Leyendas */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-bold uppercase tracking-[0.1em] text-muted2">
            Vendedor
          </span>
          {sellers.map(([name, tint]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: tint }}
              />
              {name}
            </span>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-bold uppercase tracking-[0.1em] text-muted2">
            Anillo · etapa
          </span>
          {stages.map((stage) => (
            <span key={stage.id} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full border-2 bg-transparent"
                style={{ borderColor: stageHex(stage.color) }}
              />
              {stage.name}
            </span>
          ))}
        </span>
      </div>

      {/* Mapa + planificador de viajes */}
      <MapWorkspace pins={pins} canManage={companyWide} />
    </div>
  );
}
