import { prisma } from "@/lib/prisma";

export const COMPANY_SETTINGS_ID = "singleton";

/** Returns the single company settings row (or null if not configured yet). */
export function getCompanySettings() {
  return prisma.companySettings.findUnique({
    where: { id: COMPANY_SETTINGS_ID },
  });
}
