import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

export const COMPANY_SETTINGS_ID = "singleton";
export const COMPANY_SETTINGS_TAG = "company-settings";

// Company settings rarely change but are read on EVERY page (header logo).
// Cache them across requests; the update action revalidates the tag.
const fetchCompanySettings = unstable_cache(
  () =>
    prisma.companySettings.findUnique({
      where: { id: COMPANY_SETTINGS_ID },
    }),
  [COMPANY_SETTINGS_TAG],
  { tags: [COMPANY_SETTINGS_TAG] }
);

/** Returns the single company settings row (or null if not configured yet). */
export const getCompanySettings = cache(fetchCompanySettings);
