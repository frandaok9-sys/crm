/**
 * Fechas SIEMPRE en hora de Argentina.
 *
 * El servidor (Vercel) corre en UTC: después de las 21:00 de Argentina allá
 * ya es el día siguiente. Sin fijar la zona, el CRM mostraba "martes 11" un
 * lunes 10 a las 21:06, y una factura cargada de noche aparecía con la fecha
 * del día siguiente. Todo lo que se renderiza en el servidor tiene que pasar
 * por acá.
 *
 * (En componentes de cliente el navegador ya usa la hora local del usuario.)
 */
export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** dd/mm/aaaa en hora de Argentina. */
export function formatDateAR(date: Date): string {
  return date.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE });
}

/** dd/mm/aaaa hh:mm en hora de Argentina. */
export function formatDateTimeAR(date: Date): string {
  return date.toLocaleString("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** dd/mm/aaaa con dos dígitos (para el PDF de presupuestos). */
export function formatDatePadAR(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "LUNES, 10 DE AGOSTO" — el saludo del Inicio. */
export function todayKickerAR(): string {
  return new Date()
    .toLocaleDateString("es-AR", {
      timeZone: AR_TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();
}

/**
 * Año y mes (1-12) de una fecha EN ARGENTINA. Sin esto, un registro del 31
 * a la noche cae en el mes siguiente al agrupar por mes.
 */
export function yearMonthAR(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month") };
}

/** Clave "aaaa-mm" en hora de Argentina (agrupar por mes). */
export function monthKeyAR(date: Date): string {
  const { year, month } = yearMonthAR(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "ago 26" en hora de Argentina (etiqueta de mes). */
export function monthLabelAR(date: Date): string {
  return date
    .toLocaleDateString("es-AR", {
      timeZone: AR_TIME_ZONE,
      month: "short",
      year: "2-digit",
    })
    .replace(".", "");
}
