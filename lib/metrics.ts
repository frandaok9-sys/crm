import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import {
  quoteScope,
  opportunityScope,
  canViewAllRecords,
  type Principal,
} from "@/lib/permissions";
import { SEGMENT_LABELS } from "@/lib/clients";
import { latestRevisions } from "@/lib/quotes";
import { QuoteStatus } from "@/lib/generated/prisma/enums";

/**
 * Fase 4 — Métricas. Agregaciones con Decimal, SIEMPRE separadas por moneda
 * (nunca se suman ARS con USD) y respetando el alcance del usuario.
 */

export type MonthPoint = {
  label: string; // "jul 26"
  quoted: string;
  approved: string;
};

export type CurrencySeries = {
  currency: string;
  months: MonthPoint[];
  maxValue: string; // máximo entre todas las barras (para escalar)
};

export type SegmentRow = { label: string; total: string };

export type FunnelRow = {
  stage: string;
  color: string;
  count: number;
  m2: string;
  amounts: { currency: string; total: string }[];
};

export type SellerRow = {
  name: string;
  quoted: { currency: string; total: string }[];
  approved: { currency: string; total: string }[];
  issued: number;
  approvedCount: number;
  ratePct: number;
  pipelineM2: string;
};

export type MetricsData = {
  totals: { currency: string; quoted: string; approved: string }[];
  conversion: { issued: number; approved: number; ratePct: number };
  pipelineM2: string;
  monthly: CurrencySeries[];
  bySegment: { currency: string; rows: SegmentRow[] }[];
  funnel: FunnelRow[];
  /** Comparativa por vendedor — solo para quienes ven toda la cartera. */
  bySeller: SellerRow[] | null;
};

const MONTHS_BACK = 6;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date
    .toLocaleDateString("es-AR", { month: "short", year: "2-digit" })
    .replace(".", "");
}

export async function getMetrics(user: Principal): Promise<MetricsData> {
  const companyWide = canViewAllRecords(user);
  const [allQuotes, opportunities] = await Promise.all([
    prisma.quote.findMany({
      where: quoteScope(user),
      select: {
        id: true,
        rootId: true,
        version: true,
        status: true,
        total: true,
        currency: true,
        createdAt: true,
        client: { select: { segment: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: opportunityScope(user),
      select: {
        amount: true,
        currency: true,
        estimatedM2: true,
        stage: { select: { name: true, color: true, position: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  // Cada presupuesto cuenta UNA sola vez: si tiene revisiones (Rev.2, Rev.3…)
  // se toma la última. Sin esto, un presupuesto revisado inflaba cotizado,
  // aprobado y conversión por cada revisión.
  const quotes = latestRevisions(allQuotes);

  // --- Totales y conversión ------------------------------------------------
  const totalsMap = new Map<string, { quoted: Decimal; approved: Decimal }>();
  let issued = 0;
  let approvedCount = 0;
  for (const q of quotes) {
    const entry =
      totalsMap.get(q.currency) ??
      { quoted: new Decimal(0), approved: new Decimal(0) };
    const total = new Decimal(q.total.toString());
    entry.quoted = entry.quoted.plus(total);
    if (q.status === QuoteStatus.APPROVED) {
      entry.approved = entry.approved.plus(total);
      approvedCount++;
    }
    if (q.status !== QuoteStatus.DRAFT) issued++;
    totalsMap.set(q.currency, entry);
  }

  // --- Serie mensual (últimos 6 meses) por moneda ---------------------------
  const now = new Date();
  const buckets: { key: string; label: string }[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: monthKey(d), label: monthLabel(d) });
  }

  const monthly: CurrencySeries[] = [...totalsMap.keys()].map((currency) => {
    const perMonth = new Map<string, { quoted: Decimal; approved: Decimal }>();
    for (const b of buckets) {
      perMonth.set(b.key, { quoted: new Decimal(0), approved: new Decimal(0) });
    }
    for (const q of quotes) {
      if (q.currency !== currency) continue;
      const entry = perMonth.get(monthKey(q.createdAt));
      if (!entry) continue; // fuera de la ventana
      const total = new Decimal(q.total.toString());
      entry.quoted = entry.quoted.plus(total);
      if (q.status === QuoteStatus.APPROVED) {
        entry.approved = entry.approved.plus(total);
      }
    }
    let max = new Decimal(0);
    const months = buckets.map((b) => {
      const entry = perMonth.get(b.key)!;
      max = Decimal.max(max, entry.quoted, entry.approved);
      return {
        label: b.label,
        quoted: entry.quoted.toFixed(2),
        approved: entry.approved.toFixed(2),
      };
    });
    return { currency, months, maxValue: max.toFixed(2) };
  });

  // --- Aprobado por segmento -------------------------------------------------
  const segmentMap = new Map<string, Map<string, Decimal>>(); // currency -> label -> total
  for (const q of quotes) {
    if (q.status !== QuoteStatus.APPROVED) continue;
    const label = q.client.segment
      ? SEGMENT_LABELS[q.client.segment]
      : "Sin segmento";
    const byLabel = segmentMap.get(q.currency) ?? new Map<string, Decimal>();
    byLabel.set(
      label,
      (byLabel.get(label) ?? new Decimal(0)).plus(q.total.toString())
    );
    segmentMap.set(q.currency, byLabel);
  }
  const bySegment = [...segmentMap.entries()].map(([currency, byLabel]) => ({
    currency,
    rows: [...byLabel.entries()]
      .map(([label, total]) => ({ label, total: total.toFixed(2) }))
      .sort((a, b) => Number(b.total) - Number(a.total)),
  }));

  // --- Embudo del pipeline ---------------------------------------------------
  const funnelMap = new Map<
    string,
    {
      color: string;
      position: number;
      count: number;
      m2: Decimal;
      amounts: Map<string, Decimal>;
    }
  >();
  let pipelineM2 = new Decimal(0);
  for (const o of opportunities) {
    const entry =
      funnelMap.get(o.stage.name) ??
      {
        color: o.stage.color,
        position: o.stage.position,
        count: 0,
        m2: new Decimal(0),
        amounts: new Map<string, Decimal>(),
      };
    entry.count++;
    if (o.estimatedM2) {
      entry.m2 = entry.m2.plus(o.estimatedM2.toString());
      pipelineM2 = pipelineM2.plus(o.estimatedM2.toString());
    }
    if (o.amount) {
      entry.amounts.set(
        o.currency,
        (entry.amounts.get(o.currency) ?? new Decimal(0)).plus(
          o.amount.toString()
        )
      );
    }
    funnelMap.set(o.stage.name, entry);
  }
  const funnel: FunnelRow[] = [...funnelMap.entries()]
    .sort((a, b) => a[1].position - b[1].position)
    .map(([stage, e]) => ({
      stage,
      color: e.color,
      count: e.count,
      m2: e.m2.toFixed(0),
      amounts: [...e.amounts.entries()].map(([currency, total]) => ({
        currency,
        total: total.toFixed(2),
      })),
    }));

  // --- Comparativa por vendedor (solo visión general) ------------------------
  let bySeller: SellerRow[] | null = null;
  if (companyWide) {
    type Acc = {
      name: string;
      quoted: Map<string, Decimal>;
      approved: Map<string, Decimal>;
      issued: number;
      approvedCount: number;
      m2: Decimal;
    };
    const sellers = new Map<string, Acc>();
    const acc = (owner: { id: string; name: string | null; email: string } | null): Acc => {
      const key = owner?.id ?? "__none__";
      const existing = sellers.get(key);
      if (existing) return existing;
      const fresh: Acc = {
        name: owner ? owner.name ?? owner.email : "Sin asignar",
        quoted: new Map(),
        approved: new Map(),
        issued: 0,
        approvedCount: 0,
        m2: new Decimal(0),
      };
      sellers.set(key, fresh);
      return fresh;
    };

    for (const q of quotes) {
      const s = acc(q.owner);
      const total = new Decimal(q.total.toString());
      s.quoted.set(
        q.currency,
        (s.quoted.get(q.currency) ?? new Decimal(0)).plus(total)
      );
      if (q.status !== QuoteStatus.DRAFT) s.issued++;
      if (q.status === QuoteStatus.APPROVED) {
        s.approvedCount++;
        s.approved.set(
          q.currency,
          (s.approved.get(q.currency) ?? new Decimal(0)).plus(total)
        );
      }
    }
    for (const o of opportunities) {
      if (!o.estimatedM2) continue;
      acc(o.owner).m2 = acc(o.owner).m2.plus(o.estimatedM2.toString());
    }

    bySeller = [...sellers.values()]
      .map((s) => ({
        name: s.name,
        quoted: [...s.quoted.entries()].map(([currency, total]) => ({
          currency,
          total: total.toFixed(2),
        })),
        approved: [...s.approved.entries()].map(([currency, total]) => ({
          currency,
          total: total.toFixed(2),
        })),
        issued: s.issued,
        approvedCount: s.approvedCount,
        ratePct: s.issued > 0 ? Math.round((s.approvedCount / s.issued) * 100) : 0,
        pipelineM2: s.m2.toFixed(0),
      }))
      .sort((a, b) => {
        const aArs = Number(a.approved.find((x) => x.currency === "ARS")?.total ?? 0);
        const bArs = Number(b.approved.find((x) => x.currency === "ARS")?.total ?? 0);
        return bArs - aArs;
      });
  }

  return {
    totals: [...totalsMap.entries()].map(([currency, t]) => ({
      currency,
      quoted: t.quoted.toFixed(2),
      approved: t.approved.toFixed(2),
    })),
    conversion: {
      issued,
      approved: approvedCount,
      ratePct: issued > 0 ? Math.round((approvedCount / issued) * 100) : 0,
    },
    pipelineM2: pipelineM2.toFixed(0),
    monthly,
    bySegment,
    funnel,
    bySeller,
  };
}
