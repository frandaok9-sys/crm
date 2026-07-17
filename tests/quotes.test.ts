import { describe, it, expect } from "vitest";

import { canTransitionQuote, latestRevisions } from "../lib/quotes";
import { QuoteStatus } from "../lib/generated/prisma/enums";

/**
 * Máquina de estados del presupuesto (validación del lado del servidor) y
 * deduplicación de revisiones (la base del arreglo de métricas infladas).
 */

describe("canTransitionQuote (máquina de estados)", () => {
  it("permite el flujo normal: Borrador→Enviado→Aprobado/Rechazado/Vencido", () => {
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.SENT)).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.APPROVED)).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.REJECTED)).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.EXPIRED)).toBe(true);
  });

  it("bloquea revivir estados finales (el bug: Vencido/Rechazado → Aprobado)", () => {
    expect(canTransitionQuote(QuoteStatus.EXPIRED, QuoteStatus.APPROVED)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.REJECTED, QuoteStatus.APPROVED)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.APPROVED, QuoteStatus.DRAFT)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.APPROVED, QuoteStatus.SENT)).toBe(false);
  });

  it("bloquea saltos y retrocesos", () => {
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.APPROVED)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.EXPIRED)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.DRAFT)).toBe(false);
  });

  it("no permite quedarse en el mismo estado (no-op)", () => {
    for (const s of Object.values(QuoteStatus)) {
      expect(canTransitionQuote(s, s)).toBe(false);
    }
  });
});

describe("latestRevisions (una revisión por presupuesto)", () => {
  const q = (id: string, rootId: string | null, version: number) => ({
    id,
    rootId,
    version,
  });

  it("con revisiones, sobrevive solo la más nueva del grupo", () => {
    const rows = [
      q("a1", null, 1), // original (grupo a1)
      q("a2", "a1", 2), // Rev.2 del mismo grupo
      q("a3", "a1", 3), // Rev.3 del mismo grupo
      q("b1", null, 1), // otro presupuesto sin revisiones
    ];
    const latest = latestRevisions(rows);
    expect(latest.map((r) => r.id).sort()).toEqual(["a3", "b1"]);
  });

  it("sin revisiones devuelve todo tal cual", () => {
    const rows = [q("a", null, 1), q("b", null, 1)];
    expect(latestRevisions(rows)).toHaveLength(2);
  });

  it("no importa el orden de llegada de las revisiones", () => {
    const rows = [q("a3", "a1", 3), q("a1", null, 1), q("a2", "a1", 2)];
    const latest = latestRevisions(rows);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe("a3");
  });
});
