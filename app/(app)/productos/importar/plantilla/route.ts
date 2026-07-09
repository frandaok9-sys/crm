import ExcelJS from "exceljs";

import { currentUser } from "@/lib/auth";
import { PRODUCT_IMPORT_COLUMNS } from "@/lib/product-import";

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");
  sheet.columns = PRODUCT_IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.field,
    width: 24,
  }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    name: "Ashford Formula x 208 L",
    brand: "Ashford",
    sku: "AF-208",
    description: "Endurecedor densificador de hormigón",
    unit: "un",
    price: "850000",
    currency: "ARS",
    ivaRate: "21",
  });
  sheet.addRow({
    name: "Recuplast Piso x 20 L",
    brand: "Sinteplast",
    sku: "RP-20",
    description: "",
    unit: "un",
    price: "95000",
    currency: "ARS",
    ivaRate: "21",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
