"use client";

type ExportItem = { type: string; label: string; desc: string };

const ITEMS: ExportItem[] = [
  {
    type: "clientes",
    label: "Clientes",
    desc: "Razón social, CUIT, condición IVA, segmento, ubicación y vendedor.",
  },
  {
    type: "presupuestos",
    label: "Presupuestos",
    desc: "Última revisión de cada uno: cliente, estado, moneda, total y fechas.",
  },
  {
    type: "metricas",
    label: "Métricas",
    desc: "Totales por moneda, conversión, embudo por etapa, por segmento y por vendedor.",
  },
];

export function AdminExportSection() {
  return (
    <div className="max-w-[620px] space-y-4">
      <p className="text-sm text-muted-foreground">
        Descargá los datos en Excel (.xlsx) para respaldos o reportes. Cada
        exportación queda registrada en la auditoría.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <a
            key={item.type}
            href={`/admin/export?type=${item.type}`}
            className="group flex flex-col gap-1 rounded-[12px] border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-hoverbg"
          >
            <span className="flex items-center gap-2 text-[14.5px] font-bold text-foreground">
              <span className="text-primary">↓</span> {item.label}
            </span>
            <span className="text-[12.5px] text-muted-foreground">{item.desc}</span>
            <span className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Descargar Excel
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
