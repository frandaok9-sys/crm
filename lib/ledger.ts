import { LedgerMovementType } from "@/lib/generated/prisma/enums";

export const LEDGER_TYPE_LABELS: Record<LedgerMovementType, string> = {
  [LedgerMovementType.INVOICE]: "Factura",
  [LedgerMovementType.DEBIT_NOTE]: "Nota de débito",
  [LedgerMovementType.PAYMENT]: "Pago",
  [LedgerMovementType.CREDIT_NOTE]: "Nota de crédito",
};
