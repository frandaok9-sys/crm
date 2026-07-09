import ExcelJS from "exceljs";

import { currentUser } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/client-import";

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.field,
    width: 24,
  }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    legalName: "Ejemplo S.A.",
    tradeName: "Ejemplo",
    taxId: "30-12345678-9",
    ivaCondition: "Responsable Inscripto",
    email: "contacto@ejemplo.com",
    phone: "+54 11 5555-5555",
    address: "Av. Siempre Viva 123",
    city: "CABA",
    province: "Buenos Aires",
    industry: "Industria",
    notes: "",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-clientes.xlsx"',
    },
  });
}
