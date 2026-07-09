import { IvaCondition, ClientSegment } from "@/lib/generated/prisma/enums";

/** Human-readable IVA condition labels for the Spanish UI. */
export const IVA_LABELS: Record<IvaCondition, string> = {
  [IvaCondition.RESPONSABLE_INSCRIPTO]: "Responsable Inscripto",
  [IvaCondition.MONOTRIBUTO]: "Monotributo",
  [IvaCondition.EXENTO]: "Exento",
  [IvaCondition.CONSUMIDOR_FINAL]: "Consumidor Final",
  [IvaCondition.NO_ALCANZADO]: "No Alcanzado",
};

/** Client segment labels (RC Pisos Industriales target market). */
export const SEGMENT_LABELS: Record<ClientSegment, string> = {
  [ClientSegment.BODEGA]: "Bodega / Vitivinícola",
  [ClientSegment.AGROINDUSTRIA]: "Agroindustria / Alimenticia",
  [ClientSegment.CONSTRUCTORA]: "Constructora / Desarrolladora",
  [ClientSegment.FABRICA]: "Planta / Fábrica",
  [ClientSegment.LOGISTICA]: "Logística / Distribución",
  [ClientSegment.COMERCIO]: "Comercio / Servicios",
  [ClientSegment.OTRO]: "Otro",
};
