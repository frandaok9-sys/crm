import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canViewRecord } from "@/lib/permissions";

/**
 * Sirve un documento adjunto de una obra (PDF/foto/Word/Excel guardado como
 * data URL). Protegido: solo quien puede ver esa oportunidad.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const user = await requireActiveUser();

  const doc = await prisma.opportunityDocument.findUnique({
    where: { id: docId },
    select: {
      data: true,
      mimeType: true,
      fileName: true,
      opportunityId: true,
      opportunity: { select: { ownerId: true } },
    },
  });
  // El documento tiene que pertenecer a la obra de la URL (evita adivinar ids).
  if (!doc || doc.opportunityId !== id) {
    return new Response("Documento no encontrado", { status: 404 });
  }
  if (!canViewRecord(user, doc.opportunity)) {
    return new Response("No autorizado", { status: 403 });
  }

  const base64 = doc.data.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  // Los PDF y las imágenes se abren en el navegador; el resto se descarga.
  const inline =
    doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
