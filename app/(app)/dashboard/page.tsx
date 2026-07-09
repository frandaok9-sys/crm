import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  ROLE_LABELS,
  clientScope,
  opportunityScope,
  quoteScope,
} from "@/lib/permissions";
import { QuoteStatus } from "@/lib/generated/prisma/enums";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm">
      <div className="font-heading text-3xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold uppercase tracking-wide">
          {title}
        </h2>
        <span className="text-zinc-300 transition-all group-hover:translate-x-1 group-hover:text-primary">
          →
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Sin rol";
  const firstName = (user.name ?? user.email ?? "").split(" ")[0];

  const [clients, opportunities, quotesSent, quotesApproved] =
    await Promise.all([
      prisma.client.count({ where: clientScope(user) }),
      prisma.opportunity.count({ where: opportunityScope(user) }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.SENT },
      }),
      prisma.quote.count({
        where: { ...quoteScope(user), status: QuoteStatus.APPROVED },
      }),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
          {roleLabel}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Hola, {firstName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Clientes" value={clients} />
        <Metric label="Oportunidades" value={opportunities} />
        <Metric label="Presupuestos enviados" value={quotesSent} />
        <Metric label="Presupuestos aprobados" value={quotesApproved} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/clientes"
          title="Clientes"
          description="Cartera, contactos y cuenta corriente."
        />
        <QuickLink
          href="/oportunidades"
          title="Pipeline"
          description="Seguimiento de obras y oportunidades."
        />
        <QuickLink
          href="/presupuestos"
          title="Presupuestos"
          description="Cotizaciones por m², IVA y revisiones."
        />
        <QuickLink
          href="/productos"
          title="Productos"
          description="Catálogo Sinteplast y Ashford con precios."
        />
      </div>
    </div>
  );
}
