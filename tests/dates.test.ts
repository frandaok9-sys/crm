import { describe, it, expect } from "vitest";

import {
  formatDateAR,
  formatDatePadAR,
  monthKeyAR,
  monthLabelAR,
  yearMonthAR,
} from "../lib/dates";
import { monthlyBuckets } from "../lib/design";

/**
 * El servidor (Vercel) corre en UTC. Estas fechas son las que rompían:
 * un instante que en Argentina todavía es el día 10, en UTC ya es el 11.
 */
describe("fechas en hora de Argentina", () => {
  // Lunes 10/08/2026 21:06 en Argentina = martes 11/08 00:06 UTC.
  const lunesNoche = new Date("2026-08-11T00:06:00.000Z");

  it("muestra el día correcto aunque en UTC ya sea el siguiente", () => {
    expect(lunesNoche.toISOString().slice(0, 10)).toBe("2026-08-11"); // UTC
    expect(formatDateAR(lunesNoche)).toBe("10/8/2026");
    expect(formatDatePadAR(lunesNoche)).toBe("10/08/2026");
  });

  it("agrupa por mes según Argentina (fin de mes a la noche)", () => {
    // 31/08/2026 22:00 ARG = 01/09 01:00 UTC → tiene que seguir en agosto.
    const finDeMes = new Date("2026-09-01T01:00:00.000Z");
    expect(monthKeyAR(finDeMes)).toBe("2026-08");
    expect(yearMonthAR(finDeMes)).toEqual({ year: 2026, month: 8 });
    expect(monthLabelAR(finDeMes)).toBe("ago 26");
  });

  it("cuenta el registro de fin de mes en el mes que corresponde", () => {
    const finDeMes = new Date("2026-09-01T01:00:00.000Z"); // 31/08 22:00 ARG
    const buckets = monthlyBuckets([finDeMes], 6, lunesNoche);
    expect(buckets).toHaveLength(6);
    // El último bucket es agosto (el mes en curso en Argentina).
    expect(buckets[buckets.length - 1].count).toBe(1);
  });

  it("un registro del mes siguiente no entra en el mes actual", () => {
    const septiembre = new Date("2026-09-02T15:00:00.000Z");
    const buckets = monthlyBuckets([septiembre], 6, lunesNoche);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
});
