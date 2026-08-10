/**
 * Etapas del pipeline que el SISTEMA usa por nombre (no son solo columnas
 * del kanban): de ellas dependen el panel "En obra", /obras, las alertas de
 * oportunidades sin avanzar, los anillos del Inicio y "Pasar a ejecución".
 *
 * Por eso el Panel de control no deja renombrarlas (sí cambiarles el color
 * y el orden): un rename dejaría esas pantallas vacías en silencio.
 */
export const EXECUTION_STAGE = "En ejecución";
export const FINISHED_STAGE = "Finalizada";
export const LOST_STAGE = "Perdida";

/** Etapas terminales: la venta ya se decidió (ganada o perdida). */
export const CLOSED_STAGES = [
  EXECUTION_STAGE,
  FINISHED_STAGE,
  LOST_STAGE,
] as const;

/** Nombres que no se pueden cambiar desde el Panel de control. */
export const LOAD_BEARING_STAGES: readonly string[] = CLOSED_STAGES;

export function isLoadBearingStage(name: string): boolean {
  return LOAD_BEARING_STAGES.includes(name);
}
