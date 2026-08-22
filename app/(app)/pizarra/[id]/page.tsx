import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { BoardEditor, type BoardDocument } from "@/components/board-editor";

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
  if (!board) notFound();
  const isOwner = board.ownerId === user.id;
  if (!isOwner && !board.isShared) redirect("/pizarra");

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando la pizarra…</div>}>
    <BoardEditor
      id={board.id}
      title={board.title}
      isShared={board.isShared}
      canEdit={isOwner}
      ownerName={board.owner.name ?? board.owner.email}
      updatedAt={board.updatedAt.toISOString()}
      document={(board.data as BoardDocument | null) ?? null}
    />
    </Suspense>
  );
}
