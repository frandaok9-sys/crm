import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewAllRecords } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getMetrics } from "@/lib/metrics";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { QUOTE_STATUS_LABELS, latestRevisions } from "@/lib/quotes";

/**
 * Exportación de datos a Excel.
 * /admin/export?type=clientes | presupuestos | metricas
 *
 * Permisos: 'metricas' lo puede exportar cualquier usuario activo (recibe SUS
 * métricas según su alcance). 'clientes' y 'presupuestos' son exportaciones
 * masivas: requieren "ver todos los registros" (admins y gerentes).
 */
export async function GET(request: Request) {
  const user = await requireActiveUser();
  const type = new URL(request.url).searchParams.get("type") ?? "clientes";

  if (type !== "metricas" && !canViewAllRecords(user)) {
    return new Response("No autorizado", { status: 403 });
  }

  const admin = user;
  const workbook = new ExcelJS.Workbook();

  let filename = "export.xlsx";

  if (type === "metricas") {
    filename = "metricas.xlsx";
    const data = await getMetrics(user);

    const resumen = workbook.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Métrica", key: "m", width: 34 },
      { header: "Moneda", key: "c", width: 10 },
      { header: "Valor", key: "v", width: 20 },
    ];
    resumen.getRow(1).font = { bold: true };
    for (const t of data.totals) {
      resumen.addRow({ m: "Cotizado", c: t.currency, v: Number(t.quoted) });
      resumen.addRow({ m: "Aprobado", c: t.currency, v: Number(t.approved) });
    }
    resumen.addRow({ m: "Conversión (aprobados/emitidos)", c: "", v: `${data.conversion.ratePct}%` });
    resumen.addRow({ m: "Presupuestos emitidos", c: "", v: data.conversion.issued });
    resumen.addRow({ m: "Presupuestos aprobados", c: "", v: data.conversion.approved });
    resumen.addRow({ m: "m² en pipeline", c: "", v: Number(data.pipelineM2) });

    const etapas = workbook.addWorksheet("Por etapa");
    etapas.columns = [
      { header: "Etapa", key: "stage", width: 22 },
      { header: "Oportunidades", key: "count", width: 16 },
      { header: "m²", key: "m2", width: 12 },
      { header: "Montos", key: "amounts", width: 40 },
    ];
    etapas.getRow(1).font = { bold: true };
    for (const f of data.funnel) {
      etapas.addRow({
        stage: f.stage,
        count: f.count,
        m2: Number(f.m2),
        amounts: f.amounts
          .map((a) => `${a.currency} ${Number(a.total).toLocaleString("es-AR")}`)
          .join(" · "),
      });
    }

    const seg = workbook.addWorksheet("Por segmento");
    seg.columns = [
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Segmento", key: "label", width: 24 },
      { header: "Aprobado", key: "total", width: 18 },
    ];
    seg.getRow(1).font = { bold: true };
    for (const s of data.bySegment) {
      for (const r of s.rows) {
        seg.addRow({ currency: s.currency, label: r.label, total: Number(r.total) });
      }
    }

    if (data.bySeller && data.bySeller.length > 0) {
      const vend = workbook.addWorksheet("Por vendedor");
      vend.columns = [
        { header: "Vendedor", key: "name", width: 26 },
        { header: "Cotizado ARS", key: "qars", width: 16 },
        { header: "Aprobado ARS", key: "aars", width: 16 },
        { header: "Cotizado USD", key: "qusd", width: 16 },
        { header: "Aprobado USD", key: "ausd", width: 16 },
        { header: "Conversión", key: "rate", width: 12 },
        { header: "m² pipeline", key: "m2", width: 12 },
      ];
      vend.getRow(1).font = { bold: true };
      const amount = (rows: { currency: string; total: string }[], c: string) =>
        Number(rows.find((x) => x.currency === c)?.total ?? 0);
      for (const s of data.bySeller) {
        vend.addRow({
          name: s.name,
          qars: amount(s.quoted, "ARS"),
          aars: amount(s.approved, "ARS"),
          qusd: amount(s.quoted, "USD"),
          ausd: amount(s.approved, "USD"),
          rate: `${s.ratePct}%`,
          m2: Number(s.pipelineM2),
        });
      }
    }
  } else if (type === "clientes") {
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
