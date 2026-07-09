"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageProducts } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { Currency } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  PRODUCT_HEADER_TO_FIELD,
  normalizeHeader,
  type ProductImportState,
} from "@/lib/product-import";

function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

/** Parses an es-AR or plain number into a 2-decimal string, or null. */
function num(value: unknown): string | null {
  let s = String(value ?? "").trim().replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return /^\d+(\.\d+)?$/.test(s) ? Number(s).toFixed(2) : null;
}

function parseCurrency(value: unknown): Currency {
  const s = normalizeHeader(String(value ?? ""));
  return s.includes("usd") || s.includes("dolar") || s === "u$s"
    ? Currency.USD
    : Currency.ARS;
}

async function requireCatalogManager() {
  const user = await requireActiveUser();
  if (!canManageProducts(user)) {
    throw new Error("No tenés permisos para gestionar el catálogo.");
  }
  return user;
}

function productData(formData: FormData) {
  return {
    brand: opt(formData, "brand"),
    sku: opt(formData, "sku"),
    description: opt(formData, "description"),
    unit: (opt(formData, "unit") ?? "un").slice(0, 12),
    price: num(formData.get("price")) ?? "0.00",
    currency:
      formData.get("currency") === Currency.USD ? Currency.USD : Currency.ARS,
    ivaRate: num(formData.get("ivaRate")) ?? "21.00",
  };
}

function duplicateProduct(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createProduct(formData: FormData): Promise<void> {
  const user = await requireCatalogManager();
  const name = opt(formData, "name");
  if (!name) throw new Error("El nombre del producto es obligatorio.");

  try {
    const product = await prisma.product.create({
      data: { name, ...productData(formData) },
    });
    await logAudit({
      action: "product.created",
      actorId: user.id,
      targetType: "Product",
      targetId: product.id,
      metadata: { name },
    });
  } catch (error) {
    if (duplicateProduct(error)) {
      throw new Error("Ya existe un producto con ese nombre y marca.");
    }
    throw error;
  }
  revalidatePath("/productos");
  redirect("/productos");
}

export async function updateProduct(formData: FormData): Promise<void> {
  const user = await requireCatalogManager();
  const id = String(formData.get("id") ?? "");
  const name = opt(formData, "name");
  if (!name) throw new Error("El nombre del producto es obligatorio.");

  try {
    await prisma.product.update({
      where: { id },
      data: { name, ...productData(formData) },
    });
  } catch (error) {
    if (duplicateProduct(error)) {
      throw new Error("Ya existe un producto con ese nombre y marca.");
    }
    throw error;
  }
  await logAudit({
    action: "product.updated",
    actorId: user.id,
    targetType: "Product",
    targetId: id,
  });
  revalidatePath("/productos");
  redirect("/productos");
}

export async function toggleProductActive(formData: FormData): Promise<void> {
  const user = await requireCatalogManager();
  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;
  await prisma.product.update({
    where: { id },
    data: { isActive: !product.isActive },
  });
  await logAudit({
    action: product.isActive ? "product.deactivated" : "product.activated",
    actorId: user.id,
    targetType: "Product",
    targetId: id,
  });
  revalidatePath("/productos");
}

function cellText(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return null;
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text.trim() || null;
    if (Array.isArray(obj.richText)) {
      return (
        (obj.richText as Array<{ text?: string }>)
          .map((part) => part.text ?? "")
          .join("")
          .trim() || null
      );
    }
    if (obj.result != null) return String(obj.result).trim() || null;
  }
  return null;
}

/** Bulk-imports products from an uploaded Excel file. */
export async function importProducts(
  _prev: ProductImportState,
  formData: FormData
): Promise<ProductImportState> {
  try {
    await requireCatalogManager();
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Elegí un archivo Excel (.xlsx)." };
  }
  const defaultBrand = opt(formData, "defaultBrand");

  const workbook = new ExcelJS.Workbook();
  try {
    const data = await file.arrayBuffer();
    await workbook.xlsx.load(
      Buffer.from(data) as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
  } catch {
    return {
      status: "error",
      message: "No pude leer el archivo. Verificá que sea un .xlsx válido.",
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { status: "error", message: "El archivo no tiene hojas." };
  }

  const columnToField = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = cellText(cell.value);
    if (!header) return;
    const field = PRODUCT_HEADER_TO_FIELD[normalizeHeader(header)];
    if (field) columnToField.set(colNumber, field);
  });
  if (![...columnToField.values()].includes("name")) {
    return {
      status: "error",
      message: 'El archivo no tiene la columna "Producto" (o "Nombre").',
    };
  }

  const rows: Prisma.ProductCreateManyInput[] = [];
  let invalid = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    columnToField.forEach((field, colNumber) => {
      const text = cellText(row.getCell(colNumber).value);
      if (text) record[field] = text;
    });
    if (Object.keys(record).length === 0) return;
    if (!record.name) {
      invalid++;
      return;
    }
    rows.push({
      name: record.name,
      brand: record.brand ?? defaultBrand,
      sku: record.sku ?? null,
      description: record.description ?? null,
      unit: (record.unit ?? "un").slice(0, 12),
      price: num(record.price) ?? "0.00",
      currency: parseCurrency(record.currency),
      ivaRate: num(record.ivaRate) ?? "21.00",
    });
  });

  if (rows.length === 0) {
    return { status: "done", created: 0, skipped: 0, invalid };
  }

  const result = await prisma.product.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const user = await requireActiveUser();
  await logAudit({
    action: "products.imported",
    actorId: user.id,
    targetType: "Product",
    metadata: { created: result.count, defaultBrand },
  });
  revalidatePath("/productos");

  return {
    status: "done",
    created: result.count,
    skipped: rows.length - result.count,
    invalid,
  };
}
