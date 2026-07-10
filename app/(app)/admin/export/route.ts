import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageCompany } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";

/**
 * Exportación de datos a Excel para administradores (permiso admin.company).
 * /admin/export?type=clientes | presupuestos
 */
export async function GET(request: Request) {
  const admin = await requireActiveUser();
  if (!canManageCompany(admin)) {
    return new Response("No autorizado", { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type") ?? "clientes";
  const workbook = new ExcelJS.Workbook();

  let filename = "export.xlsx";

  if (type === "clientes") {
    filename = "clientes.xlsx";
    const sheet = workbook.addWorksheet("Clientes");
    sheet.columns = [
      { header: "Razón social", key: "legalName", width: 30 },
      { header: "Nombre fantasía", key: "tradeName", width: 24 },
      { header: "CUIT", key: "taxId", width: 16 },
      { header: "Cond. IVA", key: "iva", width: 22 },
      { header: "Segmento", key: "segment", width: 20 },
      { header: "Ciudad", key: "city", width: 18 },
      { header: "Provincia", key: "province", width: 18 },
      { header: "Vendedor", key: "owner", width: 22 },
      { header: "Alta", key: "created", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    const clients = await prisma.client.findMany({
      orderBy: { legalName: "asc" },
      include: { owner: { select: { name: true, email: true } } },
    });
    for (const c of clients) {
      sheet.addRow({
        legalName: c.legalName,
        tradeName: c.tradeName ?? "",
        taxId: c.taxId ?? "",
        iva: c.ivaCondition ? IVA_LABELS[c.ivaCondition] : "",
        segment: c.segment ? SEGMENT_LABELS[c.segment] : "",
        city: c.city ?? "",
        province: c.province ?? "",
        owner: c.owner ? c.owner.name ?? c.owner.email : "Sin asignar",
        created: c.createdAt.toISOString().slice(0, 10),
      });
    }
  } else if (type === "presupuestos") {
    filename = "presupuestos.xlsx";
    const sheet = workbook.addWorksheet("Presupuestos");
    sheet.columns = [
      { header: "Código", key: "code", width: 16 },
      { header: "Cliente", key: "client", width: 30 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Total", key: "total", width: 16 },
      { header: "Emisión", key: "issue", width: 12 },
      { header: "Vence", key: "valid", width: 12 },
      { header: "Vendedor", key: "owner", width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };

    const all = await prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rootId: true,
        version: true,
        code: true,
        status: true,
        total: true,
        currency: true,
        issueDate: true,
        validUntil: true,
        client: { select: { legalName: true } },
        owner: { select: { name: true, email: true } },
      },
    });
    for (const q of latestRevisions(all)) {
      sheet.addRow({
        code: q.version > 1 ? `${q.code} (Rev.${q.version})` : q.code,
        client: q.client.legalName,
        status: QUOTE_STATUS_LABELS[q.status],
        currency: q.currency,
        total: Number(q.total),
        issue: q.issueDate ? q.issueDate.toISOString().slice(0, 10) : "",
        valid: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : "",
        owner: q.owner ? q.owner.name ?? q.owner.email : "Sin asignar",
      });
    }
    sheet.getColumn("total").numFmt = "#,##0.00";
  } else {
    return new Response("Tipo inválido", { status: 400 });
  }

  await logAudit({
    action: "data.exported",
    actorId: admin.id,
    targetType: "Export",
    metadata: { type },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
