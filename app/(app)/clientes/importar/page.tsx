import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { canCreateClients, canAssignClients } from "@/lib/permissions";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { IMPORT_COLUMNS } from "@/lib/client-import";
import { ImportClientsForm } from "@/components/import-clients-form";

export default async function ImportClientsPage() {
  const user = await requireActiveUser();
  if (!canCreateClients(user)) redirect("/clientes");

  const canAssign = canAssignClients(user);
  const owners = canAssign
    ? await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-zinc-500 hover:underline">
          ← Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Importar clientes desde Excel
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {canAssign
            ? "Subí un archivo .xlsx con tu cartera de clientes y elegí a qué vendedor asignarlos."
            : "Subí un archivo .xlsx con tu cartera y los clientes quedarán en tu cartera."}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
        <h2 className="text-sm font-medium">Cómo preparar el archivo</h2>
        <p className="mt-2 text-sm text-zinc-500">
          La primera fila debe tener los títulos de las columnas. La única
          columna obligatoria es <strong>Razón social</strong>. Columnas
          reconocidas:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {IMPORT_COLUMNS.map((column) => (
            <span
              key={column.field}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {column.header}
              {"required" in column && column.required ? " *" : ""}
            </span>
          ))}
        </div>
        <a
          href="/clientes/importar/plantilla"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ↓ Descargar plantilla de ejemplo (.xlsx)
        </a>
      </div>

      <div className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
        <ImportClientsForm owners={owners} canAssign={canAssign} />
      </div>
    </div>
  );
}
