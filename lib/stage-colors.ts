/**
 * Colores de etapa del pipeline (handoff hifi). Las etapas guardan un nombre
 * de color en la base ("gray", "blue"…) que acá se traduce al hex exacto.
 */
export const STAGE_HEX: Record<string, string> = {
  // Paleta iOS suavizada (~26% hacia gris neutro) — v5.
  gray: "#8E8E93",
  teal: "#6BBEE5", // Prospecto (turquesa, para que el donut no se vea gris)
  blue: "#2E82E0",
  amber: "#E0982C",
  purple: "#A66AD0",
  green: "#4FB574",
  red: "#D65A46",
};

export function stageHex(color: string): string {
  return STAGE_HEX[color] ?? STAGE_HEX.gray;
}
