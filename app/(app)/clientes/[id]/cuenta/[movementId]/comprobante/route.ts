import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canManageLedger, canViewRecord } from "@/lib/permissions";

/**
 * Sirve el comprobante adjunto de un movimiento de cuenta corriente
 * (factura escaneada, recibo, orden de pago). Protegido: hay que poder ver
 * al cliente y manejar la cuenta corriente, igual que la propia pantalla.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; movementId: string }> }
) {
  const { id, movementId } = await params;
  const user = await requireActiveUser();

  const movement = await prisma.ledgerMovement.findUnique({
    where: { id: movementId },
    select: {
      attachment: true,
      attachmentType: true,
      attachmentName: true,
      clientId: true,
      date: true,
      client: { select: { ownerId: true } },
    },
  });
  // El movimiento tiene que ser de ESE cliente (evita adivinar ids).
  if (!movement?.attachment || movement.clientId !== id) {
    return new Response("Comprobante no encontrado", { status: 404 });
  }
  if (!canManageLedger(user) || !canViewRecord(user, movement.client)) {
    return new Response("No autorizado", { status: 403 });
  }

  const base64 = movement.attachment.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  const type = movement.attachmentType ?? "application/octet-stream";
  const ext = type === "application/pdf" ? "pdf" : type.split("/")[1] ?? "bin";
  const day = movement.date.toISOString().slice(0, 10);
  const fileName = movement.attachmentName ?? `comprobante-${day}.${ext}`;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
