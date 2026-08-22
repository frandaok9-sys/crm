import { Suspense } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { BoardEditor, type BoardDocument } from "@/components/board-editor";
import type { ShareMode } from "@/components/board-share-menu";

/** Editor de una pizarra: el dueño edita; compartida = los demás la ven. */
export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireActiveUser();
  const board = await prisma.board.findUnique({
    where: { id },
    include: { owner: { select: { name: true, email: true } } },
  });
  // Pizarra borrada o inexistente: a la lista (evita un 404 sin salida si
  // quedó una dirección vieja abierta o en el historial).
  if (!board) redirect("/pizarra");
  const isOwner = board.ownerId === user.id;
  const canView =
    isOwner || board.isShared || board.sharedUserIds.includes(user.id);
  if (!canView) redirect("/pizarra");

  // El dueño puede elegir con quién compartir: lista de usuarios activos.
  const shareableUsers = isOwner
    ? (
        await prisma.user.findMany({
          where: { status: UserStatus.ACTIVE, NOT: { id: user.id } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      ).map((u) => ({ id: u.id, name: u.name ?? u.email }))
    : [];
  const shareMode: ShareMode = board.isShared
    ? "company"
    : board.sharedUserIds.length > 0
      ? "users"
      : "private";

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando la pizarra…</div>}>
      <BoardEditor
        id={board.id}
        title={board.title}
        shareMode={shareMode}
        sharedUserIds={board.sharedUserIds}
        shareableUsers={shareableUsers}
        canEdit={isOwner}
        ownerName={board.owner.name ?? board.owner.email}
        updatedAt={board.updatedAt.toISOString()}
        document={(board.data as BoardDocument | null) ?? null}
      />
    </Suspense>
  );
}
