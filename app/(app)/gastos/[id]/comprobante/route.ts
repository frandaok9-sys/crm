import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageExpenses } from "@/lib/permissions";

/**
 * Sirve el comprobante adjunto de un gasto (foto/PDF guardado como data URL).
 * Protegido: solo el autor del gasto o quien gestiona gastos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireActiveUser();

  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { receipt: true, receiptType: true, createdById: true, date: true },
  });
  if (!expense?.receipt) {
    return new Response("Comprobante no encontrado", { status: 404 });
  }
  if (expense.createdById !== user.id && !canManageExpenses(user)) {
    return new Response("No autorizado", { status: 403 });
  }

  const base64 = expense.receipt.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  const type = expense.receiptType ?? "application/octet-stream";
  const ext = type === "application/pdf" ? "pdf" : type.split("/")[1] ?? "bin";
  const day = expense.date.toISOString().slice(0, 10);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="comprobante-${day}.${ext}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
