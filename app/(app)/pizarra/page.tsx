import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { formatDateTimeAR } from "@/lib/dates";
import { TintBadge } from "@/components/tint-badge";
import { InitialsAvatar } from "@/components/initials-avatar";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteBoard, duplicateBoard } from "./actions";
import { NewBoardButton } from "@/components/new-board-button";

/**
 * Pizarra (M6): mis tableros y los compartidos por la empresa. Cada tablero
 * es un lienzo libre (formas, flechas, notas, dibujo, imágenes) para bajar
 * ideas o presentar.
 */
export default async function BoardsPage() {
  const user = await requireActiveUser();
  const boards = await prisma.board.findMany({
    where: { OR: [{ ownerId: user.id }, { isShared: true }] },
    select: {
      id: true,
      title: true,
      isShared: true,
      updatedAt: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const mine = boards.filter((b) => b.ownerId === user.id);
  const shared = boards.filter((b) => b.ownerId !== user.id);

  const Card = ({ b }: { b: (typeof boards)[number] }) => {
    const owner = b.owner.name ?? b.owner.email;
    const isOwner = b.ownerId === user.id;
    return (
      <div className="group flex flex-col rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow-sm)] transition-colors hover:border-primary/40">
        <Link href={`/pizarra/${b.id}`} className="min-w-0 flex-1">
          <div className="mb-3 flex h-[92px] items-center justify-center rounded-[10px] border border-dashed border-border2 bg-background text-muted2">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h18v13H3zM8 21l4-4 4 4M8 12l3-3 2 2 3-4" />
            </svg>
          </div>
          <p className="truncate text-[14px] font-bold text-foreground">{b.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <InitialsAvatar name={owner} size={16} />
            <span className="truncate">{owner}</span>
            <span>·</span>
            <span className="tabular-nums">{formatDateTimeAR(b.updatedAt)}</span>
          </p>
        </Link>
        <div className="mt-3 flex items-center justify-between gap-2">
          {b.isShared ? (
            <TintBadge variant="blue">Compartida</TintBadge>
          ) : (
            <TintBadge variant="gray">Privada</TintBadge>
          )}
          <span className="flex items-center gap-2 text-[12px]">
            <form action={duplicateBoard}>
              <input type="hidden" name="id" value={b.id} />
              <button type="submit" className="text-muted-foreground hover:text-primary hover:underline" title="Hacer una copia mía">
                Duplicar
              </button>
            </form>
            {isOwner && (
              <form action={deleteBoard}>
                <input type="hidden" name="id" value={b.id} />
                <ConfirmDeleteButton
                  title="Borrar"
                  message={`¿Borrar la pizarra "${b.title}"?\n\nEsta acción no se puede deshacer.`}
                  className="text-zinc-400 hover:text-red-600"
                >
                  ✕
                </ConfirmDeleteButton>
              </form>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Pizarra</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tableros libres para bajar ideas, armar diagramas y presentar.
            {boards.length > 0 && ` ${mine.length} propia(s) · ${shared.length} compartida(s).`}
          </p>
        </div>
        <NewBoardButton />
      </div>

      {boards.length === 0 ? (
        <section className="rounded-[14px] border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold">Todavía no hay pizarras.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Creá la primera: un lienzo infinito con formas, flechas, notas,
            dibujo a mano e imágenes. Sirve para una lluvia de ideas, el plan
            de una obra o una presentación a un cliente.
          </p>
        </section>
      ) : (
        <>
          {mine.length > 0 && (
            <section>
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Mis pizarras
              </h2>
              <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {mine.map((b) => <Card key={b.id} b={b} />)}
              </div>
            </section>
          )}
          {shared.length > 0 && (
            <section>
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Compartidas por la empresa
              </h2>
              <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shared.map((b) => <Card key={b.id} b={b} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
