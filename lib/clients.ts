import { IvaCondition } from "@/lib/generated/prisma/enums";

/** Human-readable IVA condition labels for the Spanish UI. */
export const IVA_LABELS: Record<IvaCondition, string> = {
  [IvaCondition.RESPONSABLE_INSCRIPTO]: "Responsable Inscripto",
  [IvaCondition.MONOTRIBUTO]: "Monotributo",
  [IvaCondition.EXENTO]: "Exento",
  [IvaCondition.CONSUMIDOR_FINAL]: "Consumidor Final",
  [IvaCondition.NO_ALCANZADO]: "No Alcanzado",
};
