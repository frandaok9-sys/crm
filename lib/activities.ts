import { ClientActivityType } from "@/lib/generated/prisma/enums";

/** Etiquetas en español para la UI (el código va en inglés). */
export const ACTIVITY_TYPE_LABELS: Record<ClientActivityType, string> = {
  [ClientActivityType.CALL]: "Llamada",
  [ClientActivityType.VISIT]: "Visita",
  [ClientActivityType.EMAIL]: "Email",
  [ClientActivityType.NOTE]: "Nota",
  [ClientActivityType.TASK]: "Tarea",
};

export const ACTIVITY_TYPE_ICONS: Record<ClientActivityType, string> = {
  [ClientActivityType.CALL]: "📞",
  [ClientActivityType.VISIT]: "📍",
  [ClientActivityType.EMAIL]: "✉️",
  [ClientActivityType.NOTE]: "📝",
  [ClientActivityType.TASK]: "☑️",
};
