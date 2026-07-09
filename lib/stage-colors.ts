/**
 * Colores de etapa del pipeline (handoff hifi). Las etapas guardan un nombre
 * de color en la base ("gray", "blue"…) que acá se traduce al hex exacto.
 */
export const STAGE_HEX: Record<string, string> = {
  gray: "#8A8D95",
  blue: "#5B82D6",
  amber: "#D9A03C",
  purple: "#9B7BE8",
  green: "#4FA97A",
  red: "#C8523F",
};

export function stageHex(color: string): string {
  return STAGE_HEX[color] ?? STAGE_HEX.gray;
}
