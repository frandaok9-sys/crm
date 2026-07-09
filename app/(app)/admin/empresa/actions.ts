"use server";

import { revalidatePath, updateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { COMPANY_SETTINGS_ID, COMPANY_SETTINGS_TAG } from "@/lib/company";
import { IvaCondition } from "@/lib/generated/prisma/enums";

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

export async function updateCompanySettings(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canManageUsers(user)) {
    throw new Error("No tenés permisos para editar la configuración.");
  }

  // Logo: undefined = leave as is, null = remove, string = new data URL.
  let logo: string | null | undefined = undefined;
  if (formData.get("removeLogo") === "on") logo = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      throw new Error("El logo debe ser una imagen (PNG, JPG…).");
    }
    if (file.size > 800 * 1024) {
      throw new Error("El logo no puede superar los 800 KB.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    logo = `data:${file.type};base64,${buffer.toString("base64")}`;
  }

  const ivaRaw = opt(formData, "ivaCondition");
  const ivaCondition =
    ivaRaw && (Object.values(IvaCondition) as string[]).includes(ivaRaw)
      ? (ivaRaw as IvaCondition)
      : null;

  const validityRaw = opt(formData, "quoteValidity");
  const quoteValidity =
    validityRaw && /^\d+$/.test(validityRaw)
      ? Number.parseInt(validityRaw, 10)
      : null;

  const base = {
    legalName: opt(formData, "legalName"),
    tradeName: opt(formData, "tradeName"),
    taxId: opt(formData, "taxId"),
    ivaCondition,
    address: opt(formData, "address"),
    city: opt(formData, "city"),
    province: opt(formData, "province"),
    postalCode: opt(formData, "postalCode"),
    phone: opt(formData, "phone"),
    email: opt(formData, "email"),
    website: opt(formData, "website"),
    primaryColor: opt(formData, "primaryColor"),
    quoteFooter: opt(formData, "quoteFooter"),
    quoteValidity,
    bankInfo: opt(formData, "bankInfo"),
  };
  const data = logo === undefined ? base : { ...base, logo };

  await prisma.companySettings.upsert({
    where: { id: COMPANY_SETTINGS_ID },
    create: { id: COMPANY_SETTINGS_ID, ...data },
    update: data,
  });

  await logAudit({
    action: "company.settings_updated",
    actorId: user.id,
    targetType: "CompanySettings",
    targetId: COMPANY_SETTINGS_ID,
  });
  updateTag(COMPANY_SETTINGS_TAG);
  revalidatePath("/admin");
}
