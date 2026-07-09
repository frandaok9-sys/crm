"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  canCreateClients,
  canAssignClients,
  canEditClient,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { IvaCondition, ClientSegment } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import ExcelJS from "exceljs";
import {
  HEADER_TO_FIELD,
  mapIvaCondition,
  normalizeHeader,
  type ImportState,
} from "@/lib/client-import";

/** Reads a trimmed form field, returning null when empty. */
function opt(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function parseIva(formData: FormData): IvaCondition | null {
  const value = opt(formData, "ivaCondition");
  if (!value) return null;
  return (Object.values(IvaCondition) as string[]).includes(value)
    ? (value as IvaCondition)
    : null;
}

function parseSegment(formData: FormData): ClientSegment | null {
  const value = opt(formData, "segment");
  if (!value) return null;
  return (Object.values(ClientSegment) as string[]).includes(value)
    ? (value as ClientSegment)
    : null;
}

function duplicateTaxId(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** Scalar client fields shared by create and update. */
function clientData(formData: FormData) {
  return {
    tradeName: opt(formData, "tradeName"),
    taxId: opt(formData, "taxId"),
    ivaCondition: parseIva(formData),
    email: opt(formData, "email"),
    phone: opt(formData, "phone"),
    address: opt(formData, "address"),
    city: opt(formData, "city"),
    province: opt(formData, "province"),
    industry: opt(formData, "industry"),
    segment: parseSegment(formData),
    notes: opt(formData, "notes"),
  };
}

export async function createClient(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canCreateClients(user)) {
    throw new Error("No tenés permisos para crear clientes.");
  }
  const legalName = opt(formData, "legalName");
  if (!legalName) throw new Error("La razón social es obligatoria.");

  // Managers/admins may choose the owner; a salesperson keeps it in their book.
  const ownerId = canAssignClients(user) ? opt(formData, "ownerId") : user.id;

  let clientId: string;
  try {
    const client = await prisma.client.create({
      data: { legalName, ...clientData(formData), ownerId },
    });
    clientId = client.id;
    await logAudit({
      action: "client.created",
      actorId: user.id,
      targetType: "Client",
      targetId: client.id,
      metadata: { legalName },
    });
  } catch (error) {
    if (duplicateTaxId(error)) {
      throw new Error("Ya existe un cliente con ese CUIT.");
    }
    throw error;
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${clientId}`);
}

export async function updateClient(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) throw new Error("Cliente no encontrado.");
  if (!canEditClient(user, existing)) {
    throw new Error("No tenés permisos para editar este cliente.");
  }
  const legalName = opt(formData, "legalName");
  if (!legalName) throw new Error("La razón social es obligatoria.");

  try {
    await prisma.client.update({
      where: { id },
      data: { legalName, ...clientData(formData) },
    });
  } catch (error) {
    if (duplicateTaxId(error)) {
      throw new Error("Ya existe un cliente con ese CUIT.");
    }
    throw error;
  }

  await logAudit({
    action: "client.updated",
    actorId: user.id,
    targetType: "Client",
    targetId: id,
  });
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}

export async function assignClient(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  if (!canAssignClients(user)) {
    throw new Error("No tenés permisos para asignar clientes.");
  }
  const id = String(formData.get("id") ?? "");
  const ownerId = opt(formData, "ownerId"); // null => cartera general (sin asignar)

  await prisma.client.update({ where: { id }, data: { ownerId } });
  await logAudit({
    action: "client.assigned",
    actorId: user.id,
    targetType: "Client",
    targetId: id,
    metadata: { ownerId },
  });
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}

export async function addContact(formData: FormData): Promise<void> {
  const user = await requireActiveUser();
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Cliente no encontrado.");
  if (!canEditClient(user, client)) {
    throw new Error("No tenés permisos para modificar este cliente.");
  }
  const name = opt(formData, "name");
  if (!name) throw new Error("El nombre del contacto es obligatorio.");

  const contact = await prisma.contact.create({
    data: {
      clientId,
      name,
      position: opt(formData, "position"),
      email: opt(formData, "email"),
      phone: opt(formData, "phone"),
      isPrimary: formData.get("isPrimary") === "on",
    },
  });
  await logAudit({
    action: "contact.created",
    actorId: user.id,
    targetType: "Contact",
    targetId: contact.id,
    metadata: { clientId },
  });
  revalidatePath(`/clientes/${clientId}`);
}

/** Extracts a trimmed string from an ExcelJS cell value of any shape. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleDateString("es-AR");
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

type ParseResult = {
  missingLegalNameColumn: boolean;
  valid: Prisma.ClientCreateManyInput[];
  invalid: number;
};

/** Parses an uploaded .xlsx buffer into client rows ready for insertion. */
async function parseClientsXlsx(
  data: ArrayBuffer,
  ownerId: string | null
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(data) as unknown as Parameters<typeof workbook.xlsx.load>[0]
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { missingLegalNameColumn: true, valid: [], invalid: 0 };
  }

  // Map spreadsheet columns to Client fields using the header row.
  const columnToField = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = cellText(cell.value);
    if (!header) return;
    const field = HEADER_TO_FIELD[normalizeHeader(header)];
    if (field) columnToField.set(colNumber, field);
  });

  if (![...columnToField.values()].includes("legalName")) {
    return { missingLegalNameColumn: true, valid: [], invalid: 0 };
  }

  const valid: Prisma.ClientCreateManyInput[] = [];
  const seenTaxIds = new Set<string>();
  let invalid = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: Record<string, string> = {};
    columnToField.forEach((field, colNumber) => {
      const text = cellText(row.getCell(colNumber).value);
      if (text) record[field] = text;
    });

    if (Object.keys(record).length === 0) return; // blank row

    if (!record.legalName) {
      invalid++;
      return;
    }
    if (record.taxId) {
      if (seenTaxIds.has(record.taxId)) return; // duplicate within the file
      seenTaxIds.add(record.taxId);
    }

    valid.push({
      legalName: record.legalName,
      tradeName: record.tradeName ?? null,
      taxId: record.taxId ?? null,
      ivaCondition: mapIvaCondition(record.ivaCondition ?? null),
      email: record.email ?? null,
      phone: record.phone ?? null,
      address: record.address ?? null,
      city: record.city ?? null,
      province: record.province ?? null,
      industry: record.industry ?? null,
      notes: record.notes ?? null,
      ownerId,
    });
  });

  return { missingLegalNameColumn: false, valid, invalid };
}

/** Bulk-imports clients from an uploaded Excel file. */
export async function importClients(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const user = await requireActiveUser();
  if (!canCreateClients(user)) {
    return { status: "error", message: "No tenés permisos para importar clientes." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Elegí un archivo Excel (.xlsx)." };
  }

  // Managers/admins may import into someone's portfolio; a salesperson into theirs.
  const ownerId = canAssignClients(user) ? opt(formData, "ownerId") : user.id;

  let parsed: ParseResult;
  try {
    parsed = await parseClientsXlsx(await file.arrayBuffer(), ownerId);
  } catch {
    return {
      status: "error",
      message: "No pude leer el archivo. Verificá que sea un .xlsx válido.",
    };
  }

  if (parsed.missingLegalNameColumn) {
    return {
      status: "error",
      message: 'El archivo no tiene la columna "Razón social".',
    };
  }
  if (parsed.valid.length === 0) {
    return { status: "done", created: 0, skipped: 0, invalid: parsed.invalid };
  }

  const result = await prisma.client.createMany({
    data: parsed.valid,
    skipDuplicates: true,
  });

  await logAudit({
    action: "clients.imported",
    actorId: user.id,
    targetType: "Client",
    metadata: { created: result.count, ownerId },
  });
  revalidatePath("/clientes");

  return {
    status: "done",
    created: result.count,
    skipped: parsed.valid.length - result.count,
    invalid: parsed.invalid,
  };
}
